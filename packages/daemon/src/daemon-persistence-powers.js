// @ts-check

/**
 * Pure-JS factory for DaemonicPersistencePowers.
 *
 * Extracted from daemon-node-powers.js so that the XS daemon bundle
 * can import it without pulling in Node.js-specific dependencies
 * (@endo/stream-node, node:fs, child_process).
 */

import harden from '@endo/harden';
import { q } from '@endo/errors';
import { makeSnapshotStore } from '@endo/platform/fs/lite';

import { makeReaderRef } from './reader-ref.js';
import { toHex, fromHex } from './hex.js';

/** @import { Config, CryptoPowers, DaemonicPersistencePowers, FilePowers, Formula, FormulaNumber } from './types.js' */

/**
 * @param {FilePowers} filePowers
 * @param {CryptoPowers} cryptoPowers
 * @param {Config} config
 * @returns {DaemonicPersistencePowers}
 */
export const makeDaemonicPersistencePowers = (
  filePowers,
  cryptoPowers,
  config,
) => {
  const initializePersistence = async () => {
    const { statePath, ephemeralStatePath, cachePath } = config;
    const statePathP = filePowers.makePath(statePath);
    const ephemeralStatePathP = filePowers.makePath(ephemeralStatePath);
    const cachePathP = filePowers.makePath(cachePath);
    await Promise.all([statePathP, cachePathP, ephemeralStatePathP]);
  };

  /** @type {DaemonicPersistencePowers['provideRootNonce']} */
  const provideRootNonce = async () => {
    const noncePath = filePowers.joinPath(config.statePath, 'nonce');
    const existingNonce = await filePowers.maybeReadFileText(noncePath);
    if (existingNonce === undefined) {
      const rootNonce = /** @type {FormulaNumber} */ (
        await cryptoPowers.randomHex256()
      );
      await filePowers.writeFileText(noncePath, `${rootNonce}\n`);
      return { rootNonce, isNewlyCreated: true };
    } else {
      const rootNonce = /** @type {FormulaNumber} */ (existingNonce.trim());
      return { rootNonce, isNewlyCreated: false };
    }
  };

  /** @type {DaemonicPersistencePowers['provideRootKeypair']} */
  const provideRootKeypair = async () => {
    const keypairPath = filePowers.joinPath(config.statePath, 'keypair');
    const existingKeypair = await filePowers.maybeReadFileText(keypairPath);
    if (existingKeypair === undefined) {
      const keypair = await cryptoPowers.generateEd25519Keypair();
      const publicHex = toHex(keypair.publicKey);
      const privateHex = toHex(keypair.privateKey);
      await filePowers.writeFileText(
        keypairPath,
        `${publicHex}\n${privateHex}\n`,
      );
      return { keypair, isNewlyCreated: true };
    } else {
      const lines = existingKeypair.trim().split('\n');
      const pubHex = lines[0];
      const privHex = lines[1];
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
          sign: message =>
            cryptoPowers.ed25519Sign(fromHex(privHex), message),
        }),
        isNewlyCreated: false,
      };
    }
  };

  const makeContentStore = () => {
    const { statePath } = config;
    const storageDirectoryPath = filePowers.joinPath(statePath, 'store-sha256');

    /** @type {import('@endo/platform/fs/lite/types').ContentStore} */
    const rawStore = harden({
      /**
       * @param {AsyncIterable<Uint8Array>} readable
       * @returns {Promise<string>}
       */
      async store(readable) {
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

        // Calculate hash.
        const sha256 = digester.digestHex();
        // Finish with an atomic rename.
        const storagePath = filePowers.joinPath(storageDirectoryPath, sha256);
        await filePowers.renamePath(temporaryStoragePath, storagePath);
        return sha256;
      },
      /**
       * @param {string} sha256
       */
      fetch(sha256) {
        const storagePath = filePowers.joinPath(storageDirectoryPath, sha256);
        const streamBase64 = () => {
          const reader = filePowers.makeFileReader(storagePath);
          return makeReaderRef(reader);
        };
        const text = async () => {
          return filePowers.readFileText(storagePath);
        };
        const json = async () => {
          const jsonSrc = await text();
          return JSON.parse(jsonSrc);
        };
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

  /**
   * @param {string} formulaNumber
   */
  const makeFormulaPath = formulaNumber => {
    const { statePath } = config;
    if (formulaNumber.length < 3) {
      throw new TypeError(`Invalid formula number ${q(formulaNumber)}`);
    }
    const head = formulaNumber.slice(0, 2);
    const tail = formulaNumber.slice(2);
    const directory = filePowers.joinPath(statePath, 'formulas', head);
    const file = filePowers.joinPath(directory, `${tail}.json`);
    return harden({ directory, file });
  };

  /**
   * @param {string} formulaNumber
   * @returns {Promise<Formula>}
   */
  const readFormula = async formulaNumber => {
    const { file: formulaPath } = makeFormulaPath(formulaNumber);
    const formulaText = await filePowers.maybeReadFileText(formulaPath);
    if (formulaText === undefined) {
      throw new ReferenceError(`No reference exists at path ${formulaPath}`);
    }
    const formula = (() => {
      try {
        return JSON.parse(formulaText);
      } catch (error) {
        throw new TypeError(
          `Corrupt description for reference in file ${formulaPath}: ${/** @type {Error} */ (error).message}`,
        );
      }
    })();
    return formula;
  };

  // Persist instructions for revival (this can be collected)
  /** @type {DaemonicPersistencePowers['writeFormula']} */
  const writeFormula = async (formulaNumber, formula) => {
    const { directory, file } = makeFormulaPath(formulaNumber);
    // TODO Take care to write atomically with a rename here.
    await filePowers.makePath(directory);
    await filePowers.writeFileText(file, `${q(formula)}\n`);
  };

  /** @type {DaemonicPersistencePowers['deleteFormula']} */
  const deleteFormula = async formulaNumber => {
    const { file } = makeFormulaPath(formulaNumber);
    await filePowers.removePath(file);
  };

  /** @type {DaemonicPersistencePowers['listFormulas']} */
  const listFormulas = async () => {
    const formulasPath = filePowers.joinPath(config.statePath, 'formulas');
    const heads = await filePowers.readDirectory(formulasPath).catch(error => {
      if (error.message.startsWith('ENOENT: ')) {
        return [];
      }
      throw error;
    });
    /** @type {import('./types.js').FormulaNumber[]} */
    const numbers = [];
    await Promise.all(
      heads.map(async head => {
        const headPath = filePowers.joinPath(formulasPath, head);
        const files = await filePowers.readDirectory(headPath).catch(error => {
          if (
            error.message.startsWith('ENOTDIR: ') ||
            error.message.startsWith('ENOENT: ')
          ) {
            return [];
          }
          throw error;
        });
        for (const file of files) {
          if (file.endsWith('.json')) {
            const tail = file.slice(0, -'.json'.length);
            numbers.push(
              /** @type {import('./types.js').FormulaNumber} */ (
                `${head}${tail}`
              ),
            );
          }
        }
      }),
    );
    return numbers;
  };

  return harden({
    statePath: config.statePath,
    initializePersistence,
    provideRootNonce,
    provideRootKeypair,
    makeContentStore,
    readFormula,
    writeFormula,
    deleteFormula,
    listFormulas,
  });
};
harden(makeDaemonicPersistencePowers);
