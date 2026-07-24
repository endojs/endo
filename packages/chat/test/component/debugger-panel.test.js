// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { createDebuggerPanel } from '@endo/spaces-util/debugger-panel.js';
import { createDOM, tick } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

// renderConfined renders through Preact; some idioms defer with
// requestAnimationFrame. dom-setup stubs setTimeout but not rAF; provide a
// setTimeout-backed shim, as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). The panel loads its initial
 * state through several eventual-send awaits + Preact effect flushes, so a
 * fixed delay races on slower CI runners; polling the actual condition is
 * robust. (Copied from inbox-shell.test.js — do not replace with a fixed tick.)
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
 * A mock Debugger exo recording the eventual-send calls it receives. Defaults
 * to a paused worker with one frame and one local so the panel paints content.
 * @param overrides
 */
const makeMockDebugger = (overrides = {}) => {
  const calls = [];
  const record = (method, ...args) => calls.push({ method, args });

  const debuggerRef = Far('MockDebugger', {
    isBroken: () => Promise.resolve(overrides.broken ?? true),
    getLastBreak: () =>
      Promise.resolve(
        overrides.lastBreak ?? {
          path: 'foo.js',
          line: 42,
          message: 'paused here',
        },
      ),
    getTitle: () => Promise.resolve(overrides.title ?? 'worker-1'),
    getTag: () => Promise.resolve(overrides.tag ?? 'tag-1'),
    getFrames: () =>
      Promise.resolve(
        overrides.frames ?? [
          { name: 'main', value: '', path: 'foo.js', line: 42 },
        ],
      ),
    getLocals: () =>
      Promise.resolve(
        overrides.locals ?? [
          { name: 'x', value: '1', flags: '' },
          {
            name: 'obj',
            value: '{...}',
            flags: '',
            children: [{ name: 'a', value: '2', flags: '' }],
          },
        ],
      ),
    getGlobals: () =>
      Promise.resolve(
        overrides.globals ?? [
          { name: 'globalThis', value: '[global]', flags: '' },
        ],
      ),
    selectFrame: id => {
      record('selectFrame', id);
      return Promise.resolve([{ name: 'y', value: '9', flags: '' }]);
    },
    go: () => {
      record('go');
      return Promise.resolve();
    },
    step: () => {
      record('step');
      return Promise.resolve();
    },
    stepIn: () => {
      record('stepIn');
      return Promise.resolve();
    },
    stepOut: () => {
      record('stepOut');
      return Promise.resolve();
    },
    abort: () => {
      record('abort');
      return Promise.resolve();
    },
    setExceptionBreakMode: mode => {
      record('setExceptionBreakMode', mode);
      return Promise.resolve();
    },
    setBreakpoint: (path, line) => {
      record('setBreakpoint', path, line);
      return Promise.resolve();
    },
    clearBreakpoint: (path, line) => {
      record('clearBreakpoint', path, line);
      return Promise.resolve();
    },
    clearAllBreakpoints: () => {
      record('clearAllBreakpoints');
      return Promise.resolve();
    },
    evaluate: source => {
      record('evaluate', source);
      return Promise.resolve(`=> ${source}`);
    },
  });

  return { debuggerRef, calls };
};

/**
 * Fresh container + backdrop hosts, mirroring chat.js's #debugger-panel-*
 * nodes, and a created panel.
 * @param overrides
 */
const setupPanel = (overrides = {}) => {
  testDocument.body.innerHTML = '';
  const $container = testDocument.createElement('div');
  $container.id = 'debugger-panel-container';
  const $backdrop = testDocument.createElement('div');
  $backdrop.id = 'debugger-panel-backdrop';
  testDocument.body.appendChild($backdrop);
  testDocument.body.appendChild($container);

  const panel = createDebuggerPanel({ $container, $backdrop });
  const { debuggerRef, calls } = makeMockDebugger(overrides);
  return { $container, $backdrop, panel, debuggerRef, calls };
};

