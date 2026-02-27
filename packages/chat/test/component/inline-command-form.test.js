// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { createInlineCommandForm } from '../../inline-command-form.js';

const { window: testWindow, cleanup: cleanupDOM } = createDOM();

/**
 * Create DOM container for form testing.
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

test('createInlineCommandForm creates API with expected methods', t => {
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

test('getCommand returns null initially', t => {
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

test('setCommand sets current command', t => {
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

test('setCommand renders form fields for show command', async t => {
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
  await tick(10);

  // show command has one field: petName
  const fields = $container.querySelectorAll('.inline-field');
  t.is(fields.length, 1);

  const label = $container.querySelector('.inline-field-label');
  t.is(label?.textContent, 'Name');

  form.dispose();
  cleanup();
});

test('setCommand renders form fields for adopt command', async t => {
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
  await tick(10);

  // adopt command has: messageNumber, edgeName, petName
  const fields = $container.querySelectorAll('.inline-field');
  t.is(fields.length, 3);

  form.dispose();
  cleanup();
});

test('isValid returns false when required fields empty', t => {
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

test('isValid returns true when required fields filled', async t => {
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input')
  );
  input.value = 'alice';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(10);

  t.true(form.isValid());

  form.dispose();
  cleanup();
});

test('getData returns form field values', async t => {
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input')
  );
  input.value = 'my-value';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(10);

  const data = form.getData();
  t.is(data.petName, 'my-value');

  form.dispose();
  cleanup();
});

test('clear resets command and container', t => {
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
  t.truthy($container.querySelector('.inline-field'));

  form.clear();

  t.is(form.getCommand(), null);
  t.falsy($container.querySelector('.inline-field'));

  form.dispose();
  cleanup();
});

test('onValidityChange callback is called', async t => {
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
  await tick(10);

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input')
  );
  input.value = 'test';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(10);

  t.true(validityChanges.length > 0);
  t.true(validityChanges[validityChanges.length - 1]); // Last should be valid

  form.dispose();
  cleanup();
});

test('onSubmit callback is called on Enter when valid', async t => {
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

  form.setCommand('show');

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input')
  );
  input.value = 'test-name';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(10);

  // Press Enter
  const formEl = $container.querySelector('.inline-command-form');
  formEl?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  await tick(10);

  t.is(submittedCommand, 'show');
  t.truthy(submittedData);
  t.is(/** @type {any} */ (submittedData).petName, 'test-name');

  form.dispose();
  cleanup();
});

test('onCancel callback is called on Escape', async t => {
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

  form.setCommand('show');
  await tick(10);

  const formEl = $container.querySelector('.inline-command-form');
  formEl?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await tick(10);

  t.true(cancelled);

  form.dispose();
  cleanup();
});

test('immediate commands render no fields', t => {
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

  const fields = $container.querySelectorAll('.inline-field');
  t.is(fields.length, 0);

  form.dispose();
  cleanup();
});

test('renders messageNumber field as number input', async t => {
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

  form.setCommand('dismiss'); // has messageNumber field
  await tick(10);

  const input = $container.querySelector('input[type="number"]');
  t.truthy(input);

  form.dispose();
  cleanup();
});

test('renders text field as text input', async t => {
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
  await tick(10);

  const textInput = $container.querySelector('.text-input');
  t.truthy(textInput);

  form.dispose();
  cleanup();
});

test('petNamePaths field creates chip container', async t => {
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
  await tick(10);

  const chipContainer = $container.querySelector('.chip-container');
  t.truthy(chipContainer);

  form.dispose();
  cleanup();
});

test('dispose cleans up form', t => {
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
  form.dispose();

  // After dispose, further operations should be safe
  t.notThrows(() => form.clear());

  cleanup();
});

test('switching commands clears previous form', async t => {
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
  await tick(10);

  let fields = $container.querySelectorAll('.inline-field');
  t.is(fields.length, 1); // show has 1 field

  form.setCommand('adopt');
  await tick(10);

  fields = $container.querySelectorAll('.inline-field');
  t.is(fields.length, 3); // adopt has 3 fields

  form.dispose();
  cleanup();
});

test('getData returns messageNumber as number', async t => {
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
  await tick(10);

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input[type="number"]')
  );
  input.value = '42';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(10);

  const data = form.getData();
  t.is(data.messageNumber, 42);
  t.is(typeof data.messageNumber, 'number');

  form.dispose();
  cleanup();
});
