// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { chatBarComponent } from '@endo/spaces-util/chat-bar-component.js';
import {
  getCategories,
  getCommandsByCategory,
} from '@endo/spaces-util/command-registry.js';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { createDOM, tick } from '../helpers/dom-setup.js';

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

// happy-dom does not implement scrollIntoView / element scrollTo; durable-focus
// navigation (entering focus mode, moving to an edge) calls them. Stub no-ops.
if (typeof testWindow.HTMLElement.prototype.scrollIntoView !== 'function') {
  testWindow.HTMLElement.prototype.scrollIntoView =
    function scrollIntoView() {};
}
if (typeof testWindow.HTMLElement.prototype.scrollTo !== 'function') {
  testWindow.HTMLElement.prototype.scrollTo = function scrollTo() {};
}

/**
 * Poll until `predicate()` is truthy (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). The modeline and command
 * popover mount through `renderConfined`, whose effects flush across Preact's
 * requestAnimationFrame-backed scheduler, so a fixed delay races on slower CI
 * runners; polling the actual condition is robust.
 * @param predicate
 * @param root0
 * @param root0.timeout
 * @param root0.step
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
  <div id="pending-commands-region" class="pending-commands-region"></div>
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
  const { powersOptions, ...optionOverrides } = overrides;
  testDocument.body.innerHTML = '';
  const $parent = testDocument.createElement('div');
  $parent.innerHTML = CHAT_BAR_TEMPLATE;
  testDocument.body.appendChild($parent);

  const mock = makeMockPowers({ names: ['alice', 'bob'], ...powersOptions });
  const { powers } = mock;

  /** @type {unknown[]} */
  const shownValues = [];
  const options = {
    showValue: value => shownValues.push(value),
    enterProfile: async () => {},
    exitProfile: () => {},
    canExitProfile: false,
    getConversationPetName: () => null,
    getChannelRef: () => null,
    ...optionOverrides,
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
    mock,
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
  'command-mode chrome (label / submit) renders confined',
  async t => {
    const ctx = await setupChatBar();

    const $header = ctx.$parent.querySelector('.command-header');
    const $footer = ctx.$parent.querySelector('.command-footer');

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

    // The pending-commands region starts empty (no cards, collapsed).
    const $pending = ctx.$parent.querySelector('#pending-commands-region');
    t.truthy($pending, 'pending-commands region present');
    t.false(
      $pending.classList.contains('has-pending'),
      'pending region collapsed when no commands are in flight',
    );

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

test.serial(
  'a failing /js surfaces the daemon trace (stack + worker chip) in an ephemeral error card',
  async t => {
    // PR #133 (redraw on preact): command dispatch is non-blocking and a failed
    // command — any command — is surfaced by its ephemeral pending-command error
    // card, which carries the rich error UX (message + daemon stack trace +
    // clickable worker chip) that used to be the eval-only inline command-error
    // bubble. Regression for PR #58: the resolved trace must NOT be dropped, and
    // the bare `#chat-error` toast must not be the surface.
    const WORKER_ID = 'worker-formula-id-abc123';
    const STACK = 'Error: x\n    at eval (worker:1:7)\n    at run (worker:2:3)';

    // Model the decoded CapTP error the browser sees: its SES error name carries
    // the wire errorId `(error:daemon#1)` that `extractErrorId` reads.
    const workerError = new Error('x');
    Object.defineProperty(workerError, 'name', {
      value: 'RemoteError(error:daemon#1)',
      configurable: true,
    });

    const workerValue = harden({ mockWorker: WORKER_ID });

    /** @type {Array<{ value: unknown, id: unknown }>} */
    const workerShows = [];

    const ctx = await setupChatBar({
      powersOptions: {
        evaluateError: workerError,
        traceReports: new Map([
          [
            'error:daemon#1',
            { message: 'x', stack: STACK, workerId: WORKER_ID },
          ],
        ]),
        workersById: new Map([[WORKER_ID, workerValue]]),
      },
      showValue: (value, id) => workerShows.push({ value, id }),
    });
    t.teardown(() => ctx.api.dispose());

    // Enter `/js` command mode via its popover row.
    ctx.$menuButton.click();
    const $row = await waitFor(() =>
      ctx.$popover.querySelector('.command-popover-item[data-command="js"]'),
    );
    t.truthy($row, 'a /js command row is available');
    $row.click();

    await waitFor(() => ctx.$chatBar.classList.contains('command-mode'));

    // Type source into the inline eval input (a plain confined <input>, not
    // Monaco) and submit with Enter — the exact `/js throw new Error("x")` flow.
    const $src = await waitFor(() =>
      ctx.$parent.querySelector('.inline-eval-input'),
    );
    t.truthy($src, 'inline eval source input rendered');
    $src.value = 'throw new Error("x")';
    $src.dispatchEvent(new testWindow.Event('input', { bubbles: true }));
    $src.dispatchEvent(
      new testWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    // The bar unlocks immediately (non-blocking dispatch): command mode is left.
    await waitFor(() => !ctx.$chatBar.classList.contains('command-mode'));

    // Criterion 1: the failure becomes an ephemeral error card in the pending
    // region, carrying the full daemon-recorded stack.
    const $region = ctx.$parent.querySelector('#pending-commands-region');
    const $card = await waitFor(() =>
      $region.querySelector('.pending-command-card.error'),
    );
    t.truthy($card, 'an ephemeral error card rendered in the pending region');
    const $stack = await waitFor(() =>
      $card.querySelector('.command-error-stack-text'),
    );
    t.is($stack.textContent, STACK, 'the daemon-recorded stack is shown');
    t.is(
      $card.querySelector('.command-error-message').textContent,
      'x',
      'the error message is shown alongside the stack',
    );

    // The bare send-mode toast must NOT be the surface used.
    t.is(
      ctx.$parent.querySelector('#chat-error').textContent,
      '',
      'the bare #chat-error toast was not used',
    );

    // Criterion 2: a clickable worker chip that opens Show Value for the
    // authoritative worker id.
    const $chip = $card.querySelector('.command-error-worker-chip');
    t.truthy($chip, 'worker chip rendered');
    $chip.click();
    await waitFor(() => workerShows.length > 0);
    t.is(
      workerShows[0].id,
      WORKER_ID,
      'chip click opens Show Value for the authoritative worker id',
    );
    t.is(
      workerShows[0].value,
      workerValue,
      'the reverse-resolved live worker value is shown',
    );
    t.true(
      ctx.mock.calls.some(
        c => c.method === 'lookupById' && c.args[0] === WORKER_ID,
      ),
      'the chip reverse-resolved the worker via lookupById',
    );

    // The chip click showed the worker — it did NOT dismiss the card (the chip
    // stops click propagation).
    t.truthy(
      $region.querySelector('.pending-command-card.error'),
      'the error card persists after a worker-chip click',
    );
  },
);

const traceLookupCount = ctx =>
  Number(ctx.mock.calls.filter(c => c.method === 'traces.lookup').length);

test.serial(
  'error card: a late-arriving trace (race) enriches the card via the watch',
  async t => {
    // PR #58 follow-up, preserved onto the error card: when the daemon-side
    // record has not yet reached the aggregator (a race between the worker's
    // async trace push and the browser's lookup round-trip), the initial resolve
    // misses and the card first shows only the bare message. `watchErrorTrace`
    // re-queries until the record arrives and enriches the card in place.
    // `traceReportMisses: 1` models the race: the in-line resolve misses, the
    // first watch re-check hits.
    const WORKER_ID = 'worker-formula-id-race';
    const STACK = 'Error: x\n    at eval (worker:1:7)';

    const workerError = new Error('x');
    Object.defineProperty(workerError, 'name', {
      value: 'RemoteError(error:daemon#2)',
      configurable: true,
    });
    const workerValue = harden({ mockWorker: WORKER_ID });

    /** @type {Array<{ value: unknown, id: unknown }>} */
    const workerShows = [];

    const ctx = await setupChatBar({
      powersOptions: {
        evaluateError: workerError,
        traceReports: new Map([
          [
            'error:daemon#2',
            { message: 'x', stack: STACK, workerId: WORKER_ID },
          ],
        ]),
        workersById: new Map([[WORKER_ID, workerValue]]),
        traceReportMisses: 1,
      },
      showValue: (value, id) => workerShows.push({ value, id }),
    });
    t.teardown(() => ctx.api.dispose());

    ctx.$menuButton.click();
    const $row = await waitFor(() =>
      ctx.$popover.querySelector('.command-popover-item[data-command="js"]'),
    );
    $row.click();
    await waitFor(() => ctx.$chatBar.classList.contains('command-mode'));

    const $src = await waitFor(() =>
      ctx.$parent.querySelector('.inline-eval-input'),
    );
    $src.value = 'throw new Error("x")';
    $src.dispatchEvent(new testWindow.Event('input', { bubbles: true }));
    $src.dispatchEvent(
      new testWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    const $region = ctx.$parent.querySelector('#pending-commands-region');
    const $card = await waitFor(() =>
      $region.querySelector('.pending-command-card.error'),
    );

    // The first resolve missed, so initially only the bare message shows — no
    // stack, no chip. Confirm the message surfaced first.
    await waitFor(() => $card.textContent.includes('x'));

    // The watch then re-queries and enriches: the stack and the worker chip
    // appear without any further user action.
    const $stack = await waitFor(() =>
      $card.querySelector('.command-error-stack-text'),
    );
    t.is($stack.textContent, STACK, 'the late daemon-recorded stack is shown');
    t.is(
      $card.querySelector('.command-error-message').textContent,
      'x',
      'the message remains alongside the enriched stack',
    );

    // The enrichment required a retry: at least two lookups (the initial miss
    // plus the watch's hit).
    t.true(
      traceLookupCount(ctx) >= 2,
      'the watch re-queried the aggregator after the initial miss',
    );

    const $chip = await waitFor(() =>
      $card.querySelector('.command-error-worker-chip'),
    );
    $chip.click();
    await waitFor(() => workerShows.length > 0);
    t.is(
      workerShows[0].id,
      WORKER_ID,
      'the enriched chip opens Show Value for the authoritative worker id',
    );
  },
);

test.serial(
  'error card: dismissing the card cancels the trace watch',
  async t => {
    // The watch must be cancelled when the error card is dismissed. An error
    // card is click-to-dismiss; the click cancels any in-flight trace watch. With
    // `traceReportMisses` larger than the watch's attempt budget the record never
    // resolves, so an un-cancelled watch would keep polling; after dismissal the
    // lookup count must stop growing.
    const workerError = new Error('x');
    Object.defineProperty(workerError, 'name', {
      value: 'RemoteError(error:daemon#3)',
      configurable: true,
    });

    const ctx = await setupChatBar({
      powersOptions: {
        evaluateError: workerError,
        traceReports: new Map([
          ['error:daemon#3', { message: 'x', stack: 'S', workerId: 'W' }],
        ]),
        traceReportMisses: 1000,
      },
    });
    t.teardown(() => ctx.api.dispose());

    ctx.$menuButton.click();
    const $row = await waitFor(() =>
      ctx.$popover.querySelector('.command-popover-item[data-command="js"]'),
    );
    $row.click();
    await waitFor(() => ctx.$chatBar.classList.contains('command-mode'));

    const $src = await waitFor(() =>
      ctx.$parent.querySelector('.inline-eval-input'),
    );
    $src.value = 'throw new Error("x")';
    $src.dispatchEvent(new testWindow.Event('input', { bubbles: true }));
    $src.dispatchEvent(
      new testWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    const $region = ctx.$parent.querySelector('#pending-commands-region');
    const $card = await waitFor(() =>
      $region.querySelector('.pending-command-card.error'),
    );
    await waitFor(() => $card.textContent.includes('x'));

    // Dismiss by clicking the error card; the click cancels the in-flight watch.
    $card.click();

    // Let several watch intervals elapse; a cancelled watch stops polling.
    const countAfterDismiss = traceLookupCount(ctx);
    await new Promise(resolve => setTimeout(resolve, 700));
    t.true(
      traceLookupCount(ctx) - countAfterDismiss <= 1,
      'no further trace lookups after dismissal (watch cancelled)',
    );
  },
);

test.serial(
  'non-blocking dispatch: the bar unlocks immediately and the pending card fades on success',
  async t => {
    // PR #133 core behavior: dispatch is non-blocking. Submitting a command
    // leaves command mode at once (the bar is typable again) and the command is
    // tracked as a card in the pending region, which fades away on success —
    // never locking the input on the daemon promise.
    const ctx = await setupChatBar({
      // A successful /js: the default mock `evaluate` resolves (value undefined).
      showValue: () => {},
    });
    t.teardown(() => ctx.api.dispose());

    ctx.$menuButton.click();
    const $row = await waitFor(() =>
      ctx.$popover.querySelector('.command-popover-item[data-command="js"]'),
    );
    $row.click();
    await waitFor(() => ctx.$chatBar.classList.contains('command-mode'));

    const $src = await waitFor(() =>
      ctx.$parent.querySelector('.inline-eval-input'),
    );
    $src.value = '1 + 1';
    $src.dispatchEvent(new testWindow.Event('input', { bubbles: true }));
    $src.dispatchEvent(
      new testWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    // The bar unlocks immediately: command mode is left the moment the command
    // is dispatched, before the daemon promise settles.
    await waitFor(() => !ctx.$chatBar.classList.contains('command-mode'));
    t.false(
      ctx.$chatBar.classList.contains('command-mode'),
      'command mode left immediately on dispatch (bar unlocked)',
    );

    const $region = ctx.$parent.querySelector('#pending-commands-region');

    // The command is tracked as a card that reaches the success state...
    await waitFor(() => $region.querySelector('.pending-command-card.success'));
    t.truthy(
      $region.querySelector('.pending-command-card.success'),
      'the command tracked as a card that succeeded',
    );

    // ...and then auto-fades, collapsing the region back to empty.
    await waitFor(() => !$region.querySelector('.pending-command-card'));
    t.false(
      $region.classList.contains('has-pending'),
      'the pending region collapses after the success card fades',
    );
  },
);

// --- Pending-commands navigation (PR #133 follow-up: keyboard dismissal) ---
//
// The pending/error region sits between the transcript and the input. Arrow
// navigation threads through it: ↑ from the empty input enters the region at the
// card nearest the input, ↑ past the top hands off to durable-message focus, ↓
// past the bottom returns to the input, and Escape dismisses the hovered card.

// Powers that make `/js` fail with a daemon-recorded trace, so a stable
// (non-fading) error card lands in the region to navigate.
const jsErrorPowers = () => {
  const workerError = new Error('boom');
  Object.defineProperty(workerError, 'name', {
    value: 'RemoteError(error:daemon#1)',
    configurable: true,
  });
  return {
    evaluateError: workerError,
    traceReports: new Map([
      [
        'error:daemon#1',
        { message: 'boom', stack: 'Error: boom', workerId: '' },
      ],
    ]),
  };
};

// Drive `/js throw new Error("boom")` to completion, leaving an error card in
// the region and the bar back in send mode.
const driveJsError = async ctx => {
  ctx.$menuButton.click();
  const $row = await waitFor(() =>
    ctx.$popover.querySelector('.command-popover-item[data-command="js"]'),
  );
  $row.click();
  await waitFor(() => ctx.$chatBar.classList.contains('command-mode'));
  const $src = await waitFor(() =>
    ctx.$parent.querySelector('.inline-eval-input'),
  );
  $src.value = 'throw new Error("boom")';
  $src.dispatchEvent(new testWindow.Event('input', { bubbles: true }));
  $src.dispatchEvent(
    new testWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  await waitFor(() => !ctx.$chatBar.classList.contains('command-mode'));
};

// Append a received durable message envelope to #messages.
const appendMessage = (ctx, number) => {
  const $messages = ctx.$parent.querySelector('#messages');
  const $env = testDocument.createElement('div');
  $env.className = 'message-envelope';
  $env.dataset.number = String(number);
  $env.dataset.messageId = `m${number}`;
  const $message = testDocument.createElement('div');
  $message.className = 'message';
  $env.appendChild($message);
  // Messages render before the scroll anchor (the pending region is after it).
  $messages.insertBefore($env, $messages.querySelector('#anchor'));
  return $env;
};

// Plain ↑ from the empty input, on the input node the bar listens to.
const pressArrowUpFromInput = ctx =>
  ctx.$parent.querySelector('#chat-message').dispatchEvent(
    new testWindow.KeyboardEvent('keydown', {
      key: 'ArrowUp',
      bubbles: true,
    }),
  );

// The pending/focus navigation keys are handled on window.
const pressWindowKey = key =>
  testWindow.dispatchEvent(new testWindow.KeyboardEvent('keydown', { key }));

test.serial(
  'pending nav: ↑ enters the region and Escape dismisses the hovered card',
  async t => {
    const ctx = await setupChatBar({
      powersOptions: jsErrorPowers(),
      showValue: () => {},
    });
    t.teardown(() => ctx.api.dispose());
    const $region = ctx.$parent.querySelector('#pending-commands-region');

    await driveJsError(ctx);
    await waitFor(() => $region.querySelector('.pending-command-card.error'));

    // ↑ steps into the region (nearest card), not the transcript.
    pressArrowUpFromInput(ctx);
    await waitFor(() => $region.querySelector('.pending-command-card.cursor'));
    t.truthy(
      $region.querySelector('.pending-command-card.cursor'),
      'the cursor lands on the region card',
    );
    await waitFor(() => ctx.$modeline.textContent.includes('messages'));
    t.regex(
      ctx.$modeline.textContent,
      /messages/,
      'the pending-navigation modeline is shown',
    );

    // Escape dismisses the (only) hovered card; the region collapses.
    pressWindowKey('Escape');
    await waitFor(() => !$region.querySelector('.pending-command-card'));
    t.false(
      $region.classList.contains('has-pending'),
      'the region collapses after dismissing the only card',
    );
  },
);

test.serial(
  'pending nav: ⌘↑ does NOT enter the region (native gesture is preserved)',
  async t => {
    // The entry gesture is plain ↑; ⌘↑ / Ctrl+↑ keep their native "move to start
    // of field / document" meaning and must not be hijacked into navigation.
    const ctx = await setupChatBar({
      powersOptions: jsErrorPowers(),
      showValue: () => {},
    });
    t.teardown(() => ctx.api.dispose());
    const $region = ctx.$parent.querySelector('#pending-commands-region');

    await driveJsError(ctx);
    await waitFor(() => $region.querySelector('.pending-command-card.error'));

    // Cmd+↑ and Ctrl+↑ both leave the region untouched.
    for (const mods of [{ metaKey: true }, { ctrlKey: true }]) {
      ctx.$parent.querySelector('#chat-message').dispatchEvent(
        new testWindow.KeyboardEvent('keydown', {
          key: 'ArrowUp',
          bubbles: true,
          ...mods,
        }),
      );
    }
    // Give any (unwanted) handler a chance to run.
    await tick(50);
    t.falsy(
      $region.querySelector('.pending-command-card.cursor'),
      'modifier+↑ did not move the cursor into the region',
    );
    t.false(
      ctx.$modeline.textContent.includes('messages'),
      'modifier+↑ did not switch to the pending-navigation modeline',
    );
  },
);

test.serial(
  'pending nav: ArrowUp past the top card hands off to durable message focus',
  async t => {
    const ctx = await setupChatBar({
      powersOptions: jsErrorPowers(),
      showValue: () => {},
    });
    t.teardown(() => ctx.api.dispose());
    const $region = ctx.$parent.querySelector('#pending-commands-region');
    appendMessage(ctx, 1);

    await driveJsError(ctx);
    await waitFor(() => $region.querySelector('.pending-command-card.error'));

    pressArrowUpFromInput(ctx);
    await waitFor(() => $region.querySelector('.pending-command-card.cursor'));

    // Past the single (top) card, navigation enters durable focus: the focus
    // modeline shows and the region cursor is cleared.
    pressWindowKey('ArrowUp');
    await waitFor(() => ctx.$modeline.textContent.includes('reply'));
    t.regex(
      ctx.$modeline.textContent,
      /reply/,
      'the durable-focus modeline is shown after hand-off',
    );
    t.falsy(
      $region.querySelector('.pending-command-card.cursor'),
      'the region cursor is cleared on hand-off',
    );
  },
);

test.serial(
  'pending nav: ArrowDown past the bottom card returns to the input',
  async t => {
    const ctx = await setupChatBar({
      powersOptions: jsErrorPowers(),
      showValue: () => {},
    });
    t.teardown(() => ctx.api.dispose());
    const $region = ctx.$parent.querySelector('#pending-commands-region');

    await driveJsError(ctx);
    await waitFor(() => $region.querySelector('.pending-command-card.error'));

    pressArrowUpFromInput(ctx);
    await waitFor(() => $region.querySelector('.pending-command-card.cursor'));

    // Past the single (bottom) card, navigation returns to the input WITHOUT
    // dismissing the card — distinguishing exit from dismiss.
    pressWindowKey('ArrowDown');
    await waitFor(() => !$region.querySelector('.pending-command-card.cursor'));
    t.truthy(
      $region.querySelector('.pending-command-card.error'),
      'the card is preserved (not dismissed) on exit to the input',
    );
    await waitFor(() => !ctx.$modeline.textContent.includes('messages'));
    t.false(
      ctx.$modeline.textContent.includes('messages'),
      'the pending-navigation modeline is gone (back in send mode)',
    );
  },
);

test.serial(
  'pending nav: Escape advances to a neighbour, then returns to the input on the last card',
  async t => {
    const ctx = await setupChatBar({
      powersOptions: jsErrorPowers(),
      showValue: () => {},
    });
    t.teardown(() => ctx.api.dispose());
    const $region = ctx.$parent.querySelector('#pending-commands-region');

    await driveJsError(ctx);
    await waitFor(
      () =>
        $region.querySelectorAll('.pending-command-card.error').length === 1,
    );
    await driveJsError(ctx);
    await waitFor(
      () =>
        $region.querySelectorAll('.pending-command-card.error').length === 2,
    );

    // ↑ lands on the bottom card (nearest the input).
    pressArrowUpFromInput(ctx);
    await waitFor(() => $region.querySelector('.pending-command-card.cursor'));
    const cards = () => [...$region.querySelectorAll('.pending-command-card')];
    t.true(
      cards()[cards().length - 1].classList.contains('cursor'),
      'the cursor starts on the bottom card',
    );

    // Escape dismisses it; one card survives and the cursor stays in the region.
    pressWindowKey('Escape');
    await waitFor(
      () => $region.querySelectorAll('.pending-command-card').length === 1,
    );
    await waitFor(() => $region.querySelector('.pending-command-card.cursor'));
    t.truthy(
      $region.querySelector('.pending-command-card.cursor'),
      'the cursor advances to the surviving card',
    );
    t.regex(ctx.$modeline.textContent, /messages/, 'still in pending mode');

    // Escape dismisses the last card; the region collapses and the cursor
    // returns to the input.
    pressWindowKey('Escape');
    await waitFor(() => !$region.querySelector('.pending-command-card'));
    t.false($region.classList.contains('has-pending'), 'the region collapses');
    await waitFor(() => !ctx.$modeline.textContent.includes('messages'));
    t.false(
      ctx.$modeline.textContent.includes('messages'),
      'left pending mode back to the input',
    );
  },
);

// The delete / backspace keys dismiss the hovered card too — the ergonomic
// "remove this" gesture alongside Escape.
for (const key of ['Backspace', 'Delete']) {
  test.serial(`pending nav: ${key} dismisses the hovered card`, async t => {
    const ctx = await setupChatBar({
      powersOptions: jsErrorPowers(),
      showValue: () => {},
    });
    t.teardown(() => ctx.api.dispose());
    const $region = ctx.$parent.querySelector('#pending-commands-region');

    await driveJsError(ctx);
    await waitFor(() => $region.querySelector('.pending-command-card.error'));

    pressArrowUpFromInput(ctx);
    await waitFor(() => $region.querySelector('.pending-command-card.cursor'));

    // The hovered card is dismissed; the region collapses (it was the only
    // card) and navigation returns to the input.
    pressWindowKey(key);
    await waitFor(() => !$region.querySelector('.pending-command-card'));
    t.false(
      $region.classList.contains('has-pending'),
      `${key} dismissed the only card and collapsed the region`,
    );
    await waitFor(() => !ctx.$modeline.textContent.includes('messages'));
    t.false(
      ctx.$modeline.textContent.includes('messages'),
      'returned to the input after dismissal',
    );
  });
}

// Requirement: when an ephemeral error card GROWS (its late-arriving trace adds
// the stack / worker chip), re-pin the transcript to the bottom — but only if
// the reader was already at the bottom, never yanking a reader who scrolled up.

// `/js` that fails with a trace whose record arrives late (`traceReportMisses`),
// so the error card first shows only the message and then expands with the
// stack once the watch re-queries.
const lateTracePowers = () => {
  const workerError = new Error('x');
  Object.defineProperty(workerError, 'name', {
    value: 'RemoteError(error:daemon#9)',
    configurable: true,
  });
  return {
    evaluateError: workerError,
    traceReports: new Map([
      [
        'error:daemon#9',
        { message: 'x', stack: 'Error: x\n    at eval', workerId: '' },
      ],
    ]),
    traceReportMisses: 1,
  };
};

// Instrument #messages so `isAtBottom` is deterministically true (`pinned`) or
// false, and log every scrollTop write the region makes. A non-pinned container
// keeps scrollTop at 0 (a scrolled-up reader) so the region's writes are visible
// but never move it.
const instrumentScroll = ($messages, { pinned }) => {
  const setLog = [];
  let scrollTop = 0;
  Object.defineProperty($messages, 'scrollHeight', {
    configurable: true,
    get: () => 1000,
  });
  Object.defineProperty($messages, 'clientHeight', {
    configurable: true,
    get: () => (pinned ? 1000 : 300),
  });
  Object.defineProperty($messages, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: v => {
      setLog.push(v);
      if (pinned) scrollTop = v;
    },
  });
  return { setLog };
};

test.serial(
  'error card: a late-trace expansion re-pins the transcript when the reader is at the bottom',
  async t => {
    const ctx = await setupChatBar({
      powersOptions: lateTracePowers(),
      showValue: () => {},
    });
    t.teardown(() => ctx.api.dispose());
    const $messages = ctx.$parent.querySelector('#messages');
    const { setLog } = instrumentScroll($messages, { pinned: true });
    const $region = ctx.$parent.querySelector('#pending-commands-region');

    await driveJsError(ctx);
    const $card = await waitFor(() =>
      $region.querySelector('.pending-command-card.error'),
    );
    // The bare message renders first (before the late stack).
    await waitFor(
      () => $card.querySelector('.command-error-message')?.textContent === 'x',
    );
    const setsBeforeExpansion = setLog.length;

    // The late trace enriches the card (the stack appears); that growth re-pins
    // the transcript to the bottom.
    await waitFor(() => $card.querySelector('.command-error-stack-text'));
    t.true(
      setLog.length > setsBeforeExpansion,
      'the card expansion re-scrolled the transcript to the bottom',
    );
  },
);

test.serial(
  'error card: a late-trace expansion does not yank a reader who scrolled up',
  async t => {
    const ctx = await setupChatBar({
      powersOptions: lateTracePowers(),
      showValue: () => {},
    });
    t.teardown(() => ctx.api.dispose());
    const $messages = ctx.$parent.querySelector('#messages');
    const { setLog } = instrumentScroll($messages, { pinned: false });
    const $region = ctx.$parent.querySelector('#pending-commands-region');

    await driveJsError(ctx);
    const $card = await waitFor(() =>
      $region.querySelector('.pending-command-card.error'),
    );
    await waitFor(
      () => $card.querySelector('.command-error-message')?.textContent === 'x',
    );
    const setsBeforeExpansion = setLog.length;

    // The stack still arrives, but since the reader is not at the bottom the
    // region must not scroll.
    await waitFor(() => $card.querySelector('.command-error-stack-text'));
    t.is(
      setLog.length,
      setsBeforeExpansion,
      'a scrolled-up reader is not pulled to the bottom by the expansion',
    );
  },
);

test.serial('typing "/js" then space focuses the expression input', async t => {
  const ctx = await setupChatBar();
  t.teardown(() => ctx.api.dispose());
  const $input = ctx.$parent.querySelector('#chat-message');
  $input.focus();

  // Type "/" to enter command selection, then filter to "js".
  $input.textContent = '/';
  $input.dispatchEvent(new testWindow.Event('input', { bubbles: true }));
  $input.textContent = '/js';
  $input.dispatchEvent(new testWindow.Event('input', { bubbles: true }));

  // Space confirms the highlighted command (js), entering inline command mode.
  $input.dispatchEvent(
    new testWindow.KeyboardEvent('keydown', { key: ' ', bubbles: true }),
  );
  await waitFor(() => ctx.$chatBar.classList.contains('command-mode'));

  const $src = await waitFor(() =>
    ctx.$parent.querySelector('.inline-eval-input'),
  );
  // The expression input receives focus (not left on the command line).
  await waitFor(() => testDocument.activeElement === $src);
  t.is(
    testDocument.activeElement,
    $src,
    'the expression input is focused after confirming /js with space',
  );
});

test.serial(
  '/js collapses the empty form-body mount so the input drives the row baseline',
  async t => {
    // The confined form-body mount (a div) is unused by inline /js. If left
    // visible it is the first flex child of #inline-form-container and, being
    // empty, supplies the command row's baseline from its own box instead of the
    // expression input — dropping the "Evaluate JavaScript" label out of line.
    // The js branch collapses it; assert that structurally (happy-dom does no
    // layout, so the baseline itself cannot be measured here).
    const ctx = await setupChatBar();
    t.teardown(() => ctx.api.dispose());

    ctx.$menuButton.click();
    const $row = await waitFor(() =>
      ctx.$popover.querySelector('.command-popover-item[data-command="js"]'),
    );
    $row.click();
    await waitFor(() => ctx.$chatBar.classList.contains('command-mode'));
    await waitFor(() => ctx.$parent.querySelector('.inline-eval-input'));

    const $formContainer = ctx.$parent.querySelector('#inline-form-container');
    const $evalContainer = $formContainer.querySelector(
      '.inline-eval-container',
    );
    t.truthy($evalContainer, 'the eval container is present');

    // The form-body mount is the non-eval-container child; it must be collapsed.
    const $formMount = [...$formContainer.children].find(
      $child => !$child.classList.contains('inline-eval-container'),
    );
    t.truthy($formMount, 'the form-body mount div exists');
    t.is(
      $formMount.style.display,
      'none',
      'the empty form-body mount is collapsed in /js mode',
    );
  },
);
