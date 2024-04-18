// @ts-check

import { makeChangeTopic } from './pubsub.js';
import { parseId, assertValidId, isValidNumber } from './formula-identifier.js';
import { makeBidirectionalMultimap } from './multimap.js';

/** @import { BidirectionalMultimap, Config, FilePowers, IdChangesTopic, NameChangesTopic, PetStore, PetStoreIdNameChange, PetStoreNameChange, PetStorePowers } from './types.js' */

const { quote: q } = assert;

/**
 * @param {FilePowers} filePowers
 * @param {Config} config
 */
export const makePetStoreMaker = (filePowers, config) => {
  /**
   * @param {string} petNameDirectoryPath
   * @param {(name: string) => void} assertValidName
   * @returns {Promise<PetStore>}
   */
  const makePetStoreAtPath = async (petNameDirectoryPath, assertValidName) => {
    /** @type {BidirectionalMultimap<string, string>} */
    const idsToPetNames = makeBidirectionalMultimap();
    /** @type {NameChangesTopic} */
    const nameChangesTopic = makeChangeTopic();

    /** @returns {IdChangesTopic} */
    const makeIdChangeTopic = () => makeChangeTopic();
    /** @type {Map<string, ReturnType<typeof makeIdChangeTopic>>} */
    const idsToTopics = new Map();

    /**
     * Publishes an id change to its subscribers, if any.
     *
     * @param {string} id - The id to publish a change for.
     * @param {PetStoreIdNameChange} payload - The payload to publish.
     */
    const publishIdChangeToSubscribers = (id, payload) => {
      const idTopic = idsToTopics.get(id);
      if (idTopic !== undefined) {
        idTopic.publisher.next(payload);
      }
    };

    /**
     * @param {string} id - The id receiving a name new name.
     * @param {string} petName - The new name.
     */
    const publishNameAddition = (id, petName) => {
      const idRecord = parseId(id);
      nameChangesTopic.publisher.next({ add: petName, value: idRecord });
      publishIdChangeToSubscribers(id, { add: idRecord, names: [petName] });
    };

    /**
     * @param {string} id - The id from which a name is being removed.
     * @param {string} petName - The removed name.
     */
    const publishNameRemoval = (id, petName) => {
      nameChangesTopic.publisher.next({ remove: petName });
      if (id !== undefined) {
        publishIdChangeToSubscribers(id, {
          remove: parseId(id),
          names: [petName],
        });
      }
    };

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

    /** @type {PetStore['has']} */
    const has = petName => {
      assertValidName(petName);
      return idsToPetNames.hasValue(petName);
    };

    /** @type {PetStore['identifyLocal']} */
    const identifyLocal = petName => {
      assertValidName(petName);
      return idsToPetNames.getKey(petName);
    };

    /** @type {PetStore['write']} */
    const write = async (petName, formulaIdentifier) => {
      assertValidName(petName);
      assertValidId(formulaIdentifier);

      if (idsToPetNames.hasValue(petName)) {
        const oldFormulaIdentifier = idsToPetNames.getKey(petName);
        if (oldFormulaIdentifier === formulaIdentifier) {
          return;
        }

        if (oldFormulaIdentifier !== undefined) {
          // Perform cleanup on the overwritten pet name.
          idsToPetNames.delete(oldFormulaIdentifier, petName);
          publishNameRemoval(oldFormulaIdentifier, petName);
        }
      }

      idsToPetNames.add(formulaIdentifier, petName);

      const petNamePath = filePowers.joinPath(petNameDirectoryPath, petName);
      const petNameText = `${formulaIdentifier}\n`;
      await filePowers.writeFileText(petNamePath, petNameText);
      publishNameAddition(formulaIdentifier, petName);
    };

    /** @type {PetStore['list']} */
    const list = () => harden(idsToPetNames.getAll().sort());

    /** @type {PetStore['followNameChanges']} */
    const followNameChanges = async function* currentAndSubsequentNames() {
      const subscription = nameChangesTopic.subscribe();
      for (const name of idsToPetNames.getAll().sort()) {
        const idRecord = parseId(
          /** @type {string} */ (idsToPetNames.getKey(name)),
        );

        yield /** @type {PetStoreNameChange} */ ({
          add: name,
          value: idRecord,
        });
      }
      yield* subscription;
    };

    /** @type {PetStore['followIdNameChanges']} */
    const followIdNameChanges = async function* currentAndSubsequentIds(id) {
      if (!idsToTopics.has(id)) {
        idsToTopics.set(id, makeIdChangeTopic());
      }
      const idTopic = /** @type {IdChangesTopic} */ (idsToTopics.get(id));
      const subscription = idTopic.subscribe();

      const existingNames = idsToPetNames.getAllFor(id).sort();
      yield /** @type {PetStoreIdNameChange} */ ({
        add: parseId(id),
        names: existingNames,
      });

      yield* subscription;
    };

    /** @type {PetStore['remove']} */
    const remove = async petName => {
      assertValidName(petName);
      const formulaIdentifier = idsToPetNames.getKey(petName);
      if (formulaIdentifier === undefined) {
        throw new Error(
          `Formula does not exist for pet name ${JSON.stringify(petName)}`,
        );
      }
      assertValidId(formulaIdentifier, petName);

      const petNamePath = filePowers.joinPath(petNameDirectoryPath, petName);
      await filePowers.removePath(petNamePath);
      idsToPetNames.delete(formulaIdentifier, petName);
      publishNameRemoval(formulaIdentifier, petName);
      // TODO consider retaining a backlog of deleted names for recovery
      // TODO consider tracking historical pet names for formulas
    };

    /** @type {PetStore['rename']} */
    const rename = async (fromName, toName) => {
      assertValidName(fromName);
      assertValidName(toName);
      if (fromName === toName) {
        return;
      }
      const formulaIdentifier = idsToPetNames.getKey(fromName);
      const overwrittenId = idsToPetNames.getKey(toName);
      if (formulaIdentifier === undefined) {
        throw new Error(
          `Formula does not exist for pet name ${JSON.stringify(fromName)}`,
        );
      }
      assertValidId(formulaIdentifier, fromName);

      const fromPath = filePowers.joinPath(petNameDirectoryPath, fromName);
      const toPath = filePowers.joinPath(petNameDirectoryPath, toName);
      await filePowers.renamePath(fromPath, toPath);

      // Delete the back-reference for the overwritten pet name if it existed.
      if (overwrittenId !== undefined) {
        idsToPetNames.delete(overwrittenId, toName);
        publishNameRemoval(overwrittenId, toName);
      }

      // Update the mapping for the pet name.
      idsToPetNames.add(formulaIdentifier, toName);

      publishNameRemoval(formulaIdentifier, fromName);
      publishNameAddition(formulaIdentifier, toName);
      // TODO consider retaining a backlog of overwritten names for recovery
    };

    /** @type {PetStore['reverseIdentify']} */
    const reverseIdentify = formulaIdentifier => {
      assertValidId(formulaIdentifier);
      const formulaPetNames = idsToPetNames.getAllFor(formulaIdentifier);
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
      followIdNameChanges,
      followNameChanges,
      write,
      remove,
      rename,
    };

    return petStore;
  };

  /**
   * @type {PetStorePowers['makeIdentifiedPetStore']}
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
      config.statePath,
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
