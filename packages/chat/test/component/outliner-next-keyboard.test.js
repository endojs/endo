// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { createDOM, tick, waitFor } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

// HEADLESS-VERIFICATION FINDING (carried from the Phase-0 spike + outliner-next
// test): happy-dom's `getSelection`/`Range` are stubs that do NOT track a live
// caret across DOM re-parenting, so real CARET POSITION cannot be asserted here.
// This file therefore asserts at the INTENT / WIRING level: which intent fired,
// which `post(...)` the controller made, which neighbor line `requestFocus` was
// routed to (we stub `requestFocus` to record the target), and that the
// `editingKey` guard preserves a focused line's identity + content across a
// re-render. True caret-position survival needs real-browser confirmation.

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
}

/**
 * Controllable mock channel. Mirrors outliner-next.test.js.
 *
 * @param {object} [opts]
 * @param {string} [opts.name]
 */
const makeMockChannel = ({ name = 'test-channel' } = {}) => {
  const members = new Map();
  /** @type {unknown[]} */
  const messageQueue = [];
  /** @type {Array<(msg: unknown) => void>} */
  const waitingResolvers = [];
  /** @type {unknown[][]} */
  const postCalls = [];

  const pushMessage = msg => {
    if (waitingResolvers.length > 0) {
      const resolve = waitingResolvers.shift();
      resolve(msg);
    } else {
      messageQueue.push(msg);
    }
  };

  const messagesIterator = Far('MessagesIterator', {
    next() {
      if (messageQueue.length > 0) {
        return Promise.resolve({ value: messageQueue.shift(), done: false });
      }
      return new Promise(resolve => {
        waitingResolvers.push(msg => resolve({ value: msg, done: false }));
      });
    },
    return() {
      return Promise.resolve({ value: undefined, done: true });
    },
    throw(err) {
      return Promise.reject(err);
    },
  });

  const channel = Far('MockChannel', {
    getProposedName() {
      return name;
    },
    getMember(memberId) {
      return members.get(memberId);
    },
    getMemberId() {
      return 'member-1';
    },
    followMessages() {
      return readerFromIterator(messagesIterator);
    },
    post(...args) {
      postCalls.push(args);
      return Promise.resolve();
    },
  });

  return { channel, pushMessage, members, postCalls };
};

/**
 * Create a test message.
 *
 * @param {number} number
 * @param {string} text
 * @param {object} [opts]
 */
const makeMessage = (number, text, opts = {}) => ({
  type: 'package',
  messageId: `msg-${number}`,
  number: BigInt(number),
  date: new Date().toISOString(),
  memberId: opts.memberId || 'member-1',
  strings: opts.strings || [text],
  names: [],
  ids: [],
  ...(opts.replyTo !== undefined ? { replyTo: String(opts.replyTo) } : {}),
  ...(opts.replyType !== undefined ? { replyType: opts.replyType } : {}),
});

/**
 * Mock window.getSelection() to report the caret at the start or end of a
 * contentEditable line, so the island's `readCaret` computes atStart/atEnd.
 * Mirrors `mockCursorPosition` in outliner-enter-key.test.js.
 *
 * @param {HTMLElement} $text
 * @param {'start' | 'end'} position
 * @returns {() => void} restore
 */
const mockCursor = ($text, position) => {
  const textContent = $text.textContent || '';
  const textNode = $text.childNodes[0] || $text;
  const offset = position === 'end' ? textContent.length : 0;
  const orig = window.getSelection;
  const mockRange = testDocument.createRange();
  try {
    mockRange.selectNodeContents($text);
    mockRange.setEnd(textNode, offset);
  } catch {
    // happy-dom range methods may throw; the selection stub below suffices.
  }
  window.getSelection = () => ({
    rangeCount: 1,
    anchorNode: textNode,
    anchorOffset: offset,
    focusNode: textNode,
    focusOffset: offset,
    isCollapsed: true,
    type: 'Caret',
    removeAllRanges() {},
    addRange() {},
    getRangeAt() {
      return mockRange;
    },
    toString() {
      return position === 'end' ? textContent : '';
    },
    collapse() {},
    extend() {},
    setBaseAndExtent() {},
    selectAllChildren() {},
    deleteFromDocument() {},
    containsNode() {
      return false;
    },
  });
  return () => {
    window.getSelection = orig;
  };
};

