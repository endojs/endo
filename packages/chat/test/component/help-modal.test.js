// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createHelpModal } from '@endo/spaces-util/help-modal.js';
import { createDOM, tick } from '../helpers/dom-setup.js';

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

const setupModal = () => {
  testDocument.body.innerHTML = '';
  const $container = testDocument.createElement('div');
  $container.id = 'help-modal-container';
  testDocument.body.appendChild($container);

  let closed = 0;
  const modal = createHelpModal({
    $container,
    onClose: () => {
      closed += 1;
    },
  });

  return { $container, modal, getClosed: () => closed };
};

test.serial(
  'show() opens the modal and renders the command overview',
  async t => {
    const { $container, modal } = setupModal();
    t.teardown(() => {
      modal.hide();
      $container.remove();
    });

    t.false(modal.isVisible(), 'starts hidden');
    t.is($container.style.display, 'none', 'container hidden initially');

    modal.show();
    await waitFor(() => !!$container.querySelector('.help-modal'));

    t.true(modal.isVisible(), 'visible after show');
    t.is($container.style.display, 'flex', 'container shown');
    t.truthy($container.querySelector('.help-title'), 'title rendered');
    t.is(
      $container.querySelector('.help-title').textContent,
      'Commands',
      'overview title',
    );
    t.truthy(
      $container.querySelector('.help-category'),
      'at least one category renders',
    );
    t.truthy(
      $container.querySelector('.help-command[data-command]'),
      'command rows render',
    );
  },
);

test.serial('clicking a command row drills into its detail view', async t => {
  const { $container, modal } = setupModal();
  t.teardown(() => {
    modal.hide();
    $container.remove();
  });

  modal.show();
  await waitFor(
    () => !!$container.querySelector('.help-command[data-command]'),
  );

  const $row = $container.querySelector('.help-command[data-command]');
  const commandName = $row.getAttribute('data-command');
  $row.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => !!$container.querySelector('.help-detail'));

  t.truthy($container.querySelector('.help-detail'), 'detail view rendered');
  t.is(
    $container.querySelector('.help-detail-name').textContent,
    `/${commandName}`,
    'detail shows the clicked command',
  );
  t.truthy(
    $container.querySelector('.help-back'),
    'back button appears in detail view',
  );

  // Back returns to the overview.
  $container
    .querySelector('.help-back')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  await waitFor(() => !$container.querySelector('.help-detail'));
  t.is(
    $container.querySelector('.help-title').textContent,
    'Commands',
    'back returns to overview',
  );
});

test.serial('close button hides the modal and fires onClose', async t => {
  const { $container, modal, getClosed } = setupModal();
  t.teardown(() => {
    modal.hide();
    $container.remove();
  });

  modal.show();
  await waitFor(() => !!$container.querySelector('.help-close'));

  $container
    .querySelector('.help-close')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => !modal.isVisible());

  t.false(modal.isVisible(), 'modal hidden after close');
  t.is($container.style.display, 'none', 'container hidden');
  t.falsy($container.querySelector('.help-modal'), 'modal torn down');
  t.true(getClosed() >= 1, 'onClose fired');
});

test.serial('show(commandName) opens directly to a command detail', async t => {
  const { $container, modal } = setupModal();
  t.teardown(() => {
    modal.hide();
    $container.remove();
  });

  modal.show('help');
  await waitFor(() => !!$container.querySelector('.help-detail'));

  t.is(
    $container.querySelector('.help-detail-name').textContent,
    '/help',
    'opens directly to /help detail',
  );
});
