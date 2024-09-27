import { makeCustomDurableKindWithContext } from './custom-kind.js';

/**
 * @param {string} label
 * @param {import('@agoric/zone').Zone} zone
 * @param {any} fakeVomKit
 * @param {() => any} getCaptp
 */
export const installExtRefController = (label, zone, fakeVomKit, getCaptp) => {
  const imports = zone.setStore('imports');
  const exports = zone.mapStore('exports');
  const { fakeStuff } = fakeVomKit;

  const makeExtRef = makeCustomDurableKindWithContext(fakeVomKit, zone, {
    make: (context, value, remoteSlot) => {
      context.ref = remoteSlot;
      return value;
    },
    reanimate: context => {
      const { ref: remoteSlot } = context;
      const captp = getCaptp();
      // console.log(`## ${label} reanimate`, remoteSlot)
      return captp.importSlot(remoteSlot);
    },
    cleanup: context => {
      const { ref: remoteSlot } = context;
      imports.delete(remoteSlot);
      // indicate no further GC needed
      return false;
    },
  });

  // marks a captp imported presence as durable,
  const registerImport = (remoteSlot, value) => {
    if (imports.has(remoteSlot)) {
      return;
    }
    // console.log(`!! ${label} registerExtRef`, value, remoteSlot)
    // Note: extRef === value
    makeExtRef(value, remoteSlot);
    imports.add(remoteSlot);
  };
  const registerExport = value => {
    const durableSlot = fakeStuff.getSlotForVal(value);
    if (durableSlot === undefined) {
      throw new Error(
        `(${label}) registerExport - value not registered: ${value}`,
      );
    }
    if (!exports.has(durableSlot)) {
      exports.init(durableSlot, value);
    }
    return durableSlot;
  };
  const unregisterExport = slot => {
    if (exports.has(slot)) {
      exports.delete(slot);
    }
  };
  const lookupExport = slot => {
    if (!exports.has(slot)) {
      throw new Error(
        `(${label}) lookupExport - value not held for slot: ${slot}`,
      );
    }
    return exports.get(slot);
  };

  const isPromiseSlot = slot => {
    return slot[0] === 'p';
  };

  const captpOpts = {
    //
    // standard options
    //
    gcImports: true,
    exportHook(val, captpSlot) {
      // NOTE: we only want to handle non-promises
      if (isPromiseSlot(captpSlot)) {
        return;
      }
      // console.log(`>> ${label} exportHook`, val, captpSlot, durableSlot)
      // This value has been exported, so we add it to our table
      registerExport(val);
    },
    importHook(val, captpSlot) {
      // We only want to handle non-promises
      if (isPromiseSlot(captpSlot)) {
        return;
      }
      // console.log(`<< ${label} importHook`, val, captpSlot);
      // We know the other side has used "valueToSlotHook" to provide a durable slot
      const remoteDurableSlot = captpSlot;
      // establish durability for this imported reference
      registerImport(remoteDurableSlot, val);
    },
    //
    // extended options
    //
    valueToSlotHook(val) {
      // Captp is asking us to provide a slot for the value,
      // we'll provide the durable slot
      // TODO: could this slot collide with captp?
      // maybe not because KindId/instanceId wont conflict
      const durableSlot = fakeStuff.getSlotForVal(val);
      // console.log(`>> ${label} valueToSlotHook`, val, durableSlot)
      return durableSlot;
    },
    missingExportHook(slot) {
      // console.log(`$$ ${label} exporting missing slot`, slot)
      // Captp is trying to use an export it doesn't have,
      // so we need to provide it
      const value = lookupExport(slot);
      const captp = getCaptp();
      captp.exportValue(value, slot);
    },
    gcHook(_val, slot) {
      // console.log(`-- ${label} gcHook`, _val, slot)
      // we can release this value
      // NOTE: this will only work correctly if captp is using the vomkit WeakMap
      unregisterExport(slot);
    },
  };

  return { captpOpts };
};
