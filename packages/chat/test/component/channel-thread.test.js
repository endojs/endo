// @ts-nocheck - Component test with happy-dom

import 'ses';
import '@endo/eventual-send/shim.js';

import test from 'ava';
import { Far } from '@endo/far';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { channelComponent } from '../../channel-component.js';

const { document: testDocument, cleanup: cleanupDOM } = createDOM();

// Globals the component expects
if (!globalThis.CSS) {
  globalThis.CSS = { escape: s => s };
}
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
}

/**
 * Create a controllable mock channel.
 * Messages are pushed manually via pushMessage() and consumed by
 * the component's for-await-of loop.
 *
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {number} [opts.memberDelay] - Delay in ms for getMember calls
 */
const makeMockChannel = ({ name = 'test-channel', memberDelay = 0 } = {}) => {
  const members = new Map();
  /** @type {unknown[]} */
  const messageQueue = [];
  /** @type {Array<(msg: unknown) => void>} */
  const waitingResolvers = [];

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
        waitingResolvers.push(msg =>
          resolve({ value: msg, done: false }),
        );
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
      const info = members.get(memberId);
      if (memberDelay > 0) {
        return new Promise(resolve =>
          setTimeout(() => resolve(info), memberDelay),
        );
      }
      return info;
    },
    followMessages() {
      return messagesIterator;
    },
  });

  return { channel, pushMessage, members };
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
 * Set up a fresh channel component for testing.
 * Returns helpers for pushing messages and inspecting the DOM.
 *
 * @param {object} [opts]
 * @param {number} [opts.memberDelay] - Delay in ms for getMember calls
 */
const setup = async ({ memberDelay = 0 } = {}) => {
  testDocument.body.innerHTML = '';

  const $parent = testDocument.createElement('div');
  $parent.id = 'messages';
  testDocument.body.appendChild($parent);

  const $end = testDocument.createElement('div');
  $end.id = 'anchor';
  $parent.appendChild($end);

  const { channel, pushMessage, members } = makeMockChannel({ memberDelay });
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

  const replyCallbacks = [];
  const threadOpenCallbacks = [];
  const threadCloseCallbacks = [];

  // Start component (runs indefinitely via for-await-of)
  channelComponent($parent, $end, channel, {
    showValue: () => {},
    personaId: 'test-persona',
    ownMemberId: 'member-1',
    onReply: info => replyCallbacks.push(info),
    onThreadOpen: info => threadOpenCallbacks.push(info),
    onThreadClose: () => threadCloseCallbacks.push(true),
  });

  // Wait for async setup (getProposedName, getMember, followMessages)
  await tick(50);

  /** Push a message and wait for it to render. */
  const push = async (msg, ms = 80) => {
    pushMessage(msg);
    await tick(ms);
  };

  return { $parent, $end, push, replyCallbacks, threadOpenCallbacks, threadCloseCallbacks };
};

test.afterEach(() => {
  // Remove thread-active from any in-DOM elements to prevent stale
  // Escape handlers from interfering with subsequent tests.
  const el = testDocument.getElementById('messages');
  if (el) el.classList.remove('thread-active');
  testDocument.body.innerHTML = '';
});

test.after(() => {
  cleanupDOM();
});

// ---- Chronological view ----

test.serial('messages render in chronological view', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(1, 'Hello'));
  await push(makeMessage(2, 'World'));

  const wrappers = $parent.querySelectorAll('.message-wrapper');
  t.is(wrappers.length, 2);
});

test.serial('reply message shows reply indicator', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(1, 'Hello'));
  await push(makeMessage(2, 'A reply', { replyTo: 1 }));

  const indicators = $parent.querySelectorAll('.reply-indicator');
  t.is(indicators.length, 1);
});

test.serial('reply count badge appears and updates', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(1, 'Root'));
  await push(makeMessage(2, 'Reply 1', { replyTo: 1 }));

  const badges = $parent.querySelectorAll('.reply-count');
  t.is(badges.length, 1);
  t.is(badges[0].textContent, '1 reply');

  await push(makeMessage(3, 'Reply 2', { replyTo: 1 }));
  t.is(badges[0].textContent, '2 replies');
});

test.serial('reply button calls onReply callback', async t => {
  const { $parent, push, replyCallbacks } = await setup();

  await push(makeMessage(1, 'Hello world'));

  const $replyBtn = $parent.querySelector('.message-action-btn');
  t.truthy($replyBtn, 'reply button should exist');
  $replyBtn.click();

  t.is(replyCallbacks.length, 1);
  t.is(replyCallbacks[0].number, 1n);
  t.is(replyCallbacks[0].preview, 'Hello world');
});

