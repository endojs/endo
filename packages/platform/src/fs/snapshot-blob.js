// @ts-check

import harden from '@endo/harden';
import { encodeBase64 } from '@endo/base64';
import { decodeHex } from '@endo/hex';
import { mapReader } from '@endo/stream';
import { makeReaderPump } from '@endo/exo-stream/reader-pump.js';

import { byteLengthOfReader } from './reader-byte-length.js';

/** @import { SnapshotStore } from './types.js' */

/**
 * Returns the methods of a SnapshotBlob as a plain spreadable object.
 *
 * @param {SnapshotStore} store
 * @param {string} sha256 - the hex content-store address
 */
export const snapshotBlobMethods = (store, sha256) => {
  const { text, json, makeFileReader, size } = store.fetch(sha256);
  return harden({
    // `sha256()` returns the digest as **base64** (the canonical public hash
    // encoding, matching `getInfo().hash`). The hex form is the internal
    // content-store address; callers that need it convert at the callsite.
    sha256: () => encodeBase64(decodeHex(sha256)),
    // `getInfo()` is the uniform content-address identity accessor (the same
    // shape live blobs expose): the `{ algorithm, hash, size }` triple in one
    // round-trip, `hash` base64. `size` comes from the store's cheap stat when
    // available, else from draining the (already in-memory) bytes.
    getInfo: async () =>
      harden({
        algorithm: 'sha256',
        hash: encodeBase64(decodeHex(sha256)),
        size: size ? await size() : await byteLengthOfReader(makeFileReader),
      }),
    /** @param {import('@endo/eventual-send').ERef<unknown>} synPromise */
    streamBase64(synPromise) {
      const pump = makeReaderPump(mapReader(makeFileReader(), encodeBase64));
      return pump(/** @type {any} */ (synPromise));
    },
    text,
    json,
    /** @param {string} [method] */
    help: method =>
      method === undefined
        ? 'SnapshotBlob: immutable content-addressed bytes (sha256, getInfo, text, json, streamBase64).'
        : `No documentation for method ${method}.`,
  });
};
harden(snapshotBlobMethods);
