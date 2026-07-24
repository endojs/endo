// @ts-nocheck - Component test with happy-dom

/* eslint-disable no-underscore-dangle */

import '@endo/init/debug.js';

import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { createDOM, tick } from '../helpers/dom-setup.js';

// value-component transitively imports `markdown-preview.js`, which imports
// `@endo/monaco-wrapper` (for `colorize`). Monaco cannot run under happy-dom and
// `monaco-editor` is not installed here, so redirect the `monaco-wrapper`
// specifier to the shared stub via a Node loader registered BEFORE
// value-component is dynamically imported. This exercises the confined value
// content + actions, the blob preview as vnodes, and the host-node chrome —
// everything except real Monaco.

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
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). Preact effect flushes and the
 * async value pipeline (reverseIdentify / text) race a fixed delay on slower CI
 * runners, so poll the actual condition instead.
 *
 * @param {() => boolean} predicate
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
 * Build the value modal chrome exactly as chat.js's template does, plus a fake
 * `powers` whose calls are recorded.
 *
 * @param {object} [opts]
 * @param {(id: string) => Promise<string[]> | string[]} [opts.reverseIdentify]
 */
const setup = ({ reverseIdentify = async () => [] } = {}) => {
  testDocument.body.innerHTML = '';

  // value-component now builds and owns its own #value-frame; the host only
  // supplies an empty container to mount it into.
  const $parent = testDocument.createElement('div');
  testDocument.body.appendChild($parent);

  /** @type {Array<{ method: string, args: unknown[] }>} */
  const calls = [];

  const powers = Far('MockPowers', {
    async reverseIdentify(id) {
      calls.push({ method: 'reverseIdentify', args: [id] });
      return reverseIdentify(id);
    },
    async move(from, to) {
      calls.push({ method: 'move', args: [from, to] });
    },
    async storeValue(value, path) {
      calls.push({ method: 'storeValue', args: [value, path] });
    },
    async adopt(number, edgeName, path) {
      calls.push({ method: 'adopt', args: [number, edgeName, path] });
    },
  });

  const api = valueComponent($parent, powers, {
    enterProfile: async () => {},
  });

  return {
    $parent,
    api,
    calls,
    $frame: $parent.querySelector('#value-frame'),
    $value: $parent.querySelector('#value-value'),
    $actions: $parent.querySelector('#value-actions-container'),
    $title: $parent.querySelector('#value-title'),
  };
};

test.serial(
  'showValue renders a number as a .number span (vnodes, not innerHTML)',
  async t => {
    const { $value, api } = setup();
    t.teardown(() => api.dismissValue());

    await api.showValue(42);
    await waitFor(() => !!$value.querySelector('.number'));

    const $number = $value.querySelector('.number');
    t.truthy($number, 'number renders as a .number span');
    t.is($number.tagName, 'SPAN');
    t.is($number.textContent, '42');
  },
);

test.serial('showValue renders a string as a quoted .string span', async t => {
  const { $value, api } = setup();
  t.teardown(() => api.dismissValue());

  await api.showValue('hello');
  await waitFor(() => !!$value.querySelector('.string'));

  const $string = $value.querySelector('.string');
  t.truthy($string, 'string renders as a .string span');
  // value-vnodes quotes strings via JSON.stringify, mirroring value-render.
  t.is($string.textContent, '"hello"');
});

test.serial('showValue renders an array as nested .entries spans', async t => {
  const { $value, api } = setup();
  t.teardown(() => api.dismissValue());

  await api.showValue(harden([1, 2, 3]));
  await waitFor(() => !!$value.querySelector('.entries'));

  const $entries = $value.querySelector('.entries');
  t.truthy($entries, 'array renders an .entries container span');
  const numbers = $value.querySelectorAll('.number');
  t.is(numbers.length, 3, 'each element is its own .number span');
  const text = $value.textContent;
  t.true(text.includes('[') && text.includes(']'), 'brackets render as text');
});

