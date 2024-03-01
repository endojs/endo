// @ts-check

import { parseFormulaIdentifier } from './formula-identifier.js';

const { quote: q } = assert;

/**
 * @param {import('./types.js').PetStore} petStore
 * @param {Record<string,string>} specialNames
 * @returns {import('./types.js').PetStore}
 */
export const makePetSitter = (petStore, specialNames) => {
  /** @type {import('./types.js').Mail['has']} */
  const has = petName => {
    return Object.hasOwn(specialNames, petName) || petStore.has(petName);
  };

  /** @type {import('./types.js').Mail['identifyLocal']} */
  const identifyLocal = petName => {
    if (Object.hasOwn(specialNames, petName)) {
      return specialNames[petName];
    }
    return petStore.identifyLocal(petName);
  };

  /**
   * @param {string} petName
   * @returns {import('./types.js').FormulaIdentifierRecord}
   */
  const formulaIdentifierRecordForName = petName => {
    const formulaIdentifier = identifyLocal(petName);
    if (formulaIdentifier === undefined) {
      throw new Error(`Formula does not exist for pet name ${q(petName)}`);
    }
    return parseFormulaIdentifier(formulaIdentifier);
  };

  /** @type {import('./types.js').Mail['list']} */
  const list = () =>
    harden([...Object.keys(specialNames).sort(), ...petStore.list()]);

  /** @type {import('./types.js').PetStore['follow']} */
  const follow = async function* currentAndSubsequentNames() {
    for (const name of Object.keys(specialNames).sort()) {
      const formulaIdentifierRecord = formulaIdentifierRecordForName(name);
      yield /** @type {{ add: string, value: import('./types.js').FormulaIdentifierRecord }} */ ({
        add: name,
        value: formulaIdentifierRecord,
      });
    }
    yield* petStore.follow();
  };

  // Provided as an alias for follow, with naming symmetry to listEntries.
  /** @type {import('./types.js').PetStore['follow']} */
  const followEntries = follow;

  // Returns in Object.fromEntries format.
  /** @type {import('./types.js').PetStore['listEntries']} */
  const listEntries = () => {
    const specialEntries = Object.keys(specialNames)
      .sort()
      .map(name => {
        return /** @type {[string, import('./types.js').FormulaIdentifierRecord]} */ ([
          name,
          formulaIdentifierRecordForName(name),
        ]);
      });
    return harden([...specialEntries, ...petStore.listEntries()]);
  };

  /** @type {import('./types.js').PetStore['reverseIdentify']} */
  const reverseIdentify = formulaIdentifier => {
    const names = Array.from(petStore.reverseIdentify(formulaIdentifier));
    for (const [specialName, specialFormulaIdentifier] of Object.entries(
      specialNames,
    )) {
      if (specialFormulaIdentifier === formulaIdentifier) {
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
    listEntries,
    followEntries,
    write,
    remove,
    rename,
  };

  return petSitter;
};