/**
 * Dispatch a keydown on a line with a given key + modifiers.
 *
 * @param {HTMLElement} $line
 * @param {string} key
 * @param {object} [opts]
 */
const keydown = ($line, key, opts = {}) => {
  $line.dispatchEvent(
    new testDocument.defaultView.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      shiftKey: !!opts.shiftKey,
      metaKey: !!opts.metaKey,
      ctrlKey: !!opts.ctrlKey,
    }),
  );
};

/** @type {Array<() => void>} */
const mountedDisposals = [];

const setup = async () => {
  testDocument.body.innerHTML = '';

  const $parent = testDocument.createElement('div');
  $parent.id = 'messages';
  $parent.scrollTo = () => {};
  testDocument.body.appendChild($parent);

  const $end = testDocument.createElement('div');
  $end.id = 'anchor';
  $parent.appendChild($end);

  const { channel, pushMessage, members, postCalls } = makeMockChannel();
  members.set('member-1', { proposedName: 'Alice', pedigree: [] });

  const { outlinerComponent } = await import('../../outliner-component.js');

  const handle = await outlinerComponent($parent, $end, channel, {
    powers: undefined,
  });
  mountedDisposals.push(() => handle.dispose());

  const $mount = $parent.firstElementChild;

  const line = key =>
    $mount.querySelector(`[data-line-anchor="${key}"] .outliner-text`);

  const pushAll = async msgs => {
    for (const msg of msgs) pushMessage(msg);
    await waitFor(() =>
      msgs.every(msg => !!$mount.querySelector(`[data-key="${msg.number}"]`)),
    );
  };

  return { $parent, $mount, handle, pushAll, pushMessage, postCalls, line };
};

test.afterEach(async () => {
  while (mountedDisposals.length > 0) {
    const dispose = mountedDisposals.pop();
    dispose();
  }
  await tick(0);
  testDocument.body.innerHTML = '';
});

const directChild = (parent, className) => {
  for (const child of parent.children) {
    if (child.classList.contains(className)) return child;
  }
  return null;
};

const directChildren = (parent, className) => {
  const out = [];
  for (const child of parent.children) {
    if (child.classList.contains(className)) out.push(child);
  }
  return out;
};

// ── Enter at end of a committed line creates a CHILD draft ─────────────

test.serial(
  'Enter at end of a committed line creates a child draft node',
  async t => {
    const { $mount, pushAll, line } = await setup();
    await pushAll([
      makeMessage(1, 'Root'),
      makeMessage(2, 'Child', { replyTo: 1 }),
    ]);

    const $line2 = line('2');
    const restore = mockCursor($line2, 'end');
    keydown($line2, 'Enter');
    restore();

    // A draft line appears as a CHILD of node 2.
    await waitFor(() => {
      const $node2 = $mount.querySelector('[data-key="2"]');
      const $children = $node2 && directChild($node2, 'outliner-children');
      return !!$children && !!directChild($children, 'outliner-draft');
    });

    const $node2 = $mount.querySelector('[data-key="2"]');
    const $children = directChild($node2, 'outliner-children');
    const $draft = directChild($children, 'outliner-draft');
    t.truthy($draft, 'draft is a child of node 2 (a reply)');
    t.regex(
      $draft.dataset.key,
      /^draft/,
      'the draft node carries a draft-* key',
    );
    t.is($draft.dataset.depth, '2', 'child draft is one level deeper');
  },
);

// ── Enter at start of a committed line creates a BEFORE-SIBLING draft ──

test.serial(
  'Enter at start of a committed line creates a before-sibling draft',
  async t => {
    const { $mount, pushAll, line } = await setup();
    await pushAll([
      makeMessage(1, 'Root'),
      makeMessage(2, 'Child', { replyTo: 1 }),
    ]);

    const $line2 = line('2');
    const restore = mockCursor($line2, 'start');
    keydown($line2, 'Enter');
    restore();

    // A draft appears as a SIBLING of node 2 (inside node 1's children),
    // placed BEFORE node 2.
    await waitFor(() => {
      const $node1 = $mount.querySelector('[data-key="1"]');
      const $children = $node1 && directChild($node1, 'outliner-children');
      return (
        !!$children && directChildren($children, 'outliner-draft').length === 1
      );
    });

    const $node1 = $mount.querySelector('[data-key="1"]');
    const $children = directChild($node1, 'outliner-children');
    const kids = [...$children.children].filter(c =>
      c.classList.contains('outliner-node'),
    );
    t.is(kids.length, 2, 'node 1 now has the draft + node 2');
    t.true(
      kids[0].classList.contains('outliner-draft'),
      'the draft is placed BEFORE node 2',
    );
    t.is(kids[1].dataset.key, '2', 'node 2 follows the draft');
    t.is(kids[0].dataset.depth, '1', 'before-sibling draft is at node 2 depth');
  },
);

