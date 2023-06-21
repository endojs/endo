// @ts-check
/// <reference types="ses"/>

import { E, Far } from '@endo/far';
import { makeNetstringCapTP } from './connection.js';

const endowments = harden({
  assert,
  E,
  Far,
  TextEncoder,
  TextDecoder,
  URL,
});

/**
 * @typedef {ReturnType<makeWorkerFacet>} WorkerBootstrap
 */

/**
 * @param {object} args
 * @param {() => any} args.getDaemonBootstrap
 * @param {(error: Error) => void} args.cancel
 * @param {(path: string) => string} args.pathToFileURL
 */
export const makeWorkerFacet = ({
  getDaemonBootstrap,
  pathToFileURL,
  cancel,
}) => {
  return Far('EndoWorkerFacet', {
    terminate: async () => {
      console.error('Endo worker received terminate request');
      cancel(Error('terminate'));
    },

    /**
     * @param {string} source
     * @param {Array<string>} names
     * @param {Array<unknown>} values
     */
    evaluate: async (source, names, values) => {
      const compartment = new Compartment(
        harden({
          ...endowments,
          ...Object.fromEntries(
            names.map((name, index) => [name, values[index]]),
          ),
        }),
      );
      return compartment.evaluate(source);
    },

    /**
     * @param {string} path
     * @param {import('@endo/eventual-send').ERef<import('./types.js').EndoOutbox>} outboxP
     */
    importUnsafe0: async (path, outboxP) => {
      const url = pathToFileURL(path);
      const namespace = await import(url);
      return namespace.provide0(outboxP);
    },

    /**
     * @param {import('@endo/eventual-send').ERef<import('./types.js').EndoReadable>} readableP
     * @param {import('@endo/eventual-send').ERef<import('./types.js').EndoOutbox>} outboxP
     */
    importBundle0: async (readableP, outboxP) => {
      const bundleText = await E(readableP).text();
      const bundle = JSON.parse(bundleText);

      // We defer importing the import-bundle machinery to this in order to
      // avoid an up-front cost for workers that never use importBundle.
      const { importBundle } = await import('@endo/import-bundle');
      const namespace = await importBundle(bundle, {
        endowments,
      });
      return namespace.provide0(await outboxP);
    },
  });
};

/**
 * @param {import('./types.js').MignonicPowers} powers
 * @param {import('./types.js').Locator} locator
 * @param {string} uuid
 * @param {number | undefined} pid
 * @param {(error: Error) => void} cancel
 * @param {Promise<never>} cancelled
 */
export const main = async (powers, locator, uuid, pid, cancel, cancelled) => {
  console.error(`Endo worker started on pid ${pid}`);
  cancelled.catch(() => {
    console.error(`Endo worker exiting on pid ${pid}`);
  });

  const { pathToFileURL } = powers;

  const { reader, writer } = powers.connection;

  const workerFacet = makeWorkerFacet({
    // Behold: reference cycle
    // eslint-disable-next-line no-use-before-define
    getDaemonBootstrap: () => getBootstrap(),
    pathToFileURL,
    cancel,
  });

  const { closed, getBootstrap } = makeNetstringCapTP(
    'Endo',
    writer,
    reader,
    cancelled,
    workerFacet,
  );

  return Promise.race([cancelled, closed]);
};