// ---- Thread view ----

test.serial('clicking reply count opens thread view', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(1, 'Root'));
  await push(makeMessage(2, 'Reply', { replyTo: 1 }));

  const $badge = $parent.querySelector('.reply-count');
  t.truthy($badge, 'reply count badge should exist');
  $badge.click();
  await tick(100);

  t.true(
    $parent.classList.contains('thread-active'),
    'should have thread-active class',
  );
  t.truthy(
    $parent.querySelector('.thread-view'),
    'thread view element should exist',
  );
});

test.serial('thread view contains root and reply with correct depth', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(1, 'Root'));
  await push(makeMessage(2, 'Reply', { replyTo: 1 }));

  $parent.querySelector('.reply-count').click();
  await tick(100);

  const threadMsgs = $parent.querySelectorAll('.thread-message');
  t.is(threadMsgs.length, 2, 'thread should contain root and reply');
  t.true(threadMsgs[0].classList.contains('depth-0'));
  t.true(threadMsgs[1].classList.contains('depth-1'));
});

test.serial('back button closes thread view', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(1, 'Root'));
  await push(makeMessage(2, 'Reply', { replyTo: 1 }));

  $parent.querySelector('.reply-count').click();
  await tick(100);

  t.true($parent.classList.contains('thread-active'));

  const $back = $parent.querySelector('.thread-back');
  t.truthy($back, 'back button should exist');
  $back.click();
  await tick(50);

  t.false(
    $parent.classList.contains('thread-active'),
    'thread-active should be removed after back',
  );
  t.falsy(
    $parent.querySelector('.thread-view'),
    'thread view should be removed after back',
  );
});

test.serial('Channel breadcrumb closes thread view', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(1, 'Root'));
  await push(makeMessage(2, 'Reply', { replyTo: 1 }));

  $parent.querySelector('.reply-count').click();
  await tick(100);

  const crumbs = $parent.querySelectorAll('.thread-crumb');
  // First crumb should be "Channel"
  const $channelCrumb = crumbs[0];
  t.is($channelCrumb.textContent, 'Channel');
  $channelCrumb.click();
  await tick(50);

  t.false($parent.classList.contains('thread-active'));
  t.falsy($parent.querySelector('.thread-view'));
});

test.serial('new reply appears in thread view (live update)', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(1, 'Root'));
  await push(makeMessage(2, 'Reply 1', { replyTo: 1 }));

  // Open thread view
  $parent.querySelector('.reply-count').click();
  await tick(100);

  let threadMsgs = $parent.querySelectorAll('.thread-message');
  t.is(threadMsgs.length, 2);

  // Push a new reply while thread is open
  await push(makeMessage(3, 'Reply 2', { replyTo: 1 }));
  await tick(100);

  threadMsgs = $parent.querySelectorAll('.thread-message');
  t.is(threadMsgs.length, 3, 'new reply should appear in thread view');
});

test.serial('nested reply in thread view (live update)', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(1, 'Root'));
  await push(makeMessage(2, 'Reply to root', { replyTo: 1 }));

  // Open thread view
  $parent.querySelector('.reply-count').click();
  await tick(100);

  // Push a reply to the reply (depth 2) while thread is open
  await push(makeMessage(3, 'Reply to reply', { replyTo: 2 }));
  await tick(100);

  const threadMsgs = $parent.querySelectorAll('.thread-message');
  t.is(threadMsgs.length, 3, 'nested reply should appear in thread view');
  t.true(threadMsgs[2].classList.contains('depth-2'));
});

test.serial('thread view shows breadcrumb with thread number', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(1, 'Root'));
  await push(makeMessage(2, 'Reply', { replyTo: 1 }));

  $parent.querySelector('.reply-count').click();
  await tick(100);

  const crumbs = $parent.querySelectorAll('.thread-crumb');
  t.true(crumbs.length >= 2, 'should have Channel and Thread crumbs');
  t.is(crumbs[0].textContent, 'Channel');
  t.is(crumbs[1].textContent, 'Thread #1');
});

// ---- Race condition tests (simulated async latency) ----

