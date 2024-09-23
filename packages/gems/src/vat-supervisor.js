
/* global globalThis */
// @ts-check
/// <reference types="ses"/>

import { makeExo } from '@endo/exo';
import { E, Far } from '@endo/far';
import { M } from '@endo/patterns';
import { makeNetstringCapTP } from './daemon-vendor/connection.js';
import { makePromiseKit } from '@endo/promise-kit';
import { setupZone } from './zone.js';
import { installExtRefController } from './extref-controller.js';

const initEmpty = () => harden({});

/*
TODO:
  - [x] ensure the EndoWorkerFacetForDaemon is loaded
  - [ ] make class registry durable
*/

const makeClassRegistry = (zone) => {
  const classRegistry = zone.mapStore('classRegistry');
  const classCache = new Map();

  const loadClass = name => {
    if (classCache.has(name)) {
      return classCache.get(name);
    }
    const { builderSource } = classRegistry.get(name);
    const builder = new Compartment().evaluate(builderSource);
    const { interfaceGuards, initFn, methods } = builder();
    const exoClass = zone.exoClass(
      name,
      interfaceGuards,
      initFn,
      methods,
    );
    classCache.set(name, exoClass);
    return exoClass;
  };

  const loadClasses = () => {
    for (const name of classRegistry.keys()) {
      loadClass(name);
    }
  };

  const registerClass = (name, builderSource) => {
    // TODO: currently we require all names to be unique
    classRegistry.init(name, harden({
      name,
      builderSource,
    }));
    return loadClass(name);
  };

  return { registerClass, loadClasses };
};

export const makeVatSupervisor = (label, vatState, getRemoteExtRefController) => {
  const fakeStore = new Map(vatState);

  const { zone, flush, fakeVomKit } = setupZone(fakeStore);
  const store = zone.mapStore('store');
  const { registerClass, loadClasses } = makeClassRegistry(zone);

  const extRefZone = zone.subZone('externalRefs');
  const extRefController = installExtRefController('vat-supervisor', extRefZone, fakeVomKit, getRemoteExtRefController);

  const captpOpts = {
    gcImports: true,
    exportHook (val, slot) {
      console.log(`>> ${label} exportHook`, val, slot)
      // we eagerly hold this value
      extRefController.registerHold(val);
    },
    importHook (val, slot) {
      console.log(`<< ${label} importHook`, val, slot)
      // establish durability for this imported reference
      extRefController.registerExtRef(val).catch(err => {
        console.error(`failed to registerExtRef for catptp slot ${slot}`, err)
      })
    },
    gcHook (val, slot) {
      console.log(`-- ${label} gcHook`, val, slot)
      // we can release this value
      // TODO: this could get released if the captp WeakMap is not vomkit aware
      // actually idk how to verify when this can be released,
      // maybe when extRefController no longer has any references to it? 
      // extRefController.releaseHold(val);
    },
  }

  loadClasses();

  const serializeState = () => {
    flush();
    return Array.from(fakeStore.entries());
  };

  return { zone, store, registerClass, fakeStore, fakeVomKit, serializeState, flush, extRefController, captpOpts };
};

export const startVatSupervisorProcess = (label, vatState, powers, pid, cancel, cancelled) => {

  const { promise: vatSideKernelP, resolve: setVatSideKernel } = makePromiseKit();
  const getRemoteExtRefController = () => E(vatSideKernelP).getExtRefController();
  const vatSupervisor = makeVatSupervisor(label, vatState, getRemoteExtRefController);

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

  const normalizeFilePath = path => {
    // Check if the path is already a file URL.
    if (path.startsWith('file://')) {
      return path;
    }
    // Windows path detection and conversion (look for a drive letter at the start).
    const isWindowsPath = /^[a-zA-Z]:/.test(path);
    if (isWindowsPath) {
      // Correctly format the Windows path with three slashes.
      return `file:///${path}`;
    }
    // For non-Windows paths, prepend the file protocol.
    return `file://${path}`;
  };

  /**
   * @typedef {ReturnType<makeWorkerFacet>} WorkerBootstrap
   */

  /**
   * @param {object} args
   * @param {any} args.vatSupervisor
   * @param {(error: Error) => void} args.cancel
   */
  const makeWorkerFacet = ({ vatSupervisor, cancel }) => {
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

      terminate () {
        console.error('Endo worker received terminate request');
        cancel(Error('terminate'));
      },

      incubateGem (source) {
        const { registerClass } = vatSupervisor;
        const compartment = new Compartment(
          harden({
            ...endowments,
          }),
        );
        const actionFn = compartment.evaluate(source);
        const powers = {
          registerClass,
        };
        const result = actionFn(powers);
        console.log('incubateGem result', result);
        return result;
      },

      serializeState () {
        return serializeState();
      },

      // /**
      //  * @param {string} source
      //  * @param {Array<string>} names
      //  * @param {Array<unknown>} values
      //  * @param {string} $id
      //  * @param {Promise<never>} $cancelled
      //  */
      // evaluate: async (source, names, values, $id, $cancelled) => {
      //   const compartment = new Compartment(
      //     harden({
      //       ...endowments,
      //       $id,
      //       $cancelled,
      //       ...Object.fromEntries(
      //         names.map((name, index) => [name, values[index]]),
      //       ),
      //       getSuperVisor: () => {
      //         return globalThis.VatSupervisor;
      //       }
      //     }),
      //   );
      //   return compartment.evaluate(source);
      // },

      // /**
      //  * @param {string} specifier
      //  * @param {Promise<unknown>} powersP
      //  * @param {Promise<unknown>} contextP
      //  */
      // makeUnconfined: async (specifier, powersP, contextP) => {
      //   // Windows absolute path includes drive letter which is confused for
      //   // protocol specifier. So, we reformat the specifier to include the
      //   // file protocol.
      //   const specifierUrl = normalizeFilePath(specifier);
      //   const namespace = await import(specifierUrl);
      //   return namespace.make(powersP, contextP);
      // },

      // /*
      // * @param {ERef<EndoReadable>} readableP
      // * @param {Promise<unknown>} powersP
      // * @param {Promise<unknown>} contextP
      // */
      // makeBundle: async (readableP, powersP, contextP) => {
      //   const bundleText = await E(readableP).text();
      //   const bundle = JSON.parse(bundleText);

      //   // We defer importing the import-bundle machinery to this in order to
      //   // avoid an up-front cost for workers that never use importBundle.
      //   const { importBundle } = await import('@endo/import-bundle');
      //   const namespace = await importBundle(bundle, {
      //     endowments,
      //   });
      //   return namespace.make(powersP, contextP);
      // },

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

  const workerFacet = makeWorkerFacet({
    vatSupervisor,
    cancel,
  });
  console.log('workerFacet', workerFacet);
  console.log('worker inside ping', workerFacet.ping());

  const { closed, getBootstrap: getVatSideKernel } = makeNetstringCapTP(
    'Endo',
    writer,
    reader,
    cancelled,
    workerFacet,
    vatSupervisor.captpOpts,
  );

  setVatSideKernel(getVatSideKernel());

  E(getVatSideKernel()).ping().then(r => console.log('vat inside ping', r));

  return Promise.race([cancelled, closed]);
};
