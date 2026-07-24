// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { petNamePathAutocomplete } from '@endo/spaces-util/petname-path-autocomplete.js';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';

// Confined-conversion coverage for petname-path-autocomplete: the dropdown body
// is now rendered through `renderConfined` into the host-provided `$menu`. These
// tests pin the migrated behavior — the dropdown shows on input, keyboard
// Down/Enter selects (writing the chosen name into the host input and firing an
// `input` event), and Escape/blur hides the menu and tears the confined rows
// down — using a `waitFor` poll (NOT a fixed delay, which races on CI) because
// Preact flushes asynchronously.

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
 * Create a plain input + menu container and an onSelect-observing setup.
 * @param {string[]} names
 */
const setup = async names => {
  installRafShim();
  testWindow.document.body.innerHTML = '';
  const $input = /** @type {HTMLInputElement} */ (
    testWindow.document.createElement('input')
  );
  $input.type = 'text';
  testWindow.document.body.appendChild($input);

  const $menu = /** @type {HTMLElement} */ (
    testWindow.document.createElement('div')
  );
  $menu.className = 'token-menu';
  testWindow.document.body.appendChild($menu);

  const { powers } = makeMockPowers({ names });
  // Observe selection by listening for the `input` event the component fires
  // when a suggestion is chosen.
  const selected = [];
  $input.addEventListener('input', () => selected.push($input.value));

  const api = petNamePathAutocomplete($input, $menu, { E, powers });
  // No warmup needed: the confined Root buffers any state the host pushes
  // before its mount effect wires the setter (controller.pendingState, flushed
  // on mount), so the first input a test dispatches is never dropped. Each test
  // then polls for the rendered suggestions with waitFor.
  return { $input, $menu, api, selected };
};

const press = ($input, key) =>
  $input.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );

test.after(() => {
  cleanupDOM();
});

test.serial('dropdown shows on input (confined render)', async t => {
  const { $input, $menu, api } = await setup(['alice', 'alfred', 'bob']);

  $input.value = 'al';
  $input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));

  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length >= 2);

  t.true(api.isMenuVisible(), 'menu reports visible');
  t.true($menu.classList.contains('visible'), 'menu has visible class');
  t.is(
    $menu.querySelectorAll('.token-menu-item').length,
    2,
    'alice and alfred render as confined rows',
  );
  t.truthy($menu.querySelector('.token-menu-hint'), 'keyboard hint renders');

  api.dispose();
});

test.serial('keyboard Down then Enter selects the suggestion', async t => {
  const { $input, $menu, api, selected } = await setup(['alice', 'alfred']);

  $input.value = 'al';
  $input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length >= 2);

  // Suggestions render in sorted order: ['alfred', 'alice']. Poll for the
  // initial highlight to land on the first row, which also confirms the async
  // updateSuggestions has settled before we drive the keyboard below.
  await waitFor(() => {
    const sel = $menu.querySelector('.token-menu-item.selected');
    return sel && sel.textContent === 'alfred';
  });
  t.is(
    $menu.querySelector('.token-menu-item.selected').textContent,
    'alfred',
    'first row highlighted initially',
  );

  // Down moves the highlight to the second suggestion (alice).
  press($input, 'ArrowDown');
  await waitFor(() => {
    const sel = $menu.querySelector('.token-menu-item.selected');
    return sel && sel.textContent === 'alice';
  });
  t.is(
    $menu.querySelector('.token-menu-item.selected').textContent,
    'alice',
    'Down moves highlight to the second row',
  );

  // Enter commits the highlighted suggestion to the input.
  press($input, 'Enter');
  await waitFor(() => $input.value === 'alice');

  t.is($input.value, 'alice', 'selected name written to input');
  t.true(selected.includes('alice'), 'input event fired with selection');
  t.false(api.isMenuVisible(), 'menu hides after select');

  api.dispose();
});

test.serial('Escape hides the menu and tears down the rows', async t => {
  const { $input, $menu, api } = await setup(['alice', 'bob']);

  $input.value = 'a';
  $input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
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
  const { $input, $menu, api } = await setup(['alice', 'bob']);

  $input.value = 'a';
  $input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
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
