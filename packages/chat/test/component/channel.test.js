// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { channelComponent } from '@endo/space-channel/channel-component.js';
import { createDOM, tick } from '../helpers/dom-setup.js';

// The default multiuser channel body view, migrated from imperative DOM to a
// confined Preact component rendered through `renderConfined`. It composes the
// reused imperative helpers (profile-popup author chips, react-utils react
// buttons and pills, channel-utils three-dot menu) as HOST NODES bridged into
// anchor slots after each render, so this test exercises the confined chrome,
// the host-node bridge, threading / the thread drill-down view, the richer
// channelAPI contract (closeThread / focusOnNode / dispose), and the
// attachments-with-no-inline-slot trailing chip — with a mock channel and spy
// callbacks, no real powers.

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
 * caller's assertion reports the real difference). The confined re-render plus
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
const makeMockChannel = ({ name = 'test-channel' } = {}) => {
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
  date: new Date().toISOString(),
  memberId: opts.memberId || 'member-1',
  strings: [text],
  names: opts.names || [],
  ids: opts.ids || [],
  ...(opts.replyTo !== undefined ? { replyTo: String(opts.replyTo) } : {}),
  ...(opts.replyType !== undefined ? { replyType: opts.replyType } : {}),
});

/**
 * Mount the channel component exactly as chat.js does:
 * channelViewFn($messages, $anchor, channelRef, { ...options }).
 */
const setup = async () => {
  testDocument.body.innerHTML = '';

  const $parent = testDocument.createElement('div');
  $parent.id = 'messages';
  $parent.dataset.viewMode = 'channel';
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
  /** @type {object[]} */
  const threadOpenCalls = [];
  let threadCloseCount = 0;

  // channelComponent awaits internally and only resolves once the
  // followMessages loop is started; the loop runs to completion only when the
  // iterator ends, so we do NOT await the returned promise here.
  channelComponent($parent, $end, channel, {
    showValue: (value, id, petNamePath) =>
      showValueCalls.push({ value, id, petNamePath }),
    personaId: 'test-persona',
    ownMemberId: 'member-1',
    onReply: info => replyCallbacks.push(info),
    onThreadOpen: info => threadOpenCalls.push(info),
    onThreadClose: () => {
      threadCloseCount += 1;
    },
    onShare: (chain, preview) => shareCallbacks.push({ chain, preview }),
    onFork: async (chain, preview) => {
      forkCallbacks.push({ chain, preview });
    },
  }).catch(err => {
    console.error('channelComponent error:', err);
  });

  // Wait for async name-map setup + initial confined render + the channelAPI
  // to be hung off the parent.
  await waitFor(() => !!$parent.querySelector('.channel-message-list'));
  await waitFor(() => !!$parent.channelAPI);

  const api = $parent.channelAPI;

  // Track pushed messages so `push` can poll for the message to render into the
  // chronological list (one `.message-wrapper` per message) rather than racing a
  // fixed inter-push delay.
  let expectedWrappers = 0;
  const push = async msg => {
    expectedWrappers += 1;
    pushMessage(msg);
    await waitFor(
      () =>
        $parent.querySelectorAll('.message-wrapper').length >= expectedWrappers,
    );
  };

  return {
    $parent,
    push,
    api,
    replyCallbacks,
    shareCallbacks,
    forkCallbacks,
    showValueCalls,
    threadOpenCalls,
    getThreadCloseCount: () => threadCloseCount,
    posts,
  };
};

test.afterEach(() => {
  testDocument.body.innerHTML = '';
});

test.after(() => {
  cleanupDOM();
});

// ---- Layout ----

test.serial('message list is inserted before anchor, not after', async t => {
  const { $parent } = await setup();
  const $list = $parent.querySelector('.channel-message-list');
  const $anchor = $parent.querySelector('#anchor');
  t.truthy($list, 'list should exist');
  t.truthy($anchor, 'anchor should exist');

  const children = [...$parent.childNodes];
  t.true(
    children.indexOf($list) < children.indexOf($anchor),
    'message list should be before anchor',
  );
});

