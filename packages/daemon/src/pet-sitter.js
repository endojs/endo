// @ts-check

import harden from '@endo/harden';
import { q } from '@endo/errors';
import { isPetName, assertName } from './pet-name.js';
import { parseId } from './formula-identifier.js';

/** @import { PetStore, IdRecord, PetStoreIdNameChange, Name, SpecialName } from './types.js' */

/**
 * @param {PetStore} petStore
 * @param {Record<string,string>} specialNames
 * @returns {PetStore}
 */
export const makePetSitter = (petStore, specialNames) => {
  /** @type {PetStore['has']} */
  const has = petName => {
    return Object.hasOwn(specialNames, petName) || petStore.has(petName);
  };

  /** @type {PetStore['identifyLocal']} */
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
    return petStore.identifyLocal(petName);
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

  /** @type {PetStore['list']} */
  const list = () => {
    const specialKeys =
      /** @type {SpecialName[]} */
      (Object.keys(specialNames).sort());
    return harden([...specialKeys, ...petStore.list()]);
  };

  /** @type {PetStore['followNameChanges']} */
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
    yield* petStore.followNameChanges();
  };

  /** @type {PetStore['followIdNameChanges']} */
  const followIdNameChanges = async function* currentAndSubsequentIds(id) {
    const subscription = petStore.followIdNameChanges(id);

    const idSpecialNames = Object.entries(specialNames)
      .filter(([_, specialId]) => specialId === id)
      .map(([specialName, _]) => /** @type {SpecialName} */ (specialName));
    if (idSpecialNames.includes('SELF') && idSpecialNames.includes('HOST')) {
      const filtered = idSpecialNames.filter(name => name !== 'HOST');
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

  /** @type {PetStore['reverseIdentify']} */
  const reverseIdentify = id => {
    const names = Array.from(petStore.reverseIdentify(id));
    for (const [specialName, specialId] of Object.entries(specialNames)) {
      if (specialId === id) {
        names.push(/** @type {SpecialName} */ (specialName));
      }
    }
    return harden(names);
  };

  const { write, remove, rename } = petStore;

  const petSitter = {
    has,
    identifyLocal,
    reverseIdentify,
    list,
    followIdNameChanges,
    followNameChanges,
    write,
    remove,
    rename,
  };

  return petSitter;
};
