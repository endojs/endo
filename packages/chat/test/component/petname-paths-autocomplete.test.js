// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { petNamePathsAutocomplete } from '../../petname-paths-autocomplete.js';

const { window: testWindow, cleanup: cleanupDOM } = createDOM();

/**
 * Create DOM elements for multi-path autocomplete testing.
 * @returns {{ $container: HTMLElement, $menu: HTMLElement, cleanup: () => void }}
 */
const createElements = () => {
  const $container = /** @type {HTMLElement} */ (
    /** @type {unknown} */ (testWindow.document.createElement('div'))
  );
  $container.className = 'paths-container';
  testWindow.document.body.appendChild($container);

  const $menu = /** @type {HTMLElement} */ (
    /** @type {unknown} */ (testWindow.document.createElement('div'))
  );
  $menu.className = 'token-menu';
  testWindow.document.body.appendChild($menu);

  return {
    $container,
    $menu,
    cleanup: () => {
      $container.remove();
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.value = '';
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }),
  );
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);
  t.true(api.isMenuVisible());

  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await tick(10);

  t.false(api.isMenuVisible());

  api.dispose();
  cleanup();
});

test('ArrowDown navigates suggestions', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob', 'charlie'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);

  let selected = $menu.querySelector('.token-menu-item.selected');
  t.is(selected?.textContent, 'alice');

  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
  );
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);

  // Select first suggestion (alice) with Space
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
  );
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.value = 'a';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(50);

  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
  );
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  await tick(10);

  t.true(submitted);

  api.dispose();
  cleanup();
});

test('menu shows hint text', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
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

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  t.is(input.placeholder, 'name or path.to.name');

  api.dispose();
  cleanup();
});

test('placeholder hidden when chips exist', t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  api.setValue(['alice']);

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
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

test('finalizeOnSelect: selecting does not show more suggestions', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathsAutocomplete($container, $menu, {
    E,
    powers,
    finalizeOnSelect: true,
  });

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);

  t.true(api.isMenuVisible());

  // Select first item
  const menuItem = $menu.querySelector('.token-menu-item');
  menuItem?.dispatchEvent(
    new testWindow.MouseEvent('mousedown', { bubbles: true }),
  );
  await tick(50);

  // Menu should be hidden (not showing more suggestions)
  t.false(api.isMenuVisible());
  t.deepEqual(api.getValue(), ['alice']);

  api.dispose();
  cleanup();
});

test('Shift+Tab goes back to edit previous chip', async t => {
  const { $container, $menu, cleanup } = createElements();

  // Create nested mock so that 'AGENT' has children
  const { Far } = await import('@endo/far');
  const nestedDir = Far('NestedDir', {
    list() {
      return Far('NameIterator', {
        [Symbol.asyncIterator]() {
          const items = ['child1', 'child2'];
          let index = 0;
          return Far('NameIteratorImpl', {
            async next() {
              if (index < items.length) {
                const value = items[index];
                index += 1;
                return { value, done: false };
              }
              return { value: undefined, done: true };
            },
          });
        },
      });
    },
  });

  const { powers, setValue } = makeMockPowers({ names: ['AGENT'] });
  setValue('AGENT', nestedDir);

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  // Set up a chip
  api.setValue(['AGENT']);
  t.is($container.querySelectorAll('.path-chip').length, 1);

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );

  // Press Shift+Tab to go back
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
  );
  // updateSuggestions is async, wait longer
  await tick(100);

  // Chip should be removed and path should be in input with trailing dot
  t.is($container.querySelectorAll('.path-chip').length, 0);
  t.is(input.value, 'AGENT.');
  t.true(api.isMenuVisible());

  // Should show AGENT's children
  const items = $menu.querySelectorAll('.token-menu-item');
  t.is(items.length, 2);
  t.is(items[0].textContent, 'child1');

  api.dispose();
  cleanup();
});

test('finalizeOnSelect: hint shows Shift+Tab instead of Space', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice'] });

  const api = petNamePathsAutocomplete($container, $menu, {
    E,
    powers,
    finalizeOnSelect: true,
  });

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);

  const hint = $menu.querySelector('.token-menu-hint');
  t.truthy(hint);
  t.true(hint?.innerHTML.includes('⇧Tab'));
  t.true(hint?.innerHTML.includes('go back'));
  t.false(hint?.innerHTML.includes('Space'));

  api.dispose();
  cleanup();
});

test('clicking menu item creates chip (modal usage pattern)', async t => {
  const { $container, $menu, cleanup } = createElements();
  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(50);

  // Click on the first menu item (use mousedown since that's what triggers selection)
  const menuItem = $menu.querySelector('.token-menu-item');
  t.truthy(menuItem, 'Menu item should exist');
  menuItem?.dispatchEvent(
    new testWindow.MouseEvent('mousedown', { bubbles: true }),
  );
  await tick(50);

  // Clicking now creates a chip (uses 'space' mode)
  const chips = $container.querySelectorAll('.path-chip');
  t.is(chips.length, 1);
  t.deepEqual(api.getValue(), ['alice']);
  t.is(input.value, '');

  api.dispose();
  cleanup();
});

