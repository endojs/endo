// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { createMessagePicker } from '../../message-picker.js';

const { document: testDocument } = createDOM();

/**
 * Build a small fake host message list shaped like the real chat DOM that the
 * picker reads imperatively: each `.message` carries a `.timestamp-num` of the
 * form `#N`.
 *
 * @param {Array<{ number: number, text: string }>} entries
 * @returns {HTMLElement}
 */
const makeMessagesContainer = entries => {
  const $container = testDocument.createElement('div');
  $container.id = 'messages';
  for (const { number, text } of entries) {
    const $message = testDocument.createElement('div');
    $message.className = 'message';

    const $num = testDocument.createElement('span');
    $num.className = 'timestamp-num';
    $num.textContent = `#${number}`;
    $message.appendChild($num);

    const $body = testDocument.createElement('span');
    $body.className = 'message-body';
    $body.textContent = text;
    $message.appendChild($body);

    $container.appendChild($message);
  }
  testDocument.body.appendChild($container);
  return $container;
};

const setupPicker = async () => {
  const $messagesContainer = makeMessagesContainer([
    { number: 1, text: 'first' },
    { number: 2, text: 'second' },
    { number: 3, text: 'third' },
  ]);

  /** @type {number[]} */
  const selected = [];
  const picker = createMessagePicker({
    $messagesContainer,
    onSelect: n => selected.push(n),
  });

  // Let the root component's mount effect (which wires the controller setter)
  // settle. Generous because the first test pays SES/Preact warmup.
  await tick(80);
  return { $messagesContainer, picker, selected };
};

// Each picker appends its own overlay to the shared body; the picker under test
// is always the most recently constructed one, so use the last overlay.
const getOverlay = () => {
  const all = testDocument.body.querySelectorAll('.message-picker-overlay');
  return all[all.length - 1] || null;
};

// Keyboard handling is scoped to the overlay's `.message-picker` element
// (onKeyDown), so dispatch keydown there rather than on the document.
const keydown = key => {
  const $picker = getOverlay().querySelector('.message-picker');
  $picker.dispatchEvent(
    new testDocument.defaultView.KeyboardEvent('keydown', {
      key,
      bubbles: true,
    }),
  );
};

// Enable the picker and wait until its overlay has rendered its items, which is
// when the overlay element (and its onKeyDown handler) exists. Avoids racing
// the first synthetic keystroke against the async enable -> setState -> render
// sequence.
const enableAndWait = async picker => {
  picker.enable();
  await null;
  for (let i = 0; i < 20; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await tick(10);
    const $overlay = getOverlay();
    if ($overlay && $overlay.querySelectorAll('.message-picker-item').length) {
      return;
    }
  }
};

test.serial('enable decorates host messages and renders overlay', async t => {
  const { $messagesContainer, picker } = await setupPicker();

  await enableAndWait(picker);

  t.true(picker.isActive(), 'picker is active');
  t.true(
    $messagesContainer.classList.contains('message-picking-mode'),
    'host container marked picking-mode',
  );

  const $items = getOverlay().querySelectorAll('.message-picker-item');
  t.is($items.length, 3, 'overlay lists all three messages');
  t.regex($items[0].textContent, /first/, 'first item shows its text');

  t.teardown(() => picker.disable());
});

test.serial(
  'arrow navigation + Enter fires onSelect with the highlighted message',
  async t => {
    const { picker, selected } = await setupPicker();

    await enableAndWait(picker);

    // Default highlight is the first row (#1). Arrow down twice -> #3, up -> #2.
    keydown('ArrowDown');
    await tick(10);
    keydown('ArrowDown');
    await tick(10);
    keydown('ArrowUp');
    await tick(10);

    keydown('Enter');
    await tick(20);

    t.deepEqual(selected, [2], 'onSelect fired with the navigated message');
    t.is(picker.getSelected(), 2, 'selected number tracked');

    t.teardown(() => picker.disable());
  },
);

test.serial('clicking an overlay item fires onSelect', async t => {
  const { picker, selected } = await setupPicker();

  await enableAndWait(picker);

  const $items = getOverlay().querySelectorAll('.message-picker-item');
  $items[2].click();
  await tick(20);

  t.deepEqual(selected, [3], 'onSelect fired with the clicked message');

  t.teardown(() => picker.disable());
});

test.serial('Escape closes the picker', async t => {
  const { $messagesContainer, picker, selected } = await setupPicker();

  await enableAndWait(picker);
  t.truthy(getOverlay(), 'overlay rendered');

  keydown('Escape');
  await tick(20);

  t.false(picker.isActive(), 'picker disabled by Escape');
  t.is(getOverlay().style.display, 'none', 'overlay hidden');
  t.is(
    getOverlay().querySelectorAll('.message-picker-item').length,
    0,
    'overlay items cleared',
  );
  t.false(
    $messagesContainer.classList.contains('message-picking-mode'),
    'host picking-mode class removed',
  );
  t.deepEqual(selected, [], 'no selection fired on Escape');
});

test.serial(
  'setSelected highlights the host message and disable cleans up',
  async t => {
    const { $messagesContainer, picker } = await setupPicker();

    await enableAndWait(picker);

    picker.setSelected(2);
    await tick(20);
    t.is(picker.getSelected(), 2, 'selected number recorded');

    const $messages = $messagesContainer.querySelectorAll('.message');
    t.true(
      $messages[1].classList.contains('highlighted'),
      'host message #2 highlighted',
    );

    picker.disable();
    await tick(20);

    t.false(picker.isActive(), 'picker inactive after disable');
    t.is(getOverlay().style.display, 'none', 'overlay hidden after disable');
    for (const $message of $messages) {
      t.false(
        $message.classList.contains('selectable'),
        'selectable class removed from host messages',
      );
      t.false(
        $message.classList.contains('highlighted'),
        'highlighted class removed from host messages',
      );
    }
  },
);
