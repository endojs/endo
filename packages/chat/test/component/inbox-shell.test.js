// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { makePromiseKit } from '@endo/promise-kit';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { inboxComponent } from '../../inbox-component.js';

const { document: testDocument } = createDOM();

// renderConfined renders through Preact; its menu/effect idioms defer with
// requestAnimationFrame. dom-setup stubs setTimeout but not rAF; provide a
// setTimeout-backed shim, as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Build mock powers that stream a fixed list of messages then block forever.
 *
 * @param {object} opts
 * @param {string} opts.selfId
 * @param {object[]} opts.messages
 */
const makeStreamPowers = ({ selfId, messages }) => {
  /** @type {Array<{ method: string, args: unknown[] }>} */
  const calls = [];

  const powers = Far('MockPowers', {
    locate(...path) {
      calls.push({ method: 'locate', args: path });
      if (path.length === 1 && path[0] === '@self') {
        return `endo://localhost/${selfId}?type=handle`;
      }
      return undefined;
    },
    async reverseLocate(locator) {
      calls.push({ method: 'reverseLocate', args: [locator] });
      if (String(locator).includes('host-handle-id')) return ['@host'];
      if (String(locator).includes('guest-handle-id')) return ['alice'];
      return [];
    },
    followMessages() {
      let index = 0;
      return readerFromIterator(
        Far('MessageIterator', {
          next() {
            if (index < messages.length) {
              const value = messages[index];
              index += 1;
              return Promise.resolve({ value, done: false });
            }
            // Block forever after the last message.
            return new Promise(() => {});
          },
        }),
      );
    },
    resolve(number, value) {
      calls.push({ method: 'resolve', args: [number, value] });
      return Promise.resolve();
    },
    reject(number, value) {
      calls.push({ method: 'reject', args: [number, value] });
      return Promise.resolve();
    },
    dismiss(number) {
      calls.push({ method: 'dismiss', args: [number] });
      return Promise.resolve();
    },
  });

  return { powers, calls };
};

/**
 * Fresh inbox container with happy-dom scroll stubs.
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

  return { $parent, $end };
};

/**
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). The message subscription
 * processes messages one at a time (per-message requestAnimationFrame +
 * reverseLocate awaits + Preact effect flushes), so a fixed delay races on
 * slower CI runners; polling the actual condition is robust.
 */
const waitFor = async (predicate, { timeout = 3000, step = 20 } = {}) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return;
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};

const HOST = 'endo://localhost/host-handle-id?type=handle';
const GUEST = 'endo://localhost/guest-handle-id?type=handle';

test.serial(
  'envelopes render with number, sent class, and timestamp',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const dismissed = makePromiseKit().promise;

    const messages = [
      {
        type: 'request',
        number: 1n,
        date: new Date(0).toISOString(),
        from: HOST,
        to: GUEST,
        messageId: 'm1',
        dismissed,
        description: 'please do a thing',
        settled: new Promise(() => {}),
      },
      {
        type: 'request',
        number: 2n,
        date: new Date(0).toISOString(),
        from: GUEST,
        to: HOST,
        messageId: 'm2',
        dismissed,
        description: 'reply request',
        settled: new Promise(() => {}),
      },
    ];

    // selfId = guest, so message 2 (from guest) is "sent".
    const { powers } = makeStreamPowers({
      selfId: 'guest-handle-id',
      messages,
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(
      () => $parent.querySelectorAll('.message-envelope').length >= 2,
    );

    const envelopes = $parent.querySelectorAll('.message-envelope');
    t.is(envelopes.length, 2, 'both envelopes render');
    t.is(envelopes[0].dataset.number, '1');
    t.is(envelopes[1].dataset.number, '2');

    // Message 1 (received) is plain; message 2 (sent by guest) has the sent class.
    t.falsy(envelopes[0].querySelector('.message.sent'));
    t.truthy(envelopes[1].querySelector('.message.sent'));

    // Timestamps render with their controls.
    t.is($parent.querySelectorAll('.timestamp').length, 2);
    t.is($parent.querySelectorAll('.timestamp-num').length, 2);
    t.is(
      $parent.querySelector('.message-envelope .timestamp-num').textContent,
      '#1',
    );
  },
);

test.serial(
  'recipient filtering includes/excludes by conversationId',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const dismissed = makePromiseKit().promise;
    const OTHER = 'endo://localhost/other-handle-id?type=handle';

    const messages = [
      {
        type: 'request',
        number: 1n,
        date: new Date(0).toISOString(),
        from: GUEST,
        to: HOST,
        messageId: 'in-convo',
        dismissed,
        description: 'in conversation',
        settled: new Promise(() => {}),
      },
      {
        type: 'request',
        number: 2n,
        date: new Date(0).toISOString(),
        from: OTHER,
        to: HOST,
        messageId: 'out-convo',
        dismissed,
        description: 'different party',
        settled: new Promise(() => {}),
      },
    ];

    // self = host; conversation is with GUEST.
    const { powers } = makeStreamPowers({ selfId: 'host-handle-id', messages });

    inboxComponent($parent, $end, powers, {
      showValue: () => {},
      conversationId: GUEST,
      conversationPetName: null,
    });
    // Wait for the in-conversation message, then settle so the filtered-out
    // message has its chance to (wrongly) render before we assert exactly one.
    await waitFor(
      () => $parent.querySelectorAll('.message-envelope').length >= 1,
    );
    // Settle before a NEGATIVE assertion: give the filtered-out message its
    // chance to (wrongly) render before we assert exactly one renders.
    await tick(50);

    const envelopes = $parent.querySelectorAll('.message-envelope');
    t.is(envelopes.length, 1, 'only the in-conversation message renders');
    t.is(envelopes[0].dataset.number, '1');
  },
);

