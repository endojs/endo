// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { createHeatBar } from '../../heat-bar.js';

const { document: testDocument } = createDOM();

// Mount the heat bar the way send-form.js does: createHeatBar($container,
// $sendButton), where $container is the input's parent wrapper (which also
// holds sibling nodes) and $sendButton is a trusted host button updated
// imperatively outside the confined tree.
const setupBar = async () => {
  const $container = testDocument.createElement('div');
  $container.id = 'chat-input-wrapper';
  // A sibling that must survive mounting the bar (mirrors #chat-message).
  const $sibling = testDocument.createElement('div');
  $sibling.id = 'chat-message';
  $sibling.textContent = 'survivor';
  $container.appendChild($sibling);
  testDocument.body.appendChild($container);

  const $sendButton = testDocument.createElement('button');
  $sendButton.id = 'chat-send-button';
  testDocument.body.appendChild($sendButton);

  const bar = createHeatBar($container, $sendButton);

  // Let the root component's mount effect (which wires the controller setter)
  // settle. Generous because the first test pays SES/Preact warmup.
  await tick(80);
  return { $container, $sibling, $sendButton, bar };
};

const queryBar = $container => $container.querySelector('.heat-bar');
const queryFill = $container => $container.querySelector('.heat-bar-fill');
const querySegments = $container =>
  $container.querySelector('.heat-bar-segments');
const queryStatus = $container => $container.querySelector('.heat-bar-status');

test.serial('mount renders the bar and preserves siblings', async t => {
  const { $container, $sibling, bar } = await setupBar();

  t.truthy(queryBar($container), 'heat bar rendered');
  t.truthy(queryFill($container), 'fill rendered');
  t.truthy(querySegments($container), 'segments container rendered');
  t.truthy(queryStatus($container), 'status rendered');
  t.is($sibling.textContent, 'survivor', 'pre-existing sibling untouched');

  t.teardown(() => bar.dispose());
});

test.serial('single-hop update drives fill width and color', async t => {
  const { $container, bar } = await setupBar();

  bar.update({
    heat: 50,
    locked: false,
    lockEndTime: 0,
    lastUpdateTime: Date.now(),
  });
  await tick(20);

  const $bar = queryBar($container);
  const $fill = queryFill($container);
  t.is($bar.getAttribute('aria-valuenow'), '50', 'aria-valuenow reflects heat');
  t.regex($fill.getAttribute('style'), /width:\s*50%/, 'fill width = heat %');
  t.regex($fill.getAttribute('style'), /display:\s*block/, 'fill shown');
  t.regex(
    querySegments($container).getAttribute('style'),
    /display:\s*none/,
    'segments hidden in single-hop mode',
  );

  t.teardown(() => bar.dispose());
});

test.serial('low heat hides the bar via opacity', async t => {
  const { $container, bar } = await setupBar();

  bar.update({ heat: 0, locked: false, lockEndTime: 0, lastUpdateTime: 0 });
  await tick(20);

  t.regex(
    queryBar($container).getAttribute('style'),
    /opacity:\s*0/,
    'bar transparent when heat < 1',
  );

  t.teardown(() => bar.dispose());
});

test.serial('locked single-hop shows status and locks send button', async t => {
  const { $container, $sendButton, bar } = await setupBar();

  bar.update({
    heat: 90,
    locked: true,
    lockEndTime: Date.now() + 5000,
    lastUpdateTime: Date.now(),
  });
  await tick(20);

  t.regex(queryStatus($container).textContent, /Locked:/, 'locked status text');
  t.true(
    $sendButton.classList.contains('heat-locked'),
    'send button locked class applied imperatively',
  );
  t.true(
    $sendButton.classList.contains('heat-shake'),
    'shake applied on lock entry',
  );

  t.teardown(() => bar.dispose());
});

