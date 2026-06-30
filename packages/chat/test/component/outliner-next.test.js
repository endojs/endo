// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/far';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { createDOM, tick, waitFor } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

// CARET-SURVIVAL FINDING (carried from the Phase-0 spike): real caret/Selection
// position survival across a confined re-render cannot be asserted reliably in
// happy-dom — its `getSelection`/`Range` are stubs that do not track a live
// caret across DOM re-parenting. What IS verifiable headlessly, and is the
// load-bearing property of the anchor-slot pattern, is node IDENTITY +
// CONNECTEDNESS survival across a confined re-render (asserted below). True
// caret-position survival needs real-browser verification.

/**
 * Controllable mock channel: messages pushed via `pushMessage` are consumed by
 * the controller's `for await`. Members back the meta author-name resolution.
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
 * @param {string} [opts.memberId]
 * @param {number} [opts.replyTo]
 * @param {string} [opts.replyType]
 * @param {string[]} [opts.strings]
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

/** @type {Array<() => void>} */
const mountedDisposals = [];

/**
 * Mount the Phase-2 confined outliner host controller against a mock channel.
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

  const { outlinerComponent } = await import('../../outliner-component.js');

  const handle = await outlinerComponent($parent, $end, channel, {
    powers: undefined,
  });

  mountedDisposals.push(() => handle.dispose());

  // The confined mount is the first child of $parent (inserted before $end).
  const $mount = $parent.firstElementChild;

  /**
   * Push messages and wait for them all to render as committed nodes.
   *
   * @param {unknown[]} msgs
   */
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

// Note: createDOM()'s `cleanup` (window.close) is intentionally NOT called —
// under SES lockdown happy-dom's `window.close()` throws. Per-test
// `body.innerHTML = ''` is sufficient teardown.

// ── nested structure renders with data-key / depth / disclosure ───────

test.serial(
  'a multi-node snapshot renders the nested structure with correct data-key, depth, and disclosure',
  async t => {
    const { $mount, pushAll } = await setup();

    // root (1) → child (2); plus a second root (3).
    await pushAll([
      makeMessage(1, 'Root message'),
      makeMessage(2, 'Child message', { replyTo: 1 }),
      makeMessage(3, 'Second root'),
    ]);

    const $node1 = $mount.querySelector('[data-key="1"]');
    const $node2 = $mount.querySelector('[data-key="2"]');
    const $node3 = $mount.querySelector('[data-key="3"]');
    t.truthy($node1, 'node 1 rendered');
    t.truthy($node2, 'node 2 rendered');
    t.truthy($node3, 'node 3 rendered');

    // dataset.depth preserved (the outliner-enter-key.test.js contract).
    t.is($node1.dataset.depth, '0', 'root at depth 0');
    t.is($node2.dataset.depth, '1', 'child at depth 1');
    t.is($node3.dataset.depth, '0', 'second root at depth 0');

    // node 2 is nested inside node 1's outliner-children.
    t.true(
      $node1.querySelector('.outliner-children [data-key="2"]') === $node2,
      'node 2 is nested under node 1',
    );

    // node 1 has children, so it shows a collapse handle (disclosure), not a bullet.
    const $row1 = $node1.querySelector('.outliner-node-row');
    t.truthy(
      $row1.querySelector('.outliner-collapse-handle'),
      'node 1 shows a disclosure handle',
    );
    // node 2 is a leaf → plain bullet.
    const $row2 = $node2.querySelector('.outliner-node-row');
    t.truthy($row2.querySelector('.outliner-bullet'), 'node 2 shows a bullet');
  },
);

// ── editable lines re-parented into anchors with content + chips ──────

test.serial(
  'editable lines are re-parented into their anchors with content and chips',
  async t => {
    const { $mount, pushAll } = await setup();

    await pushAll([
      makeMessage(1, 'Plain text'),
      makeMessage(2, 'Child', { replyTo: 1 }),
    ]);

    // Each anchor holds the host's contentEditable line for that key.
    const $anchor1 = $mount.querySelector('[data-line-anchor="1"]');
    t.truthy($anchor1, 'anchor for node 1 exists');
    const $line1 = $anchor1.querySelector('.outliner-text');
    t.truthy($line1, 'host editable line re-parented into anchor 1');
    t.is($line1.contentEditable, 'true', 'the line is contentEditable');
    t.is($line1.textContent, 'Plain text', 'line 1 shows its text');
  },
);

test.serial(
  'a node with a pet-name token renders a chip in its line',
  async t => {
    const { $mount, pushMessage } = await setup();

    // Push a message whose content interleaves a name between two string runs.
    pushMessage({
      type: 'package',
      messageId: 'msg-1',
      number: BigInt(1),
      date: new Date().toISOString(),
      memberId: 'member-1',
      strings: ['Hello ', ''],
      names: ['alice'],
      ids: [''],
    });

    await waitFor(() => !!$mount.querySelector('[data-key="1"]'));

    const $line = $mount.querySelector('[data-line-anchor="1"] .outliner-text');
    t.truthy($line, 'line 1 exists');
    t.regex($line.textContent, /Hello/, 'line 1 has its leading text');
    const $chip = $line.querySelector('.chat-token');
    t.truthy($chip, 'line 1 has a chat-token chip');
    t.is($chip.contentEditable, 'false', 'the chip is not editable');
    t.is($chip.dataset.petName, 'alice', 'chip carries the pet name');
    t.is(
      $chip.querySelector('.token-name').textContent,
      'alice',
      'chip shows the pet name',
    );
  },
);

