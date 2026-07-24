// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import harden from '@endo/harden';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { h, renderConfined } from '../../setup-preact-container.js';
import { IconSelector, ALL_ICONS } from '../../icon-selector.js';
import { createEditSpaceModal } from '../../edit-space-modal.js';

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
 * races; polling the actual condition is robust. Copied from inbox-shell.test.js
 * — a fixed `tick` flakes on macOS CI.
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

// ── Part 1: IconSelector renders the grid and onSelectIcon fires on click ──

test.serial('IconSelector renders the emoji grid', async t => {
  testDocument.body.innerHTML = '';
  const $mount = testDocument.createElement('div');
  testDocument.body.appendChild($mount);
  t.teardown(() => {
    $mount.remove();
  });

  renderConfined(
    h(IconSelector, {
      selectedIcon: '🤖',
      useLetterIcon: false,
      onSelectIcon: () => {},
      onToggleLetterIcon: () => {},
    }),
    $mount,
  );

  await waitFor(() => $mount.querySelectorAll('.icon-option').length > 0);

  const $options = $mount.querySelectorAll('.icon-option');
  t.is(
    $options.length,
    ALL_ICONS.length,
    'one option per icon, matching ALL_ICONS',
  );
  t.truthy($mount.querySelector('.icon-selector'), 'icon-selector wrapper');
  t.truthy($mount.querySelector('.icon-grid'), 'icon grid');
  t.is($mount.querySelectorAll('.icon-tab').length, 2, 'Emoji + Letter tabs');

  // The selected emoji carries the `selected` class.
  const $selected = $mount.querySelector('.icon-option.selected');
  t.truthy($selected, 'selected option rendered');
  t.is($selected.getAttribute('data-icon'), '🤖', 'correct icon selected');
});

test.serial('IconSelector onSelectIcon fires on click', async t => {
  testDocument.body.innerHTML = '';
  const $mount = testDocument.createElement('div');
  testDocument.body.appendChild($mount);
  t.teardown(() => {
    $mount.remove();
  });

  /** @type {string[]} */
  const selections = [];
  renderConfined(
    h(IconSelector, {
      selectedIcon: '🤖',
      useLetterIcon: false,
      onSelectIcon: icon => selections.push(icon),
      onToggleLetterIcon: () => {},
    }),
    $mount,
  );

  await waitFor(() => $mount.querySelectorAll('.icon-option').length > 0);

  const $first = $mount.querySelector('.icon-option');
  const expectedIcon = $first.getAttribute('data-icon');
  $first.dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  await waitFor(() => selections.length > 0);

  t.is(selections.length, 1, 'onSelectIcon fired once');
  t.is(selections[0], expectedIcon, 'fired with the clicked icon');
});

// ── Part 2: createEditSpaceModal show(space) prefills; save fires callback ──

/**
 * @param {object} [opts]
 * @param {(id: string, data: object) => Promise<void>} [opts.onSubmit]
 */
const setupModal = ({ onSubmit = async () => {} } = {}) => {
  testDocument.body.innerHTML = '';
  const $container = testDocument.createElement('div');
  $container.id = 'modal-container';
  testDocument.body.appendChild($container);

  /** @type {Array<{ id: string, data: object }>} */
  const submits = [];
  let closed = 0;

  const modal = createEditSpaceModal({
    $container,
    onSubmit: async (id, data) => {
      submits.push({ id, data });
      await onSubmit(id, data);
    },
    onClose: () => {
      closed += 1;
    },
  });

  return { $container, modal, submits, getClosed: () => closed };
};

