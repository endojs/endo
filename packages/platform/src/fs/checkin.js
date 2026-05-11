// @ts-check
/* eslint-disable no-await-in-loop */

import harden from '@endo/harden';
import { E } from '@endo/far';

import { makeRefReader } from './ref-reader.js';

/** @import { SnapshotStore } from './types.js' */

const MAX_CHECKIN_DEPTH = 64;

/**
 * Recursively ingest a remote ReadableTree (possibly over CapTP) into
 * a SnapshotStore, producing a root `{ type, sha256 }` descriptor.
 *
 * @param {unknown} remoteTree
 * @param {SnapshotStore} store
 * @param {{ maxDepth?: number }} [options]
 * @returns {Promise<{ type: string, sha256: string }>}
 */
export const checkinTree = async (remoteTree, store, options = {}) => {
  const { maxDepth = MAX_CHECKIN_DEPTH } = options;

  /** @import { SnapshotBlob, SnapshotTree } from './types.js' */

  /**
   * @param {unknown} remoteNode
   * @param {boolean} isTree
   * @param {number} depth
   * @returns {Promise<{type: string, sha256: string}>}
   */
  const checkinNode = async (remoteNode, isTree, depth) => {
    if (depth > maxDepth) {
      throw new TypeError(`Maximum checkin depth (${maxDepth}) exceeded`);
    }

    if (!isTree) {
      // It's a blob — stream its content into the content store.
      const readerRef = E(
        /** @type {SnapshotBlob} */ (remoteNode),
      ).streamBase64();
      const sha256 = await store.store(
        makeRefReader(/** @type {any} */ (readerRef)),
      );
      return { type: 'blob', sha256 };
    }

    // It's a tree — enumerate children and recurse.
    const names = await E(/** @type {SnapshotTree} */ (remoteNode)).list();
    /** @type {Array<[string, string, string]>} */
    const treeEntries = [];

    for (const name of names) {
      /** @type {any} */
      const child = await E(/** @type {SnapshotTree} */ (remoteNode)).lookup(
        name,
      );
      // Use __getMethodNames__ (available on Exos and conforming Far objects)
      // to detect the node type without calling a method that may not exist,
      // which would cause CapTP to log a noisy error.
      // eslint-disable-next-line no-underscore-dangle
      const methods = await E(child).__getMethodNames__();
      const childIsTree = methods.includes('list');
      const result = await checkinNode(child, childIsTree, depth + 1);
      treeEntries.push([name, result.type, result.sha256]);
    }

    // Sort by name for deterministic hashing.
    treeEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const treeJson = JSON.stringify(treeEntries);
    const treeBytes = new TextEncoder().encode(treeJson);

    // Store tree JSON in content store.
    async function* singleChunk() {
      yield treeBytes;
    }
    const sha256 = await store.store(singleChunk());
    return { type: 'tree', sha256 };
  };

  return checkinNode(remoteTree, true, 0);
};
harden(checkinTree);
