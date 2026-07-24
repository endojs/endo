// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { sendFormComponent } from '@endo/spaces-util/send-form.js';
import { makeMockPowers } from '../helpers/mock-powers.js';
import {
  createButton,
  createDOM,
  createInputElements,
  tick,
} from '../helpers/dom-setup.js';
import { typeText } from '../helpers/keyboard-events.js';

const { document: testDocument, cleanup: cleanupDOM } = createDOM();

// renderConfined renders through Preact; its menu/effect idioms defer with
// requestAnimationFrame. dom-setup stubs setTimeout but not rAF; provide a
// setTimeout-backed shim, as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). The reply-context bar and
 * child controllers mount through `renderConfined`, whose effects flush across
 * Preact's requestAnimationFrame-backed scheduler, so a fixed delay races on
 * slower CI runners; polling the actual condition is robust.
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
 * Create fresh DOM elements for each test.
 * @param {Document} doc
 */
const createElements = doc => {
  doc.body.innerHTML = '';
  const { $input, $menu, $error } = createInputElements(doc);
  const $sendButton = createButton(doc, 'send-button');
  const $chatBar = doc.createElement('div');
  $chatBar.id = 'chat-bar';
  doc.body.appendChild($chatBar);

  return {
    $input,
    $menu,
    $error,
    $sendButton,
    $chatBar,
  };
};

/**
 * Set up the test environment with mock powers.
 * @param {object} [options]
 * @param {string[]} [options.names]
 * @param {() => unknown | null} [options.getChannelRef]
 * @param {() => string | string[] | null} [options.getConversationPetName]
 */
const setup = ({
  names = ['alice', 'bob', 'charlie'],
  getChannelRef,
  getConversationPetName,
} = {}) => {
  const { $input, $menu, $error, $sendButton, $chatBar } =
    createElements(testDocument);

  const { powers, sentMessages, addName, setValue } = makeMockPowers({ names });

  /** @type {import('@endo/spaces-util/send-form.js').SendFormState[]} */
  const stateChanges = [];

  const component = sendFormComponent({
    $input,
    $menu,
    $error,
    $sendButton,
    $chatBar,
    E,
    iterateReader,
    powers,
    showValue: () => {},
    onStateChange: state => {
      stateChanges.push(state);
    },
    getChannelRef,
    getConversationPetName,
  });

  return {
    $input,
    $menu,
    $error,
    $sendButton,
    $chatBar,
    component,
    powers,
    sentMessages,
    stateChanges,
    addName,
    setValue,
  };
};

test.afterEach(() => {
  testDocument.body.innerHTML = '';
});

test.after(() => {
  cleanupDOM();
});

test.serial('initial state is empty', t => {
  const ctx = setup();
  const state = ctx.component.getState();
  t.true(state.isEmpty);
  t.false(state.hasToken);
  t.false(state.hasText);
  t.false(state.menuVisible);
  t.teardown(() => ctx.component.dispose());
});

test.serial('form mounts: message input and child bars present', async t => {
  const ctx = setup();

  // The contenteditable message input is the host node the form drives.
  t.is(ctx.$input.getAttribute('contenteditable'), 'true');

  // The token-autocomplete child (a host-node controller) is integrated: its
  // confined dropdown renders directly into $menu (empty while hidden), and the
  // form exposes its menu-visibility through the API.
  t.false(ctx.component.isMenuVisible(), 'token menu hidden initially');

  // The reply-context bar child renders confined into a DEDICATED mount the form
  // inserts at the top of $chatBar; the mount node is present even while the bar
  // itself is hidden (renders nothing) until a reply context is set.
  t.true(
    ctx.$chatBar.childNodes.length > 0,
    'reply-context bar mount present in chat bar',
  );
  t.falsy(
    ctx.$chatBar.querySelector('.reply-context-bar'),
    'reply-context bar hidden until set',
  );

  // Setting a reply context drives the confined bar to render.
  ctx.component.setReplyTo('1', 'alice', 'hi there');
  await waitFor(() => ctx.$chatBar.querySelector('.reply-context-bar'));
  t.truthy(
    ctx.$chatBar.querySelector('.reply-context-bar'),
    'reply-context bar renders once a context is set',
  );

  t.teardown(() => ctx.component.dispose());
});

test.serial('setReplyTo renders the confined reply-context bar', async t => {
  const ctx = setup();

  ctx.component.setReplyTo('5', 'alice', 'a previous message');
  await waitFor(() => ctx.$chatBar.querySelector('.reply-context-bar'));

  const $bar = ctx.$chatBar.querySelector('.reply-context-bar');
  t.truthy($bar, 'reply-context bar rendered');
  t.truthy($bar.querySelector('.reply-context-label'), 'reply label rendered');
  t.regex(
    $bar.querySelector('.reply-context-label').textContent,
    /alice/,
    'label names the author',
  );
  t.is(
    $bar.querySelector('.reply-context-preview').textContent,
    'a previous message',
  );

  // Close button clears the reply context.
  $bar.querySelector('.reply-context-close').click();
  await waitFor(() => !ctx.$chatBar.querySelector('.reply-context-bar'));
  t.falsy(
    ctx.$chatBar.querySelector('.reply-context-bar'),
    'reply-context bar hidden after close',
  );

  t.teardown(() => ctx.component.dispose());
});

