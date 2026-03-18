// @ts-nocheck - Component test with happy-dom

import 'ses';
import '@endo/eventual-send/shim.js';

import test from 'ava';
import { E } from '@endo/far';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { createDOM, createInputElements, tick } from '../helpers/dom-setup.js';
import { makeRefIterator } from '../../ref-iterator.js';
import { tokenAutocompleteComponent } from '../../token-autocomplete.js';

const { document: testDocument, window: testWindow } = createDOM();

/**
 * Simulate typing a character into a contenteditable div in a way that
 * matches how real browsers update the selection: the cursor remains
 * inside a single text node rather than landing in the parent element.
 *
 * @param {HTMLElement} $input
 * @param {string} char
 */
const typeInto = ($input, char) => {
  const win = testWindow;
  const doc = testDocument;
  const sel = win.getSelection();
  if (!sel) return;

  // Dispatch keydown first
  const keydown = new KeyboardEvent('keydown', {
    key: char,
    bubbles: true,
    cancelable: true,
  });
  $input.dispatchEvent(keydown);
  if (keydown.defaultPrevented) return;

  // Get or create a text node at the cursor
  let textNode;
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (
      range.startContainer.nodeType === Node.TEXT_NODE &&
      range.startContainer.parentNode === $input
    ) {
      // Extend existing text node
      textNode = range.startContainer;
      const offset = range.startOffset;
      textNode.textContent =
        textNode.textContent.slice(0, offset) +
        char +
        textNode.textContent.slice(offset);
      range.setStart(textNode, offset + 1);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      // Create new text node
      textNode = doc.createTextNode(char);
      range.insertNode(textNode);
      // Position cursor inside the text node at the end
      range.setStart(textNode, 1);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } else {
    textNode = doc.createTextNode(char);
    $input.appendChild(textNode);
    const range = doc.createRange();
    range.setStart(textNode, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Dispatch input event
  $input.dispatchEvent(new Event('input', { bubbles: true }));
};

/**
 * Simulate pressing a special key (Escape, Enter, etc.)
 *
 * @param {HTMLElement} $input
 * @param {string} key
 */
const press = ($input, key) => {
  $input.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
};

/**
 * Set up the token autocomplete component with mock powers.
 *
 * @param {string[]} [names]
 */
const setup = async (names = ['alice', 'bob', 'charlie']) => {
  testDocument.body.innerHTML = '';
  const { $input, $menu } = createInputElements(testDocument);

  const { powers, addName, removeName } = makeMockPowers({ names });

  const api = tokenAutocompleteComponent($input, $menu, {
    E,
    makeRefIterator,
    powers,
  });

  // Let followNameChanges populate the pet names list
  await tick(50);

  // Focus and set initial cursor
  $input.focus();
  const sel = testWindow.getSelection();
  if (sel) {
    const range = testDocument.createRange();
    range.selectNodeContents($input);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  return { $input, $menu, api, addName, removeName };
};

// ── Menu visibility ──

test.serial('typing @ opens autocomplete menu', async t => {
  const { $input, $menu } = await setup();
  typeInto($input, '@');
  await tick(10);

  t.true($menu.classList.contains('visible'), 'menu should be visible');
  const items = $menu.querySelectorAll('.token-menu-item');
  t.is(items.length, 3, 'all 3 names shown');
});

test.serial('Escape closes menu and leaves literal @', async t => {
  const { $input, $menu } = await setup();
  typeInto($input, '@');
  await tick(10);

  t.true($menu.classList.contains('visible'), 'menu opens');

  press($input, 'Escape');
  await tick(10);

  t.false($menu.classList.contains('visible'), 'menu closes');
  // The literal @ should remain in the input
  t.is($input.textContent, '@', 'literal @ remains after Escape');
});

// ── @-prefixed special name filtering ──

test.serial(
  'typing @@ filters menu to @-prefixed special names only',
  async t => {
    const { $input, $menu } = await setup([
      'alice',
      'bob',
      '@self',
      '@agent',
    ]);

    // Type @ to open menu
    typeInto($input, '@');
    await tick(10);

    t.true($menu.classList.contains('visible'), 'menu visible after first @');
    let items = $menu.querySelectorAll('.token-menu-item');
    t.is(items.length, 4, 'all 4 names shown initially');

    // Type second @ — should filter to @-prefixed names
    typeInto($input, '@');
    await tick(10);

    t.true(
      $menu.classList.contains('visible'),
      'menu still visible after second @',
    );
    items = $menu.querySelectorAll('.token-menu-item');
    t.is(items.length, 2, 'only @-prefixed names shown');

    // Verify the displayed names
    const displayed = [...items].map(el => el.textContent);
    t.true(
      displayed.some(d => d.includes('@agent')),
      '@agent is shown',
    );
    t.true(
      displayed.some(d => d.includes('@self')),
      '@self is shown',
    );
  },
);

test.serial('typing @@s filters to special names matching @s', async t => {
  const { $input, $menu } = await setup(['alice', '@self', '@agent', 'sam']);

  typeInto($input, '@');
  typeInto($input, '@');
  typeInto($input, 's');
  await tick(10);

  t.true($menu.classList.contains('visible'), 'menu visible');
  const items = $menu.querySelectorAll('.token-menu-item');
  t.is(items.length, 1, 'only @self matches');
  t.true(items[0].textContent.includes('@self'), 'shows @self');
});

test.serial('@-prefixed names match when typed without @@', async t => {
  const { $input, $menu } = await setup(['alice', '@self', '@agent']);

  // Type @se — should match @self via the stripped-@ filter
  typeInto($input, '@');
  typeInto($input, 's');
  typeInto($input, 'e');
  await tick(10);

  t.true($menu.classList.contains('visible'), 'menu visible');
  const items = $menu.querySelectorAll('.token-menu-item');
  t.is(items.length, 1, 'only @self matches');
  t.true(items[0].textContent.includes('@self'), 'shows @self');
});

// ── Special name display ──

test.serial(
  '@-prefixed names do not get double @ prefix in menu',
  async t => {
    const { $input, $menu } = await setup(['@self', 'alice']);

    typeInto($input, '@');
    await tick(10);

    const items = $menu.querySelectorAll('.token-menu-item');
    t.is(items.length, 2, 'both names shown');

    // Find the @self item — it should show "@self" not "@@self"
    const selfItem = [...items].find(el => el.textContent.includes('self'));
    t.truthy(selfItem, '@self item exists');
    t.false(selfItem.textContent.includes('@@'), 'no double @@ prefix');

    // The alice item should have the @ prefix from the token-prefix span
    const aliceItem = [...items].find(el => el.textContent.includes('alice'));
    t.truthy(aliceItem, 'alice item exists');
    t.true(
      aliceItem.textContent.includes('@'),
      'alice has @ prefix from span',
    );
  },
);
