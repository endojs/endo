// @ts-check

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { makeMockPowers } from '../helpers/mock-powers.js';
import {
  createButton,
  createDOM,
  createInputElements,
  tick,
} from '../helpers/dom-setup.js';
import { typeText } from '../helpers/keyboard-events.js';
import { makeRefIterator } from '../../ref-iterator.js';
import { sendFormComponent } from '../../send-form.js';

const { document: testDocument, cleanup: cleanupDOM } = createDOM();

/**
 * Create fresh DOM elements for each test.
 * @param {Document} doc
 */
const createElements = doc => {
  doc.body.innerHTML = '';
  const { $input, $menu, $error } = createInputElements(doc);
  const $sendButton = createButton(doc, 'send-button');

  return {
    $input,
    $menu,
    $error,
    $sendButton,
  };
};

/**
 * Set up the test environment with mock powers.
 * @param {string[]} [names]
 */
const setup = (names = ['alice', 'bob', 'charlie']) => {
  const { $input, $menu, $error, $sendButton } = createElements(testDocument);

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

test.afterEach(() => {
  testDocument.body.innerHTML = '';
});

test.after(() => {
  cleanupDOM();
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