test.serial('panel renders its key sections on open', async t => {
  const { $container, panel, debuggerRef } = setupPanel();

  // Entry contract: synchronous create, then open(ref, label).
  t.is(typeof panel.open, 'function');
  t.is(typeof panel.hide, 'function');
  t.false(panel.isVisible());

  panel.open(debuggerRef, 'my-worker');
  t.true(panel.isVisible(), 'open marks the panel visible');
  t.is($container.style.display, 'flex', 'container shown imperatively');

  // The whole panel renders into a dedicated mount child of the host container.
  t.truthy($container.querySelector('.debugger-panel'), 'panel root renders');
  t.truthy($container.querySelector('.debugger-toolbar'));
  t.truthy($container.querySelector('.debugger-console-input'));

  // The label flows into the title once the open request reaches the component.
  await waitFor(() =>
    /my-worker/.test(
      $container.querySelector('.debugger-title')?.textContent || '',
    ),
  );
  t.is(
    $container.querySelector('.debugger-title').textContent,
    'Debugger: my-worker',
    'label flows into the title',
  );

  // Initial state load resolves: paused status + frame + locals appear.
  await waitFor(() => $container.querySelector('.debugger-status-paused'));
  t.regex($container.querySelector('.debugger-status').textContent, /Paused/);
  await waitFor(() => $container.querySelector('.debugger-frame-item'));
  t.regex($container.querySelector('.debugger-frame-item').textContent, /main/);
  await waitFor(() => $container.querySelector('.debugger-prop-row'));
  t.regex(
    $container.querySelector('.debugger-locals-tree').textContent,
    /x/,
    'a local variable renders in the tree',
  );
});

test.serial('console eval calls evaluate and shows the result', async t => {
  const { $container, panel, debuggerRef, calls } = setupPanel();
  panel.open(debuggerRef, 'w');
  // Wait until the open request has reached the component (the Debugger ref is
  // applied) — the eval handler is a no-op until then. Initial-state load
  // (paused status) is a reliable signal that the ref is live.
  await waitFor(() => $container.querySelector('.debugger-status-paused'));

  const $input = $container.querySelector('.debugger-console-input');
  $input.value = '1 + 1';
  $input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  // Settle the input update between interactions so the Enter handler reads it;
  // no positive condition to poll until the keydown drives evaluate.
  await tick(10);

  $input.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );

  await waitFor(() => calls.some(c => c.method === 'evaluate'));
  const evalCall = calls.find(c => c.method === 'evaluate');
  t.truthy(evalCall, 'evaluate was sent to the Debugger exo');
  t.is(evalCall.args[0], '1 + 1');

  await waitFor(() => $container.querySelector('.debugger-console-result'));
  t.regex(
    $container.querySelector('.debugger-console-output').textContent,
    /=> 1 \+ 1/,
    'the eval result is appended to the console',
  );
});

test.serial('adding a breakpoint sends setBreakpoint and lists it', async t => {
  const { $container, panel, debuggerRef, calls } = setupPanel();
  panel.open(debuggerRef, 'w');
  // Wait until the Debugger ref is live (initial-state load done) — the add
  // handler is a no-op until then.
  await waitFor(() => $container.querySelector('.debugger-status-paused'));

  const $path = $container.querySelector('.debugger-bp-path');
  const $line = $container.querySelector('.debugger-bp-line');
  $path.value = 'bar.js';
  $path.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  $line.value = '7';
  $line.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  // Settle the path/line input updates between interactions so the add handler
  // reads them; no positive condition to poll until the click drives
  // setBreakpoint.
  await tick(10);

  $container.querySelector('.debugger-bp-add').click();

  await waitFor(() => calls.some(c => c.method === 'setBreakpoint'));
  const bpCall = calls.find(c => c.method === 'setBreakpoint');
  t.is(bpCall.args[0], 'bar.js');
  t.is(bpCall.args[1], 7);

  await waitFor(() => $container.querySelector('.debugger-bp-item'));
  t.regex(
    $container.querySelector('.debugger-breakpoints-list').textContent,
    /bar\.js:7/,
    'the breakpoint appears in the list',
  );
});

test.serial('hide and backdrop click close the panel', async t => {
  const { $container, $backdrop, panel, debuggerRef } = setupPanel();
  panel.open(debuggerRef, 'w');
  t.true(panel.isVisible());

  panel.hide();
  t.false(panel.isVisible());
  t.is($container.style.display, 'none', 'container hidden');
  t.is($backdrop.style.display, 'none', 'backdrop hidden');

  // Re-open, then close via the backdrop click (host node, imperative).
  panel.open(debuggerRef, 'w');
  t.true(panel.isVisible());
  $backdrop.dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  t.false(panel.isVisible(), 'backdrop click hides the panel');
});

test.serial('Go button sends go and clears the frame list', async t => {
  const { $container, panel, debuggerRef, calls } = setupPanel();
  panel.open(debuggerRef, 'w');
  await waitFor(() => $container.querySelector('.debugger-frame-item'));

  $container.querySelector('.debugger-go').click();
  await waitFor(() => calls.some(c => c.method === 'go'));
  t.truthy(
    calls.find(c => c.method === 'go'),
    'go was sent',
  );

  await waitFor(() =>
    /Running/.test(
      $container.querySelector('.debugger-frames-list').textContent,
    ),
  );
  t.regex(
    $container.querySelector('.debugger-status').textContent,
    /Running/,
    'status flips to Running after resume',
  );
});
