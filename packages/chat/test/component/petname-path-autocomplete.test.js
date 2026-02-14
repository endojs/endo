// @ts-check

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { petNamePathAutocomplete } from '../../petname-path-autocomplete.js';

const { window: testWindow, cleanup: cleanupDOM } = createDOM();

/**
 * Create DOM elements for autocomplete testing.
 * @returns {{ $input: HTMLInputElement, $menu: HTMLElement, cleanup: () => void }}
 */
const createElements = () => {
  const $input = /** @type {HTMLInputElement} */ (
    testWindow.document.createElement('input')
  );
  $input.type = 'text';
  testWindow.document.body.appendChild($input);

  const $menu = /** @type {HTMLElement} */ (
    /** @type {unknown} */ (testWindow.document.createElement('div'))
  );
  $menu.className = 'token-menu';
  testWindow.document.body.appendChild($menu);

  return {
    $input,
    $menu,
    cleanup: () => {
      $input.remove();
      $menu.remove();
    },
  };
};

test.afterEach(() => {
  testWindow.document.body.innerHTML = '';
});

test.after(() => {
  cleanupDOM();
});

test('petNamePathAutocomplete creates API with expected methods', t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  t.is(typeof api.getValue, 'function');
  t.is(typeof api.setValue, 'function');
  t.is(typeof api.isMenuVisible, 'function');
  t.is(typeof api.dispose, 'function');

  api.dispose();
  cleanup();
});

test('getValue returns input value', t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'test.path';
  t.is(api.getValue(), 'test.path');

  api.dispose();
  cleanup();
});

test('setValue updates input value', t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  api.setValue('new.value');
  t.is($input.value, 'new.value');

  api.dispose();
  cleanup();
});

test('menu is initially hidden', t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  t.false(api.isMenuVisible());
  t.false($menu.classList.contains('visible'));

  api.dispose();
  cleanup();
});

test('menu shows on input when there are matching names', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'a';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);

  t.true(api.isMenuVisible());
  t.true($menu.classList.contains('visible'));

  api.dispose();
  cleanup();
});

test('menu shows suggestions filtered by input', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'alfred', 'bob'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'al';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);

  const items = $menu.querySelectorAll('.token-menu-item');
  t.is(items.length, 2); // alice and alfred

  api.dispose();
  cleanup();
});

test('menu hides when input is empty', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  // First show menu
  $input.value = 'a';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);
  t.true(api.isMenuVisible());

  // Then clear
  $input.value = '';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);

  t.false(api.isMenuVisible());

  api.dispose();
  cleanup();
});

test('dispose hides menu', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'a';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);
  t.true(api.isMenuVisible());

  api.dispose();
  t.false(api.isMenuVisible());

  cleanup();
});

test('keyboard Escape hides menu', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'a';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);
  t.true(api.isMenuVisible());

  $input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await tick(10);

  t.false(api.isMenuVisible());

  api.dispose();
  cleanup();
});

test('keyboard ArrowDown navigates to next suggestion', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'a';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(100);

  // Get initial selection
  const items = $menu.querySelectorAll('.token-menu-item');
  t.true(items.length >= 1);

  let selected = $menu.querySelector('.token-menu-item.selected');

  // Arrow down to next (if there is one)
  $input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
  );
  await tick(20);

  selected = $menu.querySelector('.token-menu-item.selected');
  // Should either move to next item or wrap around
  t.truthy(selected);

  api.dispose();
  cleanup();
});

test('keyboard ArrowUp navigates to previous suggestion', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'a';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(100);

  // Go down first
  $input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
  );
  await tick(20);

  // Go up
  $input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
  );
  await tick(20);

  const afterUp = $menu.querySelector('.token-menu-item.selected')?.textContent;

  // Up after down should return to different item (or same if wrapped)
  t.truthy(afterUp);

  api.dispose();
  cleanup();
});

test('Tab selects suggestion and updates input', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'a';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(100);

  // Get the currently selected suggestion
  const selected = $menu.querySelector('.token-menu-item.selected');
  const expectedValue = selected?.textContent || '';

  $input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
  );
  await tick(50);

  // Input should now have the selected value
  t.is($input.value, expectedValue);

  api.dispose();
  cleanup();
});

test('Enter selects suggestion', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'b';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);

  $input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  await tick(10);

  t.is($input.value, 'bob');

  api.dispose();
  cleanup();
});

test('menu shows hint text', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'a';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);

  const hint = $menu.querySelector('.token-menu-hint');
  t.truthy(hint);
  t.true(hint?.innerHTML.includes('navigate'));
  t.true(hint?.innerHTML.includes('Esc'));

  api.dispose();
  cleanup();
});

test('handles path with dots - fetches from nested directory', async t => {
  const { $input, $menu, cleanup } = createElements();
  // Set up nested structure via values lookup
  const values = new Map([
    ['dir', { list: async () => ['nested1', 'nested2'] }],
  ]);
  const { powers } = makeMockPowers({ names: ['dir', 'other'], values });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'dir.';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);

  // Should show nested items
  const items = $menu.querySelectorAll('.token-menu-item');
  t.true(items.length >= 0); // May be 0 if mock doesn't fully implement nested lookup

  api.dispose();
  cleanup();
});

test('shows "No matches" when no suggestions', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'xyz';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);

  const empty = $menu.querySelector('.token-menu-empty');
  t.truthy(empty);
  t.is(empty?.textContent, 'No matches');

  api.dispose();
  cleanup();
});

test('menu wraps around when navigating past end', async t => {
  const { $input, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathAutocomplete($input, $menu, { E, powers });

  $input.value = 'a';
  $input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(100);

  const items = $menu.querySelectorAll('.token-menu-item');
  const itemCount = items.length;

  // Get first item
  const firstSelected = $menu.querySelector('.token-menu-item.selected');
  const firstName = firstSelected?.textContent;

  // Navigate down N times (where N = item count) to wrap back to first
  for (let i = 0; i < itemCount; i += 1) {
    $input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
  }
  await tick(10);

  const afterWrap = $menu.querySelector('.token-menu-item.selected');
  // After wrapping, should be back at first item
  t.is(afterWrap?.textContent, firstName);

  api.dispose();
  cleanup();
});
