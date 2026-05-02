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
import { makeSnapshotStore } from '@endo/platform/fs/lite';

import { makeReaderRef } from './reader-ref.js';
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
  // Large blobs do not belong in SQLite.
  const makeContentStore = () => {
    const { statePath } = config;
    const storageDirectoryPath = filePowers.joinPath(statePath, 'store-sha256');

    /** @type {import('@endo/platform/fs/lite/types').ContentStore} */
    const rawStore = harden({
      /**
       * @param {AsyncIterable<Uint8Array> | AsyncIterator<Uint8Array>} readableOrIterator
       * @returns {Promise<string>}
       */
      async store(readableOrIterator) {
        const readable = /** @type {AsyncIterable<Uint8Array>} */ (
          /** @type {unknown} */ (readableOrIterator)
        );
        const digester = cryptoPowers.makeSha256();
        const storageId256 = await cryptoPowers.randomHex256();
        const temporaryStoragePath = filePowers.joinPath(
          storageDirectoryPath,
          storageId256,
        );

        // Stream to temporary file and calculate hash.
        await filePowers.makePath(storageDirectoryPath);
        const fileWriter = filePowers.makeFileWriter(temporaryStoragePath);
        // eslint-disable-next-line no-await-in-loop
        for await (const chunk of readable) {
          digester.update(chunk);
          // eslint-disable-next-line no-await-in-loop
          await fileWriter.next(chunk);
        }
        await fileWriter.return(undefined);

        // Calculate hash, finish with an atomic rename.
        const sha256 = digester.digestHex();
        const storagePath = filePowers.joinPath(storageDirectoryPath, sha256);
        await filePowers.renamePath(temporaryStoragePath, storagePath);
        return sha256;
      },
      /** @param {string} sha256 */
      fetch(sha256) {
        const storagePath = filePowers.joinPath(storageDirectoryPath, sha256);
        const streamBase64 = () => {
          const reader = filePowers.makeFileReader(storagePath);
          return makeReaderRef(reader);
        };
        const text = async () => filePowers.readFileText(storagePath);
        const json = async () => JSON.parse(await text());
        return harden({ streamBase64, text, json });
      },
      /**
       * @param {string} sha256
       * @returns {Promise<boolean>}
       */
      async has(sha256) {
        const storagePath = filePowers.joinPath(storageDirectoryPath, sha256);
        try {
          await filePowers.readFileText(storagePath);
          return true;
        } catch (_e) {
          return false;
        }
      },
    });

    return makeSnapshotStore(rawStore);
  };

  // Wrap synchronous database operations as async so that
  // implementations using async I/O are not constrained.
  return harden({
    statePath: config.statePath,
    initializePersistence,
    provideRootNonce,
    provideRootKeypair,
    makeContentStore,
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
