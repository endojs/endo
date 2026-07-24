// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { createDOM, tick, waitFor } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

// Phase-5 wiring tests for the confined outliner: drag-and-drop, rubber-band
// selection, focus/zoom mode, and a complete idempotent dispose.
//
// HEADLESS-VERIFICATION FINDING (carried from the earlier outliner-next suites):
// happy-dom does not lay anything out, so EVERY rect is measured here by stubbing
// `getBoundingClientRect` per node row. The DnD GEOMETRY (which row + the
// above/below midpoint / center "onto" zone) is therefore asserted against
// CONTROLLED, stubbed rects, not real layout. We assert at the WIRING / DECISION
// level: which `post(...,'move')` the controller computed for a given cursor
// `clientY`, which keys a rubber-band rect covered, that focus mode roots the
// snapshot + shows the breadcrumb, and that dispose returns the iterator +
// removes the document listeners + removes the mount. True pixel hit-testing,
// the drag image, and the live indicator position need real-browser
// confirmation.

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
}

// happy-dom omits the reflected `on*` drag/drop IDL properties real browsers
// expose on HTMLElement. Preact (inside renderConfined) derives a handler's
// listener name with `('on' + Name).toLowerCase() in dom`; when the property is
// absent it registers a capitalized listener (`DragOver`, …) that a lowercase
// `dispatchEvent('dragover')` never reaches. Defining them makes the test DOM
// behave like a browser so the confined DnD handlers fire (the same shim the
// inventory-component DnD test uses). Click already works because happy-dom
// exposes `onclick`.
const $htmlElementProto = testDocument.defaultView.HTMLElement.prototype;
for (const reflected of [
  'ondragstart',
  'ondragover',
  'ondragleave',
  'ondragend',
  'ondrop',
]) {
  if (!(reflected in $htmlElementProto)) {
    Object.defineProperty($htmlElementProto, reflected, {
      value: null,
      writable: true,
      configurable: true,
    });
  }
}

const makeMockChannel = ({ name = 'test-channel' } = {}) => {
  const members = new Map();
  /** @type {unknown[]} */
  const messageQueue = [];
  /** @type {Array<(msg: unknown) => void>} */
  const waitingResolvers = [];
  /** @type {unknown[][]} */
  const postCalls = [];
  let returnCalled = false;

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
      returnCalled = true;
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

  return {
    channel,
    pushMessage,
    members,
    postCalls,
    iteratorReturnCalled: () => returnCalled,
  };
};

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
 * A minimal string-only DataTransfer stub. Mirrors the WHATWG surface the
 * confined `SafeDataTransfer` facade exposes (getData/setData/types) — and,
 * deliberately, NOTHING like `.files`, so the test can never accidentally rely
 * on a capability the real facade withholds.
 */
const makeDataTransfer = () => {
  const store = new Map();
  return {
    effectAllowed: '',
    dropEffect: '',
    setData(type, val) {
      store.set(String(type), String(val));
    },
    getData(type) {
      return store.get(String(type)) || '';
    },
    get types() {
      return [...store.keys()];
    },
  };
};

/**
 * Dispatch a drag event carrying a stub dataTransfer + clientY on a node.
 */
const dragEvent = ($el, type, { dataTransfer, clientY = 0 } = {}) => {
  const ev = new testDocument.defaultView.Event(type, {
    bubbles: true,
    cancelable: true,
  });
  // happy-dom's Event does not expose `dataTransfer` / `clientY`; define them so
  // the confined renderer's `makeSafeEvent` mirrors the facade + coords.
  Object.defineProperty(ev, 'dataTransfer', {
    value: dataTransfer,
    configurable: true,
  });
  Object.defineProperty(ev, 'clientY', { value: clientY, configurable: true });
  $el.dispatchEvent(ev);
  return ev;
};

/** The direct `.outliner-node-row` child of a node (happy-dom lacks `:scope >`). */
const directRow = $node => {
  for (const child of $node.children) {
    if (child.classList.contains('outliner-node-row')) return child;
  }
  return null;
};

