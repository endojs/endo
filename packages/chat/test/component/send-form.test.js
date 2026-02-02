// @ts-check

// IMPORTANT: Set up DOM globals BEFORE importing any chat modules
// because they reference Node, etc. at module load time
import { Window } from 'happy-dom';

// Create a persistent window for the test suite
const testWindow = new Window({ url: 'http://localhost:3000' });
const w = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (testWindow));

// Set up globals before other imports
// @ts-expect-error - happy-dom types
globalThis.window = testWindow;
// @ts-expect-error - happy-dom types
globalThis.document = testWindow.document;
globalThis.setTimeout = testWindow.setTimeout.bind(testWindow);
globalThis.clearTimeout = testWindow.clearTimeout.bind(testWindow);
if (w.Node) globalThis.Node = /** @type {typeof Node} */ (w.Node);
if (w.NodeFilter) globalThis.NodeFilter = /** @type {typeof NodeFilter} */ (w.NodeFilter);
if (w.KeyboardEvent) globalThis.KeyboardEvent = /** @type {typeof KeyboardEvent} */ (w.KeyboardEvent);
if (w.Event) globalThis.Event = /** @type {typeof Event} */ (w.Event);
if (w.HTMLElement) globalThis.HTMLElement = /** @type {typeof HTMLElement} */ (w.HTMLElement);

// Now we can safely import modules that depend on DOM globals
import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { tick } from '../helpers/dom-setup.js';
import { typeText } from '../helpers/keyboard-events.js';
import { makeRefIterator } from '../../ref-iterator.js';
import { sendFormComponent } from '../../send-form.js';

/**
 * Create fresh DOM elements for each test.
 * @param {typeof testWindow.document} doc
 */
const createElements = doc => {
  // Clear document body
  doc.body.innerHTML = '';

  const $input = doc.createElement('div');
  $input.setAttribute('contenteditable', 'true');
  $input.id = 'chat-message';
  doc.body.appendChild($input);

  const $menu = doc.createElement('div');
  $menu.className = 'token-menu';
  $menu.id = 'token-menu';
  doc.body.appendChild($menu);

  const $error = doc.createElement('div');
  $error.id = 'chat-error';
  doc.body.appendChild($error);

  const $sendButton = doc.createElement('button');
  $sendButton.id = 'send-button';
  doc.body.appendChild($sendButton);

  return {
    $input: /** @type {HTMLElement} */ (/** @type {unknown} */ ($input)),
    $menu: /** @type {HTMLElement} */ (/** @type {unknown} */ ($menu)),
    $error: /** @type {HTMLElement} */ (/** @type {unknown} */ ($error)),
    $sendButton: /** @type {HTMLElement} */ (/** @type {unknown} */ ($sendButton)),
  };
};

/**
 * Set up the test environment with mock powers.
 * @param {string[]} [names]
 */
const setup = (names = ['alice', 'bob', 'charlie']) => {
  const { $input, $menu, $error, $sendButton } = createElements(testWindow.document);

  const { powers, sentMessages, addName, setValue } = makeMockPowers({ names });

  /** @type {import('../../send-form.js').SendFormState[]} */
  const stateChanges = [];

  const component = sendFormComponent({
    $input,
    $menu,
    $error,
    $sendButton,
    E,
    makeRefIterator,
    powers,
    showValue: () => {},
    onStateChange: state => {
      stateChanges.push(state);
    },
  });

  return {
    $input,
    $menu,
    $error,
    $sendButton,
    component,
    powers,
    sentMessages,
    stateChanges,
    addName,
    setValue,
  };
};

test('initial state is empty', t => {
  const ctx = setup();
  const state = ctx.component.getState();
  t.true(state.isEmpty);
  t.false(state.hasToken);
  t.false(state.hasText);
  t.false(state.menuVisible);
});

// NOTE: Token autocomplete behavior (typing @, filtering suggestions, Escape to
// close menu) cannot be tested with happy-dom because it requires a full browser
// Selection API for contenteditable elements. These behaviors require Playwright
// or similar browser automation for proper testing.

test('state changes notify callback', async t => {
  const ctx = setup();

  t.is(ctx.stateChanges.length, 0);

  typeText(ctx.$input, 'h');
  await tick(10);

  t.true(ctx.stateChanges.length > 0);
  const lastState = ctx.stateChanges[ctx.stateChanges.length - 1];
  t.true(lastState.hasText);
});

test('clear resets state', async t => {
  const ctx = setup();

  typeText(ctx.$input, 'hello');
  await tick(10);

  let state = ctx.component.getState();
  t.true(state.hasText);

  ctx.component.clear();
  await tick(10);

  state = ctx.component.getState();
  t.true(state.isEmpty);
});

test('getLastRecipient returns null initially', t => {
  const ctx = setup();
  t.is(ctx.component.getLastRecipient(), null);
});
