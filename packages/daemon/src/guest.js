// @ts-check

import { Far } from '@endo/far';

export const makeGuestMaker = ({
  provideValueForFormulaIdentifier,
  provideControllerForFormulaIdentifierAndResolveHandle,
  makeMailbox,
}) => {
  /**
   * @param {string} guestFormulaIdentifier
   * @param {string} hostHandleFormulaIdentifier
   * @param {string} petStoreFormulaIdentifier
   * @param {string} mainWorkerFormulaIdentifier
   * @param {import('./types.js').Context} context
   */
  const makeIdentifiedGuestController = async (
    guestFormulaIdentifier,
    hostHandleFormulaIdentifier,
    petStoreFormulaIdentifier,
    mainWorkerFormulaIdentifier,
    context,
  ) => {
    context.thisDiesIfThatDies(hostHandleFormulaIdentifier);
    context.thisDiesIfThatDies(petStoreFormulaIdentifier);
    context.thisDiesIfThatDies(mainWorkerFormulaIdentifier);

    const petStore = /** @type {import('./types.js').PetStore} */ (
      await provideValueForFormulaIdentifier(petStoreFormulaIdentifier)
    );
    const hostController =
      await provideControllerForFormulaIdentifierAndResolveHandle(
        hostHandleFormulaIdentifier,
      );
    const hostPrivateFacet = await hostController.internal;
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
      list,
      listSpecial,
      listAll,
    } = makeMailbox({
      petStore,
      selfFormulaIdentifier: guestFormulaIdentifier,
      specialNames: {
        SELF: guestFormulaIdentifier,
        HOST: hostHandleFormulaIdentifier,
      },
      context,
    });

    const { has, follow: followNames, listEntries, followEntries } = petStore;

    /** @type {import('@endo/eventual-send').ERef<import('./types.js').EndoGuest>} */
    const guest = Far('EndoGuest', {
      has,
      lookup,
      reverseLookup,
      request,
      send,
      list,
      listSpecial,
      listAll,
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
      petStore,
    });

    return harden({ external: guest, internal });
  };

  return makeIdentifiedGuestController;
};