// ── meta author name resolves ─────────────────────────────────────────

test.serial(
  'the meta row resolves and shows the author display name',
  async t => {
    const { $mount, pushAll } = await setup();

    await pushAll([makeMessage(1, 'Root', { memberId: 'member-2' })]);

    // Author name resolution is async (getMember → re-render).
    await waitFor(() => {
      const $author = $mount.querySelector('[data-key="1"] .outliner-author');
      return $author && $author.textContent === 'Bob';
    });

    const $author = $mount.querySelector('[data-key="1"] .outliner-author');
    t.is($author.textContent, 'Bob', 'author name resolved to the member name');
    t.true($author.classList.contains('named'), 'author span marked named');
  },
);

// ── selection reflects as a class (pure structure mapping) ────────────

test.serial(
  'a snapshot node with selected: true reflects as the outliner-selected class',
  async t => {
    // Phase 2 has no selection UI in the controller yet; assert the pure
    // structure mapping (node.selected → outliner-selected) directly through a
    // confined render, the contract Phase 3's selection layer relies on.
    const { renderConfined, h, unmount } =
      await import('../../setup-preact-container.js');
    const { OutlinerRoot } =
      await import('@endo/space-channel/outliner/outliner-structure.js');

    const mkNode = (key, selected) => ({
      key,
      depth: 0,
      hasChildren: false,
      collapsed: false,
      selected,
      focused: false,
      replyType: undefined,
      badges: [],
      effective: { strings: [`Node ${key}`], names: [] },
      author: 'member-1',
      editedBy: undefined,
      isDraft: false,
      editing: false,
      children: [],
    });

    const $host = testDocument.createElement('div');
    testDocument.body.appendChild($host);
    mountedDisposals.push(() => {
      unmount($host);
      $host.remove();
    });

    renderConfined(
      h(OutlinerRoot, {
        snapshot: [mkNode('1', true), mkNode('2', false)],
        focusedKey: undefined,
        resolveName: () => 'Alice',
      }),
      $host,
    );

    const $sel = $host.querySelector('[data-key="1"]');
    const $unsel = $host.querySelector('[data-key="2"]');
    t.true(
      $sel.classList.contains('outliner-selected'),
      'selected node carries outliner-selected',
    );
    t.false(
      $unsel.classList.contains('outliner-selected'),
      'unselected node does not',
    );
  },
);

// ── re-render keeps editable-line identity ────────────────────────────

test.serial(
  'toggling collapse re-renders and existing editable lines keep identity',
  async t => {
    const { $mount, pushAll } = await setup();

    await pushAll([
      makeMessage(1, 'Root'),
      makeMessage(2, 'Child', { replyTo: 1 }),
    ]);

    const $line1Before = $mount.querySelector(
      '[data-line-anchor="1"] .outliner-text',
    );
    const $line2Before = $mount.querySelector(
      '[data-line-anchor="2"] .outliner-text',
    );
    t.truthy($line1Before);
    t.truthy($line2Before);
    // Mark the node so we can prove the SAME node survives, not a re-render.
    $line1Before.setAttribute('data-marker', 'survived');

    // Toggle node 1's disclosure (a wired confined callback → controller re-render).
    const $handle = $mount.querySelector(
      '[data-key="1"] > .outliner-node-row .outliner-collapse-handle',
    );
    t.truthy($handle, 'node 1 has a disclosure handle');
    $handle.dispatchEvent(
      new testDocument.defaultView.Event('click', { bubbles: true }),
    );

    // After collapse, node 1's children container is collapsed; the child line
    // for node 2 is hidden by CSS but the structure for node 1 remains. Wait for
    // the collapsed class to appear.
    await waitFor(() => {
      const $node1 = $mount.querySelector('[data-key="1"]');
      const $children = $node1 && $node1.querySelector('.outliner-children');
      return (
        !!$children &&
        $children.classList.contains('outliner-children-collapsed')
      );
    });

    const $line1After = $mount.querySelector(
      '[data-line-anchor="1"] .outliner-text',
    );
    t.is(
      $line1After,
      $line1Before,
      'node 1 line kept identity across re-render',
    );
    t.is(
      $line1After.getAttribute('data-marker'),
      'survived',
      'host-set DOM state survived (Preact never owned the line)',
    );
    t.true($line1After.isConnected, 'line 1 still connected after re-render');
  },
);

// ── disclosure collapse hides children ────────────────────────────────

test.serial(
  'an added node re-renders into the tree and existing lines keep identity',
  async t => {
    const { $mount, pushAll, pushMessage } = await setup();

    await pushAll([makeMessage(1, 'Root')]);

    const $line1Before = $mount.querySelector(
      '[data-line-anchor="1"] .outliner-text',
    );
    $line1Before.setAttribute('data-marker', 'survived');

    // Add a second node; the snapshot grows and the tree re-renders.
    pushMessage(makeMessage(2, 'Second', { replyTo: 1 }));
    await waitFor(() => !!$mount.querySelector('[data-key="2"]'));

    const $line1After = $mount.querySelector(
      '[data-line-anchor="1"] .outliner-text',
    );
    t.is($line1After, $line1Before, 'node 1 line identity preserved');
    t.is(
      $line1After.getAttribute('data-marker'),
      'survived',
      'host-set state survived the structural re-render',
    );

    // The new node has its own re-parented line.
    const $line2 = $mount.querySelector(
      '[data-line-anchor="2"] .outliner-text',
    );
    t.truthy($line2, 'new node 2 has its editable line');
    t.is($line2.textContent, 'Second', 'new node 2 line shows its text');
  },
);
