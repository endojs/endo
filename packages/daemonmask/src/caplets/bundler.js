import getBundleSource from '@endo/bundle-source';
import { makeReaderRef } from '@endo/daemon';
import { makeExo } from '@endo/exo';
import { E } from '@endo/far';
import { M } from '@endo/patterns';
import { createHash } from 'crypto';
import path from 'path';
import url from 'url';

/**
 * @typedef {('NEW' | 'MAIN' | string)} WorkerName - Represents the name of the worker, with special values 'NEW' and 'MAIN'.
 * @typedef {('NONE' | 'SELF' | 'ENDO' | string)} PowersName - Represents the name of the powers, with special values 'NONE', 'SELF', and 'ENDO'.
 */

/**
 * @typedef {object} BundlerPowers
 * @property {(
 *   workerName: WorkerName,
 *   bundleName: string,
 *   powersName: PowersName,
 *   resultNamePath: string
 * ) => Promise<unknown>} makeBundle
 * @property {(
 *   workerName: WorkerName,
 *   specifier: string,
 *   powersName: PowersName,
 *   resultNamePath: string
 * ) => Promise<unknown>} makeUnconfined
 * @property {(
 *   readerRef: any,
 *   petName: string | string[]
 * ) => Promise<unknown>} storeBlob
 */

/**
 * A small caplet with file system access that can use @endo/bundle-source.
 */
export const make = () => {
  /** @type {Map<string, [string, string]>} */
  const bundleCache = new Map();
  const textEncoder = new TextEncoder();

  /** @param {string} bundleSourceString */
  const makeBundleHash = (bundleSourceString) => {
    const hash = createHash('sha1').update(bundleSourceString).digest('hex');
    return `b-${hash.slice(2)}`;
  };

  /**
   * @param {string} importPath
   * @param {BundlerPowers} powers
   */
  const prepareBundle = async (importPath, powers) => {
    if (!bundleCache.has(importPath)) {
      const bundleSource = getBundleSource(path);
      const bundleText = JSON.stringify(bundleSource);
      const bundleHash = makeBundleHash(bundleText);
      const bundleBytes = textEncoder.encode(bundleText);
      const bundleReaderRef = makeReaderRef([bundleBytes]);

      bundleCache.set(importPath, [bundleReaderRef, bundleHash]);
    }

    // @ts-expect-error It will be defined.
    const [readerRef, bundleHash] = bundleCache.get(importPath);
    await E(powers).storeBlob(readerRef, bundleHash);
    return bundleHash;
  };

  return makeExo(
    'Bundler',
    M.interface('Bundler', {}, { defaultGuards: 'passable' }),
    {
      /**
       * @param {string} importPath
       * @param {string} resultNamePath
       * @param {BundlerPowers} powers
       */
      async makeBundle(importPath, resultNamePath, powers) {
        const bundleName = await prepareBundle(importPath, powers);
        E(powers).makeBundle('MAIN', bundleName, 'NONE', resultNamePath);
      },

      /**
       * @param {string} importPath
       * @param {string} resultNamePath
       * @param {BundlerPowers} powers
       */
      async makeUnconfined(importPath, resultNamePath, powers) {
        return await E(powers).makeUnconfined(
          'MAIN',
          url.pathToFileURL(path.resolve(importPath)).href,
          'NONE',
          resultNamePath,
        );
      },
    },
  );
};
