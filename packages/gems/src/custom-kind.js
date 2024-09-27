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
