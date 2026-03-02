// @ts-nocheck - Component test with happy-dom

import 'ses';
import '@endo/eventual-send/shim.js';

import test from 'ava';
import { Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { inboxComponent } from '../../inbox-component.js';

const { document: testDocument } = createDOM();

/**
 * Build a mock powers object that yields a single form-request message.
 *
 * @param {object} opts
 * @param {string} opts.selfId - Formula identifier for the current agent.
 * @param {object} opts.message - The form-request message to deliver.
 * @returns {{ powers: unknown, calls: Array<{method: string, args: unknown[]}> }}
 */
const makeFormRequestPowers = ({ selfId, message }) => {
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];

  const powers = Far('MockPowers', {
    identify(...path) {
      calls.push({ method: 'identify', args: path });
      if (path.length === 1 && path[0] === 'SELF') {
        return selfId;
      }
      return undefined;
    },

    reverseIdentify(id) {
      calls.push({ method: 'reverseIdentify', args: [id] });
      if (id === 'host-handle-id') return ['HOST'];
      if (id === 'guest-handle-id') return ['alice'];
      return [];
    },

    followMessages() {
      let delivered = false;
      return Far('MessageIterator', {
        next() {
          if (!delivered) {
            delivered = true;
            return Promise.resolve({ value: message, done: false });
          }
          // Block forever after first message
          return new Promise(() => {});
        },
      });
    },

    respondForm(number, values) {
      calls.push({ method: 'respondForm', args: [number, values] });
      return Promise.resolve();
    },

    reject(number, reason) {
      calls.push({ method: 'reject', args: [number, reason] });
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
 * Create a fresh inbox container for each test.
 */
const createInboxDOM = () => {
  testDocument.body.innerHTML = '';
  const $parent = testDocument.createElement('div');
  $parent.id = 'inbox';
  // Stub scroll methods and properties for happy-dom
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

test('form-request renders fields and Submit calls respondForm', async t => {
  const { $parent, $end } = createInboxDOM();

  const settledKit = makePromiseKit();
  const resultIdKit = makePromiseKit();
  const resultKit = makePromiseKit();
  const dismissedKit = makePromiseKit();

  const message = {
    type: 'form-request',
    number: 1n,
    date: new Date().toISOString(),
    from: 'host-handle-id',
    to: 'guest-handle-id',
    messageId: '42',
    dismissed: dismissedKit.promise,
    description: 'Survey',
    fields: { favoriteColor: { label: 'Favorite color' }, city: { label: 'City' } },
    settled: settledKit.promise,
    resultId: resultIdKit.promise,
    result: resultKit.promise,
  };

  const { powers, calls } = makeFormRequestPowers({
    selfId: 'guest-handle-id',
    message,
  });

  // Stub requestAnimationFrame for happy-dom
  globalThis.requestAnimationFrame = fn => {
    fn(0);
    return 0;
  };

  // Launch the inbox component (it will render the message)
  inboxComponent($parent, $end, powers, {
    showValue: () => {},
  });

  // Wait for the message to be rendered
  await tick(50);

  // Verify the form-request description is rendered
  const descEl = $parent.querySelector('.form-request-description');
  t.truthy(descEl, 'form-request description should be rendered');
  t.true(descEl.textContent.includes('Survey'));

  // Verify the field inputs are rendered
  const inputs = $parent.querySelectorAll('.form-request-field-input');
  t.is(inputs.length, 2, 'should render two field inputs');

  // Verify field labels are rendered
  const labels = $parent.querySelectorAll('.form-request-field-label');
  t.is(labels.length, 2);
  t.is(labels[0].textContent, 'Favorite color');
  t.is(labels[1].textContent, 'City');

  // Fill in the form fields
  inputs[0].value = 'green';
  inputs[1].value = 'Portland';

  // Click Submit
  const $submit = $parent.querySelector('.form-request-submit');
  t.truthy($submit, 'submit button should exist');
  $submit.click();

  await tick(20);

  // Verify respondForm was called with the correct values
  const respondCall = calls.find(c => c.method === 'respondForm');
  t.truthy(respondCall, 'respondForm should have been called');
  t.is(respondCall.args[0], 1n);
  t.deepEqual(respondCall.args[1], { favoriteColor: 'green', city: 'Portland' });
});

test('form-request shows "Submitted" and "Show Result" after settlement', async t => {
  const { $parent, $end } = createInboxDOM();

  const settledKit = makePromiseKit();
  const resultIdKit = makePromiseKit();
  const resultKit = makePromiseKit();
  const dismissedKit = makePromiseKit();

  const message = {
    type: 'form-request',
    number: 2n,
    date: new Date().toISOString(),
    from: 'host-handle-id',
    to: 'guest-handle-id',
    messageId: '43',
    dismissed: dismissedKit.promise,
    description: 'Preferences',
    fields: { theme: { label: 'Theme' } },
    settled: settledKit.promise,
    resultId: resultIdKit.promise,
    result: resultKit.promise,
  };

  /** @type {Array<{value: unknown, id: unknown}>} */
  const showValueCalls = [];

  const { powers } = makeFormRequestPowers({
    selfId: 'guest-handle-id',
    message,
  });

  globalThis.requestAnimationFrame = fn => {
    fn(0);
    return 0;
  };

  inboxComponent($parent, $end, powers, {
    showValue: (value, id, petNamePath, messageContext) => {
      showValueCalls.push({ value, id, petNamePath, messageContext });
    },
  });

  await tick(50);

  // Verify Submit and Reject buttons exist before settlement
  t.truthy($parent.querySelector('.form-request-submit'));
  t.truthy($parent.querySelector('.form-request-reject'));

  // Settle the form-request as fulfilled
  settledKit.resolve('fulfilled');
  resultIdKit.resolve('marshal-formula-id');
  resultKit.resolve({ theme: 'dark' });

  await tick(50);

  // Verify "Submitted" status text appears
  const $status = $parent.querySelector('.form-request-status');
  t.truthy($status, 'status element should appear after settlement');
  t.is($status.textContent, 'Submitted');
  t.true($status.classList.contains('status-granted'));

  // Verify "Show Result" button appears
  const $showResult = $parent.querySelector('.form-request-show-result');
  t.truthy($showResult, 'Show Result button should appear');

  // Click "Show Result"
  $showResult.click();
  await tick(20);

  // Verify showValue was called with the result
  t.is(showValueCalls.length, 1, 'showValue should have been called');
  t.deepEqual(showValueCalls[0].value, { theme: 'dark' });
  t.is(showValueCalls[0].id, 'marshal-formula-id');
});

test('form-request shows "Rejected" after rejection', async t => {
  const { $parent, $end } = createInboxDOM();

  const settledKit = makePromiseKit();
  const resultIdKit = makePromiseKit();
  const resultKit = makePromiseKit();
  const dismissedKit = makePromiseKit();

  const message = {
    type: 'form-request',
    number: 3n,
    date: new Date().toISOString(),
    from: 'host-handle-id',
    to: 'guest-handle-id',
    messageId: '44',
    dismissed: dismissedKit.promise,
    description: 'Unwanted',
    fields: { field1: { label: 'Field 1' } },
    settled: settledKit.promise,
    resultId: resultIdKit.promise,
    result: resultKit.promise,
  };

  const { powers, calls } = makeFormRequestPowers({
    selfId: 'guest-handle-id',
    message,
  });

  globalThis.requestAnimationFrame = fn => {
    fn(0);
    return 0;
  };

  inboxComponent($parent, $end, powers, {
    showValue: () => {},
  });

  await tick(50);

  // Click Reject
  const $reject = $parent.querySelector('.form-request-reject');
  t.truthy($reject, 'reject button should exist');
  $reject.click();

  await tick(20);

  // Verify reject was called
  const rejectCall = calls.find(c => c.method === 'reject');
  t.truthy(rejectCall, 'reject should have been called');
  t.is(rejectCall.args[0], 3n);

  // Settle as rejected
  settledKit.resolve('rejected');
  resultIdKit.resolve(undefined);
  resultKit.resolve(undefined);

  await tick(50);

  // Verify "Rejected" status text appears
  const $status = $parent.querySelector('.form-request-status');
  t.truthy($status, 'status element should appear after rejection');
  t.is($status.textContent, 'Rejected');
  t.true($status.classList.contains('status-rejected'));

  // Verify no "Show Result" button
  const $showResult = $parent.querySelector('.form-request-show-result');
  t.falsy($showResult, 'Show Result button should not appear for rejected forms');
});

test('form-request full workflow: host sends form, guest responds, host views result', async t => {
  // This test exercises the user's manual test scenario:
  // 1. Host sends a form to guest (form appears as "sent" in host inbox)
  // 2. Guest receives form, fills in fields, clicks Submit
  // 3. Host sees "Submitted" status and clicks "Show Result"

  // --- Step 1: Host's view (sent form-request) ---
  const hostDOM = createInboxDOM();

  const hostSettledKit = makePromiseKit();
  const hostResultIdKit = makePromiseKit();
  const hostResultKit = makePromiseKit();
  const hostDismissedKit = makePromiseKit();

  const hostMessage = {
    type: 'form-request',
    number: 10n,
    date: new Date().toISOString(),
    from: 'host-handle-id',
    to: 'guest-handle-id',
    messageId: '100',
    dismissed: hostDismissedKit.promise,
    description: 'Survey',
    fields: { favoriteColor: { label: 'Favorite color' } },
    settled: hostSettledKit.promise,
    resultId: hostResultIdKit.promise,
    result: hostResultKit.promise,
  };

  const { powers: hostPowers } = makeFormRequestPowers({
    selfId: 'host-handle-id',
    message: hostMessage,
  });

  /** @type {Array<{value: unknown, id: unknown, messageContext: unknown}>} */
  const hostShowValueCalls = [];

  globalThis.requestAnimationFrame = fn => {
    fn(0);
    return 0;
  };

  inboxComponent(hostDOM.$parent, hostDOM.$end, hostPowers, {
    showValue: (value, id, petNamePath, messageContext) => {
      hostShowValueCalls.push({ value, id, messageContext });
    },
  });

  await tick(50);

  // Host sees the sent message (from === selfId, so isSent = true)
  const hostMsgEl = hostDOM.$parent.querySelector('.message.sent');
  t.truthy(hostMsgEl, 'host should see the form-request as a sent message');

  // --- Step 2: Guest's view (received form-request) ---
  const guestDOM = createInboxDOM();

  const guestSettledKit = makePromiseKit();
  const guestResultIdKit = makePromiseKit();
  const guestResultKit = makePromiseKit();
  const guestDismissedKit = makePromiseKit();

  const guestMessage = {
    type: 'form-request',
    number: 1n,
    date: new Date().toISOString(),
    from: 'host-handle-id',
    to: 'guest-handle-id',
    messageId: '101',
    dismissed: guestDismissedKit.promise,
    description: 'Survey',
    fields: { favoriteColor: { label: 'Favorite color' } },
    settled: guestSettledKit.promise,
    resultId: guestResultIdKit.promise,
    result: guestResultKit.promise,
  };

  const { powers: guestPowers, calls: guestCalls } = makeFormRequestPowers({
    selfId: 'guest-handle-id',
    message: guestMessage,
  });

  inboxComponent(guestDOM.$parent, guestDOM.$end, guestPowers, {
    showValue: () => {},
  });

  await tick(50);

  // Guest sees the received message
  const guestMsgEl = guestDOM.$parent.querySelector('.message:not(.sent)');
  t.truthy(guestMsgEl, 'guest should see the form-request as a received message');

  // Guest fills in the form and clicks Submit
  const guestInput = guestDOM.$parent.querySelector('.form-request-field-input');
  t.truthy(guestInput);
  guestInput.value = 'green';

  const guestSubmit = guestDOM.$parent.querySelector('.form-request-submit');
  t.truthy(guestSubmit);
  guestSubmit.click();

  await tick(20);

  // Verify respondForm was called on the guest's powers
  const respondCall = guestCalls.find(c => c.method === 'respondForm');
  t.truthy(respondCall, 'guest respondForm should have been called');
  t.deepEqual(respondCall.args[1], { favoriteColor: 'green' });

  // --- Step 3: Back on host — settlement arrives, host clicks "Show Result" ---
  hostSettledKit.resolve('fulfilled');
  hostResultIdKit.resolve('marshal-formula-id');
  hostResultKit.resolve({ favoriteColor: 'green' });

  await tick(50);

  const hostStatus = hostDOM.$parent.querySelector('.form-request-status');
  t.truthy(hostStatus, 'host should see settlement status');
  t.is(hostStatus.textContent, 'Submitted');

  const hostShowResult = hostDOM.$parent.querySelector(
    '.form-request-show-result',
  );
  t.truthy(hostShowResult, 'host should see Show Result button');
  hostShowResult.click();

  await tick(20);

  t.is(hostShowValueCalls.length, 1, 'showValue should have been called on host');
  t.deepEqual(hostShowValueCalls[0].value, { favoriteColor: 'green' });
  t.is(hostShowValueCalls[0].id, 'marshal-formula-id');
  t.deepEqual(hostShowValueCalls[0].messageContext, {
    number: 10n,
    edgeName: 'RESULT',
  });
});
