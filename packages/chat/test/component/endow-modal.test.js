// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { createEndowModal } from '@endo/spaces-util/endow-modal.js';
import { createDOM, tick } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

// renderConfined renders through Preact; its menu/effect idioms defer with
// requestAnimationFrame. dom-setup stubs setTimeout but not rAF; provide a
// setTimeout-backed shim, as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

// Poll until `predicate()` is true (or a timeout elapses, in which case the
// caller's assertion reports the real difference). Preact effect flushes and
// the controller's re-renders are async on slower CI runners, so a fixed delay
// races; polling the actual condition is robust. Copied from inbox-shell.test.js.
const waitFor = async (predicate, { timeout = 3000, step = 20 } = {}) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return;
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};

/**
 * Build mock powers that return a single definition message with slots, plus
 * a name registry for the pet-name path autocomplete.
 * @param root0
 * @param root0.names
 */
const makePowers = ({ names = ['alice', 'bob'] } = {}) => {
  const powers = Far('MockPowers', {
    listMessages() {
      return Promise.resolve([
        {
          number: 5n,
          type: 'definition',
          source: 'export const make = ({ db }) => db;',
          slots: { db: { label: 'the database' } },
        },
      ]);
    },
    list() {
      return Promise.resolve(names);
    },
    lookup() {
      return powers;
    },
  });
  return powers;
};

const createModalDOM = () => {
  testDocument.body.innerHTML = '';
  const $container = testDocument.createElement('div');
  $container.className = 'endow-modal-container';
  testDocument.body.appendChild($container);
  return { $container };
};

test.serial(
  'modal mounts with fields and slot autocomplete sub-mount',
  async t => {
    const { $container } = createModalDOM();
    const powers = makePowers();

    const modal = createEndowModal({
      $container,
      E,
      powers,
      onSubmit: async () => {},
      onClose: () => {},
    });
    t.teardown(() => modal.hide());

    modal.show(5n);

    // Wait for the slot row (built after the async listMessages resolves).
    await waitFor(
      () => $container.querySelectorAll('.endow-modal-slot-row').length >= 1,
    );

    t.truthy($container.querySelector('.endow-modal'), 'modal chrome renders');
    t.truthy(
      $container.querySelector('.endow-modal-result-name'),
      'result-name field',
    );
    t.truthy($container.querySelector('.endow-modal-worker'), 'worker field');
    t.is(
      $container.querySelector('.endow-modal-worker').value,
      '@main',
      'worker defaults to @main',
    );

    // The slot row renders with its code label and the autocomplete sub-mount
    // (input + token menu, owned by the host autocomplete controller).
    const $row = $container.querySelector('.endow-modal-slot-row');
    t.is($row.querySelector('code').textContent, 'db', 'slot code name');
    t.truthy(
      $row.querySelector('.endow-modal-slot-input'),
      'slot input mounted in anchor',
    );
    t.truthy(
      $row.querySelector('.endow-modal-slot-menu.token-menu'),
      'autocomplete menu sub-mount present',
    );

    t.true(modal.isVisible(), 'modal reports visible');

    // Source code renders.
    t.is(
      $container.querySelector('.endow-modal-source').textContent,
      'export const make = ({ db }) => db;',
    );
  },
);

test.serial(
  'submit is disabled until slots are filled, then invokes onSubmit',
  async t => {
    const { $container } = createModalDOM();
    const powers = makePowers();

    /** @type {Array<{ messageNumber, bindings, workerName, resultName }>} */
    const submits = [];
    let closed = false;

    const modal = createEndowModal({
      $container,
      E,
      powers,
      onSubmit: async data => {
        submits.push(data);
      },
      onClose: () => {
        closed = true;
      },
    });
    t.teardown(() => modal.hide());

    modal.show(5n);
    await waitFor(
      () => $container.querySelectorAll('.endow-modal-slot-row').length >= 1,
    );

    const $submit = $container.querySelector('.endow-modal-submit');
    t.true($submit.disabled, 'submit disabled with empty slot');

    // Fill the slot input.
    const $input = $container.querySelector('.endow-modal-slot-input');
    $input.value = 'my-db';
    $input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));

    await waitFor(
      () => !$container.querySelector('.endow-modal-submit').disabled,
    );
    t.false(
      $container.querySelector('.endow-modal-submit').disabled,
      'submit enabled once slot filled',
    );

    $container.querySelector('.endow-modal-submit').click();
    await waitFor(() => submits.length >= 1);

    t.is(submits.length, 1, 'onSubmit invoked once');
    t.is(submits[0].messageNumber, 5n);
    t.deepEqual({ ...submits[0].bindings }, { db: 'my-db' });
    t.is(submits[0].workerName, '@main');
    t.true(closed, 'onClose invoked after successful submit');
  },
);

test.serial('close button invokes onClose', async t => {
  const { $container } = createModalDOM();
  const powers = makePowers();

  let closed = false;
  const modal = createEndowModal({
    $container,
    E,
    powers,
    onSubmit: async () => {},
    onClose: () => {
      closed = true;
    },
  });
  t.teardown(() => modal.hide());

  modal.show(5n);
  await waitFor(() => $container.querySelector('.endow-modal-close'));

  $container.querySelector('.endow-modal-close').click();
  t.true(closed, 'close button triggers onClose');
});

test.serial('non-definition message shows an error', async t => {
  const { $container } = createModalDOM();
  const powers = Far('MockPowers', {
    listMessages() {
      return Promise.resolve([{ number: 9n, type: 'request' }]);
    },
    list() {
      return Promise.resolve([]);
    },
  });

  const modal = createEndowModal({
    $container,
    E,
    powers,
    onSubmit: async () => {},
    onClose: () => {},
  });
  t.teardown(() => modal.hide());

  modal.show(9n);
  await waitFor(() =>
    /is not a definition/.test(
      $container.querySelector('.endow-modal-error').textContent,
    ),
  );

  t.regex(
    $container.querySelector('.endow-modal-error').textContent,
    /Message #9 is not a definition/,
  );
});
