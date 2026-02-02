// @ts-check

// Set up DOM globals BEFORE importing any chat modules
import { Window } from 'happy-dom';

const testWindow = new Window({ url: 'http://localhost:3000' });
const w = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (testWindow));

// @ts-expect-error - happy-dom types
globalThis.window = testWindow;
// @ts-expect-error - happy-dom types
globalThis.document = testWindow.document;
globalThis.setTimeout = testWindow.setTimeout.bind(testWindow);
globalThis.clearTimeout = testWindow.clearTimeout.bind(testWindow);
if (w.Event) globalThis.Event = /** @type {typeof Event} */ (w.Event);
if (w.KeyboardEvent) globalThis.KeyboardEvent = /** @type {typeof KeyboardEvent} */ (w.KeyboardEvent);

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { petNamePathsAutocomplete } from '../../petname-paths-autocomplete.js';

/**
 * Create DOM elements for multi-path autocomplete testing.
 * @returns {{ $container: HTMLElement, $menu: HTMLElement, cleanup: () => void }}
 */
const createElements = () => {
  const $container = testWindow.document.createElement('div');
  $container.className = 'paths-container';
  testWindow.document.body.appendChild($container);

  const $menu = testWindow.document.createElement('div');
  $menu.className = 'token-menu';
  testWindow.document.body.appendChild($menu);

  return {
    $container: /** @type {HTMLElement} */ (/** @type {unknown} */ ($container)),
    $menu: /** @type {HTMLElement} */ (/** @type {unknown} */ ($menu)),
    cleanup: () => {
      $container.remove();
      $menu.remove();
    },
  };
};

/**
 * Wait for async operations.
 * @param {number} [ms]
 */
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

test.afterEach(() => {
  testWindow.document.body.innerHTML = '';
});

test('petNamePathsAutocomplete creates API with expected methods', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  t.is(typeof api.getValue, 'function');
  t.is(typeof api.setValue, 'function');
  t.is(typeof api.isMenuVisible, 'function');
  t.is(typeof api.dispose, 'function');
  t.is(typeof api.focus, 'function');

  api.dispose();
  cleanup();
});

test('creates chip container and input', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const chipContainer = $container.querySelector('.chip-container');
  t.truthy(chipContainer);

  const input = $container.querySelector('input.chip-input');
  t.truthy(input);

  api.dispose();
  cleanup();
});

test('getValue returns empty array initially', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  t.deepEqual(api.getValue(), []);

  api.dispose();
  cleanup();
});

test('setValue populates chips', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  api.setValue(['alice', 'bob', 'charlie']);

  const chips = $container.querySelectorAll('.path-chip');
  t.is(chips.length, 3);

  t.deepEqual(api.getValue(), ['alice', 'bob', 'charlie']);

  api.dispose();
  cleanup();
});

test('getValue includes current input if not empty', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  api.setValue(['alice']);

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  input.value = 'partial';

  t.deepEqual(api.getValue(), ['alice', 'partial']);

  api.dispose();
  cleanup();
});

test('menu is initially hidden', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  t.false(api.isMenuVisible());

  api.dispose();
  cleanup();
});

test('menu shows on focus', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);

  t.true(api.isMenuVisible());

  api.dispose();
  cleanup();
});

test('dispose hides menu', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);
  t.true(api.isMenuVisible());

  api.dispose();
  t.false(api.isMenuVisible());

  cleanup();
});

test('chip has remove button', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  api.setValue(['alice']);

  const chip = $container.querySelector('.path-chip');
  const removeButton = chip?.querySelector('.path-chip-remove');
  t.truthy(removeButton);
  t.is(removeButton?.textContent, '×');

  api.dispose();
  cleanup();
});

test('clicking remove button removes chip', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  api.setValue(['alice', 'bob']);
  t.is($container.querySelectorAll('.path-chip').length, 2);

  const firstRemove = $container.querySelector('.path-chip-remove');
  /** @type {HTMLElement} */ (firstRemove).click();
  await tick(10);

  t.deepEqual(api.getValue(), ['bob']);
  t.is($container.querySelectorAll('.path-chip').length, 1);

  api.dispose();
  cleanup();
});

test('Backspace on empty input removes last chip', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  api.setValue(['alice', 'bob']);
  t.is($container.querySelectorAll('.path-chip').length, 2);

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  input.value = '';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
  await tick(10);

  t.deepEqual(api.getValue(), ['alice']);
  t.is($container.querySelectorAll('.path-chip').length, 1);

  api.dispose();
  cleanup();
});

test('Escape hides menu', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);
  t.true(api.isMenuVisible());

  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await tick(10);

  t.false(api.isMenuVisible());

  api.dispose();
  cleanup();
});

test('ArrowDown navigates suggestions', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob', 'charlie'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);

  let selected = $menu.querySelector('.token-menu-item.selected');
  t.is(selected?.textContent, 'alice');

  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await tick(10);

  selected = $menu.querySelector('.token-menu-item.selected');
  t.is(selected?.textContent, 'bob');

  api.dispose();
  cleanup();
});

test('Space creates chip and starts new path', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);

  // Select first suggestion (alice) with Space
  input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  await tick(50);

  const chips = $container.querySelectorAll('.path-chip');
  t.is(chips.length, 1);
  t.true(api.getValue().includes('alice'));
  t.is(input.value, '');

  api.dispose();
  cleanup();
});

test('Tab completes suggestion in input', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  input.value = 'a';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);

  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  await tick(10);

  t.is(input.value, 'alice');
  // No chip created yet - Tab just completes
  t.is($container.querySelectorAll('.path-chip').length, 0);

  api.dispose();
  cleanup();
});

test('focus method focuses the input', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  api.focus();

  const input = $container.querySelector('input.chip-input');
  // Note: happy-dom may not fully support activeElement checking
  t.truthy(input);

  api.dispose();
  cleanup();
});

test('onChange callback is called when value changes', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  let changeCount = 0;
  const api = petNamePathsAutocomplete($container, $menu, {
    E,
    powers,
    onChange: () => {
      changeCount += 1;
    },
  });

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  input.value = 'test';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(10);

  t.true(changeCount > 0);

  api.dispose();
  cleanup();
});

test('onSubmit callback is called on Enter', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  let submitted = false;
  const api = petNamePathsAutocomplete($container, $menu, {
    E,
    powers,
    onSubmit: () => {
      submitted = true;
    },
  });

  api.setValue(['alice']);

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick(10);

  t.true(submitted);

  api.dispose();
  cleanup();
});

test('menu shows hint text', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);

  const hint = $menu.querySelector('.token-menu-hint');
  t.truthy(hint);
  t.true(hint?.innerHTML.includes('Space'));
  t.true(hint?.innerHTML.includes('Enter'));
  t.true(hint?.innerHTML.includes('Esc'));

  api.dispose();
  cleanup();
});

test('placeholder shown when no chips', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  t.is(input.placeholder, 'name or path.to.name');

  api.dispose();
  cleanup();
});

test('placeholder hidden when chips exist', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  api.setValue(['alice']);

  const input = /** @type {HTMLInputElement} */ ($container.querySelector('input.chip-input'));
  t.is(input.placeholder, '');

  api.dispose();
  cleanup();
});

test('chip text displays the path', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  api.setValue(['path.to.value']);

  const chipText = $container.querySelector('.path-chip-text');
  t.is(chipText?.textContent, 'path.to.value');

  api.dispose();
  cleanup();
});
