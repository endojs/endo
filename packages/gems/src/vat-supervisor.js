
/* global globalThis */
// @ts-check
/// <reference types="ses"/>

import { E } from '@endo/far';
import { M } from '@endo/patterns';
import { setupZone } from './zone.js';
import { installExtRefController } from './extref-controller.js';


const makeClassRegistry = (zone) => {
  const classRegistry = zone.mapStore('classRegistry');
  const classCache = new Map();

  const loadClass = name => {
    if (classCache.has(name)) {
      return classCache.get(name);
    }
    const { builderSource } = classRegistry.get(name);
    const builder = new Compartment().evaluate(builderSource);
    const {
      interfaceGuards,
      initFn,
      methods,
    } = builder({ E, M, name });
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
      // console.log(`>> ${label} exportHook`, val, slot)
      // we eagerly hold this value
      extRefController.registerHold(val);
    },
    importHook (val, slot) {
      // console.log(`<< ${label} importHook`, val, slot)
      // establish durability for this imported reference
      extRefController.registerExtRef(val).catch(err => {
        console.error(`failed to registerExtRef for catptp slot ${slot}`, err)
      })
    },
    gcHook (val, slot) {
      // console.log(`-- ${label} gcHook`, val, slot)
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
