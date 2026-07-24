// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { peersComponent } from '../../peers-component.js';

const { document: testDocument } = createDOM();

// renderConfined defers some effect/menu idioms with requestAnimationFrame;
// dom-setup stubs setTimeout but not rAF, so provide a setTimeout-backed shim.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is truthy or the timeout elapses. Returns the
 * predicate's value (or its last falsy value on timeout). The peer list loads
 * asynchronously through `listKnownPeers` / `getPeerInfo` plus Preact effect
 * flushes, so polling the actual condition is robust on slow runners.
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

/**
 * Build mock powers that serve a fixed peer list + self info and a
 * `followPeerChanges` reader that blocks forever (no further reloads).
 *
 * @param {object} opts
 * @param {object[]} opts.peers
 * @param {object} opts.selfInfo
 */
const makeStreamPowers = ({ peers, selfInfo }) => {
  const powers = Far('MockPeersPowers', {
    listKnownPeers() {
      return Promise.resolve(peers);
    },
    getPeerInfo() {
      return Promise.resolve(selfInfo);
    },
    followPeerChanges() {
      return readerFromIterator(
        Far('PeerChangeIterator', {
          // Block forever after the initial load: never emit a change.
          next() {
            return new Promise(() => {});
          },
        }),
      );
    },
  });
  return { powers };
};

test.serial('peers view renders through the confined tree', async t => {
  const $parent = testDocument.createElement('div');
  $parent.className = 'peers-host';
  testDocument.body.appendChild($parent);
  t.teardown(() => $parent.remove());

  const { powers } = makeStreamPowers({
    peers: [
      {
        node: 'remotenodehash0000000000000000000000000000',
        addresses: ['tcp://10.0.0.1:9920'],
        connectionState: 'connected',
      },
    ],
    selfInfo: {
      node: 'selfnodehash00000000000000000000000000000000',
      addresses: ['tcp://127.0.0.1:8920'],
    },
  });

  // Empty profile path uses rootPowers (the mock) directly, skipping lookups.
  const cleanup = peersComponent($parent, powers, [], () => {});
  t.is(typeof cleanup, 'function', 'returns a teardown function');

  // The confined renderer mounts the tree under the dedicated `#peers-root`
  // child; wait for the container + a peer row to appear.
  const $container = await waitFor(() =>
    $parent.querySelector('.peers-container'),
  );
  t.truthy($container, 'peers container rendered through the confined tree');

  // Header chrome.
  t.truthy($parent.querySelector('.peers-back'), 'back button rendered');
  t.truthy($parent.querySelector('.peers-title'), 'title rendered');

  // Self card + remote peer card appear once the async load resolves.
  await waitFor(() => $parent.querySelector('.peer-card-self'));
  t.truthy($parent.querySelector('.peer-card-self'), 'self node card rendered');

  const $peerCards = await waitFor(() => {
    const cards = $parent.querySelectorAll('.peer-card:not(.peer-card-self)');
    return cards.length > 0 ? cards : null;
  });
  t.is($peerCards.length, 1, 'one remote peer row rendered');
  t.truthy(
    $parent.querySelector('.peer-status-connected'),
    'connection status rendered',
  );

  // Teardown unmounts the confined tree AND removes the mount node.
  cleanup();
  await waitFor(() => $parent.querySelector('.peers-container') === null);
  t.is(
    $parent.querySelector('.peers-container'),
    null,
    'teardown removed the peers tree',
  );
  t.is(
    $parent.querySelector('#peers-root'),
    null,
    'teardown removed the dedicated mount node',
  );
});
