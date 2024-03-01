// @ts-check

import { Far } from '@endo/far';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';

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

    const basePetStore = /** @type {import('./types.js').PetStore} */ (
      await provideValueForFormulaIdentifier(petStoreFormulaIdentifier)
    );
    const petStore = makePetSitter(basePetStore, {
      SELF: guestFormulaIdentifier,
      HOST: hostHandleFormulaIdentifier,
    });
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
    } = makeMailbox({
      petStore,
      selfFormulaIdentifier: guestFormulaIdentifier,
      context,
    });

    const { has, follow, listEntries, followEntries } = petStore;

    const followNames = () => makeIteratorRef(follow());

    /** @type {import('@endo/far').FarRef<import('./types.js').EndoGuest>} */
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
      petStore,
    });

    return harden({ external: guest, internal });
  };

  return makeIdentifiedGuestController;
};
