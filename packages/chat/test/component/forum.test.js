// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { forumComponent } from '@endo/space-channel/forum-component.js';
import { createDOM, tick } from '../helpers/dom-setup.js';

// The forum (threaded tree) body view, migrated from imperative DOM to a
// confined Preact component rendered through `renderConfined`. It composes the
// reused imperative helpers (channel-utils author chips + profile popup,
// react-utils react buttons and pills) as HOST NODES bridged into anchor slots
// after each render, so this test exercises the confined chrome, the host-node
// bridge, the tree/recency layout, and the message consumer / debounced
// re-render — with a mock channel and spy callbacks, no real powers.

const { document: testDocument, cleanup: cleanupDOM } = createDOM();

// Globals the component / renderConfined expect.
if (!globalThis.CSS) {
  globalThis.CSS = { escape: s => s };
}
// renderConfined defers some idioms with requestAnimationFrame; dom-setup stubs
// setTimeout but not rAF, so provide a setTimeout-backed shim as a browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). The debounced re-render plus
 * Preact's effect flush make a fixed delay race on slow runners; polling the
 * actual condition is robust.
 *
 * @param {() => boolean} predicate
 * @param {{ timeout?: number, step?: number }} [opts]
 */
const waitFor = async (predicate, { timeout = 4000, step = 20 } = {}) => {
  await null; // safe-await-separator
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return;
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};

/**
 * Create a controllable mock channel that streams pushed messages.
 *
 * @param {object} [opts]
 * @param {string} [opts.name]
 */
const makeMockChannel = ({ name = 'test-forum' } = {}) => {
  const members = new Map();
  /** @type {unknown[]} */
  const messageQueue = [];
  /** @type {Array<(msg: unknown) => void>} */
  const waitingResolvers = [];
  /** @type {Array<{ method: string, args: unknown[] }>} */
  const posts = [];

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
    getMembers() {
      return [...members.entries()].map(([id, info]) => ({
        memberId: id,
        ...info,
      }));
    },
    followMessages() {
      return readerFromIterator(messagesIterator);
    },
    post(...args) {
      posts.push({ method: 'post', args });
    },
  });

  return { channel, pushMessage, members, posts };
};

/**
 * @param {number} number
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.memberId]
 * @param {number} [opts.replyTo]
 * @param {string} [opts.replyType]
 * @param {string[]} [opts.names]
 * @param {string[]} [opts.ids]
 */
const makeMessage = (number, text, opts = {}) => ({
  type: 'package',
  messageId: `msg-${number}`,
  number: BigInt(number),
  date: new Date(Date.now() + number * 1000).toISOString(),
  memberId: opts.memberId || 'member-1',
  strings: [text],
  names: opts.names || [],
  ids: opts.ids || [],
  ...(opts.replyTo !== undefined ? { replyTo: String(opts.replyTo) } : {}),
  ...(opts.replyType !== undefined ? { replyType: opts.replyType } : {}),
});

/**
 * Disposers for components mounted by `setup`, drained in `afterEach` so each
 * test's consumer loop and timers stop before the shared DOM is torn down.
 *
 * @type {Array<() => void>}
 */
const mountedDisposals = [];

/**
 * Mount the forum exactly as chat.js does:
 * channelViewFn($messages, $anchor, channelRef, { ...options }).
 */
