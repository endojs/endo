import { makeMapStoreProxyObj } from './mapstore-proxy-obj.js';

// TODO: import?
const makeBaseRef = (kindID, id, isDurable) => {
  return `o+${isDurable ? 'd' : 'v'}${kindID}/${id}`;
};

/**
 * Creates a custom durable kind with specified make, reanimate, and optional cleanup functions.
 *
 * @param {object} fakeVomKit - vomKit interface.
 * @param {object} zone - A durable zone exclusive to this kind.
 * @param {object} options - Options for creating the custom durable kind.
 * @param {(Object, ...any) => any} options.make - A function to create a new instance.
 * @param {(object, string) => any} options.reanimate - A function to reanimate an existing instance.
 * @param {(object, string) => boolean} [options.cleanup] - An optional function to clean up an instance.
 * @returns {Function} - A function to create new instances of the custom durable kind.
 */
export const makeCustomDurableKindWithContext = (
  fakeVomKit,
  zone,
  {
    make: customMake,
    reanimate: customReanimate,
    cleanup: customCleanup = undefined,
  },
) => {
  if (!customMake) {
    throw new Error('makeCustomDurableKindWithContext - "make" function is required');
  }
  if (!customReanimate) {
    throw new Error('makeCustomDurableKindWithContext - "reanimate" function is required');
  }
  const { vrm, fakeStuff } = fakeVomKit;
  const store = zone.mapStore('controller');
  const instanceData = zone.mapStore('data');

  // initialize the kindID and nextInstanceID
  if (!store.has('kindID')) {
    store.init('kindID', `${vrm.allocateNextID('exportID')}`);
    store.init('nextInstanceID', 1n);
  }
  const kindID = store.get('kindID');

  const takeNextInstanceID = () => {
    const nextInstanceID = store.get('nextInstanceID');
    store.set('nextInstanceID', nextInstanceID + 1n);
    return nextInstanceID;
  };

  const make = (...args) => {
    const id = takeNextInstanceID();
    const instanceSlot = makeBaseRef(kindID, id, true);
    const context = {};
    const value = customMake(context, ...args);
    // store context
    instanceData.init(instanceSlot, harden(context));
    // register the slot with the value, so it can be stored
    fakeStuff.registerEntry(instanceSlot, value, false);
    return value;
  };

  const reanimate = instanceSlot => {
    const context = instanceData.get(instanceSlot);
    return customReanimate(context, instanceSlot);
  };

  const cleanup = instanceSlot => {
    const context = instanceData.get(instanceSlot);
    const moreCleanupNeed = customCleanup?.(context, instanceSlot) || false;
    instanceData.delete(instanceSlot);
    return moreCleanupNeed;
  };

  // register ExtRef kind
  vrm.registerKind(kindID, reanimate, cleanup, true);

  return make;
};

/**
 * Creates a custom durable kind with specified make, reanimate, and optional cleanup functions.
 * These functions are provided with a zone exclusive to the instance.
 *
 * @param {object} fakeVomKit - vomKit interface.
 * @param {object} zone - A durable zone exclusive to this kind.
 * @param {object} options - Options for creating the custom durable kind.
 * @param {(Object, ...any) => any} options.make - A function to create a new instance.
 * @param {(object, string) => any} options.reanimate - A function to reanimate an existing instance.
 * @param {(object, string) => boolean} [options.cleanup] - An optional function to clean up an instance.
 * @returns {Function} - A function to create new instances of the custom durable kind.
 */
export const makeCustomDurableKindWithZone = (
  fakeVomKit,
  zone,
  {
    make: customMake,
    reanimate: customReanimate,
    cleanup: customCleanup = undefined,
  },
) => {
  if (!customMake) {
    throw new Error('makeCustomDurableKindWithZone - "make" function is required');
  }
  if (!customReanimate) {
    throw new Error('makeCustomDurableKindWithZone - "reanimate" function is required');
  }

  const { vrm, fakeStuff } = fakeVomKit;
  const store = zone.mapStore('controller');
  const dataZone = zone.subZone('instances');
  const zoneForInstance = new Map();

  // initialize the kindID and nextInstanceID
  if (!store.has('kindID')) {
    store.init('kindID', `${vrm.allocateNextID('exportID')}`);
    store.init('nextInstanceID', 1n);
  }
  const kindID = store.get('kindID');

  const takeNextInstanceID = () => {
    const nextInstanceID = store.get('nextInstanceID');
    store.set('nextInstanceID', nextInstanceID + 1n);
    return nextInstanceID;
  };

  const getZoneForInstance = instanceSlot => {
    if (!zoneForInstance.has(instanceSlot)) {
      const instanceZone = dataZone.subZone(instanceSlot);
      zoneForInstance.set(instanceSlot, instanceZone);
    }
    return zoneForInstance.get(instanceSlot);
  };

  const make = (...args) => {
    const id = takeNextInstanceID();
    const instanceSlot = makeBaseRef(kindID, id, true);
    const instanceZone = getZoneForInstance(instanceSlot);
    const value = customMake(instanceZone, ...args);
    // register the slot with the value, so it can be stored
    fakeStuff.registerEntry(instanceSlot, value, false);
    return value;
  };

  const reanimate = instanceSlot => {
    const instanceZone = getZoneForInstance(instanceSlot);
    return customReanimate(instanceZone, instanceSlot);
  };

  const cleanup = instanceSlot => {
    const instanceZone = getZoneForInstance(instanceSlot);
    const moreCleanupNeed =
      customCleanup?.(instanceZone, instanceSlot) || false;
    // TODO: No provided way to delete a zone.
    zoneForInstance.delete(instanceSlot);
    return moreCleanupNeed;
  };

  // register ExtRef kind
  vrm.registerKind(kindID, reanimate, cleanup, true);

  return make;
};

