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
 * @param {() => any} _getDaemonBootstrap
 * @param {(error: Error) => void} cancel
 */
const makeWorkerFacet = (_getDaemonBootstrap, cancel) => {
  return Far('EndoWorkerFacet', {
    terminate: async () => {
      console.error('Endo worker received terminate request');
      cancel(new Error('terminate'));
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
  });
};

/**
 * @param {import('./types.js').MignonicPowers} powers
 * @param {import('../index.js').Locator} locator
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

  const { reader, writer } = powers.connection;

  // Behold: reference cycle
  // eslint-disable-next-line no-use-before-define
  const workerFacet = makeWorkerFacet(() => getBootstrap(), cancel);

  const { closed, getBootstrap } = makeNetstringCapTP(
    'Endo',
    writer,
    reader,
    cancelled,
    workerFacet,
  );

  return Promise.race([cancelled, closed]);
};
