// @ts-check

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

  /** @type {import('./types.js').PetStore['follow']} */
  const follow = async function* currentAndSubsequentNames() {
    for (const name of Object.keys(specialNames).sort()) {
      const idRecord = idRecordForName(name);
      yield /** @type {{ add: string, value: import('./types.js').IdRecord }} */ ({
        add: name,
        value: idRecord,
      });
    }
    yield* petStore.follow();
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
    follow,
    write,
    remove,
    rename,
  };

  return petSitter;
};
