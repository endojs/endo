// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { petNamePathsAutocomplete } from '@endo/spaces-util/petname-paths-autocomplete.js';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';

// Confined-conversion coverage for petname-paths-autocomplete: the dropdown body
// is now rendered through `renderConfined` into the host-provided `$menu`. These
// tests pin the migrated behavior — the dropdown shows on focus/input, keyboard
// Down/Space selects (creating a chip in the host chip container), and
// Escape/blur hides the menu and tears the confined rows down — using a
// `waitFor` poll (NOT a fixed delay, which races on CI) because Preact flushes
// asynchronously.

const { window: testWindow, cleanup: cleanupDOM } = createDOM();

// renderConfined defers through requestAnimationFrame; dom-setup stubs
// setTimeout but not rAF. Install a setTimeout-backed shim (as a browser would)
// before each component is constructed, so the confined tree's effects flush.
const installRafShim = () => {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
};

/**
 * Poll until `predicate()` is true (or a timeout elapses). Copied from
 * inbox-shell.test.js: a fixed delay races on slower CI runners.
 * @param predicate
 * @param root0
 * @param root0.timeout
 * @param root0.step
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
 * Create a chip container + menu container and construct the component.
 * @param {string[]} names
 */
const setup = async names => {
  installRafShim();
  testWindow.document.body.innerHTML = '';
  const $container = /** @type {HTMLElement} */ (
    testWindow.document.createElement('div')
  );
  $container.className = 'paths-container';
  testWindow.document.body.appendChild($container);

  const $menu = /** @type {HTMLElement} */ (
    testWindow.document.createElement('div')
  );
  $menu.className = 'token-menu';
  testWindow.document.body.appendChild($menu);

  const { powers } = makeMockPowers({ names });
  const api = petNamePathsAutocomplete($container, $menu, { E, powers });
  // No warmup needed: the confined Root buffers any state the host pushes
  // before its mount effect wires the setter (controller.pendingState, flushed
  // on mount), so the first input a test dispatches is never dropped. Each test
  // then polls for the rendered suggestions with waitFor.

  const $input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  return { $container, $menu, $input, api };
};

const press = ($input, key) =>
  $input.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    }),
  );

test.after(() => {
  cleanupDOM();
});

test.serial('dropdown shows on focus (confined render)', async t => {
  const { $menu, $input, api } = await setup(['alice', 'alfred', 'bob']);

  $input.dispatchEvent(new globalThis.Event('focus', { bubbles: true }));

  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length >= 3);

  t.true(api.isMenuVisible(), 'menu reports visible');
  t.true($menu.classList.contains('visible'), 'menu has visible class');
  t.is(
    $menu.querySelectorAll('.token-menu-item').length,
    3,
    'all names render as confined rows',
  );
  t.truthy($menu.querySelector('.token-menu-hint'), 'keyboard hint renders');

  api.dispose();
});

test.serial('keyboard Down then Space selects the suggestion', async t => {
  const { $container, $menu, $input, api } = await setup(['alice', 'bob']);

  $input.dispatchEvent(new globalThis.Event('focus', { bubbles: true }));
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length >= 2);

  // Suggestions render in sorted order: ['alice', 'bob']. Poll for the initial
  // highlight to land on the first row, which also confirms the async
  // updateSuggestions has settled before we drive the keyboard below.
  await waitFor(() => {
    const sel = $menu.querySelector('.token-menu-item.selected');
    return sel && sel.textContent === 'alice';
  });
  t.is(
    $menu.querySelector('.token-menu-item.selected').textContent,
    'alice',
    'first row highlighted initially',
  );

  // Down moves the highlight to the second suggestion (bob).
  press($input, 'ArrowDown');
  await waitFor(() => {
    const sel = $menu.querySelector('.token-menu-item.selected');
    return sel && sel.textContent === 'bob';
  });
  t.is(
    $menu.querySelector('.token-menu-item.selected').textContent,
    'bob',
    'Down moves highlight to the second row',
  );

  // Space commits the highlighted suggestion as a chip and clears the input.
  press($input, ' ');
  await waitFor(() => $container.querySelectorAll('.path-chip').length >= 1);

  t.deepEqual(api.getValue(), ['bob'], 'selected name becomes a chip');
  t.is($input.value, '', 'input cleared after selection');

  api.dispose();
});

test.serial('Escape hides the menu and tears down the rows', async t => {
  const { $menu, $input, api } = await setup(['alice', 'bob']);

  $input.dispatchEvent(new globalThis.Event('focus', { bubbles: true }));
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length >= 1);
  t.true(api.isMenuVisible());

  press($input, 'Escape');
  await waitFor(() => !api.isMenuVisible());

  t.false(api.isMenuVisible(), 'menu hidden on Escape');
  t.false($menu.classList.contains('visible'), 'visible class removed');
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length === 0);
  t.is(
    $menu.querySelectorAll('.token-menu-item').length,
    0,
    'confined rows removed on hide',
  );

  api.dispose();
});

test.serial('blur hides the menu and tears down the rows', async t => {
  const { $menu, $input, api } = await setup(['alice', 'bob']);

  $input.dispatchEvent(new globalThis.Event('focus', { bubbles: true }));
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length >= 1);
  t.true(api.isMenuVisible());

  // Blur hides after the component's 150ms delay.
  $input.dispatchEvent(new globalThis.Event('blur', { bubbles: true }));
  await waitFor(() => !api.isMenuVisible());

  t.false(api.isMenuVisible(), 'menu hidden after blur');
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length === 0);
  t.is(
    $menu.querySelectorAll('.token-menu-item').length,
    0,
    'confined rows removed after blur',
  );

  api.dispose();
});