// ---- Basic rendering ----

test.serial('a message renders', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Hello world'));

  await waitFor(() => !!$parent.querySelector('.message-wrapper'));
  const $msg = $parent.querySelector('.message-wrapper');
  t.truthy($msg, 'a message wrapper should render');
  t.true(
    $msg.textContent.includes('Hello world'),
    `message should contain text, got: "${$msg.textContent}"`,
  );
});

test.serial('message shows author chip bridged into anchor', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Hi from Bob', { memberId: 'member-2' }));

  // Author chips are imperative DOM re-parented into the anchor.
  await waitFor(() => !!$parent.querySelector('.channel-author'));
  const $author = $parent.querySelector('.channel-author');
  t.truthy($author, 'should have an author element');
  t.is($author.dataset.memberId, 'member-2', 'author carries the memberId');
});

test.serial('react button is bridged into the action bar', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'A message'));

  // react-utils createReactButton is imperative DOM bridged into its anchor.
  await waitFor(() => !!$parent.querySelector('.react-button'));
  t.truthy(
    $parent.querySelector('.react-button'),
    'react button host node should be bridged in',
  );
});

test.serial('clicking reply triggers onReply', async t => {
  const { $parent, push, replyCallbacks } = await setup();

  await push(makeMessage(0, 'Reply to this'));

  await waitFor(() => !!$parent.querySelector('.message-action-btn'));
  const $replyBtn = $parent.querySelector('.message-action-btn');
  t.truthy($replyBtn, 'should have reply button');
  $replyBtn.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  // onReply fires after async getMemberInfo.
  await waitFor(() => replyCallbacks.length > 0);
  t.is(replyCallbacks.length, 1, 'onReply should have been called');
  t.is(replyCallbacks[0].number, 0n, 'should reference the correct message');
});

// ---- Attachments-with-no-inline-slot trailing chip ----

test.serial(
  'an attachment with no inline slot is appended as a trailing chip',
  async t => {
    const { $parent, push, showValueCalls } = await setup();

    // One text string + one attached value => zero placeholder slots in the
    // rendered text. The chip must still render (appended at the end) rather
    // than being silently dropped.
    await push(
      makeMessage(0, 'See this', { names: ['gift'], ids: ['id-gift'] }),
    );

    await waitFor(() => !!$parent.querySelector('.message-body .token'));
    const $token = $parent.querySelector('.message-body .token');
    t.truthy($token, 'trailing attachment chip rendered, not dropped');
    t.true($token.textContent.includes('@gift'), 'chip shows the edge name');

    // And it remains a working token: clicking it opens the value.
    $token.dispatchEvent(new globalThis.Event('click', { bubbles: true }));
    t.is(showValueCalls.length, 1, 'showValue called on click');
    t.is(showValueCalls[0].id, 'id-gift', 'showValue receives the id');
  },
);

// ---- Threading / reply nesting ----

test.serial('a reply shows a reply indicator on the child', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Parent message'));
  await push(makeMessage(1, 'A reply', { replyTo: 0 }));

  await waitFor(() => !!$parent.querySelector('.reply-indicator'));
  t.truthy(
    $parent.querySelector('.reply-indicator'),
    'reply should carry a reply indicator',
  );
});

test.serial('a reply adds a reply-count badge to the parent', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Parent message'));
  await push(makeMessage(1, 'A reply', { replyTo: 0 }));

  await waitFor(() => !!$parent.querySelector('.reply-count'));
  const $badge = $parent.querySelector('.reply-count');
  t.truthy($badge, 'parent should have a reply-count badge');
  t.true(
    $badge.textContent.includes('1 reply'),
    `badge should show the count, got: "${$badge.textContent}"`,
  );
});

