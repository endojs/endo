// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
// Repointed in the Phase-5 swap from the retired imperative
// `@endo/space-channel/outliner-component.js` to the live CONFINED host wrapper,
// so these Enter-key regressions are asserted against the implementation that
// actually ships. The wrapper sets `$parent.channelAPI` and renders the same
// `[data-key]` / `outliner-draft` / `data-depth` DOM the assertions read.
import { outlinerComponent } from '../../outliner-component.js';
import { createDOM, tick, waitFor } from '../helpers/dom-setup.js';

const { document: testDocument, cleanup: cleanupDOM } = createDOM();

// Globals the component expects
if (!globalThis.CSS) {
  globalThis.CSS = { escape: s => s };
}
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
}

/**
 * Create a controllable mock channel for the outliner.
 * Messages are pushed manually via pushMessage() and consumed by
 * the component's for-await-of loop.
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
    getHeatConfig() {
      return undefined;
    },
    getHopInfo() {
      return undefined;
    },
    followHeatEvents() {
      return Far('EmptyIterator', {
        next() {
          return new Promise(() => {});
        },
        return() {
          return Promise.resolve({ value: undefined, done: true });
        },
        throw(err) {
          return Promise.reject(err);
        },
      });
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
 * @param {string} [opts.memberId]
 * @param {number} [opts.replyTo]
 */
const makeMessage = (number, text, opts = {}) => ({
  type: 'package',
  messageId: `msg-${number}`,
  number: BigInt(number),
  date: new Date().toISOString(),
  memberId: opts.memberId || 'member-1',
  strings: [text],
  names: [],
  ids: [],
  ...(opts.replyTo !== undefined ? { replyTo: String(opts.replyTo) } : {}),
});

/**
 * Mock window.getSelection() to report cursor at a specific position
 * within a contenteditable element.
 *
 * @param {HTMLElement} $text - the contenteditable element
 * @param {'start' | 'end'} position - where to report the cursor
 * @returns {() => void} cleanup function to restore original getSelection
 */
const mockCursorPosition = ($text, position) => {
  const textContent = $text.textContent || '';
  const textNode = $text.childNodes[0] || $text;
  const offset = position === 'end' ? textContent.length : 0;

  const origGetSelection = window.getSelection;

  const mockRange = testDocument.createRange();
  try {
    mockRange.selectNodeContents($text);
    mockRange.setEnd(textNode, offset);
  } catch {
    // If Range methods fail in happy-dom, the mock selection object
    // alone is enough — getCursorPosition will calculate position
    // from the range it creates itself.
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
      return '';
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
    window.getSelection = origGetSelection;
  };
};

/**
 * Find a direct child element matching a class name.
 * happy-dom does not support `:scope >` in querySelector, so we
 * iterate children manually.
 *
 * @param {HTMLElement} parent
 * @param {string} className
 * @returns {HTMLElement | null}
 */
const directChild = (parent, className) => {
  for (const child of parent.children) {
    if (child.classList.contains(className)) return child;
  }
  return null;
};

/**
 * Find all direct child elements matching a class name.
 *
 * @param {HTMLElement} parent
 * @param {string} className
 * @returns {HTMLElement[]}
 */
const directChildren = (parent, className) => {
  const result = [];
  for (const child of parent.children) {
    if (child.classList.contains(className)) result.push(child);
  }
  return result;
};

/**
 * Disposers for components mounted by `setup`, drained in `afterEach`.
 *
 * @type {Array<() => void>}
 */
const mountedDisposals = [];

/**
 * Set up a fresh outliner component for testing.
 * Returns helpers for pushing messages and inspecting the DOM.
 */