test.serial(
  'request renders resolve/reject and resolve calls powers.resolve',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const dismissed = makePromiseKit().promise;

    const messages = [
      {
        type: 'request',
        number: 7n,
        date: new Date(0).toISOString(),
        from: GUEST,
        to: HOST,
        messageId: 'r1',
        dismissed,
        description: 'grant me a thing',
        settled: new Promise(() => {}),
      },
    ];

    const { powers, calls } = makeStreamPowers({
      selfId: 'host-handle-id',
      messages,
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() =>
      [...$parent.querySelectorAll('button')].some(
        b => b.textContent === 'resolve',
      ),
    );

    const buttons = [...$parent.querySelectorAll('button')];
    const $resolve = buttons.find(b => b.textContent === 'resolve');
    const $reject = buttons.find(b => b.textContent === 'reject');
    t.truthy($resolve, 'resolve button renders');
    t.truthy($reject, 'reject button renders');

    const $input = $parent.querySelector('.message-body input');
    t.truthy($input, 'pet-name input renders');
    $input.value = 'my-grant';
    $input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    // Settle the input update between interactions; no positive condition to
    // poll until the resolve click drives powers.resolve.
    await tick(10);

    $resolve.click();
    await waitFor(() => calls.some(c => c.method === 'resolve'));

    const resolveCall = calls.find(c => c.method === 'resolve');
    t.truthy(resolveCall, 'resolve was called');
    t.is(resolveCall.args[0], 7n);
    t.is(resolveCall.args[1], 'my-grant');
  },
);

test.serial('dismiss removes the envelope', async t => {
  const { $parent, $end } = createInboxDOM();
  const dismissedKit = makePromiseKit();

  const messages = [
    {
      type: 'request',
      number: 3n,
      date: new Date(0).toISOString(),
      from: GUEST,
      to: HOST,
      messageId: 'd1',
      dismissed: dismissedKit.promise,
      description: 'will be dismissed',
      settled: new Promise(() => {}),
    },
  ];

  const { powers } = makeStreamPowers({ selfId: 'host-handle-id', messages });

  inboxComponent($parent, $end, powers, { showValue: () => {} });
  await waitFor(
    () => $parent.querySelectorAll('.message-envelope').length >= 1,
  );

  t.is($parent.querySelectorAll('.message-envelope').length, 1);

  // Resolve the dismissed promise; the envelope should be removed.
  dismissedKit.resolve();
  await waitFor(
    () => $parent.querySelectorAll('.message-envelope').length === 0,
  );

  t.is(
    $parent.querySelectorAll('.message-envelope').length,
    0,
    'envelope removed after dismissed resolves',
  );
});

test.serial(
  'dispose() unmounts the inbox and removes its mount node',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const dismissed = makePromiseKit().promise;

    const messages = [
      {
        type: 'request',
        number: 1n,
        date: new Date(0).toISOString(),
        from: HOST,
        to: GUEST,
        messageId: 'm1',
        dismissed,
        description: 'a thing',
        settled: new Promise(() => {}),
      },
    ];
    const { powers } = makeStreamPowers({
      selfId: 'guest-handle-id',
      messages,
    });

    const api = await inboxComponent($parent, $end, powers, {
      showValue: () => {},
    });
    await waitFor(
      () => $parent.querySelectorAll('.message-envelope').length >= 1,
    );
    t.is($parent.querySelectorAll('.message-envelope').length, 1);

    // The confined tree mounts into a dedicated child of $parent; dispose removes
    // it entirely, leaving only the scroll anchor.
    api.dispose();
    await waitFor(
      () => $parent.querySelectorAll('.message-envelope').length === 0,
    );
    t.is($parent.querySelectorAll('.message-envelope').length, 0);
    t.is($parent.contains($end), true, 'the host scroll anchor is untouched');
  },
);