// ── Committing a draft posts via postDraft (the channel post) ──────────

test.serial(
  'committing a draft posts with the right replyTo (parent) via the channel',
  async t => {
    const { pushAll, line, postCalls } = await setup();
    await pushAll([makeMessage(1, 'Root')]);

    // Enter at end of node 1 → child draft (replyTo = 1).
    const $line1 = line('1');
    let restore = mockCursor($line1, 'end');
    keydown($line1, 'Enter');
    restore();

    // Find the freshly created draft line.
    await waitFor(
      () => !!testDocument.querySelector('.outliner-draft .outliner-text'),
    );
    const $draftLine = testDocument.querySelector(
      '.outliner-draft .outliner-text',
    );

    // Type into the draft and blur to commit.
    $draftLine.textContent = 'Reply text';
    $draftLine.dispatchEvent(
      new testDocument.defaultView.Event('input', { bubbles: true }),
    );
    restore = mockCursor($draftLine, 'end');
    $draftLine.dispatchEvent(
      new testDocument.defaultView.Event('blur', { bubbles: true }),
    );
    restore();

    await waitFor(() => postCalls.length >= 1);
    // post(strings, edgeNames, petNames, replyTo, ids, replyType)
    const call = postCalls[postCalls.length - 1];
    t.deepEqual(call[0], ['Reply text'], 'posted the draft text');
    t.is(call[3], '1', 'posted with replyTo = parent key (1)');
  },
);

// ── Backspace on an empty draft removes it (no post) ───────────────────

test.serial('Backspace on an empty draft removes the draft', async t => {
  const { $mount, pushAll, line, postCalls } = await setup();
  await pushAll([makeMessage(1, 'Root')]);

  // Create a child draft via Enter-at-end, then Backspace it empty.
  const $line1 = line('1');
  let restore = mockCursor($line1, 'end');
  keydown($line1, 'Enter');
  restore();

  await waitFor(() => !!$mount.querySelector('.outliner-draft'));
  const $draftNode = $mount.querySelector('.outliner-draft');
  const $draftLine = $draftNode.querySelector('.outliner-text');
  t.truthy($draftLine, 'draft line exists');

  // Empty draft + Backspace → remove.
  restore = mockCursor($draftLine, 'start');
  keydown($draftLine, 'Backspace');
  restore();

  await waitFor(() => !$mount.querySelector('.outliner-draft'));
  t.falsy($mount.querySelector('.outliner-draft'), 'draft was removed');
  t.is(postCalls.length, 0, 'removing an empty draft posts nothing');
});

// ── Backspace on an empty committed node posts a deletion ──────────────

test.serial(
  'Backspace on an empty committed node posts a deletion',
  async t => {
    const { pushAll, line, postCalls } = await setup();
    // node content is empty so textContent === ''.
    await pushAll([makeMessage(1, '', { strings: [''] })]);

    const $line1 = line('1');
    t.is($line1.textContent, '', 'node 1 line is empty');
    const restore = mockCursor($line1, 'start');
    keydown($line1, 'Backspace');
    restore();

    await waitFor(() => postCalls.length >= 1);
    const call = postCalls[postCalls.length - 1];
    t.is(call[5], 'deletion', 'posted a deletion reply type');
    t.is(call[3], '1', 'deletion targets node 1');
  },
);

// ── Tab indents a committed node under its previous sibling (postMove) ──

test.serial(
  'Tab on a committed node posts a move reparenting under the previous sibling',
  async t => {
    const { pushAll, line, postCalls } = await setup();
    // Two sibling roots: 1, 2. Tab on 2 → nest under 1.
    await pushAll([makeMessage(1, 'First'), makeMessage(2, 'Second')]);

    const $line2 = line('2');
    keydown($line2, 'Tab');

    await waitFor(() => postCalls.some(c => c[5] === 'move' && c[3] === '2'));
    const move = postCalls.find(c => c[5] === 'move' && c[3] === '2');
    t.truthy(move, 'a move was posted for node 2');
    // move strings: [sortOrder, newParent]
    t.is(move[0][1], '1', 'reparented under node 1 (previous sibling)');
  },
);