const setup = async () => {
  testDocument.body.innerHTML = '';

  const $parent = testDocument.createElement('div');
  $parent.id = 'messages';
  testDocument.body.appendChild($parent);

  const $end = testDocument.createElement('div');
  $end.id = 'anchor';
  $parent.appendChild($end);

  const { channel, pushMessage, members, postCalls } = makeMockChannel();
  members.set('member-1', {
    proposedName: 'Alice',
    pedigree: [],
    pedigreeMemberIds: [],
  });
  members.set('member-2', {
    proposedName: 'Bob',
    pedigree: [],
    pedigreeMemberIds: [],
  });

  // Start component (runs indefinitely via for-await-of)
  outlinerComponent($parent, $end, channel, {
    showValue: () => {},
    personaId: 'test-persona',
    ownMemberId: 'member-1',
    powers: undefined,
    onReply: () => {},
    onThreadOpen: () => {},
    onThreadClose: () => {},
    chatBarAPI: undefined,
    onFork: undefined,
    onShare: undefined,
    onMentionNotify: undefined,
    onBookmark: undefined,
  });

  // Wait for async setup (getProposedName, getMember, followMessages) by polling
  // for the control API rather than racing a fixed delay on a loaded CI runner.
  await waitFor(() => !!$parent.channelAPI);

  // Dispose the component after the test so its `for await` consumer loop and
  // timers stop before the shared DOM is torn down.
  mountedDisposals.push(() => {
    const api = /** @type {any} */ ($parent).channelAPI;
    if (api) api.dispose();
  });

  /**
   * Push messages and wait for them all to render as committed nodes. Polling
   * the rendered `[data-key]` nodes is robust against the batch debounce, where
   * a fixed delay races the render on a loaded runner.
   *
   * @param {unknown[]} msgs
   */
  const pushAll = async msgs => {
    for (const msg of msgs) {
      pushMessage(msg);
    }
    await waitFor(() =>
      msgs.every(msg => !!$parent.querySelector(`[data-key="${msg.number}"]`)),
    );
  };

  return {
    $parent,
    $end,
    pushAll,
    postCalls,
  };
};

test.afterEach(async () => {
  while (mountedDisposals.length > 0) {
    const dispose = /** @type {() => void} */ (mountedDisposals.pop());
    dispose();
  }
  // Let the iterator's return() and pending timers settle (macrotask) before
  // detaching the DOM, matching forum.test.js.
  await tick(0);
  testDocument.body.innerHTML = '';
});

test.after(() => {
  cleanupDOM();
});

// ---- Enter key creates child draft (reply), not sibling ----

test.serial(
  'Enter at end of committed message creates draft as child (reply)',
  async t => {
    const { $parent, pushAll } = await setup();

    // Create a simple tree: root (1) → child (2)
    await pushAll([
      makeMessage(1, 'Root message'),
      makeMessage(2, 'Child message', { replyTo: 1 }),
    ]);

    // Find message 2's outliner node and its text element
    const $msg2Node = $parent.querySelector('[data-key="2"]');
    t.truthy($msg2Node, 'message 2 node should exist in the DOM');

    const $msg2Text = $msg2Node.querySelector('.outliner-text');
    t.truthy($msg2Text, 'message 2 should have an outliner-text element');
    t.is($msg2Node.dataset.depth, '1', 'message 2 should be at depth 1');

    // Mock cursor position at end of text
    const restoreSelection = mockCursorPosition($msg2Text, 'end');

    // Dispatch Enter keydown on the text element
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    $msg2Text.dispatchEvent(enterEvent);

    // Poll for the draft to be inserted (it appears via requestAnimationFrame)
    // rather than racing a fixed delay.
    await waitFor(() => {
      const $children = directChild($msg2Node, 'outliner-children');
      return !!$children && !!directChild($children, 'outliner-draft');
    });

    restoreSelection();

    // The draft should be INSIDE message 2's children container (a child/reply)
    const $msg2Children = directChild($msg2Node, 'outliner-children');
    t.truthy($msg2Children, 'message 2 should have a children container');

    const $draftInMsg2 = directChild($msg2Children, 'outliner-draft');
    t.truthy(
      $draftInMsg2,
      "draft should be inside message 2's children (as a reply to it)",
    );

    // The draft should be at depth 2 (one deeper than message 2)
    t.is(
      $draftInMsg2.dataset.depth,
      '2',
      'draft should be at depth 2 (child of depth-1 message)',
    );

    // Negative check: message 1's children should NOT have a direct draft child
    const $msg1Node = $parent.querySelector('[data-key="1"]');
    const $msg1Children = directChild($msg1Node, 'outliner-children');
    const draftsInMsg1 = directChildren($msg1Children, 'outliner-draft');
    t.is(
      draftsInMsg1.length,
      0,
      'draft should NOT be a direct child of message 1 (not a sibling of message 2)',
    );
  },
);

