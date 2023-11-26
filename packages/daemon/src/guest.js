// @ts-check

import { Far } from '@endo/far';
import { assertPetName } from './pet-name.js';

export const makeGuestMaker = ({
  provideValueForFormulaIdentifier,
  provideControllerForFormulaIdentifier,
  storeReaderRef,
  makeMailbox,
}) => {
  /**
   * @param {string} guestFormulaIdentifier
   * @param {string} hostFormulaIdentifier
   * @param {string} petStoreFormulaIdentifier
   * @param {string} mainWorkerFormulaIdentifier
   * @param {import('./types.js').Terminator} terminator
   */
  const makeIdentifiedGuestController = async (
    guestFormulaIdentifier,
    hostFormulaIdentifier,
    petStoreFormulaIdentifier,
    mainWorkerFormulaIdentifier,
    terminator,
  ) => {
    terminator.thisDiesIfThatDies(hostFormulaIdentifier);
    terminator.thisDiesIfThatDies(petStoreFormulaIdentifier);
    terminator.thisDiesIfThatDies(mainWorkerFormulaIdentifier);

    const petStore = /** @type {import('./types.js').PetStore} */ (
      await provideValueForFormulaIdentifier(petStoreFormulaIdentifier)
    );
    const hostController = /** @type {import('./types.js').Controller<>} */ (
      await provideControllerForFormulaIdentifier(hostFormulaIdentifier)
    );
    const hostPrivateFacet = await hostController.internal;
    if (hostPrivateFacet === undefined) {
      throw new Error(
        `panic: a host request function must exist for every host`,
      );
    }
    const { respond: deliverToHost } = hostPrivateFacet;
    if (deliverToHost === undefined) {
      throw new Error(
        `panic: a host request function must exist for every host`,
      );
    }

    const {
      lookup,
      reverseLookup,
      followMessages,
      listMessages,
      resolve,
      reject,
      dismiss,
      adopt,
      send,
      receive,
      respond,
      request,
      rename,
      remove,
    } = makeMailbox({
      petStore,
      selfFormulaIdentifier: guestFormulaIdentifier,
      specialNames: {
        SELF: guestFormulaIdentifier,
        HOST: hostFormulaIdentifier,
      },
      terminator,
    });

    /**
     * @param {import('@endo/eventual-send').ERef<AsyncIterableIterator<string>>} readerRef
     * @param {string} [petName]
     */
    const store = async (readerRef, petName) => {
      if (petName !== undefined) {
        assertPetName(petName);
      }

      const formulaIdentifier = await storeReaderRef(readerRef);

      if (petName !== undefined) {
        await petStore.write(petName, formulaIdentifier);
      }
    };

    /**
     * @param {string} petName
     */
    const has = async petName => {
      try {
        await lookup(petName);
        return true;
      } catch (error) {
        return false;
      }
    }

    const { list, follow: followNames } = petStore;

    /** @type {import('@endo/eventual-send').ERef<import('./types.js').EndoGuest>} */
    const guest = Far('EndoGuest', {
      has,
      lookup,
      reverseLookup,
      request,
      send,
      list,
      followNames,
      followMessages,
      listMessages,
      resolve,
      reject,
      dismiss,
      adopt,
      remove,
      rename,
      store,
    });

    const internal = harden({
      receive,
      respond,
    });

    return harden({ external: guest, internal });
  };

  return makeIdentifiedGuestController;
};
