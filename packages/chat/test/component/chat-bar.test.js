// @ts-nocheck - Component test with happy-dom
/* global globalThis */

import '@endo/init/debug.js';

import test from 'ava';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { chatBarComponent } from '../../chat-bar-component.js';
import {
  getCategories,
  getCommandsByCategory,
} from '../../command-registry.js';

const {
  window: testWindow,
  document: testDocument,
  cleanup: cleanupDOM,
} = createDOM();

// dom-setup does not surface MutationObserver; the chat bar observes #messages
// for passive-focus updates. happy-dom provides it on its window.
if (
  typeof globalThis.MutationObserver !== 'function' &&
  testWindow.MutationObserver
) {
  globalThis.MutationObserver = testWindow.MutationObserver;
}

// renderConfined renders through Preact; its effect idioms defer with
// requestAnimationFrame. dom-setup stubs setTimeout but not rAF; provide a
// setTimeout-backed shim, as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

// document.execCommand is not implemented by happy-dom; the chat bar's
// global keypress-to-focus handler calls it. Stub it as a no-op.
if (typeof testDocument.execCommand !== 'function') {
  testDocument.execCommand = () => false;
}

/**
 * Poll until `predicate()` is truthy (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). The modeline and command
 * popover mount through `renderConfined`, whose effects flush across Preact's
 * requestAnimationFrame-backed scheduler, so a fixed delay races on slower CI
 * runners; polling the actual condition is robust.
 */
const waitFor = async (predicate, { timeout = 3000, step = 20 } = {}) => {
  const start = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() - start > timeout) return value;
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};

// The exact `#chat-bar`-region markup chat.js renders into `$parent` before it
// calls chatBarComponent($parent, ...). chatBarComponent queries these nodes by
// id; it does not create them. (Verbatim from chat.js's `template`.)
const CHAT_BAR_TEMPLATE = `
<div id="messages">
  <div id="anchor"></div>
</div>

<div id="chat-bar">
  <div class="command-row">
    <div class="command-header">
      <span class="command-label" id="command-label">Command</span>
      <button class="command-cancel" id="command-cancel" title="Cancel (Esc)">&times;</button>
    </div>
    <div id="chat-input-wrapper">
      <div id="chat-message" contenteditable="true"></div>
      <div id="token-menu" class="token-menu"></div>
      <div id="command-menu" class="token-menu"></div>
      <div id="chat-error"></div>
    </div>
    <div id="inline-form-container"></div>
    <div id="command-error"></div>
    <div class="command-footer">
      <button id="command-submit-button">Execute</button>
      <button class="command-cancel-footer" id="command-cancel-footer" title="Cancel (Esc)">&times;</button>
    </div>
    <div id="chat-button-wrapper" style="position: relative;">
      <button id="chat-menu-button" title="Commands">cat</button>
      <button id="chat-send-button">Send</button>
      <div id="chat-command-popover"></div>
    </div>
  </div>
  <div id="chat-modeline"></div>
</div>

<div id="eval-form-backdrop"></div>
<div id="eval-form-container"></div>
<div id="form-builder-backdrop"></div>
<div id="form-builder-container"></div>
<div id="endow-modal-backdrop"></div>
<div id="endow-modal-container"></div>
<div id="define-form-backdrop"></div>
<div id="define-form-container"></div>
<div id="blob-viewer-backdrop"></div>
<div id="blob-viewer-container"></div>
<div id="help-modal-container"></div>
<div id="debugger-panel-backdrop"></div>
<div id="debugger-panel-container"></div>
`;

/**
 * Construct the chat bar exactly as chat.js does: render the `#chat-bar`
 * template into `$parent`, then call chatBarComponent($parent, powers, opts).
 * @param {object} [overrides]
 */
const setupChatBar = async (overrides = {}) => {
  testDocument.body.innerHTML = '';
  const $parent = testDocument.createElement('div');
  $parent.innerHTML = CHAT_BAR_TEMPLATE;
  testDocument.body.appendChild($parent);

  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  /** @type {unknown[]} */
  const shownValues = [];
  const options = {
    showValue: value => shownValues.push(value),
    enterProfile: async () => {},
    exitProfile: () => {},
    canExitProfile: false,
    getConversationPetName: () => null,
    getChannelRef: () => null,
    ...overrides,
  };

  const api = chatBarComponent($parent, powers, options);

  const $chatBar = $parent.querySelector('#chat-bar');
  const $modeline = $parent.querySelector('#chat-modeline');

  // Let the confined mounts' effects (which wire the modeline controller's
  // setter) settle. The modeline paints its default hints on initial render, so
  // their presence is a reliable signal the confined mounts are wired.
  await waitFor(() => $modeline.querySelectorAll('.modeline-hint').length > 0);

  const $popover = $parent.querySelector('#chat-command-popover');
  const $menuButton = $parent.querySelector('#chat-menu-button');

  return {
    $parent,
    $chatBar,
    $modeline,
    $popover,
    $menuButton,
    api,
    powers,
    shownValues,
  };
};