/** Stub a node row's geometry so the controller can measure it. */
const stubRowRect = ($node, { top, height = 20 }) => {
  const $row = directRow($node);
  if ($row) {
    $row.getBoundingClientRect = () => ({
      top,
      bottom: top + height,
      left: 0,
      right: 100,
      width: 100,
      height,
      x: 0,
      y: top,
    });
  }
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

  const mock = makeMockChannel();
  mock.members.set('member-1', { proposedName: 'Alice', pedigree: [] });

  const { outlinerComponent } = await import('../../outliner-component.js');

  const handle = await outlinerComponent($parent, $end, mock.channel, {
    powers: undefined,
  });
  mountedDisposals.push(() => handle.dispose());

  const $mount = $parent.firstElementChild;

  const node = key => $mount.querySelector(`[data-key="${key}"]`);

  const pushAll = async msgs => {
    for (const msg of msgs) mock.pushMessage(msg);
    await waitFor(() =>
      msgs.every(msg => !!$mount.querySelector(`[data-key="${msg.number}"]`)),
    );
  };

  return { $parent, $mount, handle, pushAll, node, ...mock };
};

test.afterEach(async () => {
  while (mountedDisposals.length > 0) {
    const dispose = mountedDisposals.pop();
    dispose();
  }
  await tick(0);
  testDocument.body.innerHTML = '';
});

// ── Drop between two roots posts the right move ─────────────────────────

test.serial(
  'dragging node 3 into the gap after node 1 posts a reorder move',
  async t => {
    const { pushAll, node, postCalls } = await setup();
    // Three sibling roots stacked vertically (stubbed geometry):
    //   1 at y=0..20, 2 at y=20..40, 3 at y=40..60.
    await pushAll([
      makeMessage(1, 'One'),
      makeMessage(2, 'Two'),
      makeMessage(3, 'Three'),
    ]);

    const dt = makeDataTransfer();
    // Begin dragging node 3.
    dragEvent(node('3'), 'dragstart', { dataTransfer: dt });
    // The payload is the dragged key — a plain string, never a File.
    t.is(
      dt.getData('application/x-endo-outliner-keys'),
      '3',
      'payload is key 3',
    );
    t.false('files' in dt, 'the drag payload exposes no .files (string-only)');

    // Stub geometry AFTER the dragstart re-render so the override sits on the
    // current row elements. Stack: 1 @ 0..20, 2 @ 20..40, 3 @ 40..60.
    await tick(10);
    stubRowRect(node('1'), { top: 0 });
    stubRowRect(node('2'), { top: 20 });
    stubRowRect(node('3'), { top: 40 });

    // Drag over near the gap after node 1 (y≈20) → drop there.
    dragEvent(node('2'), 'dragover', { dataTransfer: dt, clientY: 20 });
    dragEvent(node('2'), 'drop', { dataTransfer: dt, clientY: 20 });

    await waitFor(() => postCalls.some(c => c[5] === 'move' && c[3] === '3'));
    const move = postCalls.find(c => c[5] === 'move' && c[3] === '3');
    t.truthy(move, 'a move was posted for node 3');
    // A pure reorder among roots: parent column omitted (still root level), and
    // the new sort order lands between node 1 (order 1) and node 2 (order 2).
    const newOrder = parseFloat(move[0][0]);
    t.true(
      newOrder > 1 && newOrder < 2,
      `order ${newOrder} lands between 1 and 2`,
    );
  },
);

// ── Drop onto a node's center zone reparents it as a child ──────────────

