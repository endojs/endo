// @ts-check

import { makeChangeTopic } from './pubsub.js';
import { parseId, assertValidId, isValidNumber } from './formula-identifier.js';

const { quote: q } = assert;

/**
 * @param {import('./types.js').FilePowers} filePowers
 * @param {import('./types.js').Locator} locator
 */
export const makePetStoreMaker = (filePowers, locator) => {
  /**
   * @param {string} petNameDirectoryPath
   * @param {(name: string) => void} assertValidName
   * @returns {Promise<import('./types.js').PetStore>}
   */
  const makePetStoreAtPath = async (petNameDirectoryPath, assertValidName) => {
    /** @type {Map<string, string>} */
    const petNames = new Map();
    /** @type {Map<string, Set<string>>} */
    const ids = new Map();
    /** @type {import('./types.js').Topic<({ add: string, value: import('./types.js').IdRecord } | { remove: string })>} */
    const changesTopic = makeChangeTopic();

    /** @param {string} petName */
    const read = async petName => {
      const petNamePath = filePowers.joinPath(petNameDirectoryPath, petName);
      const petNameText = await filePowers.readFileText(petNamePath);
      const formulaIdentifier = petNameText.trim();
      assertValidId(formulaIdentifier, petName);
      return formulaIdentifier;
    };

    await filePowers.makePath(petNameDirectoryPath);

    const fileNames = await filePowers.readDirectory(petNameDirectoryPath);
    await Promise.all(
      fileNames.map(async petName => {
        assertValidName(petName);
        const formulaIdentifier = await read(petName);
        petNames.set(petName, formulaIdentifier);
        const formulaPetNames = ids.get(formulaIdentifier);
        if (formulaPetNames !== undefined) {
          formulaPetNames.add(petName);
        } else {
          ids.set(formulaIdentifier, new Set([petName]));
        }
      }),
    );

    /** @type {import('./types.js').PetStore['has']} */
    const has = petName => {
      assertValidName(petName);
      return petNames.has(petName);
    };

    /** @type {import('./types.js').PetStore['identifyLocal']} */
    const identifyLocal = petName => {
      assertValidName(petName);
      return petNames.get(petName);
    };

    /** @type {import('./types.js').PetStore['write']} */
    const write = async (petName, formulaIdentifier) => {
      assertValidName(petName);
      assertValidId(formulaIdentifier);

      // TODO: Return early if the formula identifier is the same.
      if (petNames.has(petName)) {
        // Perform cleanup on the overwritten pet name.
        const formulaPetNames = ids.get(petName);
        if (formulaPetNames !== undefined) {
          formulaPetNames.delete(petName);
        }
        // TODO: Should this only happen if something is actually deleted?
        changesTopic.publisher.next({ remove: petName });
      }

      petNames.set(petName, formulaIdentifier);

      const formulaPetNames = ids.get(formulaIdentifier);
      if (formulaPetNames === undefined) {
        ids.set(formulaIdentifier, new Set([petName]));
      } else {
        formulaPetNames.add(petName);
      }

      const petNamePath = filePowers.joinPath(petNameDirectoryPath, petName);
      const petNameText = `${formulaIdentifier}\n`;
      await filePowers.writeFileText(petNamePath, petNameText);
      const formulaIdentifierRecord = parseId(formulaIdentifier);
      changesTopic.publisher.next({
        add: petName,
        value: formulaIdentifierRecord,
      });
    };

    /**
     * @param {string} petName
     * @returns {import('./types.js').IdRecord}
     */
    const formulaIdentifierRecordForName = petName => {
      const formulaIdentifier = petNames.get(petName);
      if (formulaIdentifier === undefined) {
        throw new Error(`Formula does not exist for pet name ${q(petName)}`);
      }
      return parseId(formulaIdentifier);
    };

    // Returns in an Array format.
    /** @type {import('./types.js').PetStore['list']} */
    const list = () => harden([...petNames.keys()].sort());
    // Returns in an object operations format ({ add, value } or { remove }).
    /** @type {import('./types.js').PetStore['follow']} */
    const follow = async function* currentAndSubsequentNames() {
      const changes = changesTopic.subscribe();
      for (const name of [...petNames.keys()].sort()) {
        const formulaIdentifierRecord = formulaIdentifierRecordForName(name);
        yield /** @type {{ add: string, value: import('./types.js').IdRecord }} */ ({
          add: name,
          value: formulaIdentifierRecord,
        });
      }
      yield* changes;
    };

    /** @type {import('./types.js').PetStore['remove']} */
    const remove = async petName => {
      assertValidName(petName);
      const formulaIdentifier = petNames.get(petName);
      if (formulaIdentifier === undefined) {
        throw new Error(
          `Formula does not exist for pet name ${JSON.stringify(petName)}`,
        );
      }
      assertValidId(formulaIdentifier, petName);

      const petNamePath = filePowers.joinPath(petNameDirectoryPath, petName);
      await filePowers.removePath(petNamePath);
      petNames.delete(petName);
      const formulaPetNames = ids.get(petName);
      if (formulaPetNames !== undefined) {
        formulaPetNames.delete(petName);
      }
      changesTopic.publisher.next({ remove: petName });
      // TODO consider retaining a backlog of deleted names for recovery
      // TODO consider tracking historical pet names for formulas
    };

    /** @type {import('./types.js').PetStore['rename']} */
    const rename = async (fromName, toName) => {
      assertValidName(fromName);
      assertValidName(toName);
      if (fromName === toName) {
        return;
      }
      const formulaIdentifier = petNames.get(fromName);
      const overwrittenId = petNames.get(toName);
      if (formulaIdentifier === undefined) {
        throw new Error(
          `Formula does not exist for pet name ${JSON.stringify(fromName)}`,
        );
      }
      assertValidId(formulaIdentifier, fromName);
      if (overwrittenId !== undefined) {
        assertValidId(overwrittenId, toName);
      }

      const fromPath = filePowers.joinPath(petNameDirectoryPath, fromName);
      const toPath = filePowers.joinPath(petNameDirectoryPath, toName);
      await filePowers.renamePath(fromPath, toPath);
      petNames.set(toName, formulaIdentifier);
      petNames.delete(fromName);

      // Delete the back-reference for the overwritten pet name if it existed.
      if (overwrittenId !== undefined) {
        const overwrittenFormulaPetNames = ids.get(overwrittenId);
        if (overwrittenFormulaPetNames !== undefined) {
          overwrittenFormulaPetNames.delete(toName);
        }
      }

      // Change the back-reference for the old pet name.
      const formulaPetNames = ids.get(formulaIdentifier);
      if (formulaPetNames !== undefined) {
        formulaPetNames.delete(fromName);
        formulaPetNames.add(toName);
      }

      const formulaIdentifierRecord = parseId(formulaIdentifier);
      changesTopic.publisher.next({
        add: toName,
        value: formulaIdentifierRecord,
      });
      changesTopic.publisher.next({ remove: fromName });
      // TODO consider retaining a backlog of overwritten names for recovery
    };

    /** @type {import('./types.js').PetStore['reverseIdentify']} */
    const reverseIdentify = formulaIdentifier => {
      assertValidId(formulaIdentifier);
      const formulaPetNames = ids.get(formulaIdentifier);
      if (formulaPetNames === undefined) {
        return harden([]);
      }
      return harden([...formulaPetNames]);
    };

    const petStore = {
      has,
      identifyLocal,
      reverseIdentify,
      list,
      follow,
      write,
      remove,
      rename,
    };

    return petStore;
  };

  /**
   * @type {import('./types.js').PetStorePowers['makeIdentifiedPetStore']}
   */
  const makeIdentifiedPetStore = (
    formulaNumber,
    formulaType,
    assertValidName,
  ) => {
    if (!isValidNumber(formulaNumber)) {
      throw new Error(
        `Invalid formula number for pet store ${q(formulaNumber)}`,
      );
    }
    const prefix = formulaNumber.slice(0, 2);
    const suffix = formulaNumber.slice(2);
    const petNameDirectoryPath = filePowers.joinPath(
      locator.statePath,
      formulaType,
      prefix,
      suffix,
    );
    return makePetStoreAtPath(petNameDirectoryPath, assertValidName);
  };

  return {
    makeIdentifiedPetStore,
  };
};
