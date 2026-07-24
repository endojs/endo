// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { createDOM, tick, waitFor } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

// Phase-4 wiring tests for the confined outliner: slash menu, per-node actions,
// react pills, profile / edit-history popups, and token-autocomplete
// attach/detach. As with the other outliner-next suites, real caret/Selection
// position survival is NOT asserted (happy-dom's getSelection/Range are stubs);
// we assert at the INTENT / WIRING / DOM-shape level — which callback fired,
// which `post(...)` the controller made, which confined popup appeared, and
// that the autocomplete factory mounted onto the focused line's `$text` and was
// torn down on blur. Caret-relative positioning of the menus needs real-browser
// confirmation.

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
}

/**
 * Controllable mock channel. Mirrors outliner-next.test.js, plus member info
 * carrying pedigree for the profile popup.
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
 */
const makeMessage = (number, text, opts = {}) => ({
  type: 'package',
  messageId: `msg-${number}`,
  number: BigInt(number),
  date: new Date().toISOString(),
  memberId: opts.memberId || 'member-1',
  strings: opts.strings || [text],
  names: opts.names || [],
  ids: [],
  ...(opts.replyTo !== undefined ? { replyTo: String(opts.replyTo) } : {}),
  ...(opts.replyType !== undefined ? { replyType: opts.replyType } : {}),
});

/**
 * Mock window.getSelection() to report the caret at the start or end of a
 * contentEditable line, so the island's `readCaret` computes atStart/atEnd.
 * Mirrors `mockCursor` in outliner-next-keyboard.test.js.
 */
const mockCursor = ($text, position) => {
  const textContent = $text.textContent || '';
  const textNode = $text.childNodes[0] || $text;
  const offset = position === 'start' ? 0 : textContent.length;
  const win = testDocument.defaultView;
  const original = win.getSelection;
  win.getSelection = () => ({
    rangeCount: 1,
    anchorNode: textNode,
    anchorOffset: offset,
    removeAllRanges() {},
    addRange() {},
  });
  if (!testDocument.createRange) {
    testDocument.createRange = () => ({
      selectNodeContents() {},
      setStart() {},
      setEnd() {},
      collapse() {},
      toString() {
        return textContent.slice(0, offset);
      },
    });
  }
  return () => {
    win.getSelection = original;
  };
};

/** @type {Array<() => void>} */
const mountedDisposals = [];

/**
 * Mount the confined outliner against a mock channel.
 *
 * @param {object} [opts]
 * @param {object} [opts.options] - Extra controller options (callbacks, powers).
 */
const setup = async ({ options = {} } = {}) => {
  testDocument.body.innerHTML = '';

  const $parent = testDocument.createElement('div');
  $parent.id = 'messages';
  $parent.scrollTo = () => {};
  testDocument.body.appendChild($parent);

  const $end = testDocument.createElement('div');
  $end.id = 'anchor';
  $parent.appendChild($end);

  const { channel, pushMessage, members, postCalls } = makeMockChannel();
  members.set('member-1', {
    proposedName: 'Alice',
    pedigree: ['Carol'],
    pedigreeMemberIds: ['member-3'],
  });
  members.set('member-2', {
    proposedName: 'Bob',
    pedigree: [],
    pedigreeMemberIds: [],
  });

  const { outlinerComponent } = await import('../../outliner-component.js');

  const handle = await outlinerComponent($parent, $end, channel, options);
  mountedDisposals.push(() => handle.dispose());

  const $mount = $parent.firstElementChild;

  const pushAll = async msgs => {
    for (const msg of msgs) {
      pushMessage(msg);
    }
    await waitFor(() =>
      msgs.every(msg => !!$mount.querySelector(`[data-key="${msg.number}"]`)),
    );
  };

  return { $parent, $mount, handle, pushAll, pushMessage, postCalls };
};

test.afterEach(async () => {
  while (mountedDisposals.length > 0) {
    const dispose = mountedDisposals.pop();
    dispose();
  }
  await tick(0);
  testDocument.body.innerHTML = '';
});

const Event = testDocument.defaultView.Event;
const fireClick = $el =>
  $el.dispatchEvent(new Event('click', { bubbles: true }));

// ── Slash menu ────────────────────────────────────────────────────────

