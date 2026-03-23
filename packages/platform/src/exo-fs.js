// @ts-check

import harden from '@endo/harden';
import { makeExo } from '@endo/exo';

import {
  SnapshotBlobInterface,
  SnapshotTreeInterface,
} from './fs/interfaces.js';
import { snapshotBlobMethods } from './fs/snapshot-blob.js';
import { snapshotTreeMethods } from './fs/snapshot-tree.js';

/** @import { SnapshotStore } from './fs/types.js' */

/**
 * Create a SnapshotBlob Exo from a store and hash.
 *
 * @param {SnapshotStore} store
 * @param {string} sha256
 */
export const makeSnapshotBlob = (store, sha256) =>
  makeExo(
    `SnapshotBlob ${sha256.slice(0, 8)}...`,
    SnapshotBlobInterface,
    snapshotBlobMethods(store, sha256),
  );
harden(makeSnapshotBlob);

/**
 * Create a SnapshotTree Exo from a store and hash.
 *
 * @param {SnapshotStore} store
 * @param {string} sha256
 */
export const makeSnapshotTree = (store, sha256) =>
  makeExo(
    `SnapshotTree ${sha256.slice(0, 8)}...`,
    SnapshotTreeInterface,
    snapshotTreeMethods(store, sha256),
  );
harden(makeSnapshotTree);