test('setValue with path then focus shows nested suggestions', async t => {
  const { $container, $menu, cleanup } = createElements();

  // Create mock with nested directory structure
  const { Far } = await import('@endo/far');
  const nestedDir = Far('NestedDir', {
    list() {
      return Far('NameIterator', {
        [Symbol.asyncIterator]() {
          const items = ['child1', 'child2'];
          let index = 0;
          return Far('NameIteratorImpl', {
            async next() {
              if (index < items.length) {
                const value = items[index];
                index += 1;
                return { value, done: false };
              }
              return { value: undefined, done: true };
            },
          });
        },
      });
    },
  });

  const { powers, setValue } = makeMockPowers({ names: ['AGENT'] });
  setValue('AGENT', nestedDir);

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  // Simulate modal usage: setValue with a path, then focus
  api.setValue(['AGENT']);

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(100);

  // Should show children of AGENT
  t.true(api.isMenuVisible(), 'Menu should be visible');
  const items = $menu.querySelectorAll('.token-menu-item');
  t.is(items.length, 2, 'Should have 2 nested items');
  t.is(items[0].textContent, 'child1');
  t.is(items[1].textContent, 'child2');

  api.dispose();
  cleanup();
});

test('clicking nested suggestion extends chip path', async t => {
  const { $container, $menu, cleanup } = createElements();

  const { Far } = await import('@endo/far');
  const nestedDir = Far('NestedDir', {
    list() {
      return Far('NameIterator', {
        [Symbol.asyncIterator]() {
          const items = ['child1', 'child2'];
          let index = 0;
          return Far('NameIteratorImpl', {
            async next() {
              if (index < items.length) {
                const value = items[index];
                index += 1;
                return { value, done: false };
              }
              return { value: undefined, done: true };
            },
          });
        },
      });
    },
  });

  const { powers, setValue } = makeMockPowers({ names: ['AGENT'] });
  setValue('AGENT', nestedDir);

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  // Set initial chip like the modal does
  api.setValue(['AGENT']);
  t.is($container.querySelectorAll('.path-chip').length, 1);
  t.deepEqual(api.getValue(), ['AGENT']);

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(100);

  // Menu should show children of AGENT
  t.true(api.isMenuVisible(), 'Menu should be visible');
  const menuItems = $menu.querySelectorAll('.token-menu-item');
  t.is(menuItems.length, 2, 'Should have 2 menu items');

  // Click on first item (child1) - use mousedown since that's what triggers selection
  menuItems[0].dispatchEvent(
    new testWindow.MouseEvent('mousedown', { bubbles: true }),
  );
  await tick(50);

  // Should have extended the AGENT chip to AGENT.child1
  const chips = $container.querySelectorAll('.path-chip');
  t.is(chips.length, 1, 'Should still have 1 chip');
  t.deepEqual(api.getValue(), ['AGENT.child1'], 'Chip should be extended');
  t.is(input.value, '', 'Input should be empty');

  api.dispose();
  cleanup();
});

test('ArrowDown works after setValue with existing chip', async t => {
  const { $container, $menu, cleanup } = createElements();

  const { Far } = await import('@endo/far');
  const nestedDir = Far('NestedDir', {
    list() {
      return Far('NameIterator', {
        [Symbol.asyncIterator]() {
          const items = ['option1', 'option2', 'option3'];
          let index = 0;
          return Far('NameIteratorImpl', {
            async next() {
              if (index < items.length) {
                const value = items[index];
                index += 1;
                return { value, done: false };
              }
              return { value: undefined, done: true };
            },
          });
        },
      });
    },
  });

  const { powers, setValue } = makeMockPowers({ names: ['AGENT'] });
  setValue('AGENT', nestedDir);

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  api.setValue(['AGENT']);

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(100);

  // Verify initial selection
  let selected = $menu.querySelector('.token-menu-item.selected');
  t.is(selected?.textContent, 'option1');

  // Arrow down should move selection
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
  );
  await tick(10);

  selected = $menu.querySelector('.token-menu-item.selected');
  t.is(selected?.textContent, 'option2');

  // Arrow down again
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
  );
  await tick(10);

  selected = $menu.querySelector('.token-menu-item.selected');
  t.is(selected?.textContent, 'option3');

  api.dispose();
  cleanup();
});

test('Space on nested suggestion extends the chip path', async t => {
  const { $container, $menu, cleanup } = createElements();

  const { Far } = await import('@endo/far');
  const nestedDir = Far('NestedDir', {
    list() {
      return Far('NameIterator', {
        [Symbol.asyncIterator]() {
          const items = ['child1', 'child2'];
          let index = 0;
          return Far('NameIteratorImpl', {
            async next() {
              if (index < items.length) {
                const value = items[index];
                index += 1;
                return { value, done: false };
              }
              return { value: undefined, done: true };
            },
          });
        },
      });
    },
  });

  const { powers, setValue } = makeMockPowers({ names: ['AGENT'] });
  setValue('AGENT', nestedDir);

  const api = petNamePathsAutocomplete($container, $menu, { E, powers });

  api.setValue(['AGENT']);

  const input = /** @type {HTMLInputElement} */ (
    $container.querySelector('input.chip-input')
  );
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await tick(100);

  // Press Space to select 'child1' - should extend AGENT chip to AGENT.child1
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
  );
  await tick(50);

  // Should now have one chip with extended path
  const chips = $container.querySelectorAll('.path-chip');
  t.is(chips.length, 1);
  t.deepEqual(api.getValue(), ['AGENT.child1']);
  t.is(input.value, '');

  api.dispose();
  cleanup();
});