const setup = async () => {
  testDocument.body.innerHTML = '';

  const $parent = testDocument.createElement('div');
  $parent.id = 'messages';
  // chat.js sets this; the markup must keep working under the selector.
  $parent.dataset.viewMode = 'forum';
  testDocument.body.appendChild($parent);

  const $end = testDocument.createElement('div');
  $end.id = 'anchor';
  $parent.appendChild($end);

  const { channel, pushMessage, members, posts } = makeMockChannel();
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

  /** @type {object[]} */
  const replyCallbacks = [];
  /** @type {object[]} */
  const shareCallbacks = [];
  /** @type {object[]} */
  const forkCallbacks = [];
  /** @type {object[]} */
  const showValueCalls = [];

  // forumComponent runs a `for await` consumer loop in its own body, so the
  // returned promise does not resolve until the stream ends. The control API is
  // hung off `$parent.channelAPI`; we read it from there.
  forumComponent($parent, $end, channel, {
    showValue: (value, id, petNamePath) =>
      showValueCalls.push({ value, id, petNamePath }),
    personaId: 'test-persona',
    ownMemberId: 'member-1',
    onReply: info => replyCallbacks.push(info),
    onShare: (chain, preview) => shareCallbacks.push({ chain, preview }),
    onFork: async (chain, preview) => {
      forkCallbacks.push({ chain, preview });
    },
  }).catch(err => {
    // Surface the failure as a diagnostic, but never re-throw it. Re-throwing
    // inside this detached `.catch` turns a (possibly post-teardown) consumer
    // rejection into an *unhandled* rejection that AVA attributes to whichever
    // test happens to be running — the original cross-test CI flake that showed
    // up as "N uncaught exceptions". Tests assert on observable DOM/spy state,
    // not on this promise.
    console.error('forumComponent error:', err);
  });

  // Ensure the component is disposed at end of test even if the body returns
  // early: a parked `for await` loop, its prefetch, and the initial-batch timer
  // otherwise leak across tests and fire against a torn-down DOM.
  mountedDisposals.push(() => {
    const api = /** @type {any} */ ($parent).channelAPI;
    if (api) api.dispose();
  });

  // Wait for async createChannelState + mount insertion.
  await waitFor(() => !!$parent.querySelector('.forum-view'));

  const push = async msg => {
    pushMessage(msg);
  };

  return {
    $parent,
    push,
    getApi: () => /** @type {any} */ ($parent).channelAPI,
    replyCallbacks,
    shareCallbacks,
    forkCallbacks,
    showValueCalls,
    posts,
  };
};

test.afterEach(async () => {
  // Dispose every component mounted this test so its `for await` consumer loop,
  // its reader prefetch, and any pending batch timer stop before the DOM is
  // detached. Disposing first, then letting the iterator's `return()` and any
  // in-flight microtasks settle, prevents a stray post-teardown render or
  // rejection from leaking into a later test.
  while (mountedDisposals.length > 0) {
    const dispose = /** @type {() => void} */ (mountedDisposals.pop());
    dispose();
  }
  await tick(0);
  testDocument.body.innerHTML = '';
});

test.after(() => {
  cleanupDOM();
});

// ---- Layout ----

test.serial('forum view is inserted before anchor, not after', async t => {
  const { $parent } = await setup();
  const $view = $parent.querySelector('.forum-view');
  const $anchor = $parent.querySelector('#anchor');
  t.truthy($view, 'forum view should exist');
  t.truthy($anchor, 'anchor should exist');

  const children = [...$parent.childNodes];
  const viewIdx = children.indexOf($view);
  const anchorIdx = children.indexOf($anchor);
  t.true(
    viewIdx < anchorIdx,
    `forum view (${viewIdx}) should be before anchor (${anchorIdx})`,
  );
});

// ---- Basic rendering ----

test.serial('a root message renders as a forum node', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Hello forum'));

  await waitFor(() => !!$parent.querySelector('.forum-node'));
  const $nodes = $parent.querySelectorAll('.forum-node');
  t.is($nodes.length, 1, 'should have one node');
  t.true(
    $nodes[0].textContent.includes('Hello forum'),
    `node should contain text, got: "${$nodes[0].textContent}"`,
  );
  t.true(
    $nodes[0].classList.contains('depth-0'),
    'root node should be depth-0',
  );
});

test.serial('root nodes show timestamp and message number', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'A root'));

  await waitFor(() => !!$parent.querySelector('.forum-node .timestamp-num'));
  const $num = $parent.querySelector('.forum-node .timestamp-num');
  t.truthy($num, 'should show a message number');
  t.is($num.textContent, '#0', 'number badge should be #0');

  const $time = $parent.querySelector('.forum-node .message-time');
  t.truthy($time, 'should have a time element');
  t.true($time.textContent.length > 0, 'time should have content');
});

// ---- Tree structure ----

