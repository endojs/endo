// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { makePromiseKit } from '@endo/promise-kit';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { createDOM, tick, waitFor } from '../helpers/dom-setup.js';
import { inboxComponent } from '../../inbox-component.js';

const { window: testWindow, document: testDocument } = createDOM();

// inbox-component.js renders package-type messages through the markdown
// pipeline, which performs `instanceof Element` checks.  happy-dom exposes
// Element on its window but our shared dom-setup helper does not expose it
// globally; we bind it here per test file rather than mutating the shared
// helper.
const w = /** @type {Record<string, unknown>} */ (
  /** @type {unknown} */ (testWindow)
);
if (w.Element) {
  globalThis.Element = /** @type {typeof Element} */ (w.Element);
}
if (w.DocumentFragment) {
  globalThis.DocumentFragment = /** @type {typeof DocumentFragment} */ (
    w.DocumentFragment
  );
}
if (w.CSS) {
  globalThis.CSS = /** @type {typeof CSS} */ (w.CSS);
}

/**
 * Build a mock powers object that yields a controlled stream of inbox
 * messages.  The stream is driven by an internal pump so the test can
 * deliver a follow-up revision after the first emission has been
 * rendered.
 *
 * @param {object} opts
 * @param {string} opts.selfId
 * @param {Array<object>} opts.initialMessages
 * @returns {{
 *   powers: unknown,
 *   calls: Array<{method: string, args: unknown[]}>,
 *   emit: (msg: object) => void,
 *   setHistory: (history: Array<object>) => void,
 *   setEditOutcome: (outcome: 'resolve' | { reject: string }) => void,
 * }}
 */
const makeEditPowers = ({ selfId, initialMessages }) => {
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];
  /** @type {Array<object>} */
  const pending = [...initialMessages];
  /** @type {((value: { value: object, done: boolean }) => void) | null} */
  let nextResolve = null;
  /** @type {Array<object>} */
  let history = [];
  /** @type {'resolve' | { reject: string }} */
  let editOutcome = 'resolve';

  const emit = msg => {
    if (nextResolve) {
      const r = nextResolve;
      nextResolve = null;
      r({ value: msg, done: false });
    } else {
      pending.push(msg);
    }
  };

  const setHistory = h => {
    history = h;
  };

  const setEditOutcome = outcome => {
    editOutcome = outcome;
  };

  const powers = Far('MockEditPowers', {
    locate(...path) {
      calls.push({ method: 'locate', args: path });
      if (path.length === 1 && path[0] === '@self') {
        return `endo://localhost/${selfId}?type=handle`;
      }
      return undefined;
    },
    async reverseLocate(locator) {
      calls.push({ method: 'reverseLocate', args: [locator] });
      if (locator.includes(selfId)) return ['@host'];
      return ['alice'];
    },
    followMessages() {
      return readerFromIterator(
        Far('MessageIterator', {
          next() {
            if (pending.length > 0) {
              const value = pending.shift();
              return Promise.resolve({ value, done: false });
            }
            return new Promise(resolve => {
              nextResolve = resolve;
            });
          },
        }),
      );
    },
    dismiss(number) {
      calls.push({ method: 'dismiss', args: [number] });
      return Promise.resolve();
    },
    editMessage(number, strings, edgeNames, ids, options) {
      calls.push({
        method: 'editMessage',
        args: [number, strings, edgeNames, ids, options],
      });
      if (editOutcome === 'resolve') {
        return Promise.resolve();
      }
      return Promise.reject(new Error(editOutcome.reject));
    },
    messageHistory(number) {
      calls.push({ method: 'messageHistory', args: [number] });
      return Promise.resolve(history);
    },
    lookupById(id) {
      calls.push({ method: 'lookupById', args: [id] });
      return Promise.resolve(null);
    },
  });

  return { powers, calls, emit, setHistory, setEditOutcome };
};

/**
 * Create a fresh inbox container per test.
 */
