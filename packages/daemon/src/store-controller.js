// @ts-check

import harden from '@endo/harden';

import { formatId, parseId } from './formula-identifier.js';
import { LOCAL_NODE } from './locator.js';

/** @import { FormulaIdentifier, GcHooks, Name, PetName, PetStore, StoreController, StoreConverters, SyncedPetStore } from './types.js' */

/**
 * @param {FormulaIdentifier} storeId
 * @param {PetStore} petStore
 * @param {GcHooks} gcHooks
 * @returns {StoreController}
 */
export const makeLocalStoreController = (storeId, petStore, gcHooks) => {
  const { onPetStoreWrite, onPetStoreRemove, isLocalId, withFormulaGraphLock } =
    gcHooks;

  /**
   * @param {FormulaIdentifier} id
   */
  const removeEdgeIfUnreferenced = async id => {
    await null;
    const names = petStore.reverseIdentify(id);
    if (names.length === 0) {
      await withFormulaGraphLock(async () => {
        onPetStoreRemove(storeId, id);
      });
    }
  };

  /** @type {StoreController['has']} */
  const has = petName => petStore.has(petName);

  /** @type {StoreController['identifyLocal']} */
  const identifyLocal = petName => petStore.identifyLocal(petName);

  /** @type {StoreController['list']} */
  const list = () => petStore.list();

  /** @type {StoreController['reverseIdentify']} */
  const reverseIdentify = id => petStore.reverseIdentify(id);

  /** @type {StoreController['followNameChanges']} */
  const followNameChanges = () => petStore.followNameChanges();

  /** @type {StoreController['followIdNameChanges']} */
  const followIdNameChanges = id => petStore.followIdNameChanges(id);

  /** @type {StoreController['storeIdentifier']} */
  const storeIdentifier = async (petName, id) => {
    const previousId = petStore.identifyLocal(petName);
    await petStore.storeIdentifier(petName, id);
    // Only register local IDs in the formula graph for GC tracking;
    // non-local IDs (from remote nodes) are stored but not GC-managed.
    if (isLocalId(id)) {
      await withFormulaGraphLock(async () => {
        onPetStoreWrite(storeId, /** @type {FormulaIdentifier} */ (id));
      });
    }
    if (previousId && previousId !== id) {
      await removeEdgeIfUnreferenced(
        /** @type {FormulaIdentifier} */ (previousId),
      );
    }
  };

  /** @type {StoreController['storeLocator']} */
  const storeLocator = async (_petName, _locator) => {
    throw new Error(
      'storeLocator is not supported on local stores; use storeIdentifier',
    );
  };

  /** @type {StoreController['remove']} */
  const remove = async petName => {
    const previousId = petStore.identifyLocal(petName);
    await petStore.remove(petName);
    if (previousId) {
      await removeEdgeIfUnreferenced(
        /** @type {FormulaIdentifier} */ (previousId),
      );
    }
  };

  /** @type {StoreController['rename']} */
  const rename = async (fromPetName, toPetName) => {
    const fromId = petStore.identifyLocal(fromPetName);
    const overwrittenId = petStore.identifyLocal(toPetName);
    await petStore.rename(fromPetName, toPetName);
    if (fromId && isLocalId(fromId)) {
      await withFormulaGraphLock(async () => {
        onPetStoreWrite(storeId, /** @type {FormulaIdentifier} */ (fromId));
      });
    }
    if (overwrittenId && overwrittenId !== fromId) {
      await removeEdgeIfUnreferenced(
        /** @type {FormulaIdentifier} */ (overwrittenId),
      );
    }
  };

  /** @type {StoreController['seedGcEdges']} */
  const seedGcEdges = async () => {
    await null;
    const names = petStore.list();
    /** @type {FormulaIdentifier[]} */
    const localIds = [];
    for (const name of names) {
      const id = petStore.identifyLocal(name);
      if (id !== undefined && isLocalId(id)) {
        localIds.push(/** @type {FormulaIdentifier} */ (id));
      }
    }
    if (localIds.length > 0) {
      await withFormulaGraphLock(async () => {
        for (const id of localIds) {
          onPetStoreWrite(storeId, id);
        }
      });
    }
  };

  const controller = harden({
    has,
    identifyLocal,
    list,
    reverseIdentify,
    storeIdentifier,
    storeLocator,
    remove,
    rename,
    followNameChanges,
    followIdNameChanges,
    seedGcEdges,
  });

  return controller;
};
harden(makeLocalStoreController);

