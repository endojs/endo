// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { microblogComponent } from '@endo/space-channel/microblog-component.js';
import { createDOM, tick } from '../helpers/dom-setup.js';

// The microblog body view, migrated from imperative DOM to a confined Preact
// component rendered through `renderConfined`. It composes the reused imperative
// helpers (channel-utils author chips + profile popup, react-utils react buttons
// and pills) as HOST NODES bridged into anchor slots after each render, so this
// test exercises the confined chrome, the host-node bridge, and the message
// consumer / debounced re-render — with a mock channel and spy callbacks, no
// real powers.

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
 * caller's assertion reports the real difference). The debounced re-render
 * (150ms) plus Preact's effect flush make a fixed delay race on slow runners;
 * polling the actual condition is robust.
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
const makeMockChannel = ({ name = 'test-microblog' } = {}) => {
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
 * Mount the microblog exactly as chat.js does:
 * channelViewFn($messages, $anchor, channelRef, { ...options }).
 */
const setup = async () => {
  testDocument.body.innerHTML = '';

  const $parent = testDocument.createElement('div');
  $parent.id = 'messages';
  // chat.js sets this; the markup must keep working under the selector.
  $parent.dataset.viewMode = 'microblog';
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

  const apiPromise = microblogComponent($parent, $end, channel, {
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
    console.error('microblogComponent error:', err);
    throw err;
  });

  // Wait for async createChannelState + initial confined render.
  await waitFor(() => !!$parent.querySelector('.microblog-feed'));

  const api = await apiPromise;

  const push = async msg => {
    pushMessage(msg);
    // Kept as a deliberate timing device: the feed coalesces messages behind a
    // 150ms debounce, so this waits past that window for the re-render to land.
    // This shared helper can't know what a given test pushed (bios become the
    // header, replies/edits fold into an existing post rather than adding one),
    // so there is no single positive count/selector to poll generically.
    await tick(220);
  };

  return {
    $parent,
    push,
    api,
    replyCallbacks,
    shareCallbacks,
    forkCallbacks,
    showValueCalls,
    posts,
  };
};

test.afterEach(() => {
  testDocument.body.innerHTML = '';
});

test.after(() => {
  cleanupDOM();
});

// ---- Layout and scroll position ----

test.serial('feed is inserted before anchor, not after', async t => {
  const { $parent } = await setup();
  const $feed = $parent.querySelector('.microblog-feed');
  const $anchor = $parent.querySelector('#anchor');
  t.truthy($feed, 'feed should exist');
  t.truthy($anchor, 'anchor should exist');

  const children = [...$parent.childNodes];
  const feedIdx = children.indexOf($feed);
  const anchorIdx = children.indexOf($anchor);
  t.true(
    feedIdx < anchorIdx,
    `feed (${feedIdx}) should be before anchor (${anchorIdx})`,
  );
});

test.serial('feed is first visible content in container', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'A post'));

  const $feed = $parent.querySelector('.microblog-feed');
  t.truthy($feed, 'feed should exist');
  t.is(
    $parent.firstElementChild,
    $feed,
    'feed should be the first element in the messages container',
  );
});

test.serial('scrollTop is 0 after initial load', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Post one'));
  await push(makeMessage(2, 'Post two'));

  t.is($parent.scrollTop, 0, 'should be scrolled to top after initial load');
});

// ---- Basic rendering ----

test.serial('feed, header and posts containers are created', async t => {
  const { $parent } = await setup();
  t.truthy(
    $parent.querySelector('.microblog-feed'),
    'should have a .microblog-feed',
  );
  await waitFor(() => !!$parent.querySelector('.microblog-posts'));
  t.truthy(
    $parent.querySelector('.microblog-header'),
    'should have a .microblog-header',
  );
  t.truthy(
    $parent.querySelector('.microblog-posts'),
    'should have a .microblog-posts container',
  );
});

