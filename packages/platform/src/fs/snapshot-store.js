// @ts-check

import harden from '@endo/harden';
import { makeExo } from '@endo/exo';

import { SnapshotBlobInterface, SnapshotTreeInterface } from './interfaces.js';
import { snapshotBlobMethods } from './snapshot-blob.js';
import { snapshotTreeMethods } from './snapshot-tree.js';

/** @import { ContentStore, SnapshotStore } from './types.js' */

/**
 * Wraps a ContentStore (which knows only bytes and hashes) into a
 * SnapshotStore that can load SnapshotBlob and SnapshotTree.
 *
 * - loadBlob / loadTree return Exos (remotable for CapTP).
 *
 * @param {ContentStore} contentStore
 * @returns {SnapshotStore}
 */
export const makeSnapshotStore = contentStore => {
  /** @type {SnapshotStore} */
  const snapshotStore = harden({
    store: readable => contentStore.store(readable),
    fetch: sha256 => contentStore.fetch(sha256),
    has: sha256 => contentStore.has(sha256),
    loadBlob: sha256 =>
      makeExo(
        `SnapshotBlob ${sha256.slice(0, 8)}...`,
        SnapshotBlobInterface,
        snapshotBlobMethods(snapshotStore, sha256),
      ),
    loadTree: sha256 =>
      makeExo(
        `SnapshotTree ${sha256.slice(0, 8)}...`,
        SnapshotTreeInterface,
        snapshotTreeMethods(snapshotStore, sha256),
      ),
  });
  return snapshotStore;
};
harden(makeSnapshotStore);
