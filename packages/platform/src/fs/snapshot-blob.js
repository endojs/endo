// @ts-check

import harden from '@endo/harden';
import { encodeBase64 } from '@endo/base64';
import { mapReader } from '@endo/stream';
import { makeReaderPump } from '@endo/exo-stream/reader-pump.js';

/** @import { SnapshotStore } from './types.js' */

/**
 * Returns the methods of a SnapshotBlob as a plain spreadable object.
 *
 * @param {SnapshotStore} store
 * @param {string} sha256
 */
export const snapshotBlobMethods = (store, sha256) => {
  const { text, json, makeFileReader } = store.fetch(sha256);
  return harden({
    sha256: () => sha256,
    streamBase64: makeReaderPump(mapReader(makeFileReader(), encodeBase64)),
    text,
    json,
  });
};
harden(snapshotBlobMethods);
