import { E } from "@endo/captp";


// TODO: import?
const makeBaseRef = (kindID, id, isDurable) => {
  return `o+${isDurable ? 'd' : 'v'}${kindID}/${id}`;
}

  /**
   * @param {string} label
   * @param {import('@agoric/zone').Zone} zone
   * @param {any} fakeVomKit
   * @param {any} getRemoteExtRefController
   */
export const installExtRefController = (label, zone, fakeVomKit, getRemoteExtRefController) => {
  const store = zone.mapStore('controller');
  const data = zone.mapStore('data');
  const heldValues = zone.mapStore('holds');
  const { vrm, fakeStuff } = fakeVomKit;
  const isDurable = true;

  if (!store.has('kindID')) {
    store.init('kindID', `${vrm.allocateNextID('exportID')}`);
    store.init('nextInstanceID', 1n);
  }
  const kindID = store.get('kindID');

  const getAndIncrementNextInstanceID = () => {
    const nextInstanceID = store.get('nextInstanceID');
    store.set('nextInstanceID', nextInstanceID + 1n);
    return nextInstanceID;
  }

  const reanimate = (slot) => {
    console.log(`% ${label} reanimate extRef`, slot)
    const context = data.get(slot);
    const { ref: remoteSlot } = context;
    // TODO: durable zone marshall requires this to be remoteable
    return E(getRemoteExtRefController()).lookupHold(remoteSlot);
  }
  const cleanup = (slot) => {
    console.log(`- ${label} cleanup extRef`, slot)
    data.delete(slot);
    // indicate no further GC needed
    return false;
  }
  // associates a captp imported value with a slot that is reanimated to
  // a promise will resolve to the captp value.
  // each time the value is imported, a new slot is created.
  // TODO: could likely reuse an existing slot after looking up the remoteSlot
  const registerExtRef = async (value) => {
    // make a slot for the extRef
    const id = getAndIncrementNextInstanceID();
    const slot = makeBaseRef(kindID, id, isDurable);
    // register the slot with the value, so it can be stored
    fakeStuff.registerEntry(slot, value, false);
    console.log(`+ ${label} make extRef`, slot)
    // tell the remote to hold the value, and store its remote slot
    const remoteSlot = await E(getRemoteExtRefController()).registerHold(value);
    const context = harden({ ref: remoteSlot });
    data.init(slot, context);
    console.log(`* ${label} fix extRef`, slot)
  }
  const registerHold = (value) => {
    const slot = fakeStuff.getSlotForVal(value);
    if (slot === undefined) {
      throw new Error(`(${label}) registerHold - value not registered: ${value}`);
    }
    if (!heldValues.has(slot)) {
      heldValues.init(slot, value);
    }
    return slot;
  }
  const releaseHold = (value) => {
    const slot = fakeStuff.getSlotForVal(value);
    if (slot === undefined) {
      throw new Error(`(${label}) releaseHold - value not registered: ${value}`);
    }
    heldValues.delete(slot);
  }
  const lookupHold = (slot) => {
    if (!heldValues.has(slot)) {
      throw new Error(`(${label}) lookupHold - value not held for slot: ${slot}`);
    }
    return heldValues.get(slot);
  }

  // register ExtRef kind
  vrm.registerKind(kindID, reanimate, cleanup, isDurable);

  // register the controller in the zone
  const makeExtRefController = zone.exoClass('ExtRefController', undefined, () => harden({}), {
    registerExtRef,
    registerHold,
    releaseHold,
    lookupHold,
  });
  // store.init('controller', durableExtRefController);

  return makeExtRefController();
}

/*
  value seen in importHook, with no ExtRef made for it:
    remote.registerHold(val), returns remoteSlot
    makeExtRef(remoteSlot)
    alias value to ExtRef's slot
    BUG: theres a delay where we dont know the remote slot
    a shutdown here would break the ExtRef
  reanimate - value seen in importHook, with ExtRef made for it:
    we dont know its remoteSlot yet
    so we cant tell if we've seen it before
    it will get a new slot
    can override back to the old slot in reanimate once we know it
    register hold will be a no-op
*/