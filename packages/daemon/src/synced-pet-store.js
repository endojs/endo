// @ts-check
/* eslint-disable no-await-in-loop */

/// <reference types="./types.d.ts" />

/** @import { FilePowers, PetName, SyncedEntry, SyncedPetStoreState, SyncedPetStoreMetadata, SyncedPetStorePowers, SyncedPetStore } from './types.js' */

import harden from '@endo/harden';
import { q } from '@endo/errors';

import { makeChangeTopic } from './pubsub.js';
import { assertPetName } from './pet-name.js';
import { makeSerialJobs } from './serial-jobs.js';

/**
 * Compare two synced entries using the CRDT merge rules:
 * 1. Higher timestamp wins.
 * 2. Tombstone bias on tie (null locator wins).
 * 3. Lexicographically greater writer wins on remaining ties.
 *
 * @param {SyncedEntry} a
 * @param {SyncedEntry} b
 * @returns {SyncedEntry} The winning entry.
 */
export const mergeEntry = (a, b) => {
  if (a.timestamp > b.timestamp) return a;
  if (b.timestamp > a.timestamp) return b;
  // Same timestamp: tombstone bias.
  const aIsTomb = a.locator === null;
  const bIsTomb = b.locator === null;
  if (aIsTomb && !bIsTomb) return a;
  if (bIsTomb && !aIsTomb) return b;
  // Same timestamp, same null/non-null status: node-ID tiebreaker.
  if (a.writer >= b.writer) return a;
  return b;
};
harden(mergeEntry);

/**
 * Merge a remote state into a local state, returning the set of keys
 * whose effective value changed.
 *
 * @param {SyncedPetStoreState} local
 * @param {SyncedPetStoreState} remote
 * @returns {Set<string>} Keys whose value changed in the local state.
 */
export const mergeState = (local, remote) => {
  /** @type {Set<string>} */
  const changed = new Set();
  for (const [key, remoteEntry] of remote) {
    const localEntry = local.get(key);
    if (localEntry === undefined) {
      local.set(key, remoteEntry);
      changed.add(key);
    } else {
      const winner = mergeEntry(localEntry, remoteEntry);
      if (winner !== localEntry) {
        local.set(key, winner);
        changed.add(key);
      }
    }
  }
  return changed;
};
harden(mergeState);

/**
 * Generate a short random hex string for temporary file names.
 *
 * @returns {string}
 */
