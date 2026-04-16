// @ts-check

import harden from '@endo/harden';

/** @import { FormulaIdentifier, GcHooks, Name, PetName, PetStore, StoreController } from './types.js' */

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
