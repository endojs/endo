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
 * @param {(error: Error) => void} args.cancel
 * @param {(path: string) => string} args.pathToFileURL
 */
export const makeWorkerFacet = ({ pathToFileURL, cancel }) => {
  const powerBox = Far('EndoPowerBox', {});

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
     */
    importUnsafe0: async path => {
      const url = pathToFileURL(path);
      const namespace = await import(url);
      return namespace.main0(powerBox);
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
    pathToFileURL,
    cancel,
  });

  const { closed } = makeNetstringCapTP(
    'Endo',
    writer,
    reader,
    cancelled,
    workerFacet,
  );

  return Promise.race([cancelled, closed]);
};
