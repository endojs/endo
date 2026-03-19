// @ts-check

import harden from '@endo/harden';
import { makeChangeTopic } from './pubsub.js';
import { parseId, assertValidId } from './formula-identifier.js';
import { makeBidirectionalMultimap } from './multimap.js';
/** @import { BidirectionalMultimap, DaemonDatabase, IdChangesTopic, Name, NameChangesTopic, PetName, PetStore, PetStoreIdNameChange, PetStoreNameChange, PetStorePowers } from './types.js' */

/**
 * @param {DaemonDatabase} daemonDb
 * @returns {PetStorePowers}
 */
export const makePetStoreMaker = daemonDb => {
  /**
   * @param {string} storeNumber
   * @param {string} storeType
   * @param {(name: string) => asserts name is Name} assertValidName
   * @returns {PetStore}
   */
  const makePetStoreFromDb = (storeNumber, storeType, assertValidName) => {
    /** @type {BidirectionalMultimap<string, Name>} */
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
     * @param {Name} petName - The new name.
     */
    const publishNameAddition = (id, petName) => {
      assertValidName(petName);
      const idRecord = parseId(id);
      nameChangesTopic.publisher.next({
        add: petName,
        value: idRecord,
      });
      publishIdChangeToSubscribers(id, {
        add: idRecord,
        names: [petName],
      });
    };

    /**
     * @param {string} id - The id from which a name is being removed.
     * @param {Name} petName - The removed name.
     */
    const publishNameRemoval = (id, petName) => {
      assertValidName(petName);
      nameChangesTopic.publisher.next({ remove: petName });
      if (id !== undefined) {
        publishIdChangeToSubscribers(id, {
          remove: parseId(id),
          names: [petName],
        });
      }
    };

    // Load entries from database into in-memory map.
    const entries = daemonDb.listPetStoreEntries(storeNumber, storeType);
    for (const { name, formulaId } of entries) {
      assertValidName(name);
      assertValidId(formulaId, name);
      idsToPetNames.add(formulaId, name);
    }

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

    /** @type {PetStore['storeIdentifier']} */
    const storeIdentifier = async (petName, formulaIdentifier) => {
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
      daemonDb.writePetStoreEntry(
        storeNumber,
        storeType,
        petName,
        formulaIdentifier,
      );
      publishNameAddition(formulaIdentifier, petName);
    };

    /** @type {PetStore['list']} */
    const list = () => {
      // All names in the pet store have been validated before storage
      const names = /** @type {PetName[]} */ (idsToPetNames.getAll().sort());
      return harden(names);
    };

    /** @type {PetStore['followNameChanges']} */
    const followNameChanges = async function* currentAndSubsequentNames() {
      const subscription = nameChangesTopic.subscribe();
      for (const name of idsToPetNames.getAll().sort()) {
        const idRecord = parseId(
          /** @type {string} */ (idsToPetNames.getKey(name)),
        );

        yield {
          add: name,
          value: idRecord,
        };
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
      yield {
        add: parseId(id),
        names: existingNames,
      };

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

      daemonDb.deletePetStoreEntry(storeNumber, storeType, petName);
      idsToPetNames.delete(formulaIdentifier, petName);
      publishNameRemoval(formulaIdentifier, petName);
      // TODO consider retaining a backlog of deleted names for recovery
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

      daemonDb.renamePetStoreEntry(storeNumber, storeType, fromName, toName);

      // Delete the back-reference for the overwritten pet name if it existed.
      if (overwrittenId !== undefined) {
        idsToPetNames.delete(overwrittenId, toName);
        publishNameRemoval(overwrittenId, toName);
      }

      // Update the mapping for the pet name.
      idsToPetNames.delete(formulaIdentifier, fromName);
      idsToPetNames.add(formulaIdentifier, toName);

      publishNameRemoval(formulaIdentifier, fromName);
      publishNameAddition(formulaIdentifier, toName);
      // TODO consider tracking historical pet names for formulas
    };

    /** @type {PetStore['reverseIdentify']} */
    const reverseIdentify = formulaIdentifier => {
      assertValidId(formulaIdentifier);
      const formulaPetNames = idsToPetNames.getAllFor(formulaIdentifier);
      if (formulaPetNames === undefined) {
        return harden([]);
      }
      // All names in the pet store have been validated before storage
      const names = /** @type {PetName[]} */ ([...formulaPetNames]);
      return harden(names);
    };

    const petStore = {
      has,
      identifyLocal,
      reverseIdentify,
      list,
      followIdNameChanges,
      followNameChanges,
      storeIdentifier,
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
    // Return synchronously-created pet store wrapped in a resolved promise
    // to maintain the existing async interface.
    return Promise.resolve(
      makePetStoreFromDb(formulaNumber, formulaType, assertValidName),
    );
  };

  return {
    makeIdentifiedPetStore,
    deletePetStore: async (
      /** @type {string} */ formulaNumber,
      /** @type {string} */ formulaType,
    ) => daemonDb.deletePetStore(formulaNumber, formulaType),
  };
};