const createInboxDOM = () => {
  testDocument.body.innerHTML = '';
  const $parent = testDocument.createElement('div');
  $parent.id = 'inbox';
  $parent.scrollTo = () => {};
  Object.defineProperty($parent, 'scrollTop', { value: 0, writable: true });
  Object.defineProperty($parent, 'scrollHeight', { value: 100 });
  Object.defineProperty($parent, 'clientHeight', { value: 100 });
  testDocument.body.appendChild($parent);

  const $end = testDocument.createElement('div');
  $end.id = 'inbox-end';
  $parent.appendChild($end);

  // Use a setTimeout-backed shim so Preact effects flush asynchronously, as
  // they would in a real browser. Calling fn(0) synchronously races with
  // Preact's internal scheduling and can prevent effects from ever flushing.
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);

  return { $parent, $end };
};

/**
 * Build a `package` message envelope as emitted by `followMessages`.
 *
 * @param {object} opts
 * @returns {object}
 */
const buildPackage = ({
  number,
  from,
  to,
  strings = ['hello'],
  names = [],
  ids = [],
  done = true,
  messageId = String(number),
  dismissed = makePromiseKit().promise,
}) => ({
  type: 'package',
  number,
  date: new Date().toISOString(),
  from,
  to,
  strings,
  names,
  ids,
  done,
  messageId,
  dismissed,
});

const SELF = 'self-id';
const SELF_LOCATOR = `endo://localhost/${SELF}?type=handle`;
const PEER_LOCATOR = `endo://localhost/peer-id?type=handle`;

test.serial(
  'edit button is visible on own settled package messages',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const message = buildPackage({
      number: 1n,
      from: SELF_LOCATOR,
      to: PEER_LOCATOR,
      strings: ['hello world'],
    });
    const { powers } = makeEditPowers({
      selfId: SELF,
      initialMessages: [message],
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() => $parent.querySelector('.edit-button'));

    const $edit = $parent.querySelector('.edit-button');
    t.truthy($edit, 'edit button should be rendered on a sent package message');
    t.not($edit.style.display, 'none', 'edit button should be visible');

    // History button is hidden until a revision arrives.
    const $history = $parent.querySelector('.history-button');
    t.truthy($history, 'history button should be present');
    t.is($history.style.display, 'none', 'history button hidden before edits');
  },
);

test.serial('edit button is NOT rendered on received messages', async t => {
  const { $parent, $end } = createInboxDOM();
  const message = buildPackage({
    number: 2n,
    from: PEER_LOCATOR,
    to: SELF_LOCATOR,
    strings: ['hi'],
  });
  const { powers } = makeEditPowers({
    selfId: SELF,
    initialMessages: [message],
  });

  inboxComponent($parent, $end, powers, { showValue: () => {} });
  await waitFor(() => $parent.querySelector('.message-envelope'));

  t.falsy(
    $parent.querySelector('.edit-button'),
    'edit button should not appear on received messages',
  );
});

test.serial(
  'edit button is hidden while the message is still pending',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const message = buildPackage({
      number: 3n,
      from: SELF_LOCATOR,
      to: PEER_LOCATOR,
      strings: ['Thinking...'],
      done: false,
    });
    const { powers } = makeEditPowers({
      selfId: SELF,
      initialMessages: [message],
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() => $parent.querySelector('.message-envelope'));

    const $envelope = $parent.querySelector('.message-envelope');
    t.truthy($envelope, 'envelope rendered');
    t.true(
      $envelope.classList.contains('message-envelope-pending'),
      'pending class set on done:false message',
    );
    const $edit = $parent.querySelector('.edit-button');
    t.is($edit.style.display, 'none', 'edit button hidden while pending');
  },
);

