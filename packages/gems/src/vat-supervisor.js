import { E } from '@endo/far';
import { M } from '@endo/patterns';
import { setupZone } from './zone.js';

// stores initialization scripts
// "registerIncubation" registers a script to be evaluated at every vat start
// "incubate" evals code in an environment that allows registering classes
const makeIncubationRegistry = (zone, getEndowments) => {
  const incubationRegistry = zone.mapStore('incubationRegistry');
  const incubationStore = zone.mapStore('incubationStore');

  const incubate = (source, firstTime = true) => {
    const endowments = getEndowments();
    const compartment = new Compartment({ ...endowments, firstTime });
    return compartment.evaluate(source);
  };

  const loadIncubation = (name, firstTime = false) => {
    const { source } = incubationRegistry.get(name);
    return incubate(source, firstTime);
  };

  const loadAllIncubations = async () => {
    for (const name of incubationRegistry.keys()) {
      await loadIncubation(name);
    }
  };

  const registerIncubation = (name, source) => {
    incubationStore.init(name, harden({}));

    incubationRegistry.init(name, harden({ source }));
    return loadIncubation(name, true);
  };

  const updateIncubationEndowments = (name, endowment) => {
    const endowments = incubationStore.get(name);
    incubationStore.set(name, harden({ ...endowments, ...endowment }));
  };

  return { incubate, registerIncubation, loadAllIncubations };
};

// stores class definitions
// "defineClass" defines a class in the zone
// "registerClass" registers a class definition for initialization at every vat start
//   its equivalent to "registerIncubation" where you register a class
const makeClassRegistry = zone => {
  const classRegistry = zone.mapStore('classRegistry');
  const classCache = new Map();

  const defineClass = (name, { interfaceGuards, initFn, methods }) => {
    const exoClass = zone.exoClass(name, interfaceGuards, initFn, methods);
    return exoClass;
  };

  const loadClass = name => {
    if (classCache.has(name)) {
      return classCache.get(name);
    }
    const { builderSource } = classRegistry.get(name);
    const builder = new Compartment().evaluate(builderSource);
    const { interfaceGuards, initFn, methods } = builder({ E, M, name });
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
    classRegistry.init(
      name,
      harden({
        name,
        builderSource,
      }),
    );
    return loadClass(name);
  };

  return { defineClass, registerClass, loadClasses };
};

export const makeVatSupervisor = (label, vatState) => {
  const fakeStore = new Map(vatState);

  const { zone, flush, fakeVomKit } = setupZone(fakeStore);
  const store = zone.mapStore('store');

  const endowments = {
    // See https://github.com/Agoric/agoric-sdk/issues/9515
    assert: globalThis.assert,
    console,
    E,
    // Far,
    // makeExo,
    M,
    TextEncoder,
    TextDecoder,
    URL,
    // Allow non-deterministic sources
    Math,
    Date,
  };

  const getEndowments = () => endowments;
  const { incubate, registerIncubation, loadAllIncubations } =
    makeIncubationRegistry(zone, getEndowments);
  const { defineClass, registerClass, loadClasses } = makeClassRegistry(zone);

  endowments.incubate = incubate;
  endowments.registerIncubation = registerIncubation;
  endowments.defineClass = defineClass;
  endowments.registerClass = registerClass;
  // temp
  endowments.fetch = fetch;
  harden(endowments);

  const initialize = async () => {
    loadClasses();
    await loadAllIncubations();
  };

  const serializeState = () => {
    flush();
    return Array.from(fakeStore.entries());
  };

  return {
    initialize,
    zone,
    store,
    incubate,
    registerIncubation,
    registerClass,
    fakeStore,
    fakeVomKit,
    serializeState,
    flush,
  };
};