test.serial(
  'clicking the reply-count badge opens a nested thread view',
  async t => {
    const { $parent, push, threadOpenCalls } = await setup();

    await push(makeMessage(0, 'Root'));
    await push(makeMessage(1, 'Child', { replyTo: 0 }));
    await push(makeMessage(2, 'Grandchild', { replyTo: 1 }));

    await waitFor(() => !!$parent.querySelector('.reply-count'));
    const $badge = $parent.querySelector('.reply-count');
    $badge.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

    await waitFor(() => !!$parent.querySelector('.thread-view'));
    t.truthy($parent.querySelector('.thread-view'), 'thread view should open');
    t.true(
      $parent.classList.contains('thread-active'),
      'parent gets the thread-active class',
    );

    // The thread shows the root and its nested descendants.
    await waitFor(
      () =>
        $parent.querySelectorAll('.thread-messages .message-wrapper').length >=
        3,
    );
    const $threadMsgs = $parent.querySelectorAll(
      '.thread-messages .message-wrapper',
    );
    t.is($threadMsgs.length, 3, 'thread renders root + child + grandchild');

    // Depth classes reflect the nesting.
    t.truthy(
      $parent.querySelector('.thread-message.depth-0'),
      'root is at depth 0',
    );
    t.truthy(
      $parent.querySelector('.thread-message.depth-1'),
      'child is at depth 1',
    );

    // onThreadOpen fired with the root.
    t.true(threadOpenCalls.length >= 1, 'onThreadOpen should fire');
    t.is(threadOpenCalls[0].number, '0', 'thread opened on the root key');
  },
);

// ---- channelAPI contract ----

test.serial('channelAPI exposes closeThread, focusOnNode, dispose', async t => {
  const { api } = await setup();
  t.is(typeof api.closeThread, 'function', 'closeThread present');
  t.is(typeof api.focusOnNode, 'function', 'focusOnNode present');
  t.is(typeof api.dispose, 'function', 'dispose present');
});

test.serial('closeThread closes an open thread and returns true', async t => {
  const { $parent, push, api, getThreadCloseCount } = await setup();

  await push(makeMessage(0, 'Root'));
  await push(makeMessage(1, 'Child', { replyTo: 0 }));

  await waitFor(() => !!$parent.querySelector('.reply-count'));
  $parent
    .querySelector('.reply-count')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => !!$parent.querySelector('.thread-view'));
  t.true($parent.classList.contains('thread-active'), 'thread is open');

  const result = api.closeThread();
  t.true(result, 'closeThread returns true when a thread was open');

  await waitFor(() => !$parent.classList.contains('thread-active'));
  t.false(
    $parent.classList.contains('thread-active'),
    'thread-active cleared after closeThread',
  );
  t.falsy(
    $parent.querySelector('.thread-view'),
    'thread view removed after closeThread',
  );
  t.is(getThreadCloseCount(), 1, 'onThreadClose fired once');

  // With no thread open, closeThread returns false.
  t.false(api.closeThread(), 'closeThread returns false with no thread open');
});

test.serial('focusOnNode opens the thread containing a node', async t => {
  const { $parent, push, api } = await setup();

  await push(makeMessage(0, 'Root'));
  await push(makeMessage(1, 'Child', { replyTo: 0 }));
  await push(makeMessage(2, 'Grandchild', { replyTo: 1 }));

  // Focus a deep node — the thread rooted at its ancestor should open.
  api.focusOnNode('2');

  await waitFor(() => !!$parent.querySelector('.thread-view'));
  t.truthy(
    $parent.querySelector('.thread-view'),
    'focusOnNode opens the thread view',
  );
  t.true(
    $parent.classList.contains('thread-active'),
    'parent is thread-active after focusOnNode',
  );
  // The focused node is present in the thread.
  await waitFor(
    () => !!$parent.querySelector('.thread-messages [data-message-id="2"]'),
  );
  t.truthy(
    $parent.querySelector('.thread-messages [data-message-id="2"]'),
    'focused node is rendered in the thread',
  );
});

test.serial('dispose unmounts the confined message list', async t => {
  const { $parent, push, api } = await setup();

  await push(makeMessage(0, 'A message'));

  t.truthy(
    $parent.querySelector('.channel-message-list'),
    'message list mounted',
  );
  api.dispose();
  t.falsy(
    $parent.querySelector('.channel-message-list'),
    'message list removed after dispose',
  );
});