/**
 * @param {FormulaIdentifier} storeId
 * @param {SyncedPetStore} syncedStore
 * @param {GcHooks} gcHooks
 * @param {StoreConverters} converters
 * @returns {StoreController}
 */
export const makeSyncedStoreController = (
  storeId,
  syncedStore,
  gcHooks,
  converters,
) => {
  const { onPetStoreWrite, onPetStoreRemove, withFormulaGraphLock } = gcHooks;
  const { idFromLocator, isLocalKey } = converters;

  /**
   * @param {string} locator
   * @returns {FormulaIdentifier | undefined}
   */
  const safeIdFromLocator = locator => {
    try {
      return /** @type {FormulaIdentifier} */ (idFromLocator(locator));
    } catch {
      return undefined;
    }
  };

  /** @type {StoreController['has']} */
  const has = petName => syncedStore.has(petName);

  /** @type {StoreController['identifyLocal']} */
  const identifyLocal = petName => {
    const locator = syncedStore.lookup(petName);
    if (locator === undefined) {
      return undefined;
    }
    const id = safeIdFromLocator(locator);
    if (id === undefined) {
      return undefined;
    }
    // Normalize local node keys to LOCAL_NODE via internalizeLocator.
    const { id: normalizedId } = converters.internalizeLocator(
      locator,
      isLocalKey,
    );
    return normalizedId;
  };

  /** @type {StoreController['list']} */
  const list = () => syncedStore.list();

  /** @type {StoreController['reverseIdentify']} */
  const reverseIdentify = id => {
    /** @type {Name[]} */
    const names = [];
    const state = syncedStore.getState();
    for (const [key, entry] of Object.entries(state)) {
      if (entry.locator !== null) {
        try {
          const { id: entryId } = converters.internalizeLocator(
            entry.locator,
            isLocalKey,
          );
          if (entryId === id) {
            names.push(/** @type {Name} */ (key));
          }
        } catch {
          // Ignore unparseable locators.
        }
      }
    }
    return harden(names);
  };

  /** @type {StoreController['storeIdentifier']} */
  const storeIdentifier = async (petName, id) => {
    const previousId = identifyLocal(petName);
    const formulaType = await converters.getTypeForId(
      /** @type {FormulaIdentifier} */ (id),
    );
    // Externalize LOCAL_NODE to the real node number so that
    // locators in the synced store are unambiguous across daemons.
    const { number, node } = parseId(/** @type {FormulaIdentifier} */ (id));
    const externalNode =
      node === LOCAL_NODE ? converters.localNodeNumber : node;
    const externalId = formatId({ number, node: externalNode });
    const locator = converters.formatLocator(externalId, formulaType);
    await syncedStore.storeLocator(petName, locator);
    await withFormulaGraphLock(async () => {
      onPetStoreWrite(storeId, /** @type {FormulaIdentifier} */ (id));
    });
    if (previousId && previousId !== id) {
      const stillReferenced = reverseIdentify(previousId).length > 0;
      if (!stillReferenced) {
        await withFormulaGraphLock(async () => {
          onPetStoreRemove(
            storeId,
            /** @type {FormulaIdentifier} */ (previousId),
          );
        });
      }
    }
  };

  /** @type {StoreController['storeLocator']} */
  const storeLocator = async (petName, locator) => {
    const previousId = identifyLocal(petName);
    await syncedStore.storeLocator(petName, locator);
    const newId = safeIdFromLocator(locator);
    if (newId) {
      await withFormulaGraphLock(async () => {
        onPetStoreWrite(storeId, newId);
      });
    }
    if (previousId && previousId !== (newId ?? '')) {
      const stillReferenced = reverseIdentify(previousId).length > 0;
      if (!stillReferenced) {
        await withFormulaGraphLock(async () => {
          onPetStoreRemove(
            storeId,
            /** @type {FormulaIdentifier} */ (previousId),
          );
        });
      }
    }
  };

  /** @type {StoreController['remove']} */
  const remove = async petName => {
    const previousLocator = syncedStore.lookup(petName);
    await syncedStore.remove(petName);
    if (previousLocator) {
      const previousId = safeIdFromLocator(previousLocator);
      if (previousId) {
        const stillReferenced = reverseIdentify(previousId).length > 0;
        if (!stillReferenced) {
          await withFormulaGraphLock(async () => {
            onPetStoreRemove(storeId, previousId);
          });
        }
      }
    }
  };

  /** @type {StoreController['rename']} */
  const rename = async (fromPetName, toPetName) => {
    const locator = syncedStore.lookup(fromPetName);
    if (locator === undefined) {
      throw new Error(
        `Formula does not exist for pet name ${JSON.stringify(fromPetName)}`,
      );
    }
    const overwrittenId = identifyLocal(toPetName);
    await syncedStore.storeLocator(toPetName, locator);
    await syncedStore.remove(fromPetName);
    const fromId = safeIdFromLocator(locator);
    if (fromId) {
      await withFormulaGraphLock(async () => {
        onPetStoreWrite(storeId, fromId);
      });
    }
    if (overwrittenId && overwrittenId !== (fromId ?? '')) {
      const stillReferenced = reverseIdentify(overwrittenId).length > 0;
      if (!stillReferenced) {
        await withFormulaGraphLock(async () => {
          onPetStoreRemove(
            storeId,
            /** @type {FormulaIdentifier} */ (overwrittenId),
          );
        });
      }
    }
  };

  /** @type {StoreController['followNameChanges']} */
  const followNameChanges = async function* syncedFollowNameChanges() {
    for await (const { key, entry } of syncedStore.followChanges()) {
      if (entry.locator !== null) {
        const entryId = safeIdFromLocator(entry.locator);
        if (entryId !== undefined) {
          const { id: normalizedId } = converters.internalizeLocator(
            entry.locator,
            isLocalKey,
          );
          const idRecord = parseId(normalizedId);
          yield /** @type {import('./types.js').PetStoreNameChange} */ ({
            add: /** @type {Name} */ (key),
            value: idRecord,
          });
        }
      } else {
        yield /** @type {import('./types.js').PetStoreNameChange} */ ({
          remove: /** @type {Name} */ (key),
        });
      }
    }
  };

  /** @type {StoreController['followIdNameChanges']} */
  const followIdNameChanges = async function* syncedFollowIdNameChanges(id) {
    const currentNames = reverseIdentify(id);
    const idRecord = parseId(id);
    yield /** @type {import('./types.js').PetStoreIdNameChange} */ ({
      add: idRecord,
      names: currentNames,
    });
    // Then deltas.
    for await (const { key, entry } of syncedStore.followChanges()) {
      const entryId =
        entry.locator !== null ? safeIdFromLocator(entry.locator) : undefined;
      let normalizedEntryId;
      if (entryId !== undefined && entry.locator !== null) {
        ({ id: normalizedEntryId } = converters.internalizeLocator(
          entry.locator,
          isLocalKey,
        ));
      }
      if (normalizedEntryId === id) {
        yield /** @type {import('./types.js').PetStoreIdNameChange} */ ({
          add: idRecord,
          names: [/** @type {Name} */ (key)],
        });
      } else if (entry.locator === null) {
        // The entry was removed; check if it was for our target id.
        yield /** @type {import('./types.js').PetStoreIdNameChange} */ ({
          remove: idRecord,
          names: [/** @type {Name} */ (key)],
        });
      }
    }
  };

  /** @type {StoreController['seedGcEdges']} */
  const seedGcEdges = async () => {
    await null;
    const names = syncedStore.list();
    /** @type {FormulaIdentifier[]} */
    const ids = [];
    for (const name of names) {
      const locator = syncedStore.lookup(name);
      if (locator !== undefined) {
        const id = safeIdFromLocator(locator);
        if (id !== undefined) {
          ids.push(id);
        }
      }
    }
    if (ids.length > 0) {
      await withFormulaGraphLock(async () => {
        for (const id of ids) {
          onPetStoreWrite(storeId, id);
        }
      });
    }
  };

  const controller = harden({
    has,
    identifyLocal,
    list,
    reverseIdentify,
    storeIdentifier,
    storeLocator,
    remove,
    rename,
    followNameChanges,
    followIdNameChanges,
    seedGcEdges,
  });

  return controller;
};
harden(makeSyncedStoreController);