test.serial(
  'hideThreadView cancels in-flight render (generation counter)',
  async t => {
    // Use delayed getMember to create a real async gap during showThreadView.
    const { $parent, push } = await setup({ memberDelay: 40 });

    await push(makeMessage(1, 'Root'), 150);
    await push(makeMessage(2, 'Reply', { replyTo: 1 }), 150);

    // Click badge to open thread (starts async showThreadView, not awaited)
    $parent.querySelector('.reply-count').click();
    // Immediately close before the render completes
    // hideThreadView should bump the generation counter so the in-flight
    // render bails out after its await instead of re-inserting the view.
    await tick(5);
    const $back = $parent.querySelector('.thread-back');
    // If the back button isn't available yet (still rendering), simulate
    // hideThreadView via the Channel crumb or Escape.  The point is that
    // after hiding, no stale render should re-insert the thread view.
    if ($back) {
      $back.click();
    } else {
      // Dispatch Escape directly
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      testDocument.dispatchEvent(ev);
    }
    await tick(200);

    t.false(
      $parent.classList.contains('thread-active'),
      'thread-active should stay removed after hide + stale render',
    );
    t.falsy(
      $parent.querySelector('.thread-view'),
      'no orphaned thread-view should remain in the DOM',
    );
  },
);

test.serial(
  'live update queued during render is applied after render completes',
  async t => {
    // Use delayed getMember so the badge-triggered showThreadView takes
    // real time, overlapping with message arrivals.
    const { $parent, push } = await setup({ memberDelay: 30 });

    await push(makeMessage(1, 'Root'), 150);
    await push(makeMessage(2, 'Reply 1', { replyTo: 1 }), 150);

    // Open thread via badge (starts slow showThreadView)
    $parent.querySelector('.reply-count').click();

    // Push a reply while the initial render is in progress.
    // Without the re-render queue this reply would be lost because the
    // message loop's showThreadView call hits the threadViewRendering guard.
    await tick(5);
    await push(makeMessage(3, 'Reply 2', { replyTo: 1 }), 10);

    // Wait long enough for the initial render + queued re-render to finish.
    await tick(400);

    const threadMsgs = $parent.querySelectorAll('.thread-message');
    t.is(
      threadMsgs.length,
      3,
      'reply pushed during initial render should appear via queued re-render',
    );
  },
);

// ---- onThreadOpen / onThreadClose callback tests ----

test.serial('onThreadOpen fires when thread view opens', async t => {
  const { $parent, push, threadOpenCallbacks } = await setup();

  await push(makeMessage(1, 'Root message'));
  await push(makeMessage(2, 'Reply', { replyTo: 1 }));

  $parent.querySelector('.reply-count').click();
  await tick(100);

  t.is(threadOpenCallbacks.length, 1, 'onThreadOpen should be called once');
  t.is(threadOpenCallbacks[0].number, '1');
  t.is(threadOpenCallbacks[0].preview, 'Root message');
});

test.serial('onThreadClose fires when back button closes thread', async t => {
  const { $parent, push, threadCloseCallbacks } = await setup();

  await push(makeMessage(1, 'Root'));
  await push(makeMessage(2, 'Reply', { replyTo: 1 }));

  $parent.querySelector('.reply-count').click();
  await tick(100);

  t.is(threadCloseCallbacks.length, 0, 'onThreadClose not called yet');

  $parent.querySelector('.thread-back').click();
  await tick(50);

  t.is(threadCloseCallbacks.length, 1, 'onThreadClose should be called once');
});

test.serial('onThreadClose fires when Escape closes thread', async t => {
  const { $parent, push, threadCloseCallbacks } = await setup();

  await push(makeMessage(1, 'Root'));
  await push(makeMessage(2, 'Reply', { replyTo: 1 }));

  $parent.querySelector('.reply-count').click();
  await tick(100);

  const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  testDocument.dispatchEvent(ev);
  await tick(50);

  t.is(threadCloseCallbacks.length, 1, 'onThreadClose should fire on Escape');
});

test.serial('onThreadClose fires when Channel breadcrumb closes thread', async t => {
  const { $parent, push, threadCloseCallbacks } = await setup();

  await push(makeMessage(1, 'Root'));
  await push(makeMessage(2, 'Reply', { replyTo: 1 }));

  $parent.querySelector('.reply-count').click();
  await tick(100);

  const crumbs = $parent.querySelectorAll('.thread-crumb');
  crumbs[0].click(); // "Channel" crumb
  await tick(50);

  t.is(threadCloseCallbacks.length, 1, 'onThreadClose should fire on breadcrumb click');
});

// ---- Reply indicator opens full thread from root ----

