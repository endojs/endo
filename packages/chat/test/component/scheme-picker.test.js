// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { createSchemePicker } from '../../scheme-picker.js';

const { document: testDocument } = createDOM();

// renderConfined renders through Preact; some of its idioms defer with
// requestAnimationFrame. dom-setup stubs setTimeout but not rAF; provide a
// setTimeout-backed shim, as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). Preact effect flushes and
 * the controller's re-renders are async on slower CI runners, so a fixed delay
 * races; polling the actual condition is robust. Copied from
 * inbox-shell.test.js — a fixed `tick` flakes on macOS CI.
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

const setupPicker = ({ initialValue } = {}) => {
  testDocument.body.innerHTML = '';
  // Mimic the embedding host node (#scheme-picker-slot) used by the modals.
  const $container = testDocument.createElement('div');
  $container.id = 'scheme-picker-slot';
  testDocument.body.appendChild($container);

  const picker = createSchemePicker({ $container, initialValue });
  return { $container, picker };
};

test.serial('renders the scheme picker grid into its container', async t => {
  const { $container, picker } = setupPicker();
  t.teardown(() => {
    picker.restoreScheme();
    $container.remove();
  });

  await waitFor(() => !!$container.querySelector('.scheme-picker'));

  t.truthy(
    $container.querySelector('.scheme-picker'),
    'picker wrapper renders',
  );
  t.truthy($container.querySelector('.scheme-auto'), 'Auto button renders');
  t.is(
    $container.querySelectorAll('.scheme-cell').length,
    4,
    'four captioned preview cells render',
  );
  t.is(
    $container.querySelectorAll('.scheme-preview').length,
    4,
    'each cell has a preview',
  );

  // Default selection is 'auto'.
  t.is(picker.getValue(), 'auto', 'defaults to auto');
  t.truthy(
    $container.querySelector('.scheme-auto.selected'),
    'Auto button marked selected',
  );
});

test.serial('clicking a cell selects it and fires onChange', async t => {
  const { $container, picker } = setupPicker();
  t.teardown(() => {
    picker.restoreScheme();
    $container.remove();
  });

  /** @type {string[]} */
  const changes = [];
  picker.onChange(scheme => changes.push(scheme));

  await waitFor(() => !!$container.querySelector('.scheme-cell'));

  const $dark = $container.querySelector('.scheme-cell[data-scheme="dark"]');
  t.truthy($dark, 'dark cell present');
  $dark.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => picker.getValue() === 'dark');

  t.is(picker.getValue(), 'dark', 'getValue reflects the clicked cell');
  t.is(changes.length, 1, 'onChange fired once');
  t.is(changes[0], 'dark', 'onChange fired with the selected scheme');
  await waitFor(
    () =>
      !!$container.querySelector('.scheme-cell[data-scheme="dark"].selected'),
  );
  t.truthy(
    $container.querySelector('.scheme-cell[data-scheme="dark"].selected'),
    'dark cell marked selected',
  );

  // Live preview applies to the document.
  t.is(
    testDocument.documentElement.getAttribute('data-scheme'),
    'dark',
    'live preview applied to document',
  );
});

test.serial('setValue updates selection and initialValue prefills', async t => {
  const { $container, picker } = setupPicker({ initialValue: 'light' });
  t.teardown(() => {
    picker.restoreScheme();
    $container.remove();
  });

  await waitFor(() => !!$container.querySelector('.scheme-cell'));
  t.is(picker.getValue(), 'light', 'initialValue prefills the selection');
  t.truthy(
    $container.querySelector('.scheme-cell[data-scheme="light"].selected'),
    'light cell preselected',
  );

  picker.setValue('high-contrast-dark');
  await waitFor(() => picker.getValue() === 'high-contrast-dark');
  t.truthy(
    $container.querySelector(
      '.scheme-cell[data-scheme="high-contrast-dark"].selected',
    ),
    'setValue updates the selected cell',
  );
});

test.serial('restoreScheme reverts the live document preview', async t => {
  // Establish a known starting document scheme.
  testDocument.documentElement.setAttribute('data-scheme', 'light');
  const { $container, picker } = setupPicker();
  t.teardown(() => {
    testDocument.documentElement.removeAttribute('data-scheme');
    $container.remove();
  });

  await waitFor(() => !!$container.querySelector('.scheme-cell'));

  const $dark = $container.querySelector('.scheme-cell[data-scheme="dark"]');
  $dark.dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  await waitFor(
    () => testDocument.documentElement.getAttribute('data-scheme') === 'dark',
  );

  picker.restoreScheme();
  t.is(
    testDocument.documentElement.getAttribute('data-scheme'),
    'light',
    'restoreScheme reverts to the pre-picker document scheme',
  );
});
