// @ts-check
/// <reference types="ses"/>

/**
 * SQLite-backed DaemonicPersistencePowers shared by every Endo
 * daemon flavour.  Formula records, agent keys, retention
 * tables and the per-node formula index all live in the
 * SQLite-backed `daemon-database.js` schema.  The content store
 * (large binary blobs addressed by SHA-256) still lives on the
 * filesystem, since SQLite isn't a great place for many-MB
 * payloads.
 *
 * The Node daemon path passes `better-sqlite3` as the Database
 * constructor; the XS-on-Rust-supervisor path passes
 * `./better-sqlite3-xs.js`, which forwards prepared-statement
 * calls through host functions to rusqlite.  Both backends agree
 * on the on-disk schema (`<statePath>/endo.sqlite`), so a single
 * state directory can be opened by either supervisor without a
 * migration step.
 */

import harden from '@endo/harden';
import { makeContentStore } from '@endo/daemon-cas';
import { makeSnapshotStore } from '@endo/platform/fs/lite';

import { toHex, fromHex } from './hex.js';

/** @import { Config, CryptoPowers, DaemonicPersistencePowers, FilePowers, Formula, FormulaNumber } from './types.js' */
/** @import { DaemonDatabase } from './daemon-database.js' */

/**
 * @param {DaemonDatabase} daemonDb
 * @param {FilePowers} filePowers
 * @param {CryptoPowers} cryptoPowers
 * @param {Config} config
 * @returns {DaemonicPersistencePowers}
 */
export const makeDaemonicPersistencePowers = (
  daemonDb,
  filePowers,
  cryptoPowers,
  config,
) => {
  const {
    readFormula,
    writeFormula,
    deleteFormula,
    listFormulas,
    listFormulaNumbersByNode,
    getState,
    setState,
    writeAgentKey,
    getAgentKey,
    hasAgentKey,
    listAgentKeys,
    deleteAgentKey,
    writeRemoteAgentKey,
    getRemoteAgentKey,
    writeRetention,
    deleteRetention,
    listRetention,
    replaceRetention,
    deleteAllRetention,
  } = daemonDb;

  const initializePersistence = async () => {
    const { statePath, ephemeralStatePath, cachePath } = config;
    const statePathP = filePowers.makePath(statePath);
    const ephemeralStatePathP = filePowers.makePath(ephemeralStatePath);
    const cachePathP = filePowers.makePath(cachePath);
    await Promise.all([statePathP, cachePathP, ephemeralStatePathP]);
  };

  /** @type {DaemonicPersistencePowers['provideRootNonce']} */
  const provideRootNonce = async () => {
    const existingNonce = getState('root_nonce');
    if (existingNonce === undefined) {
      const rootNonce = /** @type {FormulaNumber} */ (
        await cryptoPowers.randomHex256()
      );
      setState('root_nonce', rootNonce);
      return { rootNonce, isNewlyCreated: true };
    }
    return {
      rootNonce: /** @type {FormulaNumber} */ (existingNonce),
      isNewlyCreated: false,
    };
  };

  /** @type {DaemonicPersistencePowers['provideRootKeypair']} */
  const provideRootKeypair = async () => {
    const existingPublicHex = getState('public_key');
    if (existingPublicHex === undefined) {
      const keypair = await cryptoPowers.generateEd25519Keypair();
      const publicHex = toHex(keypair.publicKey);
      const privateHex = toHex(keypair.privateKey);
      setState('public_key', publicHex);
      setState('private_key', privateHex);
      return { keypair, isNewlyCreated: true };
    }
    const pubHex = existingPublicHex;
    const privHex = /** @type {string} */ (getState('private_key'));
    // Use getters to avoid storing Uint8Array directly on the
    // hardened object — in XS, Uint8Array indexed elements are
    // non-configurable so harden/freeze fails.
    return {
      keypair: harden({
        get publicKey() {
          return fromHex(pubHex);
        },
        get privateKey() {
          return fromHex(privHex);
        },
        sign: message => cryptoPowers.ed25519Sign(fromHex(privHex), message),
      }),
      isNewlyCreated: false,
    };
  };

  // Content store uses the filesystem for streaming binary data.
  // Large blobs do not belong in SQLite.  The four-method
  // `store`/`fetch`/`has`/`remove` contract lives in `@endo/daemon-cas`;
  // this factory owns the daemon-specific path opinion
  // (`<statePath>/store-sha256/`) and the `makeSnapshotStore` wrap
  // that satisfies the persistence-powers `SnapshotStore` contract.
  // See `designs/daemon-cas-management.md` Phase 5 for the destination
  // architecture (the Rust supervisor's `cas-*` envelope verbs will
  // later replace the CAS package's implementation without changing the
  // call site at `daemon.js` line ~330).
  const makeSnapshotContentStore = () => {
    const storageDirectoryPath = filePowers.joinPath(
      config.statePath,
      'store-sha256',
    );
    return makeSnapshotStore(
      makeContentStore(storageDirectoryPath, { filePowers, cryptoPowers }),
    );
  };

  // Wrap synchronous database operations as async so that
  // implementations using async I/O are not constrained.
  return harden({
    statePath: config.statePath,
    initializePersistence,
    provideRootNonce,
    provideRootKeypair,
    makeContentStore: makeSnapshotContentStore,
    readFormula: async formulaNumber => readFormula(formulaNumber),
    writeFormula: async (formulaNumber, nodeNumber, formula) =>
      writeFormula(formulaNumber, nodeNumber, formula),
    deleteFormula: async formulaNumber => deleteFormula(formulaNumber),
    listFormulas: async () => listFormulas(),
    listFormulaNumbersByNode,
    writeAgentKey,
    getAgentKey,
    hasAgentKey,
    listAgentKeys,
    deleteAgentKey,
    writeRemoteAgentKey,
    getRemoteAgentKey,
    writeRetention,
    deleteRetention,
    listRetention,
    replaceRetention,
    deleteAllRetention,
  });
};
harden(makeDaemonicPersistencePowers);
