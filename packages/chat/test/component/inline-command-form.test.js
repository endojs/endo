// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { createInlineCommandForm } from '@endo/spaces-util/inline-command-form.js';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';

const { window: testWindow, cleanup: cleanupDOM } = createDOM();

// renderConfined renders through Preact; its menu/effect idioms defer with
// requestAnimationFrame. dom-setup stubs setTimeout but not rAF; provide a
// setTimeout-backed shim, as a real browser would (copied from
// inbox-shell.test.js).
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). The confined form body
 * renders through Preact (per-render requestAnimationFrame + effect flush, then
 * a host re-parent of controller nodes), so a fixed delay races on slower CI
 * runners; polling the actual condition is robust. (Copied from
 * inbox-shell.test.js — a POLL helper, not a fixed tick.)
 *
 * @param {() => boolean} predicate
 * @param {{ timeout?: number, step?: number }} [opts]
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
 * Create a DOM container for form testing.
 * @returns {{ $container: HTMLElement, cleanup: () => void }}
 */
const createElements = () => {
  const $container = /** @type {HTMLElement} */ (
    /** @type {unknown} */ (testWindow.document.createElement('div'))
  );
  $container.className = 'form-container';
  testWindow.document.body.appendChild($container);

  return {
    $container,
    cleanup: () => {
      $container.remove();
    },
  };
};

test.afterEach(() => {
  testWindow.document.body.innerHTML = '';
});

test.after(() => {
  cleanupDOM();
});

test.serial('createInlineCommandForm creates API with expected methods', t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  t.is(typeof form.setCommand, 'function');
  t.is(typeof form.getCommand, 'function');
  t.is(typeof form.getData, 'function');
  t.is(typeof form.isValid, 'function');
  t.is(typeof form.clear, 'function');
  t.is(typeof form.focus, 'function');
  t.is(typeof form.dispose, 'function');

  form.dispose();
  cleanup();
});

test.serial('getCommand returns null initially', t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  t.is(form.getCommand(), null);

  form.dispose();
  cleanup();
});

test.serial('setCommand sets current command', t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('show');
  t.is(form.getCommand(), 'show');

  form.dispose();
  cleanup();
});

test.serial(
  'form mounts with its child sub-mounts (host-node re-parent)',
  async t => {
    const { $container, cleanup } = createElements();
    const { powers } = makeMockPowers({ names: ['alice'] });

    const form = createInlineCommandForm({
      $container,
      E,
      powers,
      onSubmit: () => {},
      onCancel: () => {},
      onValidityChange: () => {},
    });

    form.setCommand('show');
    // The confined body renders the field, then the host re-parents the
    // petNamePathAutocomplete host `<input>` into the field's anchor.
    await waitFor(() => !!$container.querySelector('.petname-input'));

    // The confined form shell rendered.
    t.truthy($container.querySelector('.inline-command-form'));
    const fields = $container.querySelectorAll('.inline-field');
    t.is(fields.length, 1);
    t.is($container.querySelector('.inline-field-label')?.textContent, 'Name');

    // The host-node child controller's input was re-parented into the field
    // anchor (a real sub-mount, not a confined-rendered node).
    const petInput = $container.querySelector('.petname-input');
    t.truthy(petInput);
    t.truthy(petInput.closest('.inline-field-input-wrapper'));

    form.dispose();
    cleanup();
  },
);

test.serial('setCommand renders form fields for adopt command', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('adopt');
  // adopt has: messageNumber, edgeName, petName
  await waitFor(
    () => $container.querySelectorAll('.inline-field').length === 3,
  );

  t.is($container.querySelectorAll('.inline-field').length, 3);

  form.dispose();
  cleanup();
});

test.serial('isValid returns false when required fields empty', t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('show');
  t.false(form.isValid());

  form.dispose();
  cleanup();
});

test.serial('isValid returns true when required fields filled', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('show');
  await waitFor(() => !!$container.querySelector('.petname-input'));

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('.petname-input')
  );
  input.value = 'alice';
  input.dispatchEvent(new testWindow.Event('input', { bubbles: true }));
  await waitFor(() => form.isValid());

  t.true(form.isValid());

  form.dispose();
  cleanup();
});

test.serial('getData returns form field values', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('show');
  await waitFor(() => !!$container.querySelector('.petname-input'));

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('.petname-input')
  );
  input.value = 'my-value';
  input.dispatchEvent(new testWindow.Event('input', { bubbles: true }));
  await waitFor(() => form.getData().petName === 'my-value');

  t.is(form.getData().petName, 'my-value');

  form.dispose();
  cleanup();
});

test.serial('clear resets command and container', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('show');
  await waitFor(() => !!$container.querySelector('.inline-field'));

  form.clear();
  await waitFor(() => !$container.querySelector('.inline-field'));

  t.is(form.getCommand(), null);
  t.falsy($container.querySelector('.inline-field'));

  form.dispose();
  cleanup();
});

