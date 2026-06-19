// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';
import { encodeBase64 } from '@endo/base64';
import { decodeHex } from '@endo/hex';

import { byteLengthOfReader } from './reader-byte-length.js';

/** @import { SnapshotStore, SnapshotTree } from './types.js' */

/**
 * Returns the methods of a SnapshotTree as a plain spreadable object.
 * Children returned by lookup are Exos (remotable for CapTP), created
 * via store.loadBlob / store.loadTree.
 *
 * The content at `sha256` is a JSON array of `[name, type, childSha256]`
 * tuples sorted by name.
 *
 * @param {SnapshotStore} store
 * @param {string} sha256
 */
export const snapshotTreeMethods = (store, sha256) => {
  const { json, makeFileReader, size } = store.fetch(sha256);
  /** @type {Promise<Array<[string, string, string]>> | undefined} */
  let entriesPromise;

  const getEntries = () => {
    if (!entriesPromise) {
      entriesPromise = json();
    }
    return entriesPromise;
  };

  /**
   * @param {string} childType - "blob" or "tree"
   * @param {string} childSha256
   */
  const resolveChild = (childType, childSha256) => {
    if (childType === 'blob') {
      return store.loadBlob(childSha256);
    } else if (childType === 'tree') {
      return store.loadTree(childSha256);
    }
    throw new TypeError(`Unknown entry type: ${JSON.stringify(childType)}`);
  };

  return harden({
    // `sha256()` returns the digest as **base64** (the canonical public hash
    // encoding). The hex form is the internal content-store address (and the
    // encoding of the child references in the manifest); callers that need hex
    // convert at the callsite.
    sha256: () => encodeBase64(decodeHex(sha256)),
    // `getInfo()` is the uniform content-address identity accessor, matching
    // the blob/live-blob shape so generic code can read a content hash off any
    // blob *or* tree via `getInfo().hash`. `size` is the byte length of the
    // tree's own manifest (the content-addressed object), not the recursive
    // total of its files.
    getInfo: async () =>
      harden({
        algorithm: 'sha256',
        hash: encodeBase64(decodeHex(sha256)),
        size: size ? await size() : await byteLengthOfReader(makeFileReader),
      }),
    /**
     * @param {...string} petNamePath
     */
    has: async (...petNamePath) => {
      if (petNamePath.length === 0) {
        return true;
      }
      const entries = await getEntries();
      const [head, ...tail] = petNamePath;
      const entry = entries.find(([name]) => name === head);
      if (!entry) {
        return false;
      }
      if (tail.length === 0) {
        return true;
      }
      const child = resolveChild(entry[1], entry[2]);
      return E(/** @type {SnapshotTree} */ (child)).has(...tail);
    },
    /**
     * @param {...string} petNamePath
     */
    list: async (...petNamePath) => {
      const entries = await getEntries();
      if (petNamePath.length === 0) {
        return harden(entries.map(([name]) => name));
      }
      const [head, ...tail] = petNamePath;
      const entry = entries.find(([name]) => name === head);
      if (!entry) {
        throw new TypeError(`Unknown name: ${JSON.stringify(head)}`);
      }
      const child = resolveChild(entry[1], entry[2]);
      return E(/** @type {SnapshotTree} */ (child)).list(...tail);
    },
    /**
     * @param {string | string[]} petNamePath
     */
    lookup: async petNamePath => {
      const namePath =
        typeof petNamePath === 'string' ? [petNamePath] : petNamePath;
      const entries = await getEntries();
      const [head, ...tail] = namePath;
      const entry = entries.find(([name]) => name === head);
      if (!entry) {
        throw new TypeError(`Unknown name: ${JSON.stringify(head)}`);
      }
      const child = resolveChild(entry[1], entry[2]);
      if (tail.length === 0) {
        return child;
      }
      return tail.reduce(
        (hub, name) => E(hub).lookup(name),
        /** @type {any} */ (child),
      );
    },
    /** @param {string} [method] */
    help: method =>
      method === undefined
        ? 'SnapshotTree: immutable content-addressed directory snapshot (sha256, getInfo, has, list, lookup).'
        : `No documentation for method ${method}.`,
  });
};
harden(snapshotTreeMethods);
