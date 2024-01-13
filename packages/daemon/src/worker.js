// @ts-check
/// <reference types="ses"/>

import { E, Far } from '@endo/far';
import { makeNetstringCapTP } from './connection.js';

const endowments = harden({
  assert,
  console,
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
 */
export const makeWorkerFacet = ({ getDaemonBootstrap, cancel }) => {
  return Far('EndoWorkerFacet', {
    terminate: async () => {
      console.error('Endo worker received terminate request');
      cancel(Error('terminate'));
    },

    /**
     * @param {string} source
     * @param {Array<string>} names
     * @param {Array<unknown>} values
     * @param {Promise<never>} cancelled
     */
    evaluate: async (source, names, values, cancelled) => {
      const compartment = new Compartment(
        harden({
          ...endowments,
          cancelled,
          ...Object.fromEntries(
            names.map((name, index) => [name, values[index]]),
          ),
        }),
      );
      return compartment.evaluate(source);
    },

    /**
     * @param {string} specifier
     * @param {unknown} powersP
     * @param {unknown} contextP
     */
    makeUnsafe: async (specifier, powersP, contextP) => {
      const namespace = await import(specifier);
      return namespace.make(powersP, contextP);
    },

    /**
     * @param {import('@endo/eventual-send').ERef<import('./types.js').EndoReadable>} readableP
     * @param {unknown} powersP
     * @param {unknown} contextP
     */
    makeBundle: async (readableP, powersP, contextP) => {
      const bundleText = await E(readableP).text();
      const bundle = JSON.parse(bundleText);

      // We defer importing the import-bundle machinery to this in order to
      // avoid an up-front cost for workers that never use importBundle.
      const { importBundle } = await import('@endo/import-bundle');
      const namespace = await importBundle(bundle, {
        endowments,
      });
      return namespace.make(powersP, contextP);
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

  const { reader, writer } = powers.connection;

  const workerFacet = makeWorkerFacet({
    // Behold: reference cycle
    // eslint-disable-next-line no-use-before-define
    getDaemonBootstrap: () => getBootstrap(),
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
