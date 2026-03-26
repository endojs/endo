// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';

/** @import { SnapshotStore } from './types.js' */

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
  const { json } = store.fetch(sha256);
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
    sha256: () => sha256,
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
      return E(child).has(...tail);
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
      return E(child).list(...tail);
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
  });
};
harden(snapshotTreeMethods);