const randomTmpSuffix = () => {
  const bytes = new Uint8Array(8);
  // eslint-disable-next-line no-undef
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Write a JSON value atomically using write-then-rename.
 *
 * @param {FilePowers} filePowers
 * @param {string} targetDir
 * @param {string} fileName
 * @param {unknown} value
 */
const atomicWriteJSON = async (filePowers, targetDir, fileName, value) => {
  const temporaryPath = filePowers.joinPath(
    targetDir,
    `.tmp.${randomTmpSuffix()}`,
  );
  const finalPath = filePowers.joinPath(targetDir, fileName);
  await filePowers.writeFileText(temporaryPath, `${JSON.stringify(value)}\n`);
  await filePowers.renamePath(temporaryPath, finalPath);
};

/**
 * Clean up stale temporary files from a directory.
 *
 * @param {FilePowers} filePowers
 * @param {string} directory
 */
const cleanTmpFiles = async (filePowers, directory) => {
  const entries = await filePowers.readDirectory(directory).catch(error => {
    if (/** @type {Error} */ (error).message.startsWith('ENOENT: ')) {
      return [];
    }
    throw error;
  });
  await Promise.all(
    entries
      .filter(name => name.startsWith('.tmp.'))
      .map(name => filePowers.removePath(filePowers.joinPath(directory, name))),
  );
};

/**
 * @param {object} opts
 * @param {string} opts.storePath - Root directory for this synced store instance.
 * @param {FilePowers} opts.filePowers
 * @param {string} opts.localNodeId - The local node's identifier.
 * @param {'grantor' | 'grantee'} opts.role
 * @returns {Promise<SyncedPetStore>}
 */
export const makeSyncedPetStore = async ({
  storePath,
  filePowers,
  localNodeId,
  role,
}) => {
  const namesDir = filePowers.joinPath(storePath, 'names');
  await filePowers.makePath(namesDir);
  await filePowers.makePath(storePath);

  // Clean stale temp files from a prior crash.
  await cleanTmpFiles(filePowers, namesDir);
  await cleanTmpFiles(filePowers, storePath);

  // Load metadata.
  /** @type {SyncedPetStoreMetadata} */
  let meta = { localClock: 0, remoteAckedClock: 0 };
  const metaText = await filePowers.maybeReadFileText(
    filePowers.joinPath(storePath, 'clock.json'),
  );
  if (metaText !== undefined) {
    meta = JSON.parse(metaText);
  }

  // Load entries from disk.
  /** @type {SyncedPetStoreState} */
  const state = new Map();
  const fileNames = await filePowers.readDirectory(namesDir).catch(error => {
    if (/** @type {Error} */ (error).message.startsWith('ENOENT: ')) {
      return [];
    }
    throw error;
  });
  await Promise.all(
    fileNames
      .filter(name => name.endsWith('.json') && !name.startsWith('.tmp.'))
      .map(async fileName => {
        const petName = fileName.slice(0, -'.json'.length);
        const text = await filePowers.readFileText(
          filePowers.joinPath(namesDir, fileName),
        );
        /** @type {SyncedEntry} */
        const entry = JSON.parse(text);
        state.set(petName, entry);
      }),
  );

  const writeJobs = makeSerialJobs();

  /** @type {import('./types.js').Topic<{ key: string, entry: SyncedEntry }>} */
  const changeTopic = makeChangeTopic();

  /**
   * Persist an entry to disk.
   *
   * @param {string} key
   * @param {SyncedEntry} entry
   */
  const persistEntry = async (key, entry) => {
    await writeJobs.enqueue(async () => {
      await atomicWriteJSON(filePowers, namesDir, `${key}.json`, entry);
    });
  };

  /**
   * Delete an entry file from disk (used for tombstone pruning).
   *
   * @param {string} key
   */
  const deleteEntryFile = async key => {
    await writeJobs.enqueue(async () => {
      await filePowers.removePath(filePowers.joinPath(namesDir, `${key}.json`));
    });
  };

  const persistMeta = async () => {
    await writeJobs.enqueue(async () => {
      await atomicWriteJSON(filePowers, storePath, 'clock.json', meta);
    });
  };

  /** @type {SyncedPetStore['storeLocator']} */
  const storeLocator = async (petName, locator) => {
    assertPetName(petName);
    if (role === 'grantee') {
      throw new Error('Grantee cannot write new entries');
    }
    meta.localClock += 1;
    /** @type {SyncedEntry} */
    const entry = harden({
      locator,
      timestamp: meta.localClock,
      writer: localNodeId,
    });
    state.set(petName, entry);
    await persistEntry(petName, entry);
    await persistMeta();
    changeTopic.publisher.next(harden({ key: petName, entry }));
  };

  /** @type {SyncedPetStore['remove']} */
  const remove = async petName => {
    assertPetName(petName);
    if (!state.has(petName)) {
      throw new Error(`No entry for pet name ${q(petName)}`);
    }
    const existing = state.get(petName);
    if (existing !== undefined && existing.locator === null) {
      // Already a tombstone.
      return;
    }
    meta.localClock += 1;
    /** @type {SyncedEntry} */
    const entry = harden({
      locator: null,
      timestamp: meta.localClock,
      writer: localNodeId,
    });
    state.set(petName, entry);
    await persistEntry(petName, entry);
    await persistMeta();
    changeTopic.publisher.next(harden({ key: petName, entry }));
  };

  /** @type {SyncedPetStore['has']} */
  const has = petName => {
    const entry = state.get(petName);
    return entry !== undefined && entry.locator !== null;
  };

  /** @type {SyncedPetStore['lookup']} */
  const lookup = petName => {
    const entry = state.get(petName);
    if (entry === undefined || entry.locator === null) {
      return undefined;
    }
    return entry.locator;
  };

  /** @type {SyncedPetStore['list']} */
  const list = () => {
    /** @type {PetName[]} */
    const names = [];
    for (const [key, entry] of state) {
      if (entry.locator !== null) {
        names.push(/** @type {PetName} */ (key));
      }
    }
    names.sort();
    return harden(names);
  };

  /** @type {SyncedPetStore['getState']} */
  const getState = () => {
    // Return a serializable snapshot.
    /** @type {Record<string, SyncedEntry>} */
    const snapshot = {};
    for (const [key, entry] of state) {
      snapshot[key] = entry;
    }
    return harden(snapshot);
  };

  /** @type {SyncedPetStore['getLocalClock']} */
  const getLocalClock = () => meta.localClock;

  /** @type {SyncedPetStore['getRemoteAckedClock']} */
  const getRemoteAckedClock = () => meta.remoteAckedClock;

  /** @type {SyncedPetStore['mergeRemoteState']} */
  const mergeRemoteState = async (remoteState, remoteClock) => {
    /** @type {SyncedPetStoreState} */
    const incoming = new Map();
    for (const [key, entry] of Object.entries(remoteState)) {
      incoming.set(key, entry);
    }
    const changed = mergeState(state, incoming);
    // Advance localClock to at least remoteClock and the max timestamp
    // of any merged entry (Lamport rule).
    let maxTs = remoteClock;
    for (const entry of incoming.values()) {
      if (entry.timestamp > maxTs) {
        maxTs = entry.timestamp;
      }
    }
    if (maxTs > meta.localClock) {
      meta.localClock = maxTs;
    }
    // Persist changed entries.
    await Promise.all(
      [...changed].map(async key => {
        const entry = /** @type {SyncedEntry} */ (state.get(key));
        await persistEntry(key, entry);
      }),
    );
    await persistMeta();
    // Notify subscribers of changes.
    for (const key of changed) {
      const entry = /** @type {SyncedEntry} */ (state.get(key));
      changeTopic.publisher.next(harden({ key, entry }));
    }
    return changed;
  };

  /** @type {SyncedPetStore['acknowledgeRemoteClock']} */
  const acknowledgeRemoteClock = async ackedClock => {
    if (ackedClock > meta.remoteAckedClock) {
      meta.remoteAckedClock = ackedClock;
      await persistMeta();
    }
  };

  /** @type {SyncedPetStore['pruneTombstones']} */
  const pruneTombstones = async () => {
    /** @type {string[]} */
    const pruned = [];
    for (const [key, entry] of state) {
      if (entry.locator === null && entry.timestamp <= meta.remoteAckedClock) {
        pruned.push(key);
      }
    }
    for (const key of pruned) {
      state.delete(key);
      await deleteEntryFile(key);
    }
    return harden(pruned);
  };

  /** @type {SyncedPetStore['followChanges']} */
  const followChanges = async function* syncedChanges() {
    const subscription = changeTopic.subscribe();
    // Yield current state first.
    for (const [key, entry] of state) {
      yield harden({ key, entry });
    }
    yield* subscription;
  };

  return harden({
    storeLocator,
    remove,
    has,
    lookup,
    list,
    getState,
    getLocalClock,
    getRemoteAckedClock,
    mergeRemoteState,
    acknowledgeRemoteClock,
    pruneTombstones,
    followChanges,
  });
};
harden(makeSyncedPetStore);
