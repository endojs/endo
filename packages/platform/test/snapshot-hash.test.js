// @ts-check

// Pins the base64 spelling of the lite `SnapshotBlob` / `SnapshotTree`
// `sha256()` accessor and the uniform `getInfo()` identity accessor. The
// content-store address is hex internally; every *public* hash accessor
// (`sha256()` and `getInfo().hash`) returns base64. A revert to hex would
// silently break out-of-repo consumers, so assert the encoding directly. See
// designs/fs-interface-consolidation.md § "Content hash".

import '@endo/init/debug.js';

import test from 'ava';
import { encodeBase64 } from '@endo/base64';
import { decodeHex } from '@endo/hex';

import { snapshotBlobMethods } from '../src/fs/snapshot-blob.js';
import { snapshotTreeMethods } from '../src/fs/snapshot-tree.js';

// A 32-byte sha-256 digest, as the hex content-store address would spell it.
const sampleHex =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const expectedBase64 = encodeBase64(decodeHex(sampleHex));

// A reader over a fixed payload, for the `getInfo().size` drain fallback.
const makeBytesReader = bytes => () => {
  let sent = false;
  return harden({
    next: async () => {
      if (sent) return harden({ done: true, value: undefined });
      sent = true;
      return harden({ done: false, value: bytes });
    },
  });
};

// `withSize` toggles whether the store's `fetch` result surfaces a cheap
// `size()` (the real content-store path) or omits it (forcing `getInfo` to
// drain `makeFileReader` to count bytes).
const makeStubStore = (bytes, withSize) =>
  harden({
    fetch: () =>
      harden({
        text: async () => new TextDecoder().decode(bytes),
        json: async () => harden([]),
        makeFileReader: makeBytesReader(bytes),
        ...(withSize ? { size: async () => BigInt(bytes.length) } : {}),
      }),
    loadBlob: () => harden({}),
    loadTree: () => harden({}),
  });

test('SnapshotBlob.sha256() returns the digest as base64, not hex', t => {
  const blob = snapshotBlobMethods(
    /** @type {any} */ (makeStubStore(new Uint8Array(4), true)),
    sampleHex,
  );
  t.is(blob.sha256(), expectedBase64);
  t.not(blob.sha256(), sampleHex, 'must not be the hex content-store address');
});

test('SnapshotTree.sha256() returns the digest as base64, not hex', t => {
  const tree = snapshotTreeMethods(
    /** @type {any} */ (makeStubStore(new Uint8Array(4), true)),
    sampleHex,
  );
  t.is(tree.sha256(), expectedBase64);
  t.not(tree.sha256(), sampleHex, 'must not be the hex content-store address');
});

test('SnapshotBlob.getInfo() returns the base64 triple (store size path)', async t => {
  const blob = snapshotBlobMethods(
    /** @type {any} */ (makeStubStore(new Uint8Array(7), true)),
    sampleHex,
  );
  t.deepEqual(await blob.getInfo(), {
    algorithm: 'sha256',
    hash: expectedBase64,
    size: 7n,
  });
});

test('SnapshotBlob.getInfo() falls back to draining bytes when the store has no size()', async t => {
  const blob = snapshotBlobMethods(
    /** @type {any} */ (makeStubStore(new Uint8Array(5), false)),
    sampleHex,
  );
  const info = await blob.getInfo();
  t.is(info.hash, expectedBase64);
  t.is(info.size, 5n);
});

test('SnapshotTree.getInfo() returns the manifest identity triple', async t => {
  const tree = snapshotTreeMethods(
    /** @type {any} */ (makeStubStore(new Uint8Array(9), true)),
    sampleHex,
  );
  t.deepEqual(await tree.getInfo(), {
    algorithm: 'sha256',
    hash: expectedBase64,
    size: 9n,
  });
});
