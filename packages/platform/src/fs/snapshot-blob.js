// @ts-check

import harden from '@endo/harden';
import { encodeBase64 } from '@endo/base64';
import { decodeHex } from '@endo/hex';
import { mapReader } from '@endo/stream';
import { makeReaderPump } from '@endo/exo-stream/reader-pump.js';

/** @import { SnapshotStore } from './types.js' */

/**
 * Returns the methods of a SnapshotBlob as a plain spreadable object.
 *
 * @param {SnapshotStore} store
 * @param {string} sha256 - the hex content-store address
 */
export const snapshotBlobMethods = (store, sha256) => {
  const { text, json, makeFileReader } = store.fetch(sha256);
  return harden({
    // `sha256()` returns the digest as **base64** (the canonical public hash
    // encoding, matching `getInfo().hash`). The hex form is the internal
    // content-store address; callers that need it convert at the callsite.
    sha256: () => encodeBase64(decodeHex(sha256)),
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
        ? 'SnapshotBlob: immutable content-addressed bytes (sha256, text, json, streamBase64).'
        : `No documentation for method ${method}.`,
  });
};
harden(snapshotBlobMethods);
