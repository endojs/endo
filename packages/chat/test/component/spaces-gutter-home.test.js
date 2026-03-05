// @ts-nocheck - Component test with happy-dom

import 'ses';
import '@endo/eventual-send/shim.js';

import test from 'ava';
import harden from '@endo/harden';
import { Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { createDOM, tick } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

/**
 * Build mock powers that support space 0 config storage and the spaces
 * directory watcher.
 *
 * @param {object} [opts]
 * @param {Map<string, unknown>} [opts.storedValues] - Pre-stored values keyed
 *   by dot-joined path (e.g. "spaces.0").
 * @returns {{
 *   powers: unknown,
 *   calls: Array<{method: string, args: unknown[]}>,
 *   storedValues: Map<string, unknown>,
 * }}
 */
const makeSpacesPowers = ({ storedValues = new Map() } = {}) => {
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];

  /** @type {string[]} */
  const spaceIds = [];
  for (const key of storedValues.keys()) {
    if (key.startsWith('spaces.')) {
      spaceIds.push(key.slice('spaces.'.length));
    }
  }

  /** @type {Array<(value: { add?: string, remove?: string }) => void>} */
  const nameChangeResolvers = [];

  const spacesDir = Far('SpacesDir', {
    followNameChanges() {
      let initialIndex = 0;
      let pendingKit = null;
      return Far('NameChangesIterator', {
        async next() {
          if (initialIndex < spaceIds.length) {
            const id = spaceIds[initialIndex];
            initialIndex += 1;
            return { value: { add: id }, done: false };
          }
          if (!pendingKit) {
            pendingKit = makePromiseKit();
            nameChangeResolvers.push(value => {
              if (pendingKit) {
                pendingKit.resolve(value);
                pendingKit = null;
              }
            });
          }
          const value = await pendingKit.promise;
          return { value, done: false };
        },
      });
    },
  });

  const powers = Far('MockPowers', {
    lookup(pathOrFirst, ...rest) {
      let path;
      if (Array.isArray(pathOrFirst)) {
        path = pathOrFirst;
      } else if (typeof pathOrFirst === 'string') {
        path = rest.length > 0 ? [pathOrFirst, ...rest] : [pathOrFirst];
      } else {
        throw new Error(`Invalid path: ${pathOrFirst}`);
      }
      calls.push({ method: 'lookup', args: path });
      const key = path.join('.');
      if (key === 'spaces') {
        return spacesDir;
      }
      if (storedValues.has(key)) {
        return storedValues.get(key);
      }
      throw new Error(`Not found: ${key}`);
    },

    list(name) {
      calls.push({ method: 'list', args: [name] });
      if (name === 'spaces') {
        const ids = [...spaceIds];
        return Far('SpaceIterator', {
          [Symbol.asyncIterator]() {
            let i = 0;
            return Far('SpaceIteratorImpl', {
              async next() {
                if (i < ids.length) {
                  const value = ids[i];
                  i += 1;
                  return { value, done: false };
                }
                return { value: undefined, done: true };
              },
            });
          },
        });
      }
      throw new Error(`Not found: ${name}`);
    },

    makeDirectory(name) {
      calls.push({ method: 'makeDirectory', args: [name] });
      return undefined;
    },

    storeValue(value, petNamePath) {
      const key = petNamePath.join('.');
      calls.push({ method: 'storeValue', args: [value, petNamePath] });
      storedValues.set(key, value);
      const pathParts = petNamePath;
      if (pathParts.length === 2 && pathParts[0] === 'spaces') {
        const id = pathParts[1];
        if (!spaceIds.includes(id)) {
          spaceIds.push(id);
        }
        for (const resolve of nameChangeResolvers) {
          resolve({ add: id });
        }
      }
    },

    remove(dir, name) {
      calls.push({ method: 'remove', args: [dir, name] });
      const key = `${dir}.${name}`;
      storedValues.delete(key);
      const idx = spaceIds.indexOf(name);
      if (idx !== -1) {
        spaceIds.splice(idx, 1);
      }
      for (const resolve of nameChangeResolvers) {
        resolve({ remove: name });
      }
    },
  });

  return { powers, calls, storedValues };
};

/**
 * Helper: create gutter containers and import the component lazily.
 */
const setupGutter = async (opts = {}) => {
  const $container = /** @type {HTMLElement} */ (
    testDocument.createElement('div')
  );
  $container.id = 'spaces-gutter';
  testDocument.body.appendChild($container);

  const $modalContainer = /** @type {HTMLElement} */ (
    testDocument.createElement('div')
  );
  $modalContainer.id = 'modal-container';
  testDocument.body.appendChild($modalContainer);

  const { powers, calls, storedValues } = makeSpacesPowers(opts);

  const navigated = [];
  const { createSpacesGutter } = await import('../../spaces-gutter.js');

  const gutter = createSpacesGutter({
    $container,
    $modalContainer,
    powers,
    currentProfilePath: [],
    onNavigate: path => navigated.push([...path]),
  });

  // Wait for refresh + watcher to settle
  await tick(50);

  return {
    $container,
    $modalContainer,
    gutter,
    calls,
    storedValues,
    navigated,
  };
};

// ── Test 1: Right-click space 0 shows Edit but not Delete ──