test.serial('first root message becomes profile header', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'This is my bio'));

  const $header = $parent.querySelector('.microblog-header');
  t.truthy($header, 'header should exist');
  t.true(
    $header.textContent.includes('bio'),
    `header should contain bio text, got: "${$header.textContent}"`,
  );
  // The bio body keeps both class names.
  t.truthy(
    $parent.querySelector('.microblog-header-bio'),
    'bio body keeps the header-bio class',
  );
});

test.serial('second root message renders as a post', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'My first post'));

  const $posts = $parent.querySelectorAll('.microblog-post');
  t.is($posts.length, 1, 'should have one post');
  t.true(
    $posts[0].textContent.includes('first post'),
    `post should contain text, got: "${$posts[0].textContent}"`,
  );
});

test.serial(
  'an attachment with no inline slot is appended as a trailing chip',
  async t => {
    const { $parent, push } = await setup();

    await push(makeMessage(0, 'Bio'));
    // One text string + one attached value => zero placeholder slots in the
    // rendered text. The chip must still render (appended at the end) rather
    // than being silently dropped (equivalent to upstream 37ceb27c4).
    await push(
      makeMessage(1, 'See this', { names: ['gift'], ids: ['id-gift'] }),
    );

    await waitFor(() => !!$parent.querySelector('.microblog-post .token'));
    const $token = $parent.querySelector('.microblog-post .token');
    t.truthy($token, 'trailing attachment chip rendered, not dropped');
    t.true($token.textContent.includes('@gift'), 'chip shows the edge name');
  },
);

test.serial('posts appear newest-first', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'First post'));
  await push(makeMessage(2, 'Second post'));
  await push(makeMessage(3, 'Third post'));

  const $posts = $parent.querySelectorAll('.microblog-post');
  t.is($posts.length, 3, 'should have three posts');

  const texts = [...$posts].map(p => p.textContent);
  t.true(texts[0].includes('Third'), 'newest post should be first');
  t.true(texts[2].includes('First'), 'oldest post should be last');
});

test.serial('empty channel shows no-posts message', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Just a bio'));

  const $empty = $parent.querySelector('.microblog-empty');
  t.truthy($empty, 'should show empty state');
  t.true($empty.textContent.includes('No posts'), 'should say no posts');
});

// ---- Authors and host-node bridge ----

test.serial('post shows author chip bridged into anchor', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Post by Bob', { memberId: 'member-2' }));

  // Author chips are imperative DOM re-parented into the anchor.
  await waitFor(
    () => !!$parent.querySelector('.microblog-post .channel-author'),
  );
  const $author = $parent.querySelector('.microblog-post .channel-author');
  t.truthy($author, 'should have an author element');
  t.is($author.dataset.memberId, 'member-2', 'author carries the memberId');
});

test.serial('each post gets its own author chip', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Post by Alice', { memberId: 'member-1' }));
  await push(makeMessage(2, 'Post by Bob', { memberId: 'member-2' }));

  await waitFor(
    () =>
      $parent.querySelectorAll('.microblog-post .channel-author').length === 2,
  );
  const $authors = $parent.querySelectorAll('.microblog-post .channel-author');
  t.is($authors.length, 2, 'each post should have an author');
});

test.serial('post shows relative timestamp', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Recent post'));

  const $time = $parent.querySelector('.microblog-post-time');
  t.truthy($time, 'should have a time element');
  t.true($time.textContent.length > 0, 'time should have content');
});

// ---- Action bar ----

test.serial('post has interaction bar with reply, share, fork', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'A post'));

  const $actions = $parent.querySelector('.microblog-actions');
  t.truthy($actions, 'should have interaction bar');

  const $buttons = $actions.querySelectorAll('.microblog-action-btn');
  t.true(
    $buttons.length >= 3,
    `should have at least 3 action buttons, got ${$buttons.length}`,
  );
});

test.serial('react button is bridged into the action bar', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'A post'));

  // react-utils createReactButton is imperative DOM bridged into its anchor.
  await waitFor(() => !!$parent.querySelector('.microblog-post .react-button'));
  t.truthy(
    $parent.querySelector('.microblog-post .react-button'),
    'react button host node should be bridged in',
  );
});

