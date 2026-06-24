// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { whylipComponent } from '../../whylip-component.js';

const { document: testDocument } = createDOM();

/**
 * Poll until `predicate()` is truthy or the timeout elapses. Returns the
 * predicate's value (or its last falsy value on timeout).
 *
 * @param {() => unknown} predicate
 * @param {number} [timeoutMs]
 */
const waitFor = async (predicate, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  let value = predicate();
  while (!value && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await tick(20);
    value = predicate();
  }
  return value;
};

// whylipComponent resolves the profile by chaining `E(powers).lookup(name)`
// over `profilePath`. An EMPTY path skips lookups and uses rootPowers directly,
// which keeps the smoke test independent of the (heavier) mailbox-message
// powers the conversation hook would otherwise need. The hook's mailbox init
// fails softly (logged via console.error) when those methods are absent — the
// static panels still render through the confined tree, which is what this
// smoke test exercises: that `WhylipApp` mounts via `renderConfined` and that
// teardown removes the mount.
test.serial('whylip panels render through the confined tree', async t => {
  const $parent = testDocument.createElement('div');
  $parent.className = 'whylip-host';
  testDocument.body.appendChild($parent);
  t.teardown(() => $parent.remove());

  const mock = makeMockPowers({});

  const cleanup = whylipComponent($parent, mock.powers, [], () => {});
  t.is(typeof cleanup, 'function', 'returns a teardown function');

  // The confined renderer mounts the tree under the dedicated `#whylip-root`
  // child; wait for the layout + its panels to appear.
  const $layout = await waitFor(() => $parent.querySelector('.whylip-layout'));
  t.truthy($layout, 'whylip layout rendered through the confined tree');

  t.truthy($parent.querySelector('.whylip-sidebar'), 'sidebar panel rendered');
  t.truthy(
    $parent.querySelector('.whylip-tree'),
    'conversation tree panel rendered',
  );
  t.truthy(
    $parent.querySelector('.whylip-scene'),
    'scene canvas panel rendered',
  );
  t.truthy(
    $parent.querySelector('.whylip-narrative'),
    'narrative panel rendered',
  );
  t.truthy($parent.querySelector('.whylip-input'), 'input bar rendered');

  // The back button is a real, sanitized button (its onClick is wrapped by the
  // confined renderer) — confirms event handlers survived sanitization.
  t.truthy(
    $parent.querySelector('.whylip-back-button'),
    'back button rendered',
  );

  // Teardown unmounts the confined tree AND removes the mount node.
  cleanup();
  await waitFor(() => $parent.querySelector('.whylip-layout') === null);
  t.is(
    $parent.querySelector('.whylip-layout'),
    null,
    'teardown removed the whylip tree',
  );
  t.is(
    $parent.querySelector('#whylip-root'),
    null,
    'teardown removed the dedicated mount node',
  );
});
