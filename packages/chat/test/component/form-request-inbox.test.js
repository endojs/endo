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
 * Build a mock powers object that yields a single form message.
 *
 * @param {object} opts
 * @param {string} opts.selfId - Formula identifier for the current agent.
 * @param {object} opts.message - The form message to deliver.
 * @returns {{ powers: unknown, calls: Array<{method: string, args: unknown[]}> }}
 */
const makeFormPowers = ({ selfId, message }) => {
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];

  const powers = Far('MockPowers', {
    identify(...path) {
      calls.push({ method: 'identify', args: path });
      if (path.length === 1 && path[0] === '@self') {
        return selfId;
      }
      return undefined;
    },

    locate(...path) {
      calls.push({ method: 'locate', args: path });
      if (path.length === 1 && path[0] === '@self') {
        return `endo://localhost/?id=${selfId}&type=handle`;
      }
      return undefined;
    },

    reverseIdentify(id) {
      calls.push({ method: 'reverseIdentify', args: [id] });
      if (id === 'host-handle-id') return ['@host'];
      if (id === 'guest-handle-id') return ['alice'];
      return [];
    },

    async reverseLocate(locator) {
      calls.push({ method: 'reverseLocate', args: [locator] });
      if (locator.includes('host-handle-id')) return ['@host'];
      if (locator.includes('guest-handle-id')) return ['alice'];
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

    submit(number, values) {
      calls.push({ method: 'submit', args: [number, values] });
      return Promise.resolve();
    },

    lookupById(id) {
      calls.push({ method: 'lookupById', args: [id] });
      return Promise.resolve({ submitted: true });
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

test('form renders fields and Submit calls submit()', async t => {
  const { $parent, $end } = createInboxDOM();

  const dismissedKit = makePromiseKit();

  const message = {
    type: 'form',
    number: 1n,
    date: new Date().toISOString(),
    from: 'endo://localhost/?id=host-handle-id&type=handle',
    to: 'endo://localhost/?id=guest-handle-id&type=handle',
    messageId: '42',
    dismissed: dismissedKit.promise,
    description: 'Survey',
    fields: [
      { name: 'favoriteColor', label: 'Favorite color' },
      { name: 'city', label: 'City' },
    ],
  };

  const { powers, calls } = makeFormPowers({
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

  // Verify the form description is rendered
  const descEl = $parent.querySelector('.form-request-description');
  t.truthy(descEl, 'form description should be rendered');
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

  // Verify submit was called with the correct values
  const submitCall = calls.find(c => c.method === 'submit');
  t.truthy(submitCall, 'submit should have been called');
  t.is(submitCall.args[0], 1n);
  t.deepEqual(submitCall.args[1], { favoriteColor: 'green', city: 'Portland' });
});

test('form sender view shows input fields and submit button', async t => {
  const { $parent, $end } = createInboxDOM();

  const dismissedKit = makePromiseKit();

  const message = {
    type: 'form',
    number: 10n,
    date: new Date().toISOString(),
    from: 'endo://localhost/?id=host-handle-id&type=handle',
    to: 'endo://localhost/?id=guest-handle-id&type=handle',
    messageId: '100',
    dismissed: dismissedKit.promise,
    description: 'Survey',
    fields: [{ name: 'favoriteColor', label: 'Favorite color' }],
  };

  const { powers } = makeFormPowers({
    selfId: 'host-handle-id',
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

  // Host sees the sent message (from === selfId, so isSent = true)
  const hostMsgEl = $parent.querySelector('.message.sent');
  t.truthy(hostMsgEl, 'host should see the form as a sent message');

  // Sender sees input fields and submit button (same as receiver)
  const $submit = $parent.querySelector('.form-request-submit');
  t.truthy($submit, 'submit button should exist on sender view');

  const inputs = $parent.querySelectorAll('.form-request-field-input');
  t.is(inputs.length, 1, 'should render one field input');

  const labels = $parent.querySelectorAll('.form-request-field-label');
  t.is(labels.length, 1);
  t.is(labels[0].textContent, 'Favorite color');
});

test('value message renders with Show Value button', async t => {
  const { $parent, $end } = createInboxDOM();

  const dismissedKit = makePromiseKit();

  const message = {
    type: 'value',
    number: 5n,
    date: new Date().toISOString(),
    from: 'endo://localhost/?id=guest-handle-id&type=handle',
    to: 'endo://localhost/?id=host-handle-id&type=handle',
    messageId: '200',
    replyTo: '42',
    valueId: 'marshal-formula-id',
    dismissed: dismissedKit.promise,
  };

  /** @type {Array<{value: unknown, id: unknown}>} */
  const showValueCalls = [];

  const { powers } = makeFormPowers({
    selfId: 'host-handle-id',
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

  // Verify the value message description is rendered
  const descEl = $parent.querySelector('.form-request-description');
  t.truthy(descEl, 'value message description should be rendered');
  t.is(descEl.textContent.trim(), '@alice responded to form');

  // Verify the value is rendered inline (wait for async lookupById)
  await tick(50);
  const $inlineValue = $parent.querySelector('.form-request-inline-value');
  t.truthy($inlineValue, 'inline value container should exist');
  t.truthy(
    $inlineValue.textContent.length > 0,
    'inline value should render the looked-up value',
  );

  // Click "Show Value" button
  const $showResult = $parent.querySelector('.form-request-show-result');
  t.truthy($showResult, 'Show Value button should exist');
  $showResult.click();

  // E() adds multiple microtask hops; flush them.
  await tick(10);
  await tick(10);
  await tick(10);

  // Verify showValue was called
  t.is(showValueCalls.length, 1, 'showValue should have been called');
  t.deepEqual(showValueCalls[0].value, { submitted: true });
  t.is(showValueCalls[0].id, 'marshal-formula-id');
});
