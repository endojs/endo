// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { tokenAutocompleteComponent } from '@endo/spaces-util/token-autocomplete.js';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { createDOM, createInputElements, tick } from '../helpers/dom-setup.js';

// Confined-conversion coverage for token-autocomplete: the dropdown body is now
// rendered through `renderConfined` into the host-provided `$menu`. These tests
// pin the migrated behavior — the menu shows on `@`, keyboard Down/Enter selects
// (inserting a `chat-token`), and Escape/blur hides the menu and tears the
// confined tree's content down — using a `waitFor` poll (NOT a fixed delay,
// which races on CI) because Preact flushes through requestAnimationFrame.

const { document: testDocument, window: testWindow } = createDOM();

// renderConfined defers through requestAnimationFrame; dom-setup stubs
// setTimeout but not rAF. Provide a setTimeout-backed shim, as a browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). Copied from
 * inbox-shell.test.js: Preact flushes asynchronously, so a fixed delay races on
 * slower CI runners; polling the actual condition is robust.
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
 * Type a single character into the contenteditable, matching how a real browser
 * updates the selection (cursor stays inside one text node).
 *
 * @param {HTMLElement} $input
 * @param {string} char
 */
const typeInto = ($input, char) => {
  const sel = testWindow.getSelection();
  if (!sel) return;
  const keydown = new KeyboardEvent('keydown', {
    key: char,
    bubbles: true,
    cancelable: true,
  });
  $input.dispatchEvent(keydown);
  if (keydown.defaultPrevented) return;

  let textNode;
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (
      range.startContainer.nodeType === Node.TEXT_NODE &&
      range.startContainer.parentNode === $input
    ) {
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
      textNode = testDocument.createTextNode(char);
      range.insertNode(textNode);
      range.setStart(textNode, 1);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } else {
    textNode = testDocument.createTextNode(char);
    $input.appendChild(textNode);
    const range = testDocument.createRange();
    range.setStart(textNode, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  $input.dispatchEvent(new Event('input', { bubbles: true }));
};

/**
 * Press a special key on the input.
 * @param {HTMLElement} $input
 * @param {string} key
 */
const press = ($input, key) => {
  $input.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
};

/**
 * Construct the component with mock powers and focus the input.
 * @param {string[]} [names]
 */
const setup = async (names = ['alice', 'bob', 'charlie']) => {
  testDocument.body.innerHTML = '';
  const { $input, $menu } = createInputElements(testDocument);

  const { powers } = makeMockPowers({ names });

  const api = tokenAutocompleteComponent($input, $menu, {
    E,
    iterateReader,
    powers,
  });

  // Deliberate settle (not a poll): wait for the async followNameChanges stream
  // to populate the pet-name list before typing. There is no DOM-observable
  // signal for it, and the component does not re-filter an already-typed query
  // when names arrive later, so a typed-then-poll approach would race.
  await tick(50);

  $input.focus();
  const sel = testWindow.getSelection();
  if (sel) {
    const range = testDocument.createRange();
    range.selectNodeContents($input);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  return { $input, $menu, api };
};

test.serial('dropdown shows on @ input (confined render)', async t => {
  const { $input, $menu } = await setup();

  typeInto($input, '@');
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length >= 3);

  t.true($menu.classList.contains('visible'), 'menu becomes visible');
  t.is(
    $menu.querySelectorAll('.token-menu-item').length,
    3,
    'all names render as confined rows',
  );
  t.truthy($menu.querySelector('.token-menu-hint'), 'keyboard hint renders');
});

test.serial('keyboard Down then Enter selects and inserts a token', async t => {
  const { $input, $menu } = await setup(['alice', 'bob', 'charlie']);

  typeInto($input, '@');
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length >= 3);

  // Move highlight down to the second row.
  press($input, 'ArrowDown');
  await waitFor(() => {
    const sel = $menu.querySelector('.token-menu-item.selected');
    return sel && sel.textContent.includes('bob');
  });
  t.true(
    $menu
      .querySelector('.token-menu-item.selected')
      .textContent.includes('bob'),
    'Down moves highlight to bob',
  );

  // Enter inserts the highlighted name as a token into the host input.
  press($input, 'Enter');
  await waitFor(() => $input.querySelector('.chat-token'));

  const $token = $input.querySelector('.chat-token');
  t.truthy($token, 'a chat-token is inserted');
  t.is($token.dataset.petName, 'bob', 'the selected name is inserted');
  t.false($menu.classList.contains('visible'), 'menu hides after select');
});

test.serial('Escape hides the menu and tears down the rows', async t => {
  const { $input, $menu } = await setup();

  typeInto($input, '@');
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length >= 1);
  t.true($menu.classList.contains('visible'));

  press($input, 'Escape');
  await waitFor(() => !$menu.classList.contains('visible'));

  t.false($menu.classList.contains('visible'), 'menu hidden on Escape');
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length === 0);
  t.is(
    $menu.querySelectorAll('.token-menu-item').length,
    0,
    'confined rows removed on hide',
  );
  t.is($input.textContent, '@', 'literal @ remains in the input');
});

test.serial('blur hides the menu and tears down the rows', async t => {
  const { $input, $menu } = await setup();

  typeInto($input, '@');
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length >= 1);
  t.true($menu.classList.contains('visible'));

  // Move focus off the input; the component hides after its blur delay.
  Object.defineProperty(testDocument, 'activeElement', {
    value: testDocument.body,
    configurable: true,
  });
  $input.dispatchEvent(new Event('blur', { bubbles: true }));

  await waitFor(() => !$menu.classList.contains('visible'));
  t.false($menu.classList.contains('visible'), 'menu hidden after blur');
  await waitFor(() => $menu.querySelectorAll('.token-menu-item').length === 0);
  t.is(
    $menu.querySelectorAll('.token-menu-item').length,
    0,
    'confined rows removed after blur',
  );
});