test.serial(
  'clicking edit opens an inline editor pre-filled with the message text',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const message = buildPackage({
      number: 4n,
      from: SELF_LOCATOR,
      to: PEER_LOCATOR,
      strings: ['original text'],
    });
    const { powers } = makeEditPowers({
      selfId: SELF,
      initialMessages: [message],
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() => $parent.querySelector('.edit-button'));

    $parent.querySelector('.edit-button').click();
    await waitFor(() => $parent.querySelector('.edit-editor'));

    const $editor = $parent.querySelector('.edit-editor');
    t.truthy($editor, 'inline editor should mount');
    const $textarea = $parent.querySelector('.edit-input');
    t.truthy($textarea, 'editor has a textarea');
    t.is($textarea.value, 'original text', 'textarea pre-filled');
    t.truthy($parent.querySelector('.edit-submit'), 'submit button present');
    t.truthy($parent.querySelector('.edit-cancel'), 'cancel button present');
  },
);

test.serial(
  'submitting an edit calls editMessage on powers and closes the editor',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const message = buildPackage({
      number: 5n,
      from: SELF_LOCATOR,
      to: PEER_LOCATOR,
      strings: ['v1'],
    });
    const { powers, calls } = makeEditPowers({
      selfId: SELF,
      initialMessages: [message],
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() => $parent.querySelector('.edit-button'));

    $parent.querySelector('.edit-button').click();
    await waitFor(() => $parent.querySelector('.edit-input'));

    const $textarea = $parent.querySelector('.edit-input');
    $textarea.value = 'v2';
    $textarea.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await tick(10);
    $parent.querySelector('.edit-submit').click();
    await waitFor(() => calls.find(c => c.method === 'editMessage'));

    const editCall = calls.find(c => c.method === 'editMessage');
    t.truthy(editCall, 'editMessage was invoked');
    t.is(editCall.args[0], 5n, 'editMessage targets the message number');
    t.deepEqual(editCall.args[1], ['v2'], 'editMessage carries the new text');
    t.deepEqual(editCall.args[2], [], 'no edge names for plain text edit');
    t.deepEqual(editCall.args[3], [], 'no ids for plain text edit');

    await waitFor(() => !$parent.querySelector('.edit-editor'));
    t.falsy(
      $parent.querySelector('.edit-editor'),
      'editor should close after successful submit',
    );
  },
);

test.serial(
  'submitting an edit that preserves a binding resolves each kept locator to a pet name',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const KEPT_LOCATOR = `endo://localhost/kept-value-id?type=handle`;
    const DROPPED_LOCATOR = `endo://localhost/dropped-value-id?type=handle`;
    const message = buildPackage({
      number: 50n,
      from: SELF_LOCATOR,
      to: PEER_LOCATOR,
      strings: ['hello @one and @two there'],
      names: ['one', 'two'],
      ids: [KEPT_LOCATOR, DROPPED_LOCATOR],
    });
    const { powers, calls } = makeEditPowers({
      selfId: SELF,
      initialMessages: [message],
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() => $parent.querySelector('.edit-button'));

    $parent.querySelector('.edit-button').click();
    await waitFor(() => $parent.querySelector('.edit-input'));

    // Edit drops the @two token.  @one is still referenced and must be kept.
    const $editInput = $parent.querySelector('.edit-input');
    $editInput.value = 'hello @one only';
    $editInput.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await tick(10);
    $parent.querySelector('.edit-submit').click();
    await waitFor(() => calls.find(c => c.method === 'editMessage'));

    const editCall = calls.find(c => c.method === 'editMessage');
    t.truthy(editCall, 'editMessage was invoked');
    t.deepEqual(editCall.args[1], ['hello @one only']);
    t.deepEqual(
      editCall.args[2],
      ['one'],
      'only the still-referenced edge name is kept',
    );
    // makeEditPowers.reverseLocate returns ['alice'] for non-self locators.
    t.deepEqual(
      editCall.args[3],
      ['alice'],
      'kept binding is passed as a pet name, not a locator',
    );
    const reverseCalls = calls.filter(c => c.method === 'reverseLocate');
    t.true(
      reverseCalls.some(c => c.args[0] === KEPT_LOCATOR),
      'kept locator was reverse-located',
    );
  },
);

