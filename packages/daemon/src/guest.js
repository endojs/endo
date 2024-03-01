// @ts-check

import { Far } from '@endo/far';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';

/**
 * @param {object} args
 * @param {import('./types.js').DaemonCore['provideValueForFormulaIdentifier']} args.provideValueForFormulaIdentifier
 * @param {import('./types.js').DaemonCore['provideControllerForFormulaIdentifierAndResolveHandle']} args.provideControllerForFormulaIdentifierAndResolveHandle
 * @param {import('./types.js').DaemonCore['makeMailbox']} args.makeMailbox
 */
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
    const specialStore = makePetSitter(basePetStore, {
      SELF: guestFormulaIdentifier,
      HOST: hostHandleFormulaIdentifier,
    });
    const hostController =
      /** @type {import('./types.js').EndoHostController} */
      (
        await provideControllerForFormulaIdentifierAndResolveHandle(
          hostHandleFormulaIdentifier,
        )
      );
    const hostPrivateFacet = await hostController.internal;
    const { respond: deliverToHost } = hostPrivateFacet;
    if (deliverToHost === undefined) {
      throw new Error(
        `panic: a host request function must exist for every host`,
      );
    }

    const {
      petStore,
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
    } = makeMailbox({
      petStore: specialStore,
      selfFormulaIdentifier: guestFormulaIdentifier,
      context,
    });

    const { has, remove, rename, list, follow, listEntries, followEntries } =
      petStore;

    const followNames = () => makeIteratorRef(follow());

    /** @type {import('@endo/far').FarRef<import('./types.js').EndoGuest>} */
    const guest = Far('EndoGuest', {
      has,
      remove,
      rename,
      list,
      followNames,
      listEntries,
      followEntries,
      lookup,
      reverseLookup,
      request,
      send,
      listMessages,
      followMessages,
      resolve,
      reject,
      dismiss,
      adopt,
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