test.serial(
  'dropping node 2 onto the center of node 1 reparents it under node 1',
  async t => {
    const { pushAll, node, postCalls } = await setup();
    await pushAll([makeMessage(1, 'One'), makeMessage(2, 'Two')]);

    const dt = makeDataTransfer();
    dragEvent(node('2'), 'dragstart', { dataTransfer: dt });
    // node 1 occupies y=0..20; its center zone (30%..70%) is y=6..14.
    await tick(10);
    stubRowRect(node('1'), { top: 0, height: 20 });
    stubRowRect(node('2'), { top: 20, height: 20 });
    // Hover the center of node 1 (y=10) → "onto" drop = reparent.
    dragEvent(node('1'), 'dragover', { dataTransfer: dt, clientY: 10 });
    dragEvent(node('1'), 'drop', { dataTransfer: dt, clientY: 10 });

    await waitFor(() => postCalls.some(c => c[5] === 'move' && c[3] === '2'));
    const move = postCalls.find(c => c[5] === 'move' && c[3] === '2');
    t.truthy(move, 'a move was posted for node 2');
    // move strings: [sortOrder, newParent]; reparented under node 1.
    t.is(move[0][1], '1', 'node 2 reparented under node 1');
  },
);

// ── dragover sets a drop-target / indicator class via view state ────────

test.serial(
  'dragover over a node center marks it as the drop target',
  async t => {
    const { pushAll, node } = await setup();
    await pushAll([makeMessage(1, 'One'), makeMessage(2, 'Two')]);

    const dt = makeDataTransfer();
    dragEvent(node('2'), 'dragstart', { dataTransfer: dt });
    await tick(10);
    stubRowRect(node('1'), { top: 0, height: 20 });
    stubRowRect(node('2'), { top: 20, height: 20 });
    dragEvent(node('1'), 'dragover', { dataTransfer: dt, clientY: 10 });

    await waitFor(() => node('1').classList.contains('outliner-drop-target'));
    t.true(
      node('1').classList.contains('outliner-drop-target'),
      'node 1 shows the drop-target class during an onto-drag',
    );
    // The dragged node carries the dragging class.
    t.true(
      node('2').classList.contains('outliner-dragging'),
      'the dragged node shows the dragging class',
    );

    // dragend clears the transient state.
    dragEvent(node('2'), 'dragend', { dataTransfer: dt });
    await waitFor(() => !node('1').classList.contains('outliner-drop-target'));
    t.false(
      node('2').classList.contains('outliner-dragging'),
      'dragend cleared the dragging class',
    );
  },
);

// ── Rubber-band selects the covered keys ────────────────────────────────

test.serial(
  'a rubber-band drag selects the committed nodes its rect covers',
  async t => {
    const { $mount, pushAll, node } = await setup();
    await pushAll([
      makeMessage(1, 'One'),
      makeMessage(2, 'Two'),
      makeMessage(3, 'Three'),
    ]);

    // Stack: 1 @ 0..20, 2 @ 20..40, 3 @ 40..60. A band from y=15 to y=45 should
    // cover nodes 2 (20..40) and brush 1 (0..20) and 3 (40..60).
    stubRowRect(node('1'), { top: 0, height: 20 });
    stubRowRect(node('2'), { top: 20, height: 20 });
    stubRowRect(node('3'), { top: 40, height: 20 });
    // The mount's own rect (for the rubber-band element position math).
    $mount.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      bottom: 200,
      right: 100,
      width: 100,
      height: 200,
      x: 0,
      y: 0,
    });

    const mouseEvent = (type, { clientX, clientY, button = 0 }) =>
      new testDocument.defaultView.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        button,
      });

    // mousedown on the mount background, then drag a band over node 2.
    $mount.dispatchEvent(mouseEvent('mousedown', { clientX: 80, clientY: 22 }));
    // Move past the 5px threshold to start the band, covering node 2's row.
    testDocument.dispatchEvent(
      mouseEvent('mousemove', { clientX: 90, clientY: 38 }),
    );

    await waitFor(() => node('2').classList.contains('outliner-selected'));
    t.true(
      node('2').classList.contains('outliner-selected'),
      'node 2 (fully inside the band) is selected',
    );

    // Release the band.
    testDocument.dispatchEvent(
      mouseEvent('mouseup', { clientX: 90, clientY: 38 }),
    );
    // The selection rect element is removed on mouseup.
    await waitFor(() => !$mount.querySelector('.outliner-selection-rect'));
    t.falsy(
      $mount.querySelector('.outliner-selection-rect'),
      'the rubber-band rect is removed on mouseup',
    );
  },
);

