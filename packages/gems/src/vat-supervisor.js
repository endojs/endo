import { E, Far } from '@endo/far';
import { M } from '@endo/patterns';
import { setupZone } from './zone.js';
import { makeDefineDurableFactory } from './custom-kind.js';

const incubationsKey = 'incubations';

// stores initialization scripts
// "registerIncubation" registers a script to be evaluated at every vat start
// "incubate" evals code in an environment that allows registering classes
const makeIncubationRegistry = (label, zone, getEnvEndowments) => {
  // dataStore[incubateKey] stores the incubation order.
  // mapStore iteration order does not follow insertion order.
  const dataStore = zone.mapStore('data');
  const incubationRegistry = zone.mapStore('incubationRegistry');
  if (!dataStore.has(incubationsKey)) {
    dataStore.init(incubationsKey, harden([]));
  }

  const incubate = (source, endowments, firstTime = true) => {
    const envEndowments = getEnvEndowments();
    const compartment = new Compartment({
      ...envEndowments,
      ...endowments,
      firstTime,
    });
    return compartment.evaluate(source);
  };

  const loadIncubation = (incubationRecord, firstTime = false) => {
    const { name, source, endowments } = incubationRecord;
    try {
      return incubate(source, endowments, firstTime);
    } catch (err) {
      console.error(`Error incubating ${name}:`, err);
      throw err;
    }
  };

  const loadAllIncubations = async () => {
    const incubationOrder = dataStore.get(incubationsKey);
    for (const name of incubationOrder) {
      const incubationRecord = incubationRegistry.get(name);
      await loadIncubation(incubationRecord);
    }
  };

  const registerIncubation = (name, source, endowments) => {
    if (incubationRegistry.has(name)) {
      throw new Error(`Incubation ${name} already registered`);
    }
    const incubationRecord = harden({ name, source, endowments });
    incubationRegistry.init(name, incubationRecord);
    dataStore.set(
      incubationsKey,
      harden([...dataStore.get(incubationsKey), name]),
    );
    return loadIncubation(incubationRecord, true);
  };

  return { incubate, registerIncubation, loadAllIncubations };
};

// stores class definitions
// "defineClass" defines a class in the zone
// "registerClass" registers a class definition for initialization at every vat start
//   its equivalent to "registerIncubation" where you register a class
const makeClassRegistry = (zone, fakeVomKit) => {
  const { fakeStuff } = fakeVomKit;
  const classRegistry = zone.mapStore('classRegistry');
  const classCache = new Map();

  const defineClass = (name, { interfaceGuards, initFn, methods }) => {
    const makeExoClass = zone.exoClass(name, interfaceGuards, initFn, methods);
    const farMakeExoClass = Far(`makeExoClass-${name}`, makeExoClass);
    // determine the kindSlot by creating an ephemeral instance
    // TODO: dont do this, just find the kindSlot
    const testValue = farMakeExoClass();
    const testSlot = fakeStuff.getSlotForVal(testValue);
    const kindSlot = testSlot.split('/')[0];
    fakeStuff.registerEntry(kindSlot, farMakeExoClass, false);
    return farMakeExoClass;
  };

  // const jsClassToExoClass = new Map();
  const defineJsClass = jsClass => {
    const methods = jsClass.prototype;
    return defineClass(jsClass.name, {
      interfaceGuards: methods.implements,
      initFn: methods.init,
      methods,
    });
  };
  // const getJsClassExo = jsClass => {
  //   if (jsClassToExoClass.has(jsClass)) {
  //     return jsClassToExoClass.get(jsClass);
  //   }
  //   const makeJsClassExo = defineJsClass(jsClass);
  //   jsClassToExoClass.set(jsClass, makeJsClassExo);
  //   return makeJsClassExo;
  // };
  // const DurableBaseClass = harden(class {
  //   constructor(...args) {
  //     const descendantClass = this.constructor;
  //     const makeJsClassExo = getJsClassExo(descendantClass)
  //     return makeJsClassExo(...args);
  //   }
  // });

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

  const defineDurableFactory = makeDefineDurableFactory(fakeVomKit, zone);

  return {
    defineClass,
    defineJsClass,
    registerClass,
    loadClasses,
    defineDurableFactory,
  };
};

export const makeVatSupervisor = (label, vatState) => {
  const fakeStore = new Map(vatState);

  const { zone, flush, fakeVomKit } = setupZone(fakeStore);
  const store = zone.mapStore('store');

  const envEndowments = {
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

  const getEnvEndowments = () => envEndowments;
  const { incubate, registerIncubation, loadAllIncubations } =
    makeIncubationRegistry(label, zone, getEnvEndowments);
  const {
    defineClass,
    defineJsClass,
    DurableBaseClass,
    registerClass,
    loadClasses,
    defineDurableFactory,
  } = makeClassRegistry(zone, fakeVomKit);

  envEndowments.incubate = incubate;
  envEndowments.registerIncubation = registerIncubation;
  envEndowments.defineJsClass = defineJsClass;
  envEndowments.DurableBaseClass = DurableBaseClass;
  envEndowments.defineClass = defineClass;
  envEndowments.registerClass = registerClass;
  envEndowments.defineDurableFactory = defineDurableFactory;

  // temp
  envEndowments.fetch = fetch;
  harden(envEndowments);

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
    defineClass,
    defineJsClass,
    fakeStore,
    fakeVomKit,
    serializeState,
    flush,
  };
};