test.serial('clicking reply button triggers onReply', async t => {
  const { $parent, push, replyCallbacks } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Reply to this'));

  const $replyBtn = $parent.querySelector(
    '.microblog-post .microblog-action-btn',
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

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'A shareable post'));

  // reply (↩), react (bridged), comments (💬), share (⇗), fork (⑂).
  const $actions = $parent.querySelector('.microblog-post .microblog-actions');
  const $btns = $actions.querySelectorAll('.microblog-action-btn');
  // Share button has the ⇗ icon.
  const $shareBtn = [...$btns].find(b => b.textContent.includes('⇗'));
  t.truthy($shareBtn, 'should have a share button');
  $shareBtn.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  t.is(shareCallbacks.length, 1, 'onShare should have been called');
  t.is(shareCallbacks[0].chain.length, 1, 'heritage chain has one message');
});

// ---- Replies / comments ----

test.serial('replies become comments, not new posts', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'A post'));
  await push(makeMessage(2, 'A comment on the post', { replyTo: 1 }));

  const $posts = $parent.querySelectorAll('.microblog-post');
  t.is($posts.length, 1, 'reply should not create a new post');

  const $countEl = $posts[0].querySelector('.microblog-action-count');
  t.truthy($countEl, 'should show comment count');
  t.is($countEl.textContent, '1', 'comment count should be 1');
});

test.serial('edit-type replies do not render as posts', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Original post'));
  await push(makeMessage(2, 'Edited text', { replyTo: 1, replyType: 'edit' }));

  const $posts = $parent.querySelectorAll('.microblog-post');
  t.is($posts.length, 1, 'edit should not create a second post');
});

test.serial(
  'expanding a post reveals its comments with their own action bars',
  async t => {
    const { $parent, push } = await setup();

    await push(makeMessage(0, 'Bio'));
    await push(makeMessage(1, 'A post'));
    await push(makeMessage(2, 'Comment on post', { replyTo: 1 }));
    await push(makeMessage(3, 'Reply to comment', { replyTo: 2 }));

    // Click the comments toggle (the action button carrying a count).
    const $actionBtns = $parent.querySelectorAll(
      '.microblog-post > .microblog-actions .microblog-action-btn',
    );
    const $commentsBtn = [...$actionBtns].find(
      btn => btn.querySelector('.microblog-action-count') !== null,
    );
    t.truthy($commentsBtn, 'post should have a comment toggle with a count');
    $commentsBtn.dispatchEvent(
      new globalThis.Event('click', { bubbles: true }),
    );

    await waitFor(() => !!$parent.querySelector('.microblog-comments-section'));

    const $commentSection = $parent.querySelector(
      '.microblog-comments-section',
    );
    t.truthy($commentSection, 'comments section should be expanded');

    const $commentActions = $commentSection.querySelector('.microblog-actions');
    t.truthy($commentActions, 'comment should have its own action bar');

    // The nested comment shows its own reply count of 1.
    const $nestedCount = $commentSection.querySelector(
      '.microblog-action-count',
    );
    t.truthy($nestedCount, 'nested comment should show a reply count');
    t.is($nestedCount.textContent, '1', 'should show count of 1 nested reply');
  },
);

// ---- Token chips ----

test.serial('token chip opens value via showValue', async t => {
  const { $parent, push, showValueCalls } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push({
    type: 'package',
    messageId: 'msg-1',
    number: 1n,
    date: new Date().toISOString(),
    memberId: 'member-1',
    strings: ['See ', ' here'],
    names: ['thing'],
    ids: ['endo://localhost/?id=abc'],
  });

  await waitFor(() => !!$parent.querySelector('.microblog-post .token'));
  const $token = $parent.querySelector('.microblog-post .token');
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

// ---- Teardown ----

test.serial('dispose unmounts the confined feed', async t => {
  const { $parent, push, api } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'A post'));

  t.truthy($parent.querySelector('.microblog-feed'), 'feed mounted');
  api.dispose();
  t.falsy(
    $parent.querySelector('.microblog-feed'),
    'feed removed after dispose',
  );
});
