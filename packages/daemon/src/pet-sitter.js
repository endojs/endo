// @ts-check

import { isPetName } from './pet-name.js';
import { parseId } from './formula-identifier.js';

const { quote: q } = assert;

/**
 * @param {import('./types.js').PetStore} petStore
 * @param {Record<string,string>} specialNames
 * @returns {import('./types.js').PetStore}
 */
export const makePetSitter = (petStore, specialNames) => {
  /** @type {import('./types.js').PetStore['has']} */
  const has = petName => {
    return Object.hasOwn(specialNames, petName) || petStore.has(petName);
  };

  /** @type {import('./types.js').PetStore['identifyLocal']} */
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
   * @returns {import('./types.js').IdRecord}
   */
  const idRecordForName = petName => {
    const id = identifyLocal(petName);
    if (id === undefined) {
      throw new Error(`Formula does not exist for pet name ${q(petName)}`);
    }
    return parseId(id);
  };

  /** @type {import('./types.js').PetStore['list']} */
  const list = () =>
    harden([...Object.keys(specialNames).sort(), ...petStore.list()]);

  /** @type {import('./types.js').PetStore['followNameChanges']} */
  const followNameChanges = async function* currentAndSubsequentNames() {
    for (const name of Object.keys(specialNames).sort()) {
      const idRecord = idRecordForName(name);
      yield /** @type {{ add: string, value: import('./types.js').IdRecord }} */ ({
        add: name,
        value: idRecord,
      });
    }
    yield* petStore.followNameChanges();
  };

  /** @type {import('./types.js').PetStore['followIdNameChanges']} */
  const followIdNameChanges = async function* currentAndSubsequentIds(id) {
    const subscription = petStore.followIdNameChanges(id);

    const [idSpecialName] = Object.entries(specialNames)
      .filter(([_, specialId]) => specialId === id)
      .map(([specialName, _]) => specialName);

    if (typeof idSpecialName === 'string') {
      // The first published event contains the existing names for the id, if any.
      const { value: existingNames } = await subscription.next();
      existingNames?.names?.unshift(idSpecialName);
      existingNames?.names?.sort();
      yield /** @type {import('./types.js').PetStoreIdDiff} */ (existingNames);
    }

    yield* subscription;
  };

  /** @type {import('./types.js').PetStore['reverseIdentify']} */
  const reverseIdentify = id => {
    const names = Array.from(petStore.reverseIdentify(id));
    for (const [specialName, specialId] of Object.entries(specialNames)) {
      if (specialId === id) {
        names.push(specialName);
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