test.serial(
  'typing /ev shows the Evidence command and selecting it sets the draft replyType',
  async t => {
    const { $mount, pushAll } = await setup();
    await pushAll([makeMessage(1, 'Root')]);

    // Focus the committed line, caret at end, Enter → child draft.
    const $line1 = $mount.querySelector(
      '[data-line-anchor="1"] .outliner-text',
    );
    const restore = mockCursor($line1, 'end');
    $line1.dispatchEvent(new Event('focus', { bubbles: true }));
    $line1.dispatchEvent(
      new testDocument.defaultView.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      }),
    );
    restore();

    // A draft line appears.
    await waitFor(() => $mount.querySelector('.outliner-draft .outliner-text'));
    const $draftNode = $mount.querySelector('.outliner-draft');
    const draftKey = $draftNode.dataset.key;
    const $draftLine = $draftNode.querySelector('.outliner-text');

    // Type `/ev` into the draft line and fire input.
    $draftLine.textContent = '/ev';
    $draftLine.dispatchEvent(new Event('input', { bubbles: true }));

    // The slash menu shows the Evidence command.
    await waitFor(() => $mount.querySelector('.outliner-slash-menu'));
    const $menu = $mount.querySelector('.outliner-slash-menu');
    t.truthy($menu, 'slash menu rendered');
    const items = [...$menu.querySelectorAll('.outliner-slash-item')];
    t.is(items.length, 1, 'only Evidence matches /ev');
    t.regex(items[0].textContent, /Evidence/, 'Evidence command shown');

    // Select it via mousedown.
    items[0].dispatchEvent(new Event('mousedown', { bubbles: true }));

    // The draft node now carries the Evidence badge (replyType applied) and the
    // slash menu is gone.
    await waitFor(() =>
      $mount.querySelector(`[data-key="${draftKey}"] .outliner-badge-evidence`),
    );
    t.truthy(
      $mount.querySelector(`[data-key="${draftKey}"] .outliner-badge-evidence`),
      'draft replyType set to evidence (badge shown)',
    );
    t.falsy(
      $mount.querySelector('.outliner-slash-menu'),
      'slash menu dismissed after selection',
    );
  },
);

test.serial('the slash menu dismisses via its in-tree backdrop', async t => {
  const { $mount, pushAll } = await setup();
  await pushAll([makeMessage(1, 'Root')]);

  const $line1 = $mount.querySelector('[data-line-anchor="1"] .outliner-text');
  const restore = mockCursor($line1, 'end');
  $line1.dispatchEvent(new Event('focus', { bubbles: true }));
  $line1.dispatchEvent(
    new testDocument.defaultView.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
    }),
  );
  restore();

  await waitFor(() => $mount.querySelector('.outliner-draft .outliner-text'));
  const $draftLine = $mount.querySelector('.outliner-draft .outliner-text');
  $draftLine.textContent = '/p';
  $draftLine.dispatchEvent(new Event('input', { bubbles: true }));

  await waitFor(() => $mount.querySelector('.outliner-slash-backdrop'));
  const $backdrop = $mount.querySelector('.outliner-slash-backdrop');
  fireClick($backdrop);

  await waitFor(() => !$mount.querySelector('.outliner-slash-menu'));
  t.falsy(
    $mount.querySelector('.outliner-slash-menu'),
    'backdrop click dismissed the slash menu',
  );
});

// ── Per-node actions ──────────────────────────────────────────────────

