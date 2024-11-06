import { makeCustomDurableKindWithContext } from './custom-kind.js';

/**
 * @param {string} label
 * @param {import('@agoric/zone').Zone} zone
 * @param {any} fakeVomKit
 * @param {import('./presence-controller').PresenceController} presenceController
 */
export const installExternalReferenceController = (
  label,
  zone,
  fakeVomKit,
  presenceController,
) => {
  const { makePresenceForSlot, cleanupPresenceForSlot } = presenceController;
  const { fakeStuff } = fakeVomKit;

  // TODO: "imports" should be a WeakValueMap/FinalizingMap
  // We want to cache the presence for a slot,
  // but we don't need to hold on to it.
  const imports = zone.mapStore('imports');
  const exports = zone.mapStore('exports');

  const makeExtRef = makeCustomDurableKindWithContext(fakeVomKit, zone, {
    make: (context, remoteSlot, iface) => {
      context.ref = remoteSlot;
      context.iface = iface;
      return makePresenceForSlot(remoteSlot, iface);
    },
    reanimate: context => {
      const { ref: remoteSlot, iface } = context;
      return makePresenceForSlot(remoteSlot, iface);
    },
    cleanup: context => {
      const { ref: remoteSlot } = context;
      // We don't need to clear from imports here,
      // because its already been dropped before this call can happen.
      // Return GC hint -- true if potentially more GC needed.
      return cleanupPresenceForSlot(remoteSlot);
    },
  });

  const registerImport = (remoteSlot, iface) => {
    // console.log(`- ${label} registerImport ${remoteSlot}`);
    if (imports.has(remoteSlot)) {
      return imports.get(remoteSlot);
    }
    const extRef = makeExtRef(remoteSlot, iface);
    imports.init(remoteSlot, extRef);
    return extRef;
  };

  const registerExport = value => {
    // console.log(`- ${label} registerExport ${value}`);
    const durableSlot = fakeStuff.getSlotForVal(value);
    if (durableSlot === undefined) {
      throw new Error(`registerExport - value not registered: ${value}`);
    }
    if (!exports.has(durableSlot)) {
      exports.init(durableSlot, value);
    }
    return durableSlot;
  };
  const unregisterExport = localSlot => {
    // console.log(`- ${label} unregisterExport ${localSlot}`);
    if (exports.has(localSlot)) {
      exports.delete(localSlot);
      return true;
    }
    return false;
  };
  const lookupExport = localSlot => {
    // console.log(`- ${label} lookupExport ${localSlot}`);
    if (!exports.has(localSlot)) {
      throw new Error(
        `(${label}) lookupExport - value not held for slot: ${localSlot}`,
      );
    }
    return exports.get(localSlot);
  };

  const makeCapTPImportExportTables = () => {
    return {
      makeSlotForValue: registerExport,
      makeValueForSlot: (slot, iface) => {
        const val = registerImport(slot, iface);
        return { val, settler: undefined };
      },
      hasImport: slot => imports.has(slot),
      getImport: slot => imports.get(slot),
      markAsImported: () => {
        /* already registered */
      },
      hasExport: slot => exports.has(slot),
      getExport: slot => lookupExport(slot),
      markAsExported: () => {
        /* already registered */
      },
      deleteExport: slot => unregisterExport(slot),
      didDisconnect: () => {
        /* noop */
      },
    };
  };

  return {
    registerImport,
    registerExport,
    unregisterExport,
    lookupExport,
    makeCapTPImportExportTables,
  };
};

export const makeCaptpOptionsForExtRefController = controller => {
  const captpOptions = {
    makeCapTPImportExportTables: controller.makeCapTPImportExportTables,
  };
  return captpOptions;
};
