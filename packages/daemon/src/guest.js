// @ts-check

import { Far } from '@endo/far';

export const makeGuestMaker = ({
  provideValueForFormulaIdentifier,
  provideControllerForFormulaIdentifier,
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

    const {
      has,
      list,
      follow: followNames,
      listEntries,
      followEntries,
    } = petStore;

    /** @type {import('@endo/eventual-send').ERef<import('./types.js').EndoGuest>} */
    const guest = Far('EndoGuest', {
      has,
      lookup,
      reverseLookup,
      request,
      send,
      list,
      followNames,
      listMessages,
      followMessages,
      listEntries,
      followEntries,
      resolve,
      reject,
      dismiss,
      adopt,
      remove,
      rename,
    });

    const internal = harden({
      receive,
      respond,
    });

    return harden({ external: guest, internal });
  };

  return makeIdentifiedGuestController;
};