test.serial(
  'Reply / Fork / Share / Bookmark fire the right callback with the right payload',
  async t => {
    let replyArg;
    let forkArg;
    let shareArg;
    let bookmarkArg;
    const { $mount, pushAll } = await setup({
      options: {
        onReply: info => {
          replyArg = info;
        },
        onFork: (chain, preview) => {
          forkArg = { chain, preview };
          return Promise.resolve();
        },
        onShare: (chain, preview) => {
          shareArg = { chain, preview };
        },
        onBookmark: (key, preview) => {
          bookmarkArg = { key, preview };
        },
      },
    });
    // root 1 → child 2, so the heritage chain for 2 is [1, 2].
    await pushAll([
      makeMessage(1, 'Root note'),
      makeMessage(2, 'Child note', { replyTo: 1 }),
    ]);

    const $node2 = $mount.querySelector('[data-key="2"]');

    // Reply.
    fireClick($node2.querySelector('.outliner-reply-button'));
    await waitFor(() => replyArg !== undefined);
    t.is(replyArg.number, 2n, 'reply targets node 2');
    t.is(replyArg.authorName, 'Alice', 'reply carries resolved author name');
    t.regex(replyArg.preview, /Child note/, 'reply preview from node content');

    // Open the three-dot menu for the Fork / Share / Bookmark items.
    const openMenu = () => {
      fireClick($mount.querySelector('[data-key="2"] .message-menu-button'));
    };

    openMenu();
    await waitFor(() =>
      $mount.querySelector('[data-key="2"] .outliner-menu-fork'),
    );
    fireClick($mount.querySelector('[data-key="2"] .outliner-menu-fork'));
    await waitFor(() => forkArg !== undefined);
    t.is(forkArg.chain.length, 2, 'fork heritage chain is [root, child]');
    t.is(String(forkArg.chain[0].number), '1', 'chain root is node 1');
    t.is(String(forkArg.chain[1].number), '2', 'chain leaf is node 2');

    openMenu();
    await waitFor(() =>
      $mount.querySelector('[data-key="2"] .outliner-menu-share'),
    );
    fireClick($mount.querySelector('[data-key="2"] .outliner-menu-share'));
    await waitFor(() => shareArg !== undefined);
    t.is(shareArg.chain.length, 2, 'share heritage chain is [root, child]');

    openMenu();
    await waitFor(() =>
      $mount.querySelector('[data-key="2"] .outliner-menu-bookmark'),
    );
    fireClick($mount.querySelector('[data-key="2"] .outliner-menu-bookmark'));
    await waitFor(() => bookmarkArg !== undefined);
    t.is(bookmarkArg.key, '2', 'bookmark carries node key');
    t.regex(bookmarkArg.preview, /Child note/, 'bookmark preview');
  },
);

test.serial('Delete posts a deletion to the channel', async t => {
  const { $mount, pushAll, postCalls } = await setup();
  await pushAll([makeMessage(1, 'Root')]);

  fireClick($mount.querySelector('[data-key="1"] .message-menu-button'));
  await waitFor(() =>
    $mount.querySelector('[data-key="1"] .outliner-menu-delete'),
  );
  fireClick($mount.querySelector('[data-key="1"] .outliner-menu-delete'));

  await waitFor(() => postCalls.some(args => args[5] === 'deletion'));
  const del = postCalls.find(args => args[5] === 'deletion');
  t.truthy(del, 'a deletion was posted');
  t.is(del[3], '1', 'deletion targets node 1');
});

// ── Reacts ────────────────────────────────────────────────────────────

test.serial(
  'a react pill renders from snapshot and toggling it posts react / redact-react',
  async t => {
    const { $mount, pushAll, pushMessage, postCalls } = await setup({
      options: { ownMemberId: 'member-1' },
    });
    await pushAll([makeMessage(1, 'Root')]);

    // Another member reacts 👍 to node 1.
    pushMessage(
      makeMessage(10, '', {
        replyTo: 1,
        replyType: 'react',
        strings: ['👍'],
        memberId: 'member-2',
      }),
    );

    await waitFor(() => $mount.querySelector('[data-key="1"] .react-pill'));
    const $pill = $mount.querySelector('[data-key="1"] .react-pill');
    t.truthy($pill, 'react pill rendered from snapshot');
    t.regex($pill.textContent, /👍/, 'pill shows the emoji');
    t.false(
      $pill.classList.contains('react-pill-own'),
      'not my react (member-2 reacted, I am member-1)',
    );

    // Toggle: I am not in this react → posts `react`.
    fireClick($pill);
    await waitFor(() => postCalls.some(args => args[5] === 'react'));
    const reactPost = postCalls.find(args => args[5] === 'react');
    t.is(reactPost[3], '1', 'react targets node 1');
    t.is(reactPost[0][0], '👍', 'react carries the emoji');

    // Now make it MY react and toggle again → redact-react.
    pushMessage(
      makeMessage(11, '', {
        replyTo: 1,
        replyType: 'react',
        strings: ['❤️'],
        memberId: 'member-1',
      }),
    );
    await waitFor(() => $mount.querySelector('[data-key="1"] .react-pill-own'));
    const $mine = $mount.querySelector('[data-key="1"] .react-pill-own');
    fireClick($mine);
    await waitFor(() => postCalls.some(args => args[5] === 'redact-react'));
    const redact = postCalls.find(args => args[5] === 'redact-react');
    t.is(redact[0][0], '❤️', 'redact-react carries my emoji');
  },
);

// ── Profile popup ─────────────────────────────────────────────────────