test.serial('a reply renders as a nested (deeper) node', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Root post'));
  await push(makeMessage(1, 'A reply', { replyTo: 0 }));

  await waitFor(() => $parent.querySelectorAll('.forum-node').length === 2);
  const $nodes = $parent.querySelectorAll('.forum-node');
  t.is($nodes.length, 2, 'should have two nodes');

  const $depth1 = $parent.querySelector('.forum-node.depth-1');
  t.truthy($depth1, 'reply should be rendered at depth-1');
  t.true(
    $depth1.textContent.includes('A reply'),
    `depth-1 node should contain the reply, got: "${$depth1.textContent}"`,
  );
});

test.serial('edit-type replies do not render as nodes', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Original'));
  await push(makeMessage(1, 'Edited text', { replyTo: 0, replyType: 'edit' }));

  // Gate on the edit actually being applied (it adds an "edited by" marker to
  // the target node) so the count assertion can't run before the edit is
  // processed — the edit must fold into node 0, not spawn a second node.
  await waitFor(() => !!$parent.querySelector('.forum-edited-by'));
  const $nodes = $parent.querySelectorAll('.forum-node');
  t.is($nodes.length, 1, 'edit should not create a second tree node');
});

test.serial('a node with replies shows a collapse handle', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Root'));
  await push(makeMessage(1, 'Reply one', { replyTo: 0 }));
  await push(makeMessage(2, 'Reply two', { replyTo: 0 }));

  await waitFor(() => !!$parent.querySelector('.forum-collapse-handle'));
  const $handle = $parent.querySelector('.forum-collapse-handle');
  t.truthy($handle, 'root with replies should have a collapse handle');
  t.true(
    $handle.textContent.includes('replies'),
    `handle should show a reply count, got: "${$handle.textContent}"`,
  );
});

test.serial('clicking the collapse handle hides replies', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Root'));
  await push(makeMessage(1, 'A reply', { replyTo: 0 }));

  await waitFor(() => $parent.querySelectorAll('.forum-node').length === 2);
  const $handle = $parent.querySelector('.forum-collapse-handle');
  t.truthy($handle, 'should have a collapse handle');

  $handle.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  // After collapse, only the root node remains in the tree.
  await waitFor(() => $parent.querySelectorAll('.forum-node').length === 1);
  t.is(
    $parent.querySelectorAll('.forum-node').length,
    1,
    'collapsed root should hide its reply node',
  );
  const $root = $parent.querySelector('.forum-node');
  t.true(
    $root.classList.contains('collapsed'),
    'root node should carry the collapsed class',
  );
});

// ---- Authors and host-node bridge ----

test.serial('node shows author chip bridged into anchor', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Post by Bob', { memberId: 'member-2' }));

  // Author chips are imperative DOM re-parented into the anchor.
  await waitFor(() => !!$parent.querySelector('.forum-node .channel-author'));
  const $author = $parent.querySelector('.forum-node .channel-author');
  t.truthy($author, 'should have an author element');
  t.is($author.dataset.memberId, 'member-2', 'author carries the memberId');
});

test.serial('each node gets its own author chip', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Post by Alice', { memberId: 'member-1' }));
  await push(
    makeMessage(1, 'Reply by Bob', { memberId: 'member-2', replyTo: 0 }),
  );

  await waitFor(
    () => $parent.querySelectorAll('.forum-node .channel-author').length === 2,
  );
  const $authors = $parent.querySelectorAll('.forum-node .channel-author');
  t.is($authors.length, 2, 'each node should have an author');
});

test.serial('react button is bridged into the action bar', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'A post'));

  // react-utils createReactButton is imperative DOM bridged into its anchor.
  await waitFor(() => !!$parent.querySelector('.forum-node .react-button'));
  t.truthy(
    $parent.querySelector('.forum-node .react-button'),
    'react button host node should be bridged in',
  );
});

// ---- Action bar ----

test.serial('node has an action bar with reply, fork, share', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'A post'));

  await waitFor(() => !!$parent.querySelector('.message-actions'));
  const $actions = $parent.querySelector('.forum-node .message-actions');
  t.truthy($actions, 'should have an action bar');
  const $buttons = $actions.querySelectorAll('.message-action-btn');
  t.true(
    $buttons.length >= 3,
    `should have at least 3 action buttons, got ${$buttons.length}`,
  );
});