test.serial(
  'submit in conversation mode invokes powers.send (eventual-send)',
  async t => {
    const ctx = setup({
      getConversationPetName: () => 'alice',
    });

    typeText(ctx.$input, 'hello world');
    await waitFor(() => ctx.component.getState().hasText);

    // Submit via the send button (handleSend → E(powers).send).
    ctx.$sendButton.click();
    await waitFor(() => ctx.sentMessages.length > 0);

    t.is(ctx.sentMessages.length, 1, 'one message sent');
    t.is(ctx.sentMessages[0].to, 'alice', 'sent to the conversation');
    t.deepEqual(
      ctx.sentMessages[0].strings,
      ['hello world'],
      'message text forwarded',
    );

    t.teardown(() => ctx.component.dispose());
  },
);

test.serial(
  'channel mode submit calls channel.post (eventual-send)',
  async t => {
    /** @type {unknown[][]} */
    const posts = [];
    const channelRef = Far('MockChannel', {
      getHopInfo: () => undefined,
      getHeatConfig: () => undefined,
      post: (...args) => {
        posts.push(args);
        return Promise.resolve();
      },
    });

    const ctx = setup({ getChannelRef: () => channelRef });

    typeText(ctx.$input, 'channel hello');
    await waitFor(() => ctx.component.getState().hasText);

    ctx.$sendButton.click();
    await waitFor(() => posts.length > 0);

    t.is(posts.length, 1, 'channel.post invoked once');
    t.deepEqual(posts[0][0], ['channel hello'], 'post carries message strings');

    t.teardown(() => ctx.component.dispose());
  },
);

test.serial('state changes notify callback', async t => {
  const ctx = setup();

  t.is(ctx.stateChanges.length, 0);

  typeText(ctx.$input, 'h');
  await waitFor(() => ctx.stateChanges.length > 0);

  t.true(ctx.stateChanges.length > 0);
  const lastState = ctx.stateChanges[ctx.stateChanges.length - 1];
  t.true(lastState.hasText);

  t.teardown(() => ctx.component.dispose());
});

test.serial('clear resets state', async t => {
  const ctx = setup();

  typeText(ctx.$input, 'hello');
  await waitFor(() => ctx.component.getState().hasText);

  let state = ctx.component.getState();
  t.true(state.hasText);

  ctx.component.clear();
  await waitFor(() => ctx.component.getState().isEmpty);

  state = ctx.component.getState();
  t.true(state.isEmpty);

  t.teardown(() => ctx.component.dispose());
});

test.serial('getLastRecipient returns null initially', t => {
  const ctx = setup();
  t.is(ctx.component.getLastRecipient(), null);
  t.teardown(() => ctx.component.dispose());
});

test.serial(
  'dispose tears down the reply-bar mount without leaking',
  async t => {
    const ctx = setup();
    ctx.component.setReplyTo('1', 'bob', 'hi');
    await waitFor(() => ctx.$chatBar.querySelector('.reply-context-bar'));

    const before = ctx.$chatBar.childNodes.length;
    t.true(before > 0);

    ctx.component.dispose();
    // Settle delay before a negative assertion (the bar should be gone); there
    // is no positive condition to poll for.
    await tick(20);

    t.falsy(
      ctx.$chatBar.querySelector('.reply-context-bar'),
      'reply-context bar removed on dispose',
    );
  },
);

// Regression: `initHeatEngine` awaits `getHopInfo`/`getHeatConfig`, so a
// component can be disposed mid-init. If the awaited continuation then starts
// a heat engine, its self-rescheduling requestAnimationFrame loop is never
// stopped — under happy-dom (and the rAF shim above) that loop is a live
// timer that keeps the process alive forever, so the test passes but the
// worker (and CI) hangs. The component must bail out of init once disposed.
//
// This test forces the dispose-before-resolve ordering deterministically and
// asserts that NO requestAnimationFrame is scheduled after dispose (i.e. the
// engine never started). The post-dispose rAF is swallowed rather than run, so
// a regression fails the assertion fast instead of hanging the suite.
test.serial(
  'dispose during heat-engine init does not start a leaking rAF loop',
  async t => {
    const { $input, $menu, $error, $sendButton, $chatBar } =
      createElements(testDocument);
    const { powers } = makeMockPowers({ names: [] });

    // A channel whose heat config resolves only when we say so, letting us
    // dispose while `initHeatEngine` is still awaiting it.
    let resolveConfig;
    const configReady = new Promise(resolve => {
      resolveConfig = resolve;
    });
    const channelRef = Far('Channel', {
      getHopInfo: async () => undefined,
      getHeatConfig: async () => configReady,
    });

    const component = sendFormComponent({
      $input,
      $menu,
      $error,
      $sendButton,
      $chatBar,
      E,
      iterateReader,
      powers,
      showValue: () => {},
      onStateChange: () => {},
      getChannelRef: () => channelRef,
    });

    // Dispose before the heat config resolves — the racy ordering.
    component.dispose();

    // From here on, any requestAnimationFrame call means the heat engine (or
    // its heat bar) started AFTER dispose. Swallow it so a regression cannot
    // spin a real loop and hang the worker.
    const realRaf = globalThis.requestAnimationFrame;
    let rafAfterDispose = 0;
    globalThis.requestAnimationFrame = () => {
      rafAfterDispose += 1;
      return 0;
    };
    t.teardown(() => {
      globalThis.requestAnimationFrame = realRaf;
      component.dispose();
    });

    // Let the init continuation run to completion past its await.
    resolveConfig({
      burstLimit: 5,
      sustainedRate: 10,
      lockoutDurationMs: 5000,
      postLockoutPct: 50,
    });
    // Deliberate settle to let the post-dispose init continuation run, before a
    // negative assertion that NO rAF loop started; there is no positive
    // condition to poll for.
    await tick(50);

    t.is(rafAfterDispose, 0, 'no heat engine / rAF loop started after dispose');
  },
);