test.serial('warm heat glows then jitters the send button', async t => {
  const { $sendButton, bar } = await setupBar();

  // LOCKOUT_THRESHOLD is 90: 0.5 * 90 = 45 (glow), 0.8 * 90 = 72 (jitter).
  bar.update({ heat: 50, locked: false, lockEndTime: 0, lastUpdateTime: 0 });
  await tick(10);
  t.true($sendButton.classList.contains('heat-glow'), 'glow at moderate heat');
  t.false($sendButton.classList.contains('heat-jitter'), 'not jittering yet');

  bar.update({ heat: 80, locked: false, lockEndTime: 0, lastUpdateTime: 0 });
  await tick(10);
  t.true($sendButton.classList.contains('heat-jitter'), 'jitter at high heat');
  t.false($sendButton.classList.contains('heat-glow'), 'glow cleared');

  t.teardown(() => bar.dispose());
});

test.serial('composite update renders one segment per hop', async t => {
  const { $container, bar } = await setupBar();

  bar.update({
    effectiveHeat: 60,
    effectiveLocked: false,
    effectiveLockRemaining: 0,
    canSend: true,
    bottleneckIndex: 1,
    bottleneckLabel: 'alice',
    isSelfBottleneck: true,
    hops: [
      {
        hopIndex: 0,
        label: 'root',
        normalizedHeat: 30,
        locked: false,
        lockRemaining: 0,
        isSelf: false,
      },
      {
        hopIndex: 1,
        label: 'alice',
        normalizedHeat: 60,
        locked: false,
        lockRemaining: 0,
        isSelf: true,
      },
    ],
  });
  await tick(20);

  const $segs = querySegments($container);
  t.regex($segs.getAttribute('style'), /display:\s*flex/, 'segments shown');
  t.regex(
    queryFill($container).getAttribute('style'),
    /display:\s*none/,
    'single fill hidden in composite mode',
  );

  const segs = $segs.querySelectorAll('.heat-bar-segment');
  t.is(segs.length, 2, 'one segment per hop');
  t.true(segs[1].classList.contains('self'), 'self hop marked self');
  t.true(segs[0].classList.contains('ancestor'), 'ancestor hop marked');
  t.regex(
    queryStatus($container).textContent,
    /heat:\s*60%/,
    'self-bottleneck status shows heat %',
  );

  t.teardown(() => bar.dispose());
});

test.serial('composite locked shows bottleneck cooldown', async t => {
  const { $container, $sendButton, bar } = await setupBar();

  bar.update({
    effectiveHeat: 100,
    effectiveLocked: true,
    effectiveLockRemaining: 8000,
    canSend: false,
    bottleneckIndex: 0,
    bottleneckLabel: 'root',
    isSelfBottleneck: false,
    hops: [
      {
        hopIndex: 0,
        label: 'root',
        normalizedHeat: 100,
        locked: true,
        lockRemaining: 8000,
        isSelf: false,
      },
    ],
  });
  await tick(20);

  t.regex(
    queryStatus($container).textContent,
    /root cooldown —/,
    'bottleneck label in cooldown status',
  );
  t.true($sendButton.classList.contains('heat-locked'), 'send button locked');

  t.teardown(() => bar.dispose());
});

test.serial('dispose removes the bar and clears button classes', async t => {
  const { $container, $sibling, $sendButton, bar } = await setupBar();

  bar.update({
    heat: 90,
    locked: true,
    lockEndTime: Date.now() + 5000,
    lastUpdateTime: Date.now(),
  });
  await tick(20);
  t.true(
    $sendButton.classList.contains('heat-locked'),
    'locked before dispose',
  );

  bar.dispose();
  await tick(20);

  t.falsy(queryBar($container), 'heat bar removed after dispose');
  t.is($sibling.textContent, 'survivor', 'sibling still intact after dispose');
  t.false(
    $sendButton.classList.contains('heat-locked'),
    'heat-locked cleared on dispose',
  );
  t.false(
    $sendButton.classList.contains('heat-glow'),
    'heat-glow cleared on dispose',
  );
});