test.serial(
  'clicking reply indicator opens thread rooted at the topmost ancestor',
  async t => {
    const { $parent, push } = await setup();

    // Build a chain: 1 → 2 → 3 (message 3 replies to 2, which replies to 1)
    await push(makeMessage(1, 'Root'));
    await push(makeMessage(2, 'Reply to root', { replyTo: 1 }));
    await push(makeMessage(3, 'Reply to reply', { replyTo: 2 }));

    // Click the reply indicator on message 3 (which shows "↩ Reply to root" / message 2)
    const indicators = $parent.querySelectorAll('.reply-indicator');
    // Message 2 has a reply indicator (replying to 1) and message 3 has one (replying to 2)
    t.is(indicators.length, 2, 'should have two reply indicators');
    // Click the indicator on message 3 (the deepest one)
    indicators[1].click();
    await tick(100);

    t.true(
      $parent.classList.contains('thread-active'),
      'thread view should open',
    );

    // The thread should be rooted at message 1 (the topmost ancestor),
    // showing all three messages in the chain.
    const threadMsgs = $parent.querySelectorAll('.thread-message');
    t.is(threadMsgs.length, 3, 'thread should contain entire chain from root');
    t.true(threadMsgs[0].classList.contains('depth-0'), 'root at depth 0');
    t.true(threadMsgs[1].classList.contains('depth-1'), 'first reply at depth 1');
    t.true(threadMsgs[2].classList.contains('depth-2'), 'second reply at depth 2');

    // Breadcrumb should reference the root message
    const crumbs = $parent.querySelectorAll('.thread-crumb');
    t.is(crumbs[1].textContent, 'Thread #1');
  },
);

// ---- Conversation-back integration: thread → channel → new thread ----

test.serial(
  'conversation-back closes thread and stays in channel, then new thread works',
  async t => {
    const { $parent, $end, push, threadCloseCallbacks } = await setup();

    await push(makeMessage(1, 'Root'));
    await push(makeMessage(2, 'Reply to root', { replyTo: 1 }));
    await push(makeMessage(3, 'Another root'));
    await push(makeMessage(4, 'Reply to another', { replyTo: 3 }));

    // Open thread on message 1
    const badges = $parent.querySelectorAll('.reply-count');
    t.is(badges.length, 2, 'should have two reply count badges');
    badges[0].click();
    await tick(100);

    t.true(
      $parent.classList.contains('thread-active'),
      'thread should be open',
    );

    // Simulate what #conversation-back should do:
    // Use the closeThread() API exposed by channelComponent.
    // This should close the thread and keep us in the channel.
    const closed = $parent.channelAPI.closeThread();
    t.true(closed, 'closeThread() should return true when thread was active');
    await tick(50);

    t.false(
      $parent.classList.contains('thread-active'),
      'thread-active should be removed after closeThread()',
    );
    t.is(threadCloseCallbacks.length, 1, 'onThreadClose should fire');

    // Channel messages should be visible
    const wrappers = $parent.querySelectorAll('.message-wrapper');
    t.true(wrappers.length >= 4, 'all channel messages should be visible');

    // Open a different thread (message 3)
    const newBadges = $parent.querySelectorAll('.reply-count');
    t.true(newBadges.length >= 2, 'reply count badges should still exist');
    newBadges[1].click();
    await tick(100);

    t.true(
      $parent.classList.contains('thread-active'),
      'second thread should open',
    );
    t.truthy(
      $parent.querySelector('.thread-back'),
      'second thread should have a back button',
    );

    // Close the second thread via its own back button
    $parent.querySelector('.thread-back').click();
    await tick(50);

    t.false(
      $parent.classList.contains('thread-active'),
      'second thread should be closed',
    );
    t.is(threadCloseCallbacks.length, 2, 'onThreadClose should fire again');
  },
);

test.serial(
  'switchChannel cleanup: thread-active removed when children are cleared',
  async t => {
    const { $parent, $end, push } = await setup();

    await push(makeMessage(1, 'Root'));
    await push(makeMessage(2, 'Reply', { replyTo: 1 }));

    // Open thread
    $parent.querySelector('.reply-count').click();
    await tick(100);

    t.true($parent.classList.contains('thread-active'));

    // Simulate switchChannel tearing down channel: use closeThread API
    // to properly clean up before clearing children.
    $parent.channelAPI.closeThread();

    t.false(
      $parent.classList.contains('thread-active'),
      'thread-active must be removed before new channel renders',
    );

    // Now simulate clearing children (like switchChannel does)
    while ($parent.firstChild !== $end) {
      /** @type {ChildNode} */ ($parent.firstChild).remove();
    }

    // A new channel component would start fresh — messages should not be hidden
    // by a leftover thread-active class.
    t.false($parent.classList.contains('thread-active'));
  },
);
