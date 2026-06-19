// @ts-check

// Pins the base64 spelling of the lite `SnapshotBlob` / `SnapshotTree`
// `sha256()` accessor. The content-store address is hex internally; every
// *public* hash accessor returns base64 (matching `getInfo().hash`). A revert
// to hex would silently break out-of-repo consumers, so assert the encoding
// directly. See designs/fs-interface-consolidation.md § "Content hash".

import '@endo/init/debug.js';

import test from 'ava';
import { encodeBase64 } from '@endo/base64';
import { decodeHex } from '@endo/hex';

import { snapshotBlobMethods } from '../src/fs/snapshot-blob.js';
import { snapshotTreeMethods } from '../src/fs/snapshot-tree.js';

// A 32-byte sha-256 digest, as the hex content-store address would spell it.
const sampleHex =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// Minimal store: the `sha256()` accessor never touches the readable body, so
// `fetch` only needs to return the destructured shape without doing I/O.
const makeStubStore = () =>
  harden({
    fetch: () =>
      harden({
        text: async () => '',
        json: async () => harden([]),
        makeFileReader: () =>
          harden({ next: async () => harden({ done: true }) }),
      }),
    loadBlob: () => harden({}),
    loadTree: () => harden({}),
  });

test('SnapshotBlob.sha256() returns the digest as base64, not hex', t => {
  const blob = snapshotBlobMethods(
    /** @type {any} */ (makeStubStore()),
    sampleHex,
  );
  const expected = encodeBase64(decodeHex(sampleHex));
  t.is(blob.sha256(), expected);
  t.not(blob.sha256(), sampleHex, 'must not be the hex content-store address');
});

test('SnapshotTree.sha256() returns the digest as base64, not hex', t => {
  const tree = snapshotTreeMethods(
    /** @type {any} */ (makeStubStore()),
    sampleHex,
  );
  const expected = encodeBase64(decodeHex(sampleHex));
  t.is(tree.sha256(), expected);
  t.not(tree.sha256(), sampleHex, 'must not be the hex content-store address');
});
