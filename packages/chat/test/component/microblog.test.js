// @ts-nocheck - Component test with happy-dom
/* global globalThis */

import 'ses';
import '@endo/eventual-send/shim.js';

import test from 'ava';
import { Far } from '@endo/far';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { microblogComponent } from '../../microblog-component.js';

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
 *
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {number} [opts.memberDelay]
 */
const makeMockChannel = ({ name = 'test-microblog', memberDelay = 0 } = {}) => {
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
      const info = members.get(memberId);
      if (memberDelay > 0) {
        return new Promise(resolve =>
          setTimeout(() => resolve(info), memberDelay),
        );
      }
      return info;
    },
    getMembers() {
      return [...members.entries()].map(([id, info]) => ({
        memberId: id,
        ...info,
      }));
    },
    followMessages() {
      return messagesIterator;
    },
  });

  return { channel, pushMessage, members };
};

/**
 * @param {number} number
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.memberId]
 * @param {number} [opts.replyTo]
 * @param {string} [opts.replyType]
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
  ...(opts.replyType !== undefined ? { replyType: opts.replyType } : {}),
});

/**
 * @param {object} [opts]
 * @param {number} [opts.memberDelay]
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

  microblogComponent($parent, $end, channel, {
    showValue: () => {},
    personaId: 'test-persona',
    ownMemberId: 'member-1',
    onReply: info => replyCallbacks.push(info),
    onFork: async () => {},
    onShare: () => {},
  }).catch(err => {
    console.error('microblogComponent error:', err);
  });

  // Wait for async setup
  await tick(50);

  const push = async (msg, ms = 250) => {
    pushMessage(msg);
    await tick(ms);
  };

  return { $parent, push, replyCallbacks };
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

  // Feed must come before anchor in DOM order so switchChannel cleanup works
  const children = [...$parent.childNodes];
  const feedIdx = children.indexOf($feed);
  const anchorIdx = children.indexOf($anchor);
  t.true(
    feedIdx < anchorIdx,
    `feed (${feedIdx}) should be before anchor (${anchorIdx})`,
  );
});

test.serial('scrollTop is 0 after initial load', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Post one'));
  await push(makeMessage(2, 'Post two'));

  t.is($parent.scrollTop, 0, 'should be scrolled to top after initial load');
});

test.serial('feed is first visible content in container', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'A post'));

  const $feed = $parent.querySelector('.microblog-feed');
  t.truthy($feed, 'feed should exist');
  // The feed should be the first element child of $parent
  t.is(
    $parent.firstElementChild,
    $feed,
    'feed should be the first element in the messages container',
  );
});

// ---- Basic rendering ----

test.serial('feed container is created', async t => {
  const { $parent } = await setup();
  const $feed = $parent.querySelector('.microblog-feed');
  t.truthy($feed, 'should have a .microblog-feed container');
  const $header = $parent.querySelector('.microblog-header');
  t.truthy($header, 'should have a .microblog-header');
  const $posts = $parent.querySelector('.microblog-posts');
  t.truthy($posts, 'should have a .microblog-posts container');
});

test.serial('first root message becomes profile header', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'This is my bio'));

  const $header = $parent.querySelector('.microblog-header');
  t.truthy($header, 'header should exist');
  const headerText = $header.textContent;
  t.true(
    headerText.includes('bio'),
    `header should contain bio text, got: "${headerText}"`,
  );
});

test.serial('second root message renders as a post', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'My first post'));

  const $posts = $parent.querySelectorAll('.microblog-post');
  t.is($posts.length, 1, 'should have one post');
  const postText = $posts[0].textContent;
  t.true(
    postText.includes('first post'),
    `post should contain text, got: "${postText}"`,
  );
});

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

test.serial('replies become comments, not new posts', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'A post'));
  await push(makeMessage(2, 'A comment on the post', { replyTo: 1 }));

  const $posts = $parent.querySelectorAll('.microblog-post');
  t.is($posts.length, 1, 'reply should not create a new post');

  // Check comment count appears
  const $countEl = $posts[0].querySelector('.microblog-action-count');
  t.truthy($countEl, 'should show comment count');
  t.is($countEl.textContent, '1', 'comment count should be 1');
});

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

test.serial('post shows author name', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Post by Bob', { memberId: 'member-2' }));

  // Wait extra for async member info
  await tick(100);

  const $post = $parent.querySelector('.microblog-post');
  t.truthy($post, 'should have a post');
  const $author = $post.querySelector('.channel-author');
  t.truthy($author, 'should have an author element');
});

test.serial('post shows relative timestamp', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Recent post'));

  const $time = $parent.querySelector('.microblog-post-time');
  t.truthy($time, 'should have a time element');
  // Should show relative time or formatted date
  t.true($time.textContent.length > 0, 'time should have content');
});

test.serial('clicking reply button triggers onReply', async t => {
  const { $parent, push, replyCallbacks } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Reply to this'));

  // Wait for member info
  await tick(100);

  const $replyBtn = $parent.querySelector('.microblog-action-btn');
  t.truthy($replyBtn, 'should have reply button');
  $replyBtn.click();

  // onReply is called after async getMemberInfo
  await tick(50);

  t.is(replyCallbacks.length, 1, 'onReply should have been called');
  t.is(replyCallbacks[0].number, 1n, 'should reference correct message');
});

test.serial('empty channel shows no-posts message', async t => {
  const { $parent, push } = await setup();

  // Only the bio, no posts
  await push(makeMessage(0, 'Just a bio'));

  const $empty = $parent.querySelector('.microblog-empty');
  t.truthy($empty, 'should show empty state');
  t.true($empty.textContent.includes('No posts'), 'should say no posts');
});

test.serial('edit-type replies do not render as posts', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Original post'));
  await push(makeMessage(2, 'Edited text', { replyTo: 1, replyType: 'edit' }));

  const $posts = $parent.querySelectorAll('.microblog-post');
  t.is($posts.length, 1, 'edit should not create a second post');
});

test.serial('multiple posts from different authors', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'Post by Alice', { memberId: 'member-1' }));
  await push(makeMessage(2, 'Post by Bob', { memberId: 'member-2' }));

  const $posts = $parent.querySelectorAll('.microblog-post');
  t.is($posts.length, 2, 'should have two posts');

  // Both should have author elements
  const $authors = $parent.querySelectorAll('.microblog-post .channel-author');
  t.is($authors.length, 2, 'each post should have an author');
});

test.serial('nested replies show expandable toggle', async t => {
  const { $parent, push } = await setup();

  await push(makeMessage(0, 'Bio'));
  await push(makeMessage(1, 'A post'));
  await push(makeMessage(2, 'Comment on post', { replyTo: 1 }));
  await push(makeMessage(3, 'Reply to comment', { replyTo: 2 }));

  // Expand the post's comments by clicking the 💬 button (second action btn)
  const $actionBtns = $parent.querySelectorAll('.microblog-action-btn');
  // Find the comments toggle (the one with 💬 and a count)
  const $commentsBtn = [...$actionBtns].find(
    btn => btn.querySelector('.microblog-action-count') !== null,
  );
  t.truthy($commentsBtn, 'post should have comment toggle with count');
  $commentsBtn.click();
  await tick(300);

  // The comment should also have an action bar with a 💬 button showing "1"
  const $commentSection = $parent.querySelector('.microblog-comments-section');
  t.truthy($commentSection, 'comments section should be expanded');

  const $nestedActions = $commentSection.querySelectorAll('.microblog-actions');
  t.true($nestedActions.length >= 1, 'comment should have its own action bar');

  // Find the nested comment's 💬 count
  const $nestedCount = $commentSection.querySelector('.microblog-action-count');
  t.truthy($nestedCount, 'nested comment should show reply count');
  t.is($nestedCount.textContent, '1', 'should show count of 1 nested reply');
});

test.serial(
  'comments have same action buttons as posts (reply, comments, share, fork)',
  async t => {
    const { $parent, push } = await setup();

    await push(makeMessage(0, 'Bio'));
    await push(makeMessage(1, 'A post'));
    await push(makeMessage(2, 'A comment', { replyTo: 1 }));

    // Expand comments
    const $actionBtns = $parent.querySelectorAll('.microblog-action-btn');
    const $commentsBtn = [...$actionBtns].find(
      btn => btn.querySelector('.microblog-action-count') !== null,
    );
    t.truthy($commentsBtn, 'should have comments toggle');
    $commentsBtn.click();
    await tick(300);

    // The comment's action bar should have the same buttons as the post
    const $commentSection = $parent.querySelector(
      '.microblog-comments-section',
    );
    t.truthy($commentSection, 'comments section should exist');

    const $commentActions = $commentSection.querySelector('.microblog-actions');
    t.truthy($commentActions, 'comment should have action bar');

    const $btns = $commentActions.querySelectorAll('.microblog-action-btn');
    // reply (↩), comments (💬), share (⇗), fork (⑂)
    t.true(
      $btns.length >= 4,
      `comment should have at least 4 action buttons, got ${$btns.length}`,
    );
  },
);