test.serial(
  'author click opens a confined profile popup that dismisses via backdrop',
  async t => {
    const { $mount, pushAll } = await setup();
    await pushAll([makeMessage(1, 'Root', { memberId: 'member-2' })]);

    // Wait for the author name to resolve.
    await waitFor(() => {
      const $a = $mount.querySelector('[data-key="1"] .outliner-author');
      return $a && $a.textContent === 'Bob';
    });

    const $author = $mount.querySelector('[data-key="1"] .outliner-author');
    fireClick($author);

    await waitFor(() => $mount.querySelector('.profile-popup'));
    const $popup = $mount.querySelector('.profile-popup');
    t.truthy($popup, 'profile popup opened');
    t.regex($popup.textContent, /Bob/, 'popup shows the proposed name');

    // Dismiss via the in-tree backdrop.
    fireClick($mount.querySelector('.profile-popup-backdrop'));
    await waitFor(() => !$mount.querySelector('.profile-popup'));
    t.falsy(
      $mount.querySelector('.profile-popup'),
      'backdrop click dismissed the profile popup',
    );
  },
);

// ── Edit history popup ────────────────────────────────────────────────

test.serial('edit-history lists the edit queue', async t => {
  const { $mount, pushAll, pushMessage } = await setup();
  // Node 1, then an edit of it by member-2. The edit is a MODIFIER reply — it
  // mutates node 1's effective content rather than rendering as its own node,
  // so only node 1 has a `[data-key]`.
  await pushAll([makeMessage(1, 'Original text')]);
  pushMessage(
    makeMessage(2, 'Edited text', {
      replyTo: 1,
      replyType: 'edit',
      memberId: 'member-2',
    }),
  );

  // The edited meta row appears once the edit is ingested.
  await waitFor(() =>
    $mount.querySelector('[data-key="1"] .outliner-edited-by'),
  );
  const $editedBy = $mount.querySelector('[data-key="1"] .outliner-edited-by');
  fireClick($editedBy);

  await waitFor(() => $mount.querySelector('.outliner-edit-history'));
  const $history = $mount.querySelector('.outliner-edit-history');
  t.truthy($history, 'edit-history popup opened');
  const entries = $history.querySelectorAll('.outliner-edit-history-entry');
  t.true(entries.length >= 1, 'at least one edit entry listed');
  t.regex($history.textContent, /Edited text/, 'shows the edit content');

  // Dismiss via backdrop.
  fireClick($mount.querySelector('.outliner-edit-history-backdrop'));
  await waitFor(() => !$mount.querySelector('.outliner-edit-history'));
  t.falsy(
    $mount.querySelector('.outliner-edit-history'),
    'edit-history dismissed via backdrop',
  );
});

// ── Token autocomplete attach / detach ────────────────────────────────

test.serial(
  'token autocomplete mounts onto the focused $text and detaches on blur',
  async t => {
    /** @type {Array<{ $input: HTMLElement, $menu: HTMLElement }>} */
    const attaches = [];
    const fakeComponent = {
      getMessage: () => ({ strings: [''], petNames: [], edgeNames: [] }),
      clear: () => {},
      isMenuVisible: () => false,
      insertTokenAtCursor: () => {},
    };
    const tokenAutocompleteFactory = ($input, $menu) => {
      attaches.push({ $input, $menu });
      return fakeComponent;
    };

    // A mock powers exposing followNameChanges (never iterated meaningfully).
    const powers = Far('MockPowers', {
      followNameChanges() {
        return readerFromIterator(
          Far('NameChanges', {
            next() {
              return new Promise(() => {});
            },
            return() {
              return Promise.resolve({ value: undefined, done: true });
            },
          }),
        );
      },
    });

    const { $mount, pushAll } = await setup({
      options: { powers, tokenAutocompleteFactory },
    });
    await pushAll([makeMessage(1, 'Hello')]);

    const $line1 = $mount.querySelector(
      '[data-line-anchor="1"] .outliner-text',
    );

    // Focus → autocomplete attaches onto this very line ($text === $node).
    $line1.dispatchEvent(new Event('focus', { bubbles: true }));
    await waitFor(() => attaches.length === 1);
    t.is(
      attaches[0].$input,
      $line1,
      'autocomplete mounted onto the focused $text',
    );
    t.truthy(
      $line1.querySelector('.token-menu'),
      'the autocomplete $menu was appended to the line',
    );

    // Blur (commit) → the menu is removed (detached).
    const restore = mockCursor($line1, 'end');
    $line1.dispatchEvent(new Event('blur', { bubbles: true }));
    restore();
    await waitFor(() => !$line1.querySelector('.token-menu'));
    t.falsy(
      $line1.querySelector('.token-menu'),
      'autocomplete detached on blur (menu removed)',
    );
  },
);
