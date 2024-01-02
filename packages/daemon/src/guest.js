// @ts-check

import { Far } from '@endo/far';

export const makeGuestMaker = ({
  provideValueForFormulaIdentifier,
  provideControllerForFormulaIdentifier,
  locate,
  makeMailbox,
  nonceLocatorFormulaIdentifier,
}) => {
  /**
   * @param {string} guestFormulaIdentifier
   * @param {string} hostFormulaIdentifier
   * @param {string} petStoreFormulaIdentifier
   * @param {string} mainWorkerFormulaIdentifier
   * @param {import('./types.js').Context} context
   */
  const makeIdentifiedGuestController = async (
    guestFormulaIdentifier,
    hostFormulaIdentifier,
    petStoreFormulaIdentifier,
    mainWorkerFormulaIdentifier,
    context,
  ) => {
    context.thisDiesIfThatDies(hostFormulaIdentifier);
    context.thisDiesIfThatDies(petStoreFormulaIdentifier);
    context.thisDiesIfThatDies(mainWorkerFormulaIdentifier);

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
      lookupPath,
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
      copy,
      move,
      makeDirectory,
      list,
      listSpecial,
      listAll,
    } = makeMailbox({
      petStore,
      selfFormulaIdentifier: guestFormulaIdentifier,
      specialNames: {
        SELF: guestFormulaIdentifier,
        HOST: hostFormulaIdentifier,
        HELO: nonceLocatorFormulaIdentifier,
      },
      context,
    });

    const { has, follow: followNames } = petStore;

    const nonceLocator = () =>
      provideValueForFormulaIdentifier(nonceLocatorFormulaIdentifier);

    /** @type {import('@endo/eventual-send').ERef<import('./types.js').EndoGuest>} */
    const guest = Far('EndoGuest', {
      has,
      lookup,
      reverseLookup,
      locate,
      request,
      send,
      list,
      listSpecial,
      listAll,
      followNames,
      followMessages,
      listMessages,
      resolve,
      reject,
      dismiss,
      adopt,
      remove,
      rename,
      copy,
      move,
      makeDirectory,
      nonceLocator,
    });

    const internal = harden({
      receive,
      respond,
      lookupPath,
    });

    return harden({ external: guest, internal });
  };

  return makeIdentifiedGuestController;
};
