// @ts-check

import { Far } from '@endo/far';
import { makeChangeTopic } from './pubsub.js';
import { makeIteratorRef } from './reader-ref.js';
import { parseFormulaIdentifier } from './formula-identifier.js';

const { quote: q } = assert;

const validIdPattern = /^[0-9a-f]{128}$/;
const validFormulaPattern =
  /^(?:(?:readable-blob|worker|pet-store|pet-inspector|eval|lookup|make-unconfined|make-bundle|host|guest|handle):[0-9a-f]{128}|web-bundle:[0-9a-f]{32})$/;

/**
 * @param {import('./types.js').FilePowers} filePowers
 * @param {import('./types.js').Locator} locator
 */
export const makePetStoreMaker = (filePowers, locator) => {
  /**
   * @param {string} petNameDirectoryPath
   * @param {(name: string) => void} assertValidName
   * @returns {Promise<import('@endo/far').FarRef<import('./types.js').PetStore>>}
   */
  const makePetStoreAtPath = async (petNameDirectoryPath, assertValidName) => {
    /** @type {Map<string, string>} */
    const petNames = new Map();
    /** @type {Map<string, Set<string>>} */
    const formulaIdentifiers = new Map();
    /** @type {import('./types.js').Topic<({ add: string, value: import('./types.js').FormulaIdentifierRecord } | { remove: string })>} */
    const changesTopic = makeChangeTopic();

    /** @param {string} petName */
    const read = async petName => {
      const petNamePath = filePowers.joinPath(petNameDirectoryPath, petName);
      const petNameText = await filePowers.readFileText(petNamePath);
      const formulaIdentifier = petNameText.trim();
      if (!validFormulaPattern.test(formulaIdentifier)) {
        throw new Error(
          `Invalid formula identifier ${q(formulaIdentifier)} for pet name ${q(
            petName,
          )}`,
        );
      }
      return formulaIdentifier;
    };

    await filePowers.makePath(petNameDirectoryPath);

    const fileNames = await filePowers.readDirectory(petNameDirectoryPath);
    await Promise.all(
      fileNames.map(async petName => {
        assertValidName(petName);
        const formulaIdentifier = await read(petName);
        petNames.set(petName, formulaIdentifier);
        const formulaPetNames = formulaIdentifiers.get(formulaIdentifier);
        if (formulaPetNames !== undefined) {
          formulaPetNames.add(petName);
        } else {
          formulaIdentifiers.set(formulaIdentifier, new Set([petName]));
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
      if (!validFormulaPattern.test(formulaIdentifier)) {
        throw new Error(`Invalid formula identifier ${q(formulaIdentifier)}`);
      }

      if (petNames.has(petName)) {
        // Perform cleanup on the overwritten pet name.
        const formulaPetNames = formulaIdentifiers.get(petName);
        if (formulaPetNames !== undefined) {
          formulaPetNames.delete(petName);
        }
        changesTopic.publisher.next({ remove: petName });
      }

      petNames.set(petName, formulaIdentifier);

      const formulaPetNames = formulaIdentifiers.get(formulaIdentifier);
      if (formulaPetNames === undefined) {
        formulaIdentifiers.set(formulaIdentifier, new Set([petName]));
      } else {
        formulaPetNames.add(petName);
      }

      const petNamePath = filePowers.joinPath(petNameDirectoryPath, petName);
      const petNameText = `${formulaIdentifier}\n`;
      await filePowers.writeFileText(petNamePath, petNameText);
      const formulaIdentifierRecord = parseFormulaIdentifier(formulaIdentifier);
      changesTopic.publisher.next({
        add: petName,
        value: formulaIdentifierRecord,
      });
    };

    /**
     * @param {string} petName
     * @returns {import('./types.js').FormulaIdentifierRecord}
     */
    const formulaIdentifierRecordForName = petName => {
      const formulaIdentifier = petNames.get(petName);
      if (formulaIdentifier === undefined) {
        throw new Error(`Formula does not exist for pet name ${q(petName)}`);
      }
      return parseFormulaIdentifier(formulaIdentifier);
    };

    // Returns in an Array format.
    /** @type {import('./types.js').PetStore['list']} */
    const list = () => harden([...petNames.keys()].sort());
    // Returns in an object operations format ({ add, value } or { remove }).
    /** @type {import('./types.js').PetStore['follow']} */
    const follow = async () =>
      makeIteratorRef(
        (async function* currentAndSubsequentNames() {
          const changes = changesTopic.subscribe();
          for (const name of [...petNames.keys()].sort()) {
            const formulaIdentifierRecord =
              formulaIdentifierRecordForName(name);
            yield /** @type {{ add: string, value: import('./types.js').FormulaIdentifierRecord }} */ ({
              add: name,
              value: formulaIdentifierRecord,
            });
          }
          yield* changes;
        })(),
      );

    // Returns in Object.fromEntries format.
    /** @type {import('./types.js').PetStore['listEntries']} */
    const listEntries = () =>
      harden(
        [...petNames.keys()].sort().map(name => {
          return [name, formulaIdentifierRecordForName(name)];
        }),
      );
    // Provided as an alias for follow, with naming symmetry to listEntries.
    /** @type {import('./types.js').PetStore['follow']} */
    const followEntries = follow;

    /** @type {import('./types.js').PetStore['remove']} */
    const remove = async petName => {
      assertValidName(petName);
      const formulaIdentifier = petNames.get(petName);
      if (formulaIdentifier === undefined) {
        throw new Error(
          `Formula does not exist for pet name ${JSON.stringify(petName)}`,
        );
      }
      if (!validFormulaPattern.test(formulaIdentifier)) {
        throw new Error(`Invalid formula identifier ${q(formulaIdentifier)}`);
      }

      const petNamePath = filePowers.joinPath(petNameDirectoryPath, petName);
      await filePowers.removePath(petNamePath);
      petNames.delete(petName);
      const formulaPetNames = formulaIdentifiers.get(petName);
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
      const overwrittenFormulaIdentifier = petNames.get(toName);
      if (formulaIdentifier === undefined) {
        throw new Error(
          `Formula does not exist for pet name ${JSON.stringify(fromName)}`,
        );
      }
      if (!validFormulaPattern.test(formulaIdentifier)) {
        throw new Error(`Invalid formula identifier ${q(formulaIdentifier)}`);
      }
      if (
        overwrittenFormulaIdentifier !== undefined &&
        !validFormulaPattern.test(overwrittenFormulaIdentifier)
      ) {
        throw new Error(
          `Invalid formula identifier ${q(overwrittenFormulaIdentifier)}`,
        );
      }

      const fromPath = filePowers.joinPath(petNameDirectoryPath, fromName);
      const toPath = filePowers.joinPath(petNameDirectoryPath, toName);
      await filePowers.renamePath(fromPath, toPath);
      petNames.set(toName, formulaIdentifier);
      petNames.delete(fromName);

      // Delete the back-reference for the overwritten pet name if it existed.
      if (overwrittenFormulaIdentifier !== undefined) {
        const overwrittenFormulaPetNames = formulaIdentifiers.get(
          overwrittenFormulaIdentifier,
        );
        if (overwrittenFormulaPetNames !== undefined) {
          overwrittenFormulaPetNames.delete(toName);
        }
      }

      // Change the back-reference for the old pet name.
      const formulaPetNames = formulaIdentifiers.get(formulaIdentifier);
      if (formulaPetNames !== undefined) {
        formulaPetNames.delete(fromName);
        formulaPetNames.add(toName);
      }

      const formulaIdentifierRecord = parseFormulaIdentifier(formulaIdentifier);
      changesTopic.publisher.next({
        add: toName,
        value: formulaIdentifierRecord,
      });
      changesTopic.publisher.next({ remove: fromName });
      // TODO consider retaining a backlog of overwritten names for recovery
    };

    /** @type {import('./types.js').PetStore['reverseLookup']} */
    const reverseLookup = formulaIdentifier => {
      if (!validFormulaPattern.test(formulaIdentifier)) {
        throw new Error(`Invalid formula identifier ${q(formulaIdentifier)}`);
      }
      const formulaPetNames = formulaIdentifiers.get(formulaIdentifier);
      if (formulaPetNames === undefined) {
        return harden([]);
      }
      return harden([...formulaPetNames]);
    };

    const petStore = {
      has,
      identifyLocal,
      reverseLookup,
      list,
      follow,
      listEntries,
      followEntries,
      write,
      remove,
      rename,
    };

    return Far('PetStore', petStore);
  };

  /**
   * @param {string} id
   * @param {(name: string) => void} assertValidName
   */
  const makeIdentifiedPetStore = (id, assertValidName) => {
    if (!validIdPattern.test(id)) {
      throw new Error(`Invalid identifier for pet store ${q(id)}`);
    }
    const prefix = id.slice(0, 2);
    const suffix = id.slice(2);
    const petNameDirectoryPath = filePowers.joinPath(
      locator.statePath,
      'pet-store',
      prefix,
      suffix,
    );
    return makePetStoreAtPath(petNameDirectoryPath, assertValidName);
  };

  return {
    makeIdentifiedPetStore,
  };
};