test.serial(
  'Enter at start of committed message creates draft before (as sibling)',
  async t => {
    const { $parent, pushAll } = await setup();

    // Create a simple tree: root (1) → child (2)
    await pushAll([
      makeMessage(1, 'Root message'),
      makeMessage(2, 'Child message', { replyTo: 1 }),
    ]);

    // Find message 2's text element
    const $msg2Node = $parent.querySelector('[data-key="2"]');
    t.truthy($msg2Node, 'message 2 node should exist');

    const $msg2Text = $msg2Node.querySelector('.outliner-text');
    t.truthy($msg2Text, 'message 2 should have text element');

    // Mock cursor position at start of text
    const restoreSelection = mockCursorPosition($msg2Text, 'start');

    // Dispatch Enter keydown
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    $msg2Text.dispatchEvent(enterEvent);

    // Poll for the sibling draft to land in message 1's children.
    await waitFor(() => {
      const $m1 = $parent.querySelector('[data-key="1"]');
      const $children = $m1 && directChild($m1, 'outliner-children');
      return (
        !!$children && directChildren($children, 'outliner-draft').length === 1
      );
    });

    restoreSelection();

    // The draft should be in message 1's children (sibling of message 2,
    // placed before it)
    const $msg1Node = $parent.querySelector('[data-key="1"]');
    const $msg1Children = directChild($msg1Node, 'outliner-children');
    t.truthy($msg1Children, 'message 1 should have a children container');
    const draftsInMsg1 = directChildren($msg1Children, 'outliner-draft');
    t.is(
      draftsInMsg1.length,
      1,
      'draft should be a sibling of message 2 (inside message 1 children)',
    );

    // The draft should be at depth 1 (same level as message 2)
    t.is(
      draftsInMsg1[0].dataset.depth,
      '1',
      'draft should be at depth 1 (sibling of message 2)',
    );
  },
);

test.serial(
  'Enter at end of root message creates draft as child of root',
  async t => {
    const { $parent, pushAll } = await setup();

    // Create a single root message
    await pushAll([makeMessage(1, 'Root message')]);

    const $msg1Node = $parent.querySelector('[data-key="1"]');
    t.truthy($msg1Node, 'message 1 node should exist');

    const $msg1Text = $msg1Node.querySelector('.outliner-text');
    t.truthy($msg1Text, 'message 1 should have text element');
    t.is($msg1Node.dataset.depth, '0', 'root should be at depth 0');

    // Mock cursor at end
    const restoreSelection = mockCursorPosition($msg1Text, 'end');

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    $msg1Text.dispatchEvent(enterEvent);

    // Poll for the child draft to land in the root's children.
    await waitFor(() => {
      const $children = directChild($msg1Node, 'outliner-children');
      return !!$children && !!directChild($children, 'outliner-draft');
    });

    restoreSelection();

    // Draft should be inside message 1's children (a reply to it)
    const $msg1Children = directChild($msg1Node, 'outliner-children');
    t.truthy($msg1Children, 'message 1 should have a children container');
    const $draft = directChild($msg1Children, 'outliner-draft');
    t.truthy($draft, 'draft should be inside root message children');
    t.is($draft.dataset.depth, '1', 'draft should be at depth 1');
  },
);