test.serial('onValidityChange callback is called', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  /** @type {boolean[]} */
  const validityChanges = [];

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: isValid => {
      validityChanges.push(isValid);
    },
  });

  form.setCommand('show');
  await waitFor(() => !!$container.querySelector('.petname-input'));

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('.petname-input')
  );
  input.value = 'test';
  input.dispatchEvent(new testWindow.Event('input', { bubbles: true }));
  await waitFor(
    () => validityChanges.length > 0 && validityChanges.at(-1) === true,
  );

  t.true(validityChanges.length > 0);
  t.true(validityChanges[validityChanges.length - 1]);

  form.dispose();
  cleanup();
});

test.serial(
  'primary command submit invokes onSubmit on Enter when valid',
  async t => {
    const { $container, cleanup } = createElements();
    const { powers } = makeMockPowers({ names: ['alice'] });

    let submittedData = null;
    let submittedCommand = null;

    const form = createInlineCommandForm({
      $container,
      E,
      powers,
      onSubmit: (cmd, data) => {
        submittedCommand = cmd;
        submittedData = data;
      },
      onCancel: () => {},
      onValidityChange: () => {},
    });

    // dismiss has a single confined messageNumber field; its Enter handler runs
    // through the confined SafeEvent path into the form's submit.
    form.setCommand('dismiss');
    await waitFor(() => !!$container.querySelector('input[type="number"]'));

    const input = /** @type {HTMLInputElement} */ (
      $container.querySelector('input[type="number"]')
    );
    input.value = '7';
    input.dispatchEvent(new testWindow.Event('input', { bubbles: true }));
    await waitFor(() => form.isValid());

    input.dispatchEvent(
      new testWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await waitFor(() => submittedCommand !== null);

    t.is(submittedCommand, 'dismiss');
    t.truthy(submittedData);
    t.is(/** @type {any} */ (submittedData).messageNumber, 7);

    form.dispose();
    cleanup();
  },
);

test.serial('onCancel callback is called on Escape', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  let cancelled = false;

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {
      cancelled = true;
    },
    onValidityChange: () => {},
  });

  form.setCommand('dismiss');
  await waitFor(() => !!$container.querySelector('input[type="number"]'));

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input[type="number"]')
  );
  input.dispatchEvent(
    new testWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await waitFor(() => cancelled);

  t.true(cancelled);

  form.dispose();
  cleanup();
});

test.serial('immediate commands render no fields', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('exit'); // immediate command with no fields
  // Settle before a NEGATIVE assertion: an immediate command must render no
  // fields, so there is no positive condition to poll.
  await tick(30);

  const fields = $container.querySelectorAll('.inline-field');
  t.is(fields.length, 0);

  form.dispose();
  cleanup();
});

test.serial('renders messageNumber field as number input', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('dismiss');
  await waitFor(() => !!$container.querySelector('input[type="number"]'));

  t.truthy($container.querySelector('input[type="number"]'));

  form.dispose();
  cleanup();
});

test.serial('renders text field as text input', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('request'); // has description text field
  await waitFor(() => !!$container.querySelector('.text-input'));

  t.truthy($container.querySelector('.text-input'));

  form.dispose();
  cleanup();
});

test.serial('petNamePaths field creates chip container sub-mount', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('remove'); // has petNamePaths field
  await waitFor(() => !!$container.querySelector('.chip-container'));

  t.truthy($container.querySelector('.chip-container'));

  form.dispose();
  cleanup();
});

test.serial('dispose tears everything down without leaking', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('show');
  await waitFor(() => !!$container.querySelector('.petname-input'));

  form.dispose();
  await waitFor(() => !$container.querySelector('.inline-command-form'));

  // The confined mount and all field nodes are gone from the container.
  t.falsy($container.querySelector('.inline-command-form'));
  t.falsy($container.querySelector('.inline-field'));
  t.falsy($container.querySelector('.petname-input'));
  t.is($container.children.length, 0);

  // After dispose, further operations are safe.
  t.notThrows(() => form.clear());

  cleanup();
});

test.serial('switching commands clears previous form', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('show');
  await waitFor(
    () => $container.querySelectorAll('.inline-field').length === 1,
  );
  t.is($container.querySelectorAll('.inline-field').length, 1);

  form.setCommand('adopt');
  await waitFor(
    () => $container.querySelectorAll('.inline-field').length === 3,
  );
  t.is($container.querySelectorAll('.inline-field').length, 3);

  form.dispose();
  cleanup();
});

test.serial('getData returns messageNumber as number', async t => {
  const { $container, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const form = createInlineCommandForm({
    $container,
    E,
    powers,
    onSubmit: () => {},
    onCancel: () => {},
    onValidityChange: () => {},
  });

  form.setCommand('dismiss');
  await waitFor(() => !!$container.querySelector('input[type="number"]'));

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input[type="number"]')
  );
  input.value = '42';
  input.dispatchEvent(new testWindow.Event('input', { bubbles: true }));
  await waitFor(() => form.getData().messageNumber === 42);

  const data = form.getData();
  t.is(data.messageNumber, 42);
  t.is(typeof data.messageNumber, 'number');

  form.dispose();
  cleanup();
});
