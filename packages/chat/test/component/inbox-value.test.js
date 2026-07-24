// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { makePromiseKit } from '@endo/promise-kit';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { inboxComponent } from '../../inbox-component.js';

const { document: testDocument } = createDOM();

// renderConfined defers with requestAnimationFrame; dom-setup stubs setTimeout
// but not rAF, so provide a setTimeout-backed shim as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (or a timeout elapses). The async message
 * pipeline (rAF + reverseLocate + lookupById + Preact effect flushes) races a
 * fixed delay on slower CI runners, so poll the actual condition instead.
 */
const waitFor = async (predicate, { timeout = 3000, step = 20 } = {}) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return;
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};

/**
 * Build a mock powers object that yields a single value message and resolves
 * `lookupById` to a fixed value.
 *
 * @param {object} opts
 * @param {string} opts.selfId
 * @param {object} opts.message
 * @param {unknown} opts.lookedUpValue
 */
const makeValuePowers = ({ selfId, message, lookedUpValue }) => {
  /** @type {Array<{method: string, args: unknown[]}>} */
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
      return [];
    },

    async lookupById(id) {
      calls.push({ method: 'lookupById', args: [id] });
      return lookedUpValue;
    },

    followMessages() {
      let delivered = false;
      return readerFromIterator(
        Far('MessageIterator', {
          next() {
            if (!delivered) {
              delivered = true;
              return Promise.resolve({ value: message, done: false });
            }
            return new Promise(() => {});
          },
        }),
      );
    },

    dismiss(number) {
      calls.push({ method: 'dismiss', args: [number] });
      return Promise.resolve();
    },
  });

  return { powers, calls };
};

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

const HOST = 'endo://localhost/host-handle-id?type=handle';
const GUEST = 'endo://localhost/guest-handle-id?type=handle';

const makeValueMessage = (number = 1n) => ({
  type: 'value',
  number,
  date: new Date().toISOString(),
  from: HOST,
  to: GUEST,
  messageId: `v${number}`,
  dismissed: makePromiseKit().promise,
  valueId: 'value-formula-id',
});

test.serial(
  'value message renders a number as .number span (not a JSON blob)',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const { powers } = makeValuePowers({
      selfId: 'guest-handle-id',
      message: makeValueMessage(),
      lookedUpValue: 42,
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() =>
      $parent.querySelector('.form-request-inline-value .number'),
    );

    const $inline = $parent.querySelector('.form-request-inline-value');
    t.truthy($inline, 'inline value container renders');
    const $number = $inline.querySelector('.number');
    t.truthy($number, 'number renders as a .number span (real element)');
    t.is($number.tagName, 'SPAN');
    t.is($number.textContent, '42');
  },
);

test.serial(
  'value message renders a string as .string span with JSON quoting',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const { powers } = makeValuePowers({
      selfId: 'guest-handle-id',
      message: makeValueMessage(2n),
      lookedUpValue: 'hello',
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() =>
      $parent.querySelector('.form-request-inline-value .string'),
    );

    const $string = $parent.querySelector('.form-request-inline-value .string');
    t.truthy($string, 'string renders as a .string span');
    // value-render.js quotes strings via JSON.stringify.
    t.is($string.textContent, '"hello"');
  },
);

test.serial(
  'value message renders an array as nested .entries spans (not innerHTML)',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const { powers } = makeValuePowers({
      selfId: 'guest-handle-id',
      message: makeValueMessage(3n),
      lookedUpValue: harden([1, 2, 3]),
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() =>
      $parent.querySelector('.form-request-inline-value .entries'),
    );

    const $inline = $parent.querySelector('.form-request-inline-value');
    const $entries = $inline.querySelector('.entries');
    t.truthy($entries, 'array renders an .entries container span');
    // Three child entry spans, each containing a real .number span.
    const numbers = $inline.querySelectorAll('.number');
    t.is(numbers.length, 3, 'each array element is its own .number span');
    const text = $inline.textContent;
    t.true(text.includes('['), 'array brackets render as text');
    t.true(text.includes(']'));
    t.true(text.includes('1') && text.includes('2') && text.includes('3'));
  },
);

test.serial(
  'value message renders an object as .entries with quoted keys',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const { powers } = makeValuePowers({
      selfId: 'guest-handle-id',
      message: makeValueMessage(4n),
      lookedUpValue: harden({ name: 'test', value: 42 }),
    });

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() =>
      $parent.querySelector('.form-request-inline-value .entries'),
    );

    const $inline = $parent.querySelector('.form-request-inline-value');
    const text = $inline.textContent;
    t.true(text.includes('{'), 'record braces render');
    t.true(text.includes('}'));
    t.true(text.includes('"name"'), 'keys are JSON-quoted');
    t.true(text.includes('"test"'));
    t.true(text.includes('42'));
    // The value 42 is a real .number element, not a JSON string blob.
    t.truthy($inline.querySelector('.number'));
  },
);

test.after(() => {
  testDocument.body.innerHTML = '';
});