test.serial('right-click home space shows Edit but not Delete', async t => {
  const { $container } = await setupGutter();

  const $home = $container.querySelector('.space-item.home');
  t.truthy($home, 'home space item exists');

  // Dispatch contextmenu
  const event = new Event('contextmenu', { bubbles: true });
  // @ts-expect-error - setting clientX/Y on generic event
  event.clientX = 50;
  // @ts-expect-error
  event.clientY = 50;
  $home.dispatchEvent(event);

  const $menu = $container.querySelector('.space-context-menu');
  t.truthy($menu, 'context menu exists');
  t.true($menu.classList.contains('visible'), 'context menu is visible');

  const $edit = $menu.querySelector('[data-action="edit"]');
  const $delete = $menu.querySelector('[data-action="delete"]');
  t.truthy($edit, 'edit button exists');
  t.truthy($delete, 'delete button exists');

  // Edit should be visible (data-menu-scope="all")
  t.is($edit.style.display, '', 'edit is visible');
  // Delete should be hidden (data-menu-scope="delible")
  t.is($delete.style.display, 'none', 'delete is hidden for home');
});

// ── Test 2: Right-click regular space shows both Edit and Delete ──

test.serial('right-click regular space shows both Edit and Delete', async t => {
  const storedValues = new Map();
  storedValues.set(
    'spaces.1',
    harden({
      id: '1',
      name: 'Work',
      icon: '🧙',
      profilePath: ['work-agent'],
      mode: 'inbox',
      scheme: 'dark',
    }),
  );

  const { $container } = await setupGutter({ storedValues });

  const $space1 = $container.querySelector('.space-item[data-space-id="1"]');
  t.truthy($space1, 'space 1 item exists');

  const event = new Event('contextmenu', { bubbles: true });
  // @ts-expect-error
  event.clientX = 50;
  // @ts-expect-error
  event.clientY = 50;
  $space1.dispatchEvent(event);

  const $menu = $container.querySelector('.space-context-menu');
  const $edit = $menu.querySelector('[data-action="edit"]');
  const $delete = $menu.querySelector('[data-action="delete"]');

  t.is($edit.style.display, '', 'edit is visible for regular space');
  t.is($delete.style.display, '', 'delete is visible for regular space');
});

// ── Test 3: Edit home space modal omits Name field ──

test.serial(
  'edit home modal omits Name field but has icon and scheme',
  async t => {
    const { $container, $modalContainer } = await setupGutter();

    // Open context menu on home
    const $home = $container.querySelector('.space-item.home');
    const ctxEvent = new Event('contextmenu', { bubbles: true });
    // @ts-expect-error
    ctxEvent.clientX = 50;
    // @ts-expect-error
    ctxEvent.clientY = 50;
    $home.dispatchEvent(ctxEvent);

    // Click Edit
    const $edit = $container.querySelector('[data-action="edit"]');
    $edit.click();

    await tick(20);

    // Name field should NOT exist
    const $nameInput = $modalContainer.querySelector('#edit-space-name');
    t.is($nameInput, null, 'name field is not rendered for home');

    // Icon selector should exist
    const $iconSelector = $modalContainer.querySelector('.icon-selector');
    t.truthy($iconSelector, 'icon selector exists');

    // Scheme picker slot should exist
    const $schemeSlot = $modalContainer.querySelector('#scheme-picker-slot');
    t.truthy($schemeSlot, 'scheme picker slot exists');
  },
);

// ── Test 4: Changing icon and scheme of space 0 stores correctly ──

test.serial(
  'changing home icon/scheme stores at spaces.0 with enforced name/path',
  async t => {
    const { $container, $modalContainer, calls, storedValues } =
      await setupGutter();

    // Open context menu on home
    const $home = $container.querySelector('.space-item.home');
    const ctxEvent = new Event('contextmenu', { bubbles: true });
    // @ts-expect-error
    ctxEvent.clientX = 50;
    // @ts-expect-error
    ctxEvent.clientY = 50;
    $home.dispatchEvent(ctxEvent);

    // Click Edit
    const $edit = $container.querySelector('[data-action="edit"]');
    $edit.click();
    await tick(20);

    // Click a different emoji icon (e.g., the wizard 🧙)
    const $icons = $modalContainer.querySelectorAll('.icon-option');
    t.true($icons.length > 0, 'icon options rendered');
    // Click the first icon option (🧙)
    $icons[0].click();
    await tick(10);

    // Submit the form
    const $form = $modalContainer.querySelector('.add-space-form');
    t.truthy($form, 'form exists');
    $form.dispatchEvent(new Event('submit', { bubbles: true }));
    await tick(50);

    // Check that storeValue was called with ['spaces', '1']
    const storeCalls = calls.filter(c => c.method === 'storeValue');
    const homeStoreCall = storeCalls.find(
      c => c.args[1][0] === 'spaces' && c.args[1][1] === '0',
    );
    t.truthy(homeStoreCall, 'storeValue called for spaces.0');

    const storedConfig = homeStoreCall.args[0];
    t.is(storedConfig.name, 'Home', 'name is enforced as Home');
    t.deepEqual(storedConfig.profilePath, [], 'profilePath is enforced as []');
    t.is(storedConfig.icon, '🧙', 'icon was changed');

    // Verify the rendered home icon updated
    const $homeIcon = $container.querySelector('.space-item.home .space-icon');
    t.is($homeIcon.textContent, '🧙', 'rendered icon reflects new value');
  },
);

// ── Test 5: Home config loads from stored space 0 on refresh ──

test.serial('home config loads stored icon/scheme from spaces.0', async t => {
  const storedValues = new Map();
  storedValues.set(
    'spaces.0',
    harden({
      id: '0',
      name: 'Ignored',
      icon: '🤖',
      profilePath: ['ignored'],
      mode: 'inbox',
      scheme: 'dark',
    }),
  );

  const { $container } = await setupGutter({ storedValues });

  // Home should use the stored icon
  const $homeIcon = $container.querySelector('.space-item.home .space-icon');
  t.is($homeIcon.textContent, '🤖', 'home icon loaded from space 0');

  // Name should still be Home (not "Ignored")
  const $home = $container.querySelector('.space-item.home');
  t.true(
    $home.getAttribute('title').startsWith('Home'),
    'home name is enforced',
  );
});