test.afterEach(() => {
  testDocument.body.innerHTML = '';
});

test.after(() => {
  cleanupDOM();
});

test.serial('mounts and exposes the send-form API surface', async t => {
  const ctx = await setupChatBar();

  // The contenteditable input the bar drives exists and is wired.
  t.is(
    ctx.$parent.querySelector('#chat-message').getAttribute('contenteditable'),
    'true',
  );

  // The returned API forwards the send-form contract (preserved verbatim).
  for (const name of [
    'setReplyTo',
    'clearReplyTo',
    'setDefaultReplyTo',
    'clearDefaultReplyTo',
    'setReplyType',
    'getReplyType',
    'setText',
    'focus',
    'dispose',
  ]) {
    t.is(typeof ctx.api[name], 'function', `api.${name} is a function`);
  }

  t.teardown(() => ctx.api.dispose());
});

test.serial('modeline renders confined hint chips in send mode', async t => {
  const ctx = await setupChatBar();

  // The modeline renders into a DEDICATED mount child of #chat-modeline via
  // renderConfined; on initial paint (empty send input, no last recipient)
  // it shows the default "@ inspect or message" / "/ commands" hints.
  const $hints = await waitFor(() => {
    const hints = ctx.$modeline.querySelectorAll('.modeline-hint');
    return hints.length > 0 ? hints : null;
  });

  t.truthy($hints, 'modeline hint spans rendered confined');
  t.true(
    ctx.$chatBar.classList.contains('has-modeline'),
    'host has-modeline class toggled on',
  );

  // The "/ commands" hint renders a <kbd> chip (no innerHTML / kbd() string).
  const kbds = ctx.$modeline.querySelectorAll('.modeline-hint kbd');
  t.true(kbds.length > 0, 'hint key chips render as <kbd> elements');
  const kbdTexts = [...kbds].map(k => k.textContent);
  t.true(kbdTexts.includes('/'), 'the "/" commands key chip is present');
  t.true(kbdTexts.includes('@'), 'the "@" reference key chip is present');

  t.teardown(() => ctx.api.dispose());
});

test.serial(
  'command popover renders confined category sections and rows',
  async t => {
    const ctx = await setupChatBar();

    // Clicking the hamburger button shows the popover (host toggles .visible,
    // body rendered confined into a dedicated mount child).
    ctx.$menuButton.click();

    const $items = await waitFor(() => {
      const items = ctx.$popover.querySelectorAll('.command-popover-item');
      return items.length > 0 ? items : null;
    });

    t.truthy($items, 'command rows rendered confined into the popover');
    t.true(
      ctx.$popover.classList.contains('visible'),
      'host popover .visible class toggled on',
    );

    // Header + footer chrome present.
    t.truthy(
      ctx.$popover.querySelector('.command-popover-header'),
      'popover header present',
    );
    t.truthy(
      ctx.$popover.querySelector('.command-popover-footer'),
      'popover footer present',
    );

    // The rendered rows match the registry's inbox-context command set.
    const expected = new Set();
    for (const category of getCategories()) {
      for (const cmd of getCommandsByCategory(category, 'inbox')) {
        expected.add(cmd.name);
      }
    }
    const rendered = new Set(
      [...ctx.$popover.querySelectorAll('.command-popover-item')].map(el =>
        el.getAttribute('data-command'),
      ),
    );
    t.true(expected.size > 0, 'registry has inbox commands');
    for (const name of expected) {
      t.true(rendered.has(name), `popover row for /${name} rendered`);
    }

    t.teardown(() => ctx.api.dispose());
  },
);

test.serial(
  'clicking a popover row selects the command and hides the popover',
  async t => {
    const ctx = await setupChatBar();
    ctx.$menuButton.click();

    // Pick an inline command (mkdir) whose selection enters command mode.
    const $row = await waitFor(() =>
      ctx.$popover.querySelector('.command-popover-item[data-command="mkdir"]'),
    );
    t.truthy($row, 'a /mkdir row is available');

    $row.click();
    await waitFor(() => !ctx.$popover.classList.contains('visible'));

    // The host hides the popover after selection (clears .visible).
    t.false(
      ctx.$popover.classList.contains('visible'),
      'popover hidden after row click',
    );

    // Entering an inline command applies command-mode chrome and swaps the
    // modeline to its inline hints (Enter submit / Tab next field / Esc cancel).
    await waitFor(() => ctx.$chatBar.classList.contains('command-mode'));
    t.true(
      ctx.$chatBar.classList.contains('command-mode'),
      'command-mode entered on inline command select',
    );

    const $hints = await waitFor(() => {
      const hints = ctx.$modeline.querySelectorAll('.modeline-hint');
      return hints.length > 0 ? hints : null;
    });
    const texts = [...$hints].map(s => s.textContent || '');
    t.true(
      texts.some(text => text.includes('cancel')),
      'inline modeline shows the cancel hint',
    );

    t.teardown(() => ctx.api.dispose());
  },
);

