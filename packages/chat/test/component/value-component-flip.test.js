// @ts-nocheck - Component test with happy-dom

/* eslint-disable no-underscore-dangle */

import '@endo/init/debug.js';

import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

import test from 'ava';
import harden from '@endo/harden';
import { Far } from '@endo/pass-style';

import { createDOM, tick } from '../helpers/dom-setup.js';

// value-component transitively imports `markdown-preview.js`, which imports
// `@endo/monaco-wrapper` (for `colorize`). Monaco cannot run under happy-dom and
// `monaco-editor` is not installed here, so redirect the `monaco-wrapper`
// specifier to the shared stub via a Node loader registered BEFORE
// value-component is dynamically imported.
const here = dirname(fileURLToPath(import.meta.url));
const stubUrl = pathToFileURL(
  resolvePath(here, '../helpers/monaco-wrapper-stub.js'),
).href;

register(
  new URL(
    `data:text/javascript,${encodeURIComponent(`
      const stubUrl = ${JSON.stringify(stubUrl)};
      export async function resolve(specifier, context, nextResolve) {
        if (specifier === '@endo/monaco-wrapper' || specifier.endsWith('/monaco-wrapper.js') || specifier === './monaco-wrapper.js') {
          return { url: stubUrl, shortCircuit: true };
        }
        return nextResolve(specifier, context);
      }
    `)}`,
  ),
);

// Dynamically imported AFTER the loader is registered so the transitive
// `@endo/monaco-wrapper` import resolves to the stub.
const { valueComponent } = await import('@endo/spaces-util/value-component.js');

const { document: testDocument } = createDOM();

// renderConfined defers with requestAnimationFrame; dom-setup stubs setTimeout
// but not rAF, so provide a setTimeout-backed shim as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (or a timeout elapses).
 *
 * @param {() => unknown} predicate
 * @param {{ timeout?: number, step?: number }} [opts]
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
 * Mock powers that record calls and return a synthetic FormulaRecord for
 * getFormula.
 */
const makeMockPowers = () => {
  /** @type {Array<{ method: string, args: unknown[] }>} */
  const calls = [];
  const powers = Far('MockHostPowers', {
    // value-component reaches getFormula via `powers.diagnostics()`. The
    // mock exposes itself as its own diagnostics facet so the recorded
    // call tracking below still observes the getFormula call.
    diagnostics() {
      return powers;
    },
    getFormula(id) {
      calls.push({ method: 'getFormula', args: [id] });
      return {
        type: 'eval',
        number: 'eval-1',
        properties: {
          source: { kind: 'literal', value: '1 + 1' },
          worker: { kind: 'reference', identifier: 'worker-id' },
          endowments: { kind: 'reference-list', entries: {} },
        },
      };
    },
    lookupById(id) {
      calls.push({ method: 'lookupById', args: [id] });
      return Far('Resolved', {});
    },
    reverseIdentify(_id) {
      return [];
    },
  });
  return { powers, calls };
};

// The new value-component owns its own #value-frame and reveals it via a
// `data-show` dataset toggle; "dismissed" means the frame is no longer shown.
const setupWith = powers => {
  testDocument.body.innerHTML = '';
  const $parent = testDocument.createElement('div');
  testDocument.body.appendChild($parent);
  const api = valueComponent($parent, powers, {
    enterProfile: async () => {},
  });
  const $frame = $parent.querySelector('#value-frame');
  return {
    $parent,
    api,
    isDismissed: () => $frame.dataset.show !== 'true',
  };
};

const setupComponent = async () => {
  const { powers, calls } = makeMockPowers();
  const { $parent, api, isDismissed } = setupWith(powers);
  return { $parent, api, calls, isDismissed };
};

const pressKey = (key, opts = {}) => {
  const event = new testDocument.defaultView.KeyboardEvent('keyup', {
    key,
    bubbles: true,
    ...opts,
  });
  testDocument.defaultView.dispatchEvent(event);
};

test.serial(
  'F flips from front face to back face and fetches getFormula',
  async t => {
    const { $parent, api, calls } = await setupComponent();
    await api.showValue(harden({}), 'value-id');
    await tick(10);

    const $window = $parent.querySelector('#value-window');
    t.false($window.classList.contains('flipped'), 'starts on front face');

    pressKey('F');
    await tick(20);

    t.true($window.classList.contains('flipped'), 'flipped to back after F');
    const getFormulaCalls = calls.filter(c => c.method === 'getFormula');
    t.is(getFormulaCalls.length, 1);
    t.is(getFormulaCalls[0].args[0], 'value-id');
  },
);

