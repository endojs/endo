
/* global globalThis setTimeout */
// @ts-check
/// <reference types="ses"/>

import { makeExo } from '@endo/exo';
import { E, Far } from '@endo/far';
import { M } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';
import { makeNetstringCapTP } from './daemon-vendor/connection.js';
import { makeVatSupervisor } from './vat-supervisor.js';

export const startVatSupervisorProcess = async (label, vatState, powers, pid, cancel, cancelled) => {

  const { promise: vatSideKernelP, resolve: setVatSideKernel } = makePromiseKit();
  const getRemoteExtRefController = () => E(vatSideKernelP).getExtRefController();
  const vatSupervisor = makeVatSupervisor(label, vatState, getRemoteExtRefController);
  await vatSupervisor.initialize();

  const endowments = harden({
    // See https://github.com/Agoric/agoric-sdk/issues/9515
    assert: globalThis.assert,
    console,
    E,
    Far,
    makeExo,
    M,
    TextEncoder,
    TextDecoder,
    URL,
  });

  /**
   * @typedef {ReturnType<makeWorkerFacet>} WorkerBootstrap
   */

  const makeWorkerFacet = () => {
    const { zone, serializeState } = vatSupervisor;
    
    return zone.exo('EndoWorkerFacetForDaemon', undefined, {

      ping () {
        return 'pong';
      },

      nextCrank () {
        return new Promise(resolve => {
          setTimeout(resolve, 0);
        });
      },

      getExtRefController() {
        return vatSupervisor.extRefController;
      },

      incubate (source) {
        return vatSupervisor.incubate(source);
      },

      registerIncubation (name, recipe) {
        return vatSupervisor.registerIncubation(name, recipe);
      },

      serializeState () {
        return serializeState();
      },

      terminate () {
        console.error('Endo worker received terminate request');
        cancel(Error('terminate'));
      },

    });
  };

  /*
  * @param {MignonicPowers} powers
  * @param {number | undefined} pid
  * @param {(error: Error) => void} cancel
  * @param {Promise<never>} cancelled
  */
  console.error(`Endo worker started on pid ${pid}`);
  cancelled.catch(() => {
    console.error(`Endo worker exiting on pid ${pid}`);
  });

  const { reader, writer } = powers.connection;

  const workerFacet = makeWorkerFacet();

  const { closed, getBootstrap: getVatSideKernel } = makeNetstringCapTP(
    'Endo',
    writer,
    reader,
    cancelled,
    workerFacet,
    vatSupervisor.captpOpts,
  );

  setVatSideKernel(getVatSideKernel());

  return Promise.race([cancelled, closed]);
};
