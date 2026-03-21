// @ts-check

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
      const readerRef = E(remoteNode).streamBase64();
      const sha256 = await store.store(makeRefReader(readerRef));
      return { type: 'blob', sha256 };
    }

    // It's a tree — enumerate children and recurse.
    const names = await E(remoteNode).list();
    /** @type {Array<[string, string, string]>} */
    const treeEntries = [];

    for (const name of names) {
      const child = await E(remoteNode).lookup(name);
      // Duck-type: try list() to distinguish tree from blob.
      let childIsTree = false;
      try {
        await E(child).list();
        childIsTree = true;
      } catch (_e) {
        childIsTree = false;
      }
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
