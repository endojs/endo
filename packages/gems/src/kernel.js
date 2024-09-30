// @ts-check
import '@agoric/store/exported.js';

import { E } from '@endo/captp';
import { makePromiseKit } from '@endo/promise-kit';
import { makeVat } from './vats/node-vat/outside.js';
import { makeVatSupervisor } from './vat-supervisor.js';

const initKernel = kernelVatSupervisor => {
  // always define class
  const makeKernelFacet = kernelVatSupervisor.zone.exoClass(
    'VatSideKernelFacet',
    undefined,
    () => harden({}),
    {
      ping() {
        return 'pong';
      },
    },
  );
  // make only on first start
  if (!kernelVatSupervisor.store.has('kernel')) {
    const vatSideKernelFacet = makeKernelFacet();
    kernelVatSupervisor.store.init('kernel', vatSideKernelFacet);
    kernelVatSupervisor.store.init('vat-state', harden([]));
  }
};

export const makeKernel = async (kernelVatState = []) => {
  const vatSupervisor = makeVatSupervisor('kernel', kernelVatState);
  await vatSupervisor.initialize();
  initKernel(vatSupervisor);
  const vatSideKernelFacet = vatSupervisor.store.get('kernel');

  const { reject: terminateVat, promise: vatCancelled } = makePromiseKit();
  const vatState = vatSupervisor.store.get('vat-state');

  const captpOpts = {};
  const { workerFacet, workerTerminated } = makeVat(
    vatSupervisor.zone,
    vatSupervisor.fakeVomKit,
    vatSideKernelFacet,
    vatState,
    captpOpts,
    /** @type Promise<never> */ (vatCancelled),
  );
  const { store, serializeState } = vatSupervisor;

  const terminateChildVats = async () => {
    await E(workerFacet).nextCrank();
    await E(workerFacet).nextCrank();
    const newVatState = await E(workerFacet).serializeState();
    store.set('vat-state', newVatState);
    terminateVat(new Error('kernel shutdown'));
  };

  const shutdown = async () => {
    await terminateChildVats();
  };

  return {
    store,
    vatSupervisor,
    workerFacet,
    workerTerminated,
    shutdown,
    serializeState,
  };
};
