/* global setTimeout */
// @ts-check
/// <reference types="ses"/>

import { makeVatSupervisor } from './vat-supervisor.js';
import { makeDurableCaptp } from './durable-captp.js';

export const startVatSupervisorProcess = async (
  label,
  vatState,
  powers,
  pid,
  cancel,
  cancelled,
) => {
  const vatSupervisor = makeVatSupervisor(label, vatState);
  await vatSupervisor.initialize();

  /**
   * @typedef {ReturnType<makeWorkerFacet>} WorkerBootstrap
   */

  const makeWorkerFacet = () => {
    const { zone, serializeState } = vatSupervisor;

    return zone.exo('EndoWorkerFacetForDaemon', undefined, {
      ping() {
        return 'pong';
      },

      nextCrank() {
        return new Promise(resolve => {
          setTimeout(resolve, 0);
        });
      },

      incubate(source) {
        return vatSupervisor.incubate(source);
      },

      registerIncubation(name, code) {
        return vatSupervisor.registerIncubation(name, code);
      },

      serializeState() {
        return serializeState();
      },

      terminate() {
        console.error('Endo worker received terminate request');
        cancel(Error('terminate'));
      },
    });
  };

  console.error(`Endo worker started on pid ${pid}`);
  cancelled.catch(() => {
    console.error(`Endo worker exiting on pid ${pid}`);
  });

  const workerFacet = makeWorkerFacet();

  const captpZone = vatSupervisor.zone.subZone('captp');
  const { closed, getBootstrap: _getVatSideKernel } = makeDurableCaptp(
    'Endo',
    captpZone,
    vatSupervisor.fakeVomKit,
    powers.connection,
    cancelled,
    workerFacet,
  );

  return Promise.race([cancelled, closed]);
};
