// @ts-check

import { makeChangeTopic } from './pubsub.js';
import { parseId, assertValidId, isValidNumber } from './formula-identifier.js';
import { makeBidirectionalMultimap } from './multimap.js';

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
    /** @type {import('./types.js').BidirectionalMultimap<string, string>} */
    const idsToPetNames = makeBidirectionalMultimap();
    /** @type {import('./types.js').Topic<({ add: string, value: import('./types.js').IdRecord } | { remove: string })>} */
    const nameChangesTopic = makeChangeTopic();

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
        idsToPetNames.add(formulaIdentifier, petName);
      }),
    );

    /** @type {import('./types.js').PetStore['has']} */
    const has = petName => {
      assertValidName(petName);
      return idsToPetNames.hasValue(petName);
    };

    /** @type {import('./types.js').PetStore['identifyLocal']} */
    const identifyLocal = petName => {
      assertValidName(petName);
      return idsToPetNames.get(petName);
    };

    /** @type {import('./types.js').PetStore['write']} */
    const write = async (petName, formulaIdentifier) => {
      assertValidName(petName);
      assertValidId(formulaIdentifier);

      if (idsToPetNames.hasValue(petName)) {
        const oldFormulaIdentifier = idsToPetNames.get(petName);
        if (oldFormulaIdentifier === formulaIdentifier) {
          return;
        }

        if (oldFormulaIdentifier !== undefined) {
          // Perform cleanup on the overwritten pet name.
          idsToPetNames.delete(oldFormulaIdentifier, petName);
          nameChangesTopic.publisher.next({ remove: petName });
        }
      }

      idsToPetNames.add(formulaIdentifier, petName);

      const petNamePath = filePowers.joinPath(petNameDirectoryPath, petName);
      const petNameText = `${formulaIdentifier}\n`;
      await filePowers.writeFileText(petNamePath, petNameText);
      const formulaIdentifierRecord = parseId(formulaIdentifier);
      nameChangesTopic.publisher.next({
        add: petName,
        value: formulaIdentifierRecord,
      });
    };

    /**
     * @param {string} petName
     * @returns {import('./types.js').IdRecord}
     */
    const formulaIdentifierRecordForName = petName => {
      const formulaIdentifier = idsToPetNames.get(petName);
      if (formulaIdentifier === undefined) {
        throw new Error(`Formula does not exist for pet name ${q(petName)}`);
      }
      return parseId(formulaIdentifier);
    };

    /** @type {import('./types.js').PetStore['list']} */
    const list = () => harden(idsToPetNames.getAllValues().sort());

    /** @type {import('./types.js').PetStore['follow']} */
    const follow = async function* currentAndSubsequentNames() {
      const changes = nameChangesTopic.subscribe();
      for (const name of idsToPetNames.getAllValues().sort()) {
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
      const formulaIdentifier = idsToPetNames.get(petName);
      if (formulaIdentifier === undefined) {
        throw new Error(
          `Formula does not exist for pet name ${JSON.stringify(petName)}`,
        );
      }
      assertValidId(formulaIdentifier, petName);

      const petNamePath = filePowers.joinPath(petNameDirectoryPath, petName);
      await filePowers.removePath(petNamePath);
      idsToPetNames.delete(formulaIdentifier, petName);
      nameChangesTopic.publisher.next({ remove: petName });
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
      const formulaIdentifier = idsToPetNames.get(fromName);
      const overwrittenId = idsToPetNames.get(toName);
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

      // Delete the back-reference for the overwritten pet name if it existed.
      if (overwrittenId !== undefined) {
        idsToPetNames.delete(overwrittenId, toName);
      }

      // Update the mapping for the pet name.
      idsToPetNames.add(formulaIdentifier, toName);

      const formulaIdentifierRecord = parseId(formulaIdentifier);
      nameChangesTopic.publisher.next({
        add: toName,
        value: formulaIdentifierRecord,
      });
      nameChangesTopic.publisher.next({ remove: fromName });
      // TODO consider retaining a backlog of overwritten names for recovery
    };

    /** @type {import('./types.js').PetStore['reverseIdentify']} */
    const reverseIdentify = formulaIdentifier => {
      assertValidId(formulaIdentifier);
      const formulaPetNames = idsToPetNames.getAllValuesFor(formulaIdentifier);
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