test.serial(
  'cancelling an edit removes the editor without calling editMessage',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const message = buildPackage({
      number: 6n,
      from: SELF_LOCATOR,
      to: PEER_LOCATOR,
      strings: ['keep me'],
    });
    const { powers, calls } = makeEditPowers({
      selfId: SELF,
      initialMessages: [message],
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() => $parent.querySelector('.edit-button'));

    $parent.querySelector('.edit-button').click();
    await waitFor(() => $parent.querySelector('.edit-input'));

    const $textarea = $parent.querySelector('.edit-input');
    $textarea.value = 'never sent';
    $parent.querySelector('.edit-cancel').click();
    await waitFor(() => !$parent.querySelector('.edit-editor'));

    t.falsy($parent.querySelector('.edit-editor'), 'editor closed on cancel');
    t.falsy(
      calls.find(c => c.method === 'editMessage'),
      'editMessage was NOT called',
    );
  },
);

test.serial(
  're-emission of the same message number swaps the envelope in place',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const first = buildPackage({
      number: 7n,
      from: SELF_LOCATOR,
      to: PEER_LOCATOR,
      strings: ['Thinking...'],
      done: false,
    });
    const { powers, emit } = makeEditPowers({
      selfId: SELF,
      initialMessages: [first],
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() => $parent.querySelector('.message-envelope'));

    t.is(
      $parent.querySelectorAll('.message-envelope').length,
      1,
      'one envelope after initial emission',
    );
    t.true(
      $parent
        .querySelector('.message-envelope')
        .classList.contains('message-envelope-pending'),
      'first emission is pending',
    );

    // The daemon emits a revision: same number, settled, replacement text.
    const revision = buildPackage({
      number: 7n,
      from: SELF_LOCATOR,
      to: PEER_LOCATOR,
      strings: ['Settled answer.'],
      done: true,
    });
    emit(revision);
    await waitFor(() => {
      const $env = $parent.querySelector('.message-envelope');
      return $env && !$env.classList.contains('message-envelope-pending');
    });

    const $envelopes = $parent.querySelectorAll('.message-envelope');
    t.is(
      $envelopes.length,
      1,
      'envelope count unchanged after revision (no duplicate appended)',
    );
    const $only = $envelopes[0];
    t.false(
      $only.classList.contains('message-envelope-pending'),
      'pending class removed once done:true arrives',
    );
    t.true(
      $only.classList.contains('message-envelope-edited'),
      'edited class set after a revision is observed',
    );
  },
);

test.serial(
  'view-history button becomes visible after a revision and lists history',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const first = buildPackage({
      number: 8n,
      from: SELF_LOCATOR,
      to: PEER_LOCATOR,
      strings: ['v1'],
    });
    const { powers, emit, setHistory, calls } = makeEditPowers({
      selfId: SELF,
      initialMessages: [first],
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() => $parent.querySelector('.history-button'));

    // No edit yet; history is hidden.
    t.is(
      $parent.querySelector('.history-button').style.display,
      'none',
      'history hidden initially',
    );

    emit(
      buildPackage({
        number: 8n,
        from: SELF_LOCATOR,
        to: PEER_LOCATOR,
        strings: ['v2'],
      }),
    );
    await waitFor(() => {
      const $btn = $parent.querySelector('.history-button');
      return $btn && $btn.style.display !== 'none';
    });

    const $history = $parent.querySelector('.history-button');
    t.not($history.style.display, 'none', 'history button becomes visible');

    setHistory([
      {
        envelope: { strings: ['v1'] },
        done: true,
        date: '2026-05-21T11:00:00Z',
      },
      {
        envelope: { strings: ['v2'] },
        done: true,
        date: '2026-05-21T11:05:00Z',
      },
    ]);
    $history.click();
    await waitFor(() => $parent.querySelector('.history-item'));

    t.truthy(
      calls.find(c => c.method === 'messageHistory' && c.args[0] === 8n),
      'messageHistory was queried',
    );
    const items = $parent.querySelectorAll('.history-item');
    t.is(items.length, 2, 'history list rendered with two revisions');
    t.true(items[0].textContent.includes('v1'));
    t.true(items[1].textContent.includes('v2'));
  },
);
