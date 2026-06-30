// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, tick, waitFor } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

/**
 * Disposers for spikes mounted by `setup`, drained in `afterEach`.
 *
 * @type {Array<() => void>}
 */
const mountedDisposals = [];

/**
 * Mount the outliner spike with a small node list. Mirrors the inventory and
 * outliner component tests' harness: fresh container, lazy import of the host
 * wrapper, return helpers + the input/commit call logs.
 *
 * @param {object} [opts]
 * @param {Array<object>} [opts.nodes]
 */
const setup = async (opts = {}) => {
  testDocument.body.innerHTML = '';

  const $container = testDocument.createElement('div');
  $container.id = 'outliner';
  testDocument.body.appendChild($container);

  const nodes = opts.nodes || [
    {
      key: '1',
      depth: 0,
      hasChildren: true,
      collapsed: false,
      content: { strings: ['Root message'], names: [] },
      children: [
        {
          key: '2',
          depth: 1,
          hasChildren: false,
          collapsed: false,
          content: { strings: ['Hello ', ''], names: ['alice'] },
        },
      ],
    },
    {
      key: '3',
      depth: 0,
      hasChildren: false,
      collapsed: false,
      content: { strings: ['Second root'], names: [] },
    },
  ];

  /** @type {Array<{ key: string, parsed: object }>} */
  const inputCalls = [];
  /** @type {Array<{ key: string, parsed: object }>} */
  const commitCalls = [];

  const { makeOutlinerSpike } =
    await import('../../outliner-spike-component.js');

  const spike = makeOutlinerSpike({
    $container,
    nodes,
    onInput: (key, parsed) => inputCalls.push({ key, parsed }),
    onCommit: (key, parsed) => commitCalls.push({ key, parsed }),
  });

  mountedDisposals.push(() => spike.dispose());

  return { $container, spike, inputCalls, commitCalls };
};

test.afterEach(async () => {
  while (mountedDisposals.length > 0) {
    const dispose = /** @type {() => void} */ (mountedDisposals.pop());
    dispose();
  }
  await tick(0);
  testDocument.body.innerHTML = '';
});

// Note: createDOM()'s `cleanup` (window.close) is intentionally NOT called in a
// `test.after`. Under SES lockdown happy-dom's `window.close()` throws (`Cannot
// assign to read only property 'closed'`), as the inventory-component test also
// avoids. Per-test `body.innerHTML = ''` is sufficient teardown for a process
// that exits after the file completes.

// ── anchor-slot wiring ────────────────────────────────────────────────

test.serial(
  'each anchor slot holds its host contentEditable line with the right text + chip',
  async t => {
    const { spike } = await setup();

    // Every node's [data-line-anchor] holds exactly the host line for that key.
    for (const key of ['1', '2', '3']) {
      const $anchor = spike.$mount.querySelector(`[data-line-anchor="${key}"]`);
      t.truthy($anchor, `anchor for ${key} exists in the confined tree`);
      const line = spike.getLine(key);
      t.truthy(line, `host line for ${key} exists`);
      t.is(
        line.$node.parentElement,
        $anchor,
        `host line ${key} is re-parented into its anchor`,
      );
      t.true(
        line.$node.classList.contains('outliner-text'),
        'the host node is the editable line',
      );
      t.is(
        line.$node.contentEditable,
        'true',
        'the host node is contentEditable',
      );
    }

    // Plain-text node renders its text.
    t.is(spike.getLine('1').$node.textContent, 'Root message');

    // Token node renders text + a chip span.chat-token[contenteditable=false].
    const $line2 = spike.getLine('2').$node;
    t.regex($line2.textContent, /Hello/, 'line 2 has its leading text');
    const $chip = $line2.querySelector('.chat-token');
    t.truthy($chip, 'line 2 has a chat-token chip');
    t.is($chip.contentEditable, 'false', 'the chip is not editable');
    t.is($chip.dataset.petName, 'alice', 'chip carries the pet name');
    t.is(
      $chip.querySelector('.token-name').textContent,
      'alice',
      'chip shows the pet name',
    );
  },
);