test.serial(
  'command-mode chrome (label / submit / error) renders confined',
  async t => {
    const ctx = await setupChatBar();

    const $header = ctx.$parent.querySelector('.command-header');
    const $footer = ctx.$parent.querySelector('.command-footer');
    const $commandError = ctx.$parent.querySelector('#command-error');

    // Enter command mode via the /mkdir popover row.
    ctx.$menuButton.click();
    const $row = await waitFor(() =>
      ctx.$popover.querySelector('.command-popover-item[data-command="mkdir"]'),
    );
    $row.click();

    await waitFor(() => ctx.$chatBar.classList.contains('command-mode'));
    t.true(
      ctx.$chatBar.classList.contains('command-mode'),
      'command-mode class still toggles',
    );

    // The command label renders confined into a dedicated mount child of
    // `.command-header` as a `.command-label` span — no imperative textContent.
    const $label = await waitFor(() => {
      const span = $header.querySelector('.command-label');
      return span && span.textContent === 'Make Directory' ? span : null;
    });
    t.truthy($label, 'confined command label renders the command label');

    // The submit button renders confined into `.command-footer`, labelled from
    // the command's submitLabel, and starts disabled (the form is invalid).
    const $submit = await waitFor(() => {
      const btn = $footer.querySelector('button');
      return btn && btn.textContent === 'Create' ? btn : null;
    });
    t.truthy($submit, 'confined submit button renders the submit label');
    t.true(
      $submit.disabled,
      'submit button mirrors the authoritative invalid state (disabled)',
    );
    t.truthy(
      $footer.querySelector('.command-cancel-footer'),
      'confined cancel-footer button renders',
    );

    // The error region renders confined; it starts empty / hidden.
    t.is($commandError.style.display, 'none', 'error bubble hidden when empty');

    t.teardown(() => ctx.api.dispose());
  },
);

test.serial(
  'dispose unmounts the confined command-mode chrome mounts',
  async t => {
    const ctx = await setupChatBar();

    const $header = ctx.$parent.querySelector('.command-header');
    const $footer = ctx.$parent.querySelector('.command-footer');

    ctx.$menuButton.click();
    const $row = await waitFor(() =>
      ctx.$popover.querySelector('.command-popover-item[data-command="mkdir"]'),
    );
    $row.click();

    await waitFor(() => $header.querySelector('.command-label'));
    await waitFor(() => $footer.querySelector('button'));
    t.truthy($header.querySelector('.command-label'), 'chrome populated');
    t.truthy($footer.querySelector('button'), 'footer populated');

    ctx.api.dispose();

    await waitFor(() => !$header.querySelector('.command-label'));
    await waitFor(() => !$footer.querySelector('button'));

    // unmount() tears down each confined chrome tree, leaving the host mount
    // nodes empty.
    t.is(
      $header.querySelector('.command-label'),
      null,
      'command label removed after dispose',
    );
    t.is(
      $footer.querySelector('button'),
      null,
      'submit/cancel buttons removed after dispose',
    );
  },
);

test.serial('dispose unmounts the confined modeline mount', async t => {
  const ctx = await setupChatBar();

  await waitFor(
    () => ctx.$modeline.querySelectorAll('.modeline-hint').length > 0,
  );
  t.true(
    ctx.$modeline.querySelectorAll('.modeline-hint').length > 0,
    'modeline populated before dispose',
  );

  ctx.api.dispose();
  await waitFor(
    () => ctx.$modeline.querySelectorAll('.modeline-hint').length === 0,
  );

  // unmount() tears the confined tree down, leaving no hint spans behind.
  t.is(
    ctx.$modeline.querySelectorAll('.modeline-hint').length,
    0,
    'modeline hints removed after dispose',
  );
});

test.serial(
  'dispose removes the global document/window listeners it added',
  async t => {
    const ctx = await setupChatBar();

    // Count the listener removals the chat bar performs during dispose. The
    // chat bar attaches a document `click` (popover dismiss) and two window
    // `keydown` handlers (focus mode + global keypress-to-focus); before this
    // fix they were anonymous and leaked one set per space switch.
    let docClickRemovals = 0;
    let winKeydownRemovals = 0;
    const realDocRemove = testDocument.removeEventListener.bind(testDocument);
    const realWinRemove = testWindow.removeEventListener.bind(testWindow);
    testDocument.removeEventListener = (type, ...rest) => {
      if (type === 'click') docClickRemovals += 1;
      return realDocRemove(type, ...rest);
    };
    testWindow.removeEventListener = (type, ...rest) => {
      if (type === 'keydown') winKeydownRemovals += 1;
      return realWinRemove(type, ...rest);
    };
    t.teardown(() => {
      testDocument.removeEventListener = realDocRemove;
      testWindow.removeEventListener = realWinRemove;
    });

    ctx.api.dispose();

    t.true(docClickRemovals >= 1, 'document click listener removed on dispose');
    t.true(
      winKeydownRemovals >= 2,
      'both window keydown listeners removed on dispose',
    );
  },
);
