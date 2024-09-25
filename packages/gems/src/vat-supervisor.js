import { E } from '@endo/far';
import { M } from '@endo/patterns';
import { setupZone } from './zone.js';
import { installExtRefController } from './extref-controller.js';

// stores initialization scripts
// "registerIncubation" registers a script to be evaluated at every vat start
// "incubate" evals code in an environment that allows registering classes
const makeIncubationRegistry = (zone, getEndowments) => {
  const incubationRegistry = zone.mapStore('incubationRegistry');

  const incubate = (source, firstTime = true) => {
    const endowments = getEndowments();
    const compartment = new Compartment({ ...endowments, firstTime });
    return compartment.evaluate(source);
  };

  const loadIncubation = (name, firstTime = false) => {
    const { source } = incubationRegistry.get(name);
    return incubate(source, firstTime);
  }

  const loadAllIncubations = async () => {
    for (const name of incubationRegistry.keys()) {
      await loadIncubation(name);
    }
  }

  const registerIncubation = (name, source) => {
    incubationRegistry.init(name, harden({ source }));
    return loadIncubation(name, true);
  };

  return { incubate, registerIncubation, loadAllIncubations };
};

// stores class definitions
// "defineClass" defines a class in the zone
// "registerClass" registers a class definition for initialization at every vat start
//   its equivalent to "registerIncubation" where you register a class
const makeClassRegistry = (zone) => {
  const classRegistry = zone.mapStore('classRegistry');
  const classCache = new Map();

  const defineClass = (name, {
    interfaceGuards,
    initFn,
    methods,
  }) => {
    const exoClass = zone.exoClass(
      name,
      interfaceGuards,
      initFn,
      methods,
    );
    return exoClass;
  };

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
    const exoClass = defineClass(name, { interfaceGuards, initFn, methods });
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

  return { defineClass, registerClass, loadClasses };
};

export const makeVatSupervisor = (label, vatState, getRemoteExtRefController) => {
  const fakeStore = new Map(vatState);

  const { zone, flush, fakeVomKit } = setupZone(fakeStore);
  const store = zone.mapStore('store');

  const endowments = { E, M };
  const getEndowments = () => endowments;
  const { incubate, registerIncubation, loadAllIncubations } = makeIncubationRegistry(zone, getEndowments);
  const { defineClass, registerClass, loadClasses } = makeClassRegistry(zone);
  endowments.incubate = incubate;
  endowments.registerIncubation = registerIncubation;
  endowments.defineClass = defineClass;
  endowments.registerClass = registerClass;
  harden(endowments);

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

  const initialize = async () => {
    loadClasses();
    await loadAllIncubations();
  };

  const serializeState = () => {
    flush();
    return Array.from(fakeStore.entries());
  };

  return { initialize, zone, store, incubate, registerIncubation, registerClass, fakeStore, fakeVomKit, serializeState, flush, extRefController, captpOpts };
};