test.serial(
  'F flips from back face to front face (symmetric accelerator)',
  async t => {
    const { $parent, api } = await setupComponent();
    await api.showValue(harden({}), 'value-id');
    await tick(10);

    const $window = $parent.querySelector('#value-window');
    t.false($window.classList.contains('flipped'), 'starts on front face');

    // Flip to back face.
    pressKey('F');
    await tick(20);
    t.true($window.classList.contains('flipped'), 'on back face after first F');

    // F again must flip back to the front face (symmetric binding).
    pressKey('F');
    await tick(20);
    t.false(
      $window.classList.contains('flipped'),
      'F flipped from back to front',
    );

    // And a third F flips back to the formula again, proving the accelerator is
    // idempotent across repeated presses.
    pressKey('F');
    await tick(20);
    t.true(
      $window.classList.contains('flipped'),
      'third F flipped back to formula',
    );
  },
);

test.serial(
  'Escape on front face closes; Escape on back face flips to front',
  async t => {
    const { $parent, api, isDismissed } = await setupComponent();
    await api.showValue(harden({}), 'value-id');
    await tick(10);

    // Flip to back face.
    pressKey('F');
    await tick(20);
    const $window = $parent.querySelector('#value-window');
    t.true($window.classList.contains('flipped'));

    // Escape on back face: flip-to-front, not close.
    pressKey('Escape');
    await tick(10);
    t.false($window.classList.contains('flipped'), 'Escape flipped to front');
    t.false(isDismissed(), 'modal not dismissed yet');

    // Escape on front face: closes.
    pressKey('Escape');
    await tick(10);
    t.true(isDismissed(), 'modal dismissed on second Escape');
  },
);

test.serial(
  'clicking a reference button pushes a back-stack frame and shows new value',
  async t => {
    const { $parent, api, calls } = await setupComponent();
    await api.showValue(harden({}), 'value-id');
    await tick(10);
    pressKey('F');
    await waitFor(() => !!$parent.querySelector('.formula-view-reference'));

    const $worker = $parent.querySelector('.formula-view-reference');
    t.truthy($worker);
    $worker.click();
    await tick(30);

    // lookupById is the call that resolves the reference target.
    const lookupCalls = calls.filter(c => c.method === 'lookupById');
    t.is(lookupCalls.length, 1);
    t.is(lookupCalls[0].args[0], 'worker-id');

    // Backspace on the back face pops the stack frame and restores the original
    // value.
    pressKey('F'); // flip to back so Backspace is active
    await tick(20);
    pressKey('Backspace');
    await tick(20);
    // The modal is back on the front face for the original eval.
    const $window = $parent.querySelector('#value-window');
    t.false($window.classList.contains('flipped'));
  },
);

test.serial('Shift+P clicks Enter Profile when visible', async t => {
  const { $parent, api } = await setupComponent();
  await api.showValue(harden({}), 'value-id');
  await tick(10);

  // Simulate the front face having Enter Profile available by making the button
  // visible.
  const $enterProfile = $parent.querySelector('#value-enter-profile');
  let clicked = false;
  $enterProfile.style.display = 'block';
  $enterProfile.addEventListener('click', () => {
    clicked = true;
  });

  pressKey('P', { shiftKey: true });
  await tick(10);
  t.true(clicked, 'Shift+P clicked Enter Profile');
});

test.serial('Shift+P is a no-op when Enter Profile is hidden', async t => {
  const { $parent, api } = await setupComponent();
  await api.showValue(harden({}), 'value-id');
  await tick(10);

  const $enterProfile = $parent.querySelector('#value-enter-profile');
  let clicked = false;
  $enterProfile.style.display = 'none';
  $enterProfile.addEventListener('click', () => {
    clicked = true;
  });

  pressKey('P', { shiftKey: true });
  await tick(10);
  t.false(clicked, 'Shift+P did not click hidden Enter Profile');
});