// ── Focus mode roots the snapshot + shows the breadcrumb ─────────────────

test.serial(
  'focusOnNode zooms to a subtree and renders the breadcrumb chain',
  async t => {
    const { $parent, $mount, pushAll, node } = await setup();
    // 1 → 2 → 3 (a chain).
    await pushAll([
      makeMessage(1, 'Root'),
      makeMessage(2, 'Mid', { replyTo: 1 }),
      makeMessage(3, 'Leaf', { replyTo: 2 }),
    ]);

    // Focus on node 2 via the public channelAPI (the chat.js bookmark path).
    $parent.channelAPI.focusOnNode('2');

    await waitFor(() => !!$mount.querySelector('.outliner-breadcrumb'));
    // The breadcrumb shows Home + the ancestor chain (root 1, then current 2).
    const $bc = $mount.querySelector('.outliner-breadcrumb');
    t.truthy($bc, 'breadcrumb rendered in focus mode');
    t.regex($bc.textContent, /All/, 'breadcrumb has the home link');
    t.truthy(
      $mount.querySelector('.outliner-breadcrumb-current'),
      'the focused node is the breadcrumb current label',
    );

    // Only node 2's subtree is rooted now: node 1 is NOT a top-level node.
    const roots = [
      ...$mount.querySelectorAll('.outliner-root > .outliner-node'),
    ];
    t.is(roots.length, 1, 'exactly one rooted subtree in focus mode');
    t.is(roots[0].dataset.key, '2', 'the rooted subtree is the focused node 2');
    t.truthy(node('3'), 'the focused subtree still includes descendant 3');

    // Un-zoom via the Home link.
    $parent.channelAPI.focusOnNode(undefined);
    await waitFor(() => !$mount.querySelector('.outliner-breadcrumb'));
    t.falsy(
      $mount.querySelector('.outliner-breadcrumb'),
      'breadcrumb hidden after un-zoom',
    );
    t.truthy(node('1'), 'node 1 is a root again after un-zoom');
  },
);

// ── dispose tears everything down (idempotently) ────────────────────────

test.serial(
  'dispose returns the iterator, removes listeners, and removes the mount',
  async t => {
    const {
      $parent,
      $mount,
      handle,
      pushAll,
      pushMessage,
      iteratorReturnCalled,
    } = await setup();
    await pushAll([makeMessage(1, 'One')]);

    // Spy on document.removeEventListener to confirm the rubber-band + keydown
    // listeners are detached.
    const removed = [];
    const origRemove = testDocument.removeEventListener.bind(testDocument);
    testDocument.removeEventListener = (type, fn, opts) => {
      removed.push(type);
      return origRemove(type, fn, opts);
    };

    t.true($mount.isConnected, 'mount is connected before dispose');

    handle.dispose();

    // Listener removal + mount teardown are synchronous in dispose.
    t.true(
      removed.includes('keydown'),
      'the document keydown listener was removed',
    );
    t.false($mount.isConnected, 'the mount was removed from the DOM');
    t.is(
      $parent.querySelector('.outliner-root'),
      null,
      'the confined tree is gone',
    );

    // The iterator `.return()` is requested by dispose; it propagates through the
    // `iterateReader` reader asynchronously. Pushing another message must NOT
    // resurrect the (now-removed) tree — the `disposed` guard short-circuits the
    // loop + render.
    pushMessage(makeMessage(2, 'After dispose'));
    await tick(30);
    t.is(
      $parent.querySelector('.outliner-root'),
      null,
      'no render after dispose',
    );
    // The teardown requested the underlying iterator's cancellation; poll for the
    // propagated `.return()` (it traverses the reader stream protocol).
    await waitFor(() => iteratorReturnCalled());
    t.true(
      iteratorReturnCalled(),
      'the message iterator was returned (cancelled)',
    );

    // Idempotent: a second dispose does not throw.
    t.notThrows(() => handle.dispose(), 'a second dispose is a no-op');

    testDocument.removeEventListener = origRemove;
  },
);