// ── input parsing over the seam ───────────────────────────────────────

test.serial('typing into a line fires onInput with parsed content', async t => {
  const { spike, inputCalls } = await setup();

  const $line = spike.getLine('3').$node;
  // Simulate an edit: mutate the editable DOM, then dispatch a real `input`.
  $line.textContent = 'Second root edited';
  $line.dispatchEvent(
    new testDocument.defaultView.Event('input', { bubbles: true }),
  );

  await waitFor(() => inputCalls.length >= 1);

  t.is(inputCalls.length, 1, 'one onInput fired');
  t.is(inputCalls[0].key, '3', 'onInput carried the node key');
  t.deepEqual(
    inputCalls[0].parsed,
    { strings: ['Second root edited'], names: [] },
    'onInput carried structured parsed content (no DOM)',
  );
});

// ── identity survival across a forced confined re-render (THE spike) ───

test.serial(
  'the same host line survives a forced confined re-render with identity intact',
  async t => {
    const { spike } = await setup();

    const lineBefore = spike.getLine('2');
    const $nodeBefore = lineBefore.$node;

    // Mutate the editable DOM so we can prove the SAME node (not a fresh render
    // of the same content) survives — a Preact-owned node would be clobbered.
    $nodeBefore.setAttribute('data-spike-marker', 'survived');
    t.true($nodeBefore.isConnected, 'line is connected before re-render');

    // Force a confined re-render of the whole structure tree.
    spike.rerender();

    const lineAfter = spike.getLine('2');
    t.is(lineAfter, lineBefore, 'getLine returns the SAME EditableLine handle');
    t.is(
      lineAfter.$node,
      $nodeBefore,
      'the physical $node is identical across the re-render',
    );
    t.true(
      lineAfter.$node.isConnected,
      'the line is still connected after the re-render',
    );
    t.is(
      lineAfter.$node.getAttribute('data-spike-marker'),
      'survived',
      'host-set DOM state on the node survived (Preact never owned it)',
    );

    // It is re-parented into the correct anchor, and the anchor still belongs to
    // the freshly rendered confined tree.
    const $anchor = spike.$mount.querySelector('[data-line-anchor="2"]');
    t.is(
      lineAfter.$node.parentElement,
      $anchor,
      'the line is back in its matching anchor after re-render',
    );
    t.true($anchor.isConnected, 'the anchor belongs to the live confined tree');

    // Content is intact (the chip is still there, not re-rendered away).
    t.truthy(
      lineAfter.$node.querySelector('.chat-token'),
      'the chip survived the re-render',
    );
  },
);

// ── caret survival: what is testable headlessly ───────────────────────

// CARET-SURVIVAL FINDING: real caret/Selection position survival cannot be
// asserted reliably in happy-dom. happy-dom's `getSelection`/`Range` are stubs
// that do not track a live caret across DOM re-parenting the way a real browser
// does, so a position assertion here would be testing the stub, not the
// mechanism. What IS verifiable headlessly — and is the load-bearing property
// for the anchor-slot pattern — is node IDENTITY + CONNECTEDNESS survival
// across a confined re-render (asserted above): because Preact never owns the
// editable node, the browser's native caret/Selection (anchored to that exact
// node) is never torn down. requestFocus is exercised below for its no-throw
// contract; true caret-position survival needs real-browser verification
// (Phases 2-3).

test.serial(
  'requestFocus runs without throwing and the line stays connected (caret position needs a real browser)',
  async t => {
    const { spike } = await setup();
    const line = spike.getLine('1');

    t.notThrows(() => line.requestFocus(true), 'requestFocus(atEnd) is safe');
    t.true(line.$node.isConnected, 'line still connected after focus request');

    // Re-render, then focus again: still safe, still connected, same node.
    const $before = line.$node;
    spike.rerender();
    t.notThrows(
      () => line.requestFocus(false),
      'requestFocus(atStart) after re-render is safe',
    );
    t.is(line.$node, $before, 'same node focused after re-render');
    t.true(line.$node.isConnected, 'still connected after re-render + focus');
  },
);