// ── Shift+Tab dedents a committed node to the grandparent (postMove) ───

test.serial(
  'Shift+Tab on a nested node posts a move to the grandparent level',
  async t => {
    const { pushAll, line, postCalls } = await setup();
    // 1 → 2 (child). Shift+Tab on 2 → becomes a root sibling of 1.
    await pushAll([
      makeMessage(1, 'Root'),
      makeMessage(2, 'Child', { replyTo: 1 }),
    ]);

    const $line2 = line('2');
    keydown($line2, 'Tab', { shiftKey: true });

    await waitFor(() => postCalls.some(c => c[5] === 'move' && c[3] === '2'));
    const move = postCalls.find(c => c[5] === 'move' && c[3] === '2');
    t.truthy(move, 'a move was posted for node 2');
    t.is(move[0][1], '', 'reparented to root (empty new-parent)');
  },
);

// ── onCaretArrow routes requestFocus to the snapshot neighbor ──────────

test.serial(
  'ArrowDown at the end of a line routes requestFocus to the next visible line',
  async t => {
    const { pushAll, line } = await setup();
    await pushAll([
      makeMessage(1, 'First'),
      makeMessage(2, 'Second'),
      makeMessage(3, 'Third'),
    ]);

    // Stub requestFocus on every line to record which one the controller calls.
    // We reach the EditableLine handles via their $node and patch in place;
    // the controller calls `line.requestFocus`, so we patch the handle method.
    // The handles are not directly exposed, so we instead detect focus routing
    // by spying on focus() of the target node.
    const focused = [];
    for (const key of ['1', '2', '3']) {
      const $l = line(key);
      const origFocus = $l.focus.bind($l);
      $l.focus = (...args) => {
        focused.push(key);
        return origFocus(...args);
      };
    }

    // ArrowDown at end of line 2 → should focus line 3.
    const $line2 = line('2');
    const restore = mockCursor($line2, 'end');
    keydown($line2, 'ArrowDown');
    restore();

    await waitFor(() => focused.includes('3'));
    t.true(focused.includes('3'), 'ArrowDown at end routed focus to line 3');
    t.false(
      focused.includes('1'),
      'it did not route to a non-neighbor (line 1)',
    );
  },
);

test.serial(
  'ArrowUp at the start of a line routes requestFocus to the previous visible line',
  async t => {
    const { pushAll, line } = await setup();
    await pushAll([makeMessage(1, 'First'), makeMessage(2, 'Second')]);

    const focused = [];
    for (const key of ['1', '2']) {
      const $l = line(key);
      const origFocus = $l.focus.bind($l);
      $l.focus = () => {
        focused.push(key);
        return origFocus();
      };
    }

    const $line2 = line('2');
    const restore = mockCursor($line2, 'start');
    keydown($line2, 'ArrowUp');
    restore();

    await waitFor(() => focused.includes('1'));
    t.true(focused.includes('1'), 'ArrowUp at start routed focus to line 1');
  },
);

// ── editingKey guard: re-render does not clobber the edited line ───────

test.serial(
  'a re-render while a line is focused keeps that line identity and content',
  async t => {
    const { $mount, pushAll, pushMessage, line } = await setup();
    await pushAll([makeMessage(1, 'Original')]);

    const $line1Before = line('1');
    // Focus the line (sets editingKey) and simulate an in-progress edit.
    $line1Before.dispatchEvent(
      new testDocument.defaultView.Event('focus', { bubbles: true }),
    );
    $line1Before.textContent = 'User is typing...';
    $line1Before.dispatchEvent(
      new testDocument.defaultView.Event('input', { bubbles: true }),
    );
    $line1Before.setAttribute('data-marker', 'editing');

    // An incoming sibling message forces a re-render.
    pushMessage(makeMessage(2, 'Incoming sibling'));
    await waitFor(() => !!$mount.querySelector('[data-key="2"]'));

    const $line1After = line('1');
    t.is(
      $line1After,
      $line1Before,
      'edited line kept identity across re-render',
    );
    t.is(
      $line1After.getAttribute('data-marker'),
      'editing',
      'host-set state survived',
    );
    t.is(
      $line1After.textContent,
      'User is typing...',
      'the in-progress edit was NOT clobbered by the re-render (editingKey guard)',
    );
  },
);
