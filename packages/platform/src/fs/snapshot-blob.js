// @ts-check

import harden from '@endo/harden';

/** @import { SnapshotStore } from './types.js' */

/**
 * Returns the methods of a SnapshotBlob as a plain spreadable object.
 *
 * @param {SnapshotStore} store
 * @param {string} sha256
 */
export const snapshotBlobMethods = (store, sha256) => {
  const { text, json, streamBase64 } = store.fetch(sha256);
  return harden({
    sha256: () => sha256,
    streamBase64,
    text,
    json,
  });
};
harden(snapshotBlobMethods);