/**
 * Creates a custom durable kind with specified make, reanimate, and optional cleanup functions.
 * These functions are provided with a mapStore exclusive to the instance.
 *
 * @param {object} fakeVomKit - vomKit interface.
 * @param {object} zone - A durable zone exclusive to this kind.
 * @param {object} options - Options for creating the custom durable kind.
 * @param {(Object, ...any) => any} options.make - A function to create a new instance.
 * @param {(object, string) => any} options.reanimate - A function to reanimate an existing instance.
 * @param {(object, string) => boolean} [options.cleanup] - An optional function to clean up an instance.
 * @returns {Function} - A function to create new instances of the custom durable kind.
 */
export const makeCustomDurableKindWithMapStore = (
  fakeVomKit,
  zone,
  {
    make: customMake,
    reanimate: customReanimate,
    cleanup: customCleanup = undefined,
  },
) => {
  const storeForInstanceZone = new Map();
  const getStoreForInstanceZone = instanceZone => {
    if (!storeForInstanceZone.has(instanceZone)) {
      const store = instanceZone.mapStore('store');
      storeForInstanceZone.set(instanceZone, store);
    }
    return storeForInstanceZone.get(instanceZone);
  };

  const makeWithStore = (instanceZone, ...args) => {
    const store = getStoreForInstanceZone(instanceZone);
    return customMake(store, ...args);
  };
  const reanimateWithStore = (instanceZone, instanceSlot) => {
    const store = getStoreForInstanceZone(instanceZone);
    return customReanimate(store, instanceSlot);
  };
  const cleanupWithStore = (instanceZone, instanceSlot) => {
    const store = getStoreForInstanceZone(instanceZone);
    const moreCleanupNeed = customCleanup?.(store, instanceSlot) || false;
    storeForInstanceZone.delete(instanceZone);
    // NOTE: makeCustomDurableKindWithZone cant clear the zone, so we clear the store here
    store.clear();
    return moreCleanupNeed;
  };
  return makeCustomDurableKindWithZone(fakeVomKit, zone, {
    make: makeWithStore,
    reanimate: reanimateWithStore,
    cleanup: cleanupWithStore,
  });
};

/**
 * Creates a custom durable kind with specified make, reanimate, and optional cleanup functions.
 * These functions are provided with a mapStore based Proxy object exclusive to the instance.
 *
 * @param {object} fakeVomKit - vomKit interface.
 * @param {object} zone - A durable zone exclusive to this kind.
 * @param {object} options - Options for creating the custom durable kind.
 * @param {(Object, ...any) => any} options.make - A function to create a new instance.
 * @param {(object, string) => any} options.reanimate - A function to reanimate an existing instance.
 * @param {(object, string) => boolean} [options.cleanup] - An optional function to clean up an instance.
 * @returns {Function} - A function to create new instances of the custom durable kind.
 */
export const makeCustomDurableKindWithStoreObj = (
  fakeVomKit,
  zone,
  {
    make: customMake,
    reanimate: customReanimate,
    cleanup: customCleanup = undefined,
  },
) => {
  // Note: we don't reuse the Proxy obj here, because its just an interface to the store
  const makeWithStoreObj = (store, ...args) => {
    return customMake(makeMapStoreProxyObj(store), ...args);
  };
  const reanimateWithStoreObj = (store, instanceSlot) => {
    return customReanimate(makeMapStoreProxyObj(store), instanceSlot);
  };
  const cleanupWithStoreObj = (store, instanceSlot) => {
    const moreCleanupNeed =
      customCleanup?.(makeMapStoreProxyObj(store), instanceSlot) || false;
    return moreCleanupNeed;
  };
  return makeCustomDurableKindWithMapStore(fakeVomKit, zone, {
    make: makeWithStoreObj,
    reanimate: reanimateWithStoreObj,
    cleanup: cleanupWithStoreObj,
  });
};

const defaultDFInitFn = (_state, ..._args) => {};
const defaultDFMakeFn = _state => ({});
const defaultDFCleanupFn = _state => false;

export const makeDefineDurableFactory = (fakeVomKit, zone) => {
  const defineDurableFactory = ({
    init: initFn = defaultDFInitFn,
    make: makeFn = defaultDFMakeFn,
    cleanup: cleanupFn = defaultDFCleanupFn,
  } = {}) => {
    if (makeFn === defaultDFMakeFn) {
      throw new Error('makeDurableFactory - "make" function is required');
    }
    const makeWithInitialization = (state, ...args) => {
      initFn(state, ...args);
      return makeFn(state);
    };
    return makeCustomDurableKindWithStoreObj(fakeVomKit, zone, {
      make: makeWithInitialization,
      reanimate: state => makeFn(state),
      cleanup: state => cleanupFn(state),
    });
  };
  return defineDurableFactory;
};