test.serial(
  'F is ignored when typing into a form input inside the modal',
  async t => {
    const { $parent, api } = await setupComponent();
    await api.showValue(harden({}), 'value-id');
    await tick(10);

    // Simulate typing into an actions input. The handler must not flip when the
    // keyup target is an INPUT, otherwise typing F into the rename field would
    // flip the modal.
    const $input = testDocument.createElement('input');
    $input.type = 'text';
    $parent.querySelector('#value-actions-container').appendChild($input);
    $input.focus();

    // Dispatch the key event from the input itself.
    const event = new testDocument.defaultView.KeyboardEvent('keyup', {
      key: 'F',
      bubbles: true,
    });
    $input.dispatchEvent(event);
    await tick(20);

    const $window = $parent.querySelector('#value-window');
    t.false(
      $window.classList.contains('flipped'),
      'no flip when typing in input',
    );
  },
);

test.serial(
  'aria-live announces flip-to-formula and flip-to-value',
  async t => {
    const { $parent, api } = await setupComponent();
    await api.showValue(harden({}), 'value-id');
    await tick(10);

    const $live = $parent.querySelector('#value-aria-live');
    t.is($live.textContent, '');

    pressKey('F');
    await tick(20);
    t.regex($live.textContent, /Showing formula/);

    pressKey('F');
    await tick(20);
    t.regex($live.textContent, /Showing value/);
  },
);

test.serial(
  'navigating to a non-passable reference shows it as "Remote <Type>"',
  async t => {
    const powers = Far('MockHostPowers', {
      // The mock exposes itself as its own `diagnostics()` facet.
      diagnostics() {
        return powers;
      },
      getFormula(id) {
        if (id === 'pet-store-id') {
          return { type: 'pet-store', number: 'pet-store-id', properties: {} };
        }
        return {
          type: 'eval',
          number: 'eval-1',
          properties: {
            source: { kind: 'literal', value: '1 + 1' },
            // The single reference points at a daemon-internal pet store that
            // cannot be brought across CapTP.
            worker: { kind: 'reference', identifier: 'pet-store-id' },
            endowments: { kind: 'reference-list', entries: {} },
          },
        };
      },
      lookupById() {
        throw Error('Remotables must be explicitly declared');
      },
      reverseIdentify() {
        return [];
      },
    });
    const { $parent, api } = setupWith(powers);
    await api.showValue(harden({}), 'value-id');
    await tick(10);
    pressKey('F');
    await waitFor(() => !!$parent.querySelector('.formula-view-reference'));

    // Click the solo "Worker" reference, which points at the non-passable pet
    // store.
    const $ref = $parent.querySelector('.formula-view-reference');
    t.is($ref.textContent, 'Worker');
    $ref.click();
    await waitFor(() => !!$parent.querySelector('.value-remote'));

    // The modal does not crash; it lands on the front face presenting the
    // target as a remote capability named by its formula type.
    const $window = $parent.querySelector('#value-window');
    t.false($window.classList.contains('flipped'), 'landed on front face');
    const $remote = $parent.querySelector('.value-remote');
    t.truthy($remote, 'remote placeholder rendered');
    t.is($remote.textContent, 'Remote Pet Store');
  },
);

test.serial(
  'opening the modal blurs the prior focus and closing restores it',
  async t => {
    const { api } = await setupComponent();

    // A pre-existing control (stand-in for the command input) holds focus
    // before the modal opens.
    const $commandInput = testDocument.createElement('input');
    $commandInput.type = 'text';
    testDocument.body.appendChild($commandInput);
    $commandInput.focus();
    t.is(
      testDocument.activeElement,
      $commandInput,
      'command input focused before open',
    );

    await api.showValue(harden({}), 'value-id');
    await tick(10);
    t.not(
      testDocument.activeElement,
      $commandInput,
      'command input blurred while modal is open',
    );

    // Closing the modal returns focus to the command input.
    api.dismissValue();
    t.is(
      testDocument.activeElement,
      $commandInput,
      'focus restored to command input on close',
    );

    $commandInput.remove();
  },
);

test.serial(
  'back-stack navigation does not recapture focus mid-session',
  async t => {
    const { $parent, api } = await setupComponent();

    const $commandInput = testDocument.createElement('input');
    $commandInput.type = 'text';
    testDocument.body.appendChild($commandInput);
    $commandInput.focus();

    await api.showValue(harden({}), 'value-id');
    await tick(10);

    // Flip to the formula face and navigate to a reference. The reference click
    // re-enters showValue with the session already active; the original
    // pre-modal focus must survive so it can be restored on close rather than a
    // mid-modal element.
    pressKey('F');
    await waitFor(() => !!$parent.querySelector('.formula-view-reference'));
    const $ref = $parent.querySelector('.formula-view-reference');
    $ref.click();
    await tick(30);

    api.dismissValue();
    t.is(
      testDocument.activeElement,
      $commandInput,
      'original focus restored after navigation, not a mid-modal element',
    );

    $commandInput.remove();
  },
);