test.serial(
  'showValue shows a "Save as:" action for an unnamed plain value, and Save stores it',
  async t => {
    const { $actions, api, calls } = setup();
    t.teardown(() => api.dismissValue());

    // No id, no petNamePath, plain passable -> "Save as:" name action.
    await api.showValue(harden({ a: 1 }));
    await waitFor(() => !!$actions.querySelector('.value-name-input'));

    const $input = $actions.querySelector('.value-name-input');
    t.truthy($input, 'name input rendered');
    t.is(
      $actions.querySelector('.value-name-form label').textContent,
      'Save as:',
      'label reflects the save action',
    );

    // A copy button renders for plain passables.
    t.truthy(
      $actions.querySelector('.value-copy-button'),
      'copy button present for plain passable',
    );

    // Type a name and submit by clicking the Save button.
    $input.value = 'my/value';
    $input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await waitFor(() => $input.value === 'my/value');

    $actions
      .querySelector('.value-name-form button')
      .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

    await waitFor(() => calls.some(c => c.method === 'storeValue'));
    const storeCall = calls.find(c => c.method === 'storeValue');
    t.truthy(storeCall, 'storeValue invoked');
    t.deepEqual(storeCall.args[1], ['my', 'value'], 'path split on /');
  },
);

test.serial(
  'Escape dismisses the modal even from a focused Save-as input',
  async t => {
    const { $frame, $actions, api } = setup();
    t.teardown(() => api.dismissValue());

    await api.showValue(harden({ a: 1 }));
    await waitFor(() => !!$actions.querySelector('.value-name-input'));
    t.is($frame.dataset.show, 'true', 'frame shown while the value is open');

    // Escape dispatched from within the focused name input must dismiss the
    // modal — the input must not swallow it (regression: the key handler used to
    // ignore all keys whose target was a text field).
    const $input = $actions.querySelector('.value-name-input');
    $input.dispatchEvent(
      new globalThis.KeyboardEvent('keyup', { key: 'Escape', bubbles: true }),
    );

    await waitFor(() => $frame.dataset.show === 'false');
    t.is(
      $frame.dataset.show,
      'false',
      'Escape from the name input dismissed the modal',
    );
  },
);

test.serial(
  'showValue resolves pet names into .token chips in the title',
  async t => {
    const { $title, api } = setup({
      reverseIdentify: async () => ['alice', 'alice'],
    });
    t.teardown(() => api.dismissValue());

    await api.showValue('x', 'some-id');
    await waitFor(() => !!$title.querySelector('.token'));

    const tokens = $title.querySelectorAll('.token');
    t.is(tokens.length, 1, 'duplicate pet names de-duplicated to one chip');
    t.is($title.querySelector('.token b').textContent, '@alice');
  },
);

test.serial(
  'Close button clears the value content and hides the frame',
  async t => {
    const { $frame, $value, api } = setup();
    t.teardown(() => api.dismissValue());

    await api.showValue(7);
    await waitFor(() => !!$value.querySelector('.number'));
    // showValue reveals the frame.
    t.is($frame.dataset.show, 'true', 'frame shown while a value is open');

    $frame
      .querySelector('#value-close')
      .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

    await waitFor(() => !$value.querySelector('.number'));
    t.falsy($value.querySelector('.number'), 'value content unmounted');
    t.is($frame.dataset.show, 'false', 'frame hidden after close');
  },
);

test.after(() => {
  testDocument.body.innerHTML = '';
});

test.serial(
  'dispose() unmounts the surfaces and removes the owned frame',
  async t => {
    const { $parent, $value, api } = setup();

    await api.showValue(42);
    await waitFor(() => !!$value.querySelector('.number'));
    t.truthy($value.querySelector('.number'), 'value content is mounted');
    t.truthy($parent.querySelector('#value-frame'), 'frame is in the DOM');

    api.dispose();

    // dispose removes the entire frame the component created — no host markup
    // is left behind, since the component owned it.
    await waitFor(() => !$parent.querySelector('#value-frame'));
    t.is(
      $parent.querySelector('#value-frame'),
      null,
      'frame removed on dispose',
    );
  },
);