test.serial('show(space) opens the modal prefilled', async t => {
  const { $container, modal } = setupModal();
  t.teardown(() => {
    modal.hide();
    $container.remove();
  });

  t.false(modal.isVisible(), 'starts hidden');

  const space = harden({
    id: '7',
    name: 'Work',
    icon: '🤖',
    profilePath: ['work-agent'],
    mode: 'inbox',
    scheme: 'dark',
  });
  modal.show(space);

  await waitFor(() => !!$container.querySelector('.add-space-form'));

  t.true(modal.isVisible(), 'modal is visible after show');
  t.is($container.style.display, 'flex', 'container shown');

  const $name = $container.querySelector('#edit-space-name');
  t.truthy($name, 'name input rendered');
  t.is($name.value, 'Work', 'name prefilled from space');

  const $selectedIcon = $container.querySelector('.icon-option.selected');
  t.truthy($selectedIcon, 'icon prefilled');
  t.is($selectedIcon.getAttribute('data-icon'), '🤖', 'correct icon selected');

  // Scheme picker host slot mounted in document order.
  const $schemeSlot = $container.querySelector('#scheme-picker-slot');
  t.truthy($schemeSlot, 'scheme picker slot present');
  t.truthy(
    $schemeSlot.querySelector('.scheme-picker'),
    'scheme picker rendered into slot',
  );

  t.truthy($container.querySelector('.icon-selector'), 'icon selector present');
});

test.serial('save invokes onSubmit with the edited form data', async t => {
  const { $container, modal, submits, getClosed } = setupModal();
  t.teardown(() => {
    modal.hide();
    $container.remove();
  });

  const space = harden({
    id: '42',
    name: 'Work',
    icon: '🤖',
    profilePath: ['work-agent'],
    mode: 'inbox',
    scheme: 'auto',
  });
  modal.show(space);
  await waitFor(() => !!$container.querySelector('.add-space-form'));

  // Edit the name field.
  const $name = $container.querySelector('#edit-space-name');
  $name.value = 'Workspace';
  $name.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  // Settle the name update into form state between interactions; no positive
  // condition to poll here (the next icon click has its own waitFor).
  await tick(20);

  // Pick a different emoji icon (the first option).
  const $firstIcon = $container.querySelector('.icon-option');
  const newIcon = $firstIcon.getAttribute('data-icon');
  $firstIcon.dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  await waitFor(() => {
    const $sel = $container.querySelector('.icon-option.selected');
    return $sel && $sel.getAttribute('data-icon') === newIcon;
  });

  // Submit the form.
  const $form = $container.querySelector('.add-space-form');
  $form.dispatchEvent(new globalThis.Event('submit', { bubbles: true }));
  await waitFor(() => submits.length > 0);

  t.is(submits.length, 1, 'onSubmit invoked once');
  t.is(submits[0].id, '42', 'submitted with the space id');
  t.is(submits[0].data.name, 'Workspace', 'edited name submitted');
  t.is(submits[0].data.icon, newIcon, 'edited icon submitted');
  t.is(submits[0].data.scheme, 'auto', 'scheme submitted');

  await waitFor(() => getClosed() > 0);
  t.true(getClosed() >= 1, 'onClose called after successful save');
  t.false(modal.isVisible(), 'modal hidden after save');
});

test.serial('empty name blocks submit with a validation error', async t => {
  const { $container, modal, submits } = setupModal();
  t.teardown(() => {
    modal.hide();
    $container.remove();
  });

  const space = harden({
    id: '9',
    name: 'Temp',
    icon: '🤖',
    profilePath: [],
    mode: 'inbox',
    scheme: 'auto',
  });
  modal.show(space);
  await waitFor(() => !!$container.querySelector('.add-space-form'));

  const $name = $container.querySelector('#edit-space-name');
  $name.value = '   ';
  $name.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  // Settle the (whitespace) name update into form state between interactions; no
  // positive condition to poll until the submit drives the validation error.
  await tick(20);

  const $form = $container.querySelector('.add-space-form');
  $form.dispatchEvent(new globalThis.Event('submit', { bubbles: true }));
  await waitFor(() => !!$container.querySelector('.add-space-error'));

  t.is(submits.length, 0, 'onSubmit not invoked for empty name');
  t.is(
    $container.querySelector('.add-space-error').textContent,
    'Please enter a name',
    'validation error shown',
  );
  t.true(modal.isVisible(), 'modal stays open on validation failure');
});