test.serial(
  'verso title mirrors the recto title with a "(formula)" suffix',
  async t => {
    const powers = Far('MockHostPowers', {
      // The mock exposes itself as its own `diagnostics()` facet.
      diagnostics() {
        return powers;
      },
      getFormula() {
        return {
          type: 'eval',
          number: 'eval-1',
          properties: { source: { kind: 'literal', value: '1 + 1' } },
        };
      },
      lookupById() {
        return Far('Resolved', {});
      },
      reverseIdentify(_id) {
        // The value has a pet name, which the front title shows as a token; the
        // verso must mirror it.
        return ['alice'];
      },
    });
    const { $parent, api } = setupWith(powers);

    await api.showValue(harden({}), 'value-id');
    await waitFor(() =>
      /@alice/.test($parent.querySelector('#value-title').textContent),
    );

    const $frontTitle = $parent.querySelector('#value-title');
    t.regex($frontTitle.textContent, /@alice/, 'recto shows the pet name');

    // Flip to the formula face; the verso title mirrors the recto and appends a
    // muted "(formula)" suffix.
    pressKey('F');
    await tick(20);

    const $backTitle = $parent.querySelector('#value-back-title');
    t.regex($backTitle.textContent, /@alice/, 'verso mirrors the pet name');
    t.regex(
      $backTitle.textContent,
      /\(formula\)/,
      'verso notes it is the formula view',
    );
    const $suffix = $backTitle.querySelector('.value-title-suffix');
    t.truthy($suffix, 'suffix renders as its own element');
  },
);

test.serial('readable tree lists its children on both faces', async t => {
  const tree = Far('ReadableTree', {
    sha256: () => 'deadbeef',
    has: () => true,
    list: () => ['index.html', 'assets'],
    lookup: () => Far('Child', {}),
    __getMethodNames__: () => [
      'sha256',
      'has',
      'list',
      'lookup',
      '__getMethodNames__',
    ],
  });
  const powers = Far('MockHostPowers', {
    // The mock exposes itself as its own `diagnostics()` facet.
    diagnostics() {
      return powers;
    },
    getFormula() {
      return { type: 'readable-tree', number: 'tree-1', properties: {} };
    },
    lookupById() {
      return Far('Resolved', {});
    },
    reverseIdentify() {
      return ['mytree'];
    },
  });
  const { $parent, api } = setupWith(powers);

  await api.showValue(tree, 'tree-id');
  await waitFor(
    () => !!$parent.querySelector('#value-value .value-tree-child'),
  );

  // Front face replaces the bare remotable tag with the entry listing.
  const frontChildren = [
    ...$parent.querySelectorAll('#value-value .value-tree-child'),
  ].map(el => el.textContent);
  t.deepEqual(
    frontChildren,
    ['index.html', 'assets'],
    'front face lists tree entries',
  );

  // The formula face lists the same entries below the (reference-less) formula
  // view, since a tree's children are content, not formulas.
  pressKey('F');
  await waitFor(
    () => !!$parent.querySelector('#value-back-face .value-tree-child'),
  );
  const backChildren = [
    ...$parent.querySelectorAll('#value-back-face .value-tree-child'),
  ].map(el => el.textContent);
  t.deepEqual(
    backChildren,
    ['index.html', 'assets'],
    'back face lists tree entries',
  );
});

test.serial(
  'ephemeral value (no id) shows an empty-state note on back face',
  async t => {
    const { $parent, api, calls } = await setupComponent();
    // No id: this is an ephemeral value with no formula to inspect.
    await api.showValue(harden({}));
    await tick(10);
    pressKey('F');
    await tick(20);

    const $back = $parent.querySelector('#value-back-face');
    t.true(
      ($back.textContent || '').toLowerCase().includes('ephemeral'),
      'back face explains why there is no formula',
    );
    const getFormulaCalls = calls.filter(c => c.method === 'getFormula');
    t.is(
      getFormulaCalls.length,
      0,
      'getFormula not called when there is no id',
    );
  },
);
