// @ts-check

import harden from '@endo/harden';
import { q } from '@endo/errors';
import { isPetName, assertName } from './pet-name.js';
import { parseId } from './formula-identifier.js';

/** @import { StoreController, IdRecord, PetStoreIdNameChange, Name, SpecialName } from './types.js' */

/**
 * @param {StoreController} controller
 * @param {Record<string,string>} specialNames
 * @returns {StoreController}
 */
export const makePetSitter = (controller, specialNames) => {
  /** @type {StoreController['has']} */
  const has = petName => {
    return Object.hasOwn(specialNames, petName) || controller.has(petName);
  };

  /** @type {StoreController['identifyLocal']} */
  const identifyLocal = petName => {
    if (Object.hasOwn(specialNames, petName)) {
      return specialNames[petName];
    }
    if (!isPetName(petName)) {
      throw new Error(
        `Invalid pet name ${q(petName)} and not one of ${Object.keys(
          specialNames,
        ).join(', ')}`,
      );
    }
    return controller.identifyLocal(petName);
  };

  /**
   * @param {string} petName
   * @returns {IdRecord}
   */
  const idRecordForName = petName => {
    assertName(petName);
    const id = identifyLocal(petName);
    if (id === undefined) {
      throw new Error(`Formula does not exist for pet name ${q(petName)}`);
    }
    return parseId(id);
  };

  /** @type {StoreController['list']} */
  const list = () => {
    const specialKeys =
      /** @type {SpecialName[]} */
      (Object.keys(specialNames).sort());
    return harden([...specialKeys, ...controller.list()]);
  };

  /** @type {StoreController['followNameChanges']} */
  const followNameChanges = async function* currentAndSubsequentNames() {
    const specialKeys =
      /** @type {SpecialName[]} */
      (Object.keys(specialNames).sort());
    for (const name of specialKeys) {
      const idRecord = idRecordForName(name);
      yield /** @type {{ add: Name, value: IdRecord }} */ ({
        add: name,
        value: idRecord,
      });
    }
    yield* controller.followNameChanges();
  };

  /** @type {StoreController['followIdNameChanges']} */
  const followIdNameChanges = async function* currentAndSubsequentIds(id) {
    const subscription = controller.followIdNameChanges(id);

    const idSpecialNames = Object.entries(specialNames)
      .filter(([_, specialId]) => specialId === id)
      .map(([specialName, _]) => /** @type {SpecialName} */ (specialName));
    if (
      idSpecialNames.includes(/** @type {SpecialName} */ ('@self')) &&
      idSpecialNames.includes(/** @type {SpecialName} */ ('@host'))
    ) {
      const filtered = idSpecialNames.filter(name => name !== '@host');
      idSpecialNames.length = 0;
      idSpecialNames.push(...filtered);
    }

    // The first published event contains the existing names for the id, if any.
    const { value: existingNames } = await subscription.next();
    if (existingNames?.names) {
      existingNames.names.unshift(...idSpecialNames);
    }
    existingNames?.names?.sort();
    yield /** @type {PetStoreIdNameChange} */ (existingNames);

    yield* subscription;
  };

  /** @type {StoreController['reverseIdentify']} */
  const reverseIdentify = id => {
    const names = Array.from(controller.reverseIdentify(id));
    for (const [specialName, specialId] of Object.entries(specialNames)) {
      if (specialId === id) {
        names.push(/** @type {SpecialName} */ (specialName));
      }
    }
    return harden(names);
  };

  const { storeIdentifier, storeLocator, remove, rename, seedGcEdges } =
    controller;

  const petSitter = {
    has,
    identifyLocal,
    reverseIdentify,
    list,
    followIdNameChanges,
    followNameChanges,
    storeIdentifier,
    storeLocator,
    remove,
    rename,
    seedGcEdges,
  };

  return petSitter;
};