test.serial('clicking reply button triggers onReply', async t => {
  const { $parent, push, replyCallbacks } = await setup();

  await push(makeMessage(1, 'Reply to this'));

  await waitFor(() => !!$parent.querySelector('.message-action-btn'));
  const $replyBtn = $parent.querySelector(
    '.forum-node .message-actions .message-action-btn',
  );
  t.truthy($replyBtn, 'should have reply button');
  $replyBtn.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  // onReply fires after async getMemberInfo.
  await waitFor(() => replyCallbacks.length > 0);
  t.is(replyCallbacks.length, 1, 'onReply should have been called');
  t.is(replyCallbacks[0].number, 1n, 'should reference the correct message');
});

test.serial('clicking share button triggers onShare with heritage', async t => {
  const { $parent, push, shareCallbacks } = await setup();

  await push(makeMessage(0, 'A shareable post'));

  await waitFor(() => !!$parent.querySelector('.message-actions'));
  const $actions = $parent.querySelector('.forum-node .message-actions');
  const $btns = $actions.querySelectorAll('.message-action-btn');
  const $shareBtn = [...$btns].find(b => b.textContent.includes('⇗'));
  t.truthy($shareBtn, 'should have a share button');
  $shareBtn.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  t.is(shareCallbacks.length, 1, 'onShare should have been called');
  t.is(shareCallbacks[0].chain.length, 1, 'heritage chain has one message');
});

test.serial('clicking fork button triggers onFork with heritage', async t => {
  const { $parent, push, forkCallbacks } = await setup();

  await push(makeMessage(0, 'Root'));
  await push(makeMessage(1, 'A reply', { replyTo: 0 }));

  await waitFor(() => $parent.querySelectorAll('.forum-node').length === 2);
  const $depth1 = $parent.querySelector('.forum-node.depth-1');
  const $btns = $depth1.querySelectorAll('.message-action-btn');
  const $forkBtn = [...$btns].find(b => b.textContent.includes('⑂'));
  t.truthy($forkBtn, 'reply node should have a fork button');
  $forkBtn.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => forkCallbacks.length > 0);
  t.is(forkCallbacks.length, 1, 'onFork should have been called');
  t.is(
    forkCallbacks[0].chain.length,
    2,
    'heritage chain should include root and reply',
  );
});

// ---- Token chips ----

test.serial('token chip opens value via showValue', async t => {
  const { $parent, push, showValueCalls } = await setup();

  await push({
    type: 'package',
    messageId: 'msg-0',
    number: 0n,
    date: new Date().toISOString(),
    memberId: 'member-1',
    strings: ['See ', ' here'],
    names: ['thing'],
    ids: ['endo://localhost/?id=abc'],
  });

  await waitFor(() => !!$parent.querySelector('.forum-node .token'));
  const $token = $parent.querySelector('.forum-node .token');
  t.truthy($token, 'token chip should render');
  t.true($token.textContent.includes('@thing'), 'chip shows the edge name');

  $token.dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  t.is(showValueCalls.length, 1, 'showValue called on click');
  t.deepEqual(
    showValueCalls[0],
    {
      value: undefined,
      id: 'endo://localhost/?id=abc',
      petNamePath: ['thing'],
    },
    'showValue receives id and pet-name path',
  );
});

// ---- Control API / teardown ----

test.serial('exposes channelAPI on the parent with closeThread', async t => {
  const { getApi, push } = await setup();

  await push(makeMessage(0, 'A post'));

  const api = getApi();
  t.truthy(api, 'channelAPI should be hung off the parent');
  t.is(typeof api.closeThread, 'function', 'closeThread should be a function');
  t.is(api.closeThread(), false, 'closeThread returns false for the forum');
  t.is(typeof api.dispose, 'function', 'dispose should be a function');
});

test.serial('dispose stops the message consumer', async t => {
  const { getApi, push, $parent } = await setup();

  await push(makeMessage(0, 'A post'));
  await waitFor(() => !!$parent.querySelector('.forum-node'));

  const api = getApi();
  t.notThrows(() => api.dispose(), 'dispose should not throw');
});
