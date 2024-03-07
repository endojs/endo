// @ts-check

import { Far } from '@endo/far';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';

/**
 * @param {object} args
 * @param {import('./types.js').DaemonCore['provideValueForFormulaIdentifier']} args.provideValueForFormulaIdentifier
 * @param {import('./types.js').DaemonCore['provideControllerForFormulaIdentifierAndResolveHandle']} args.provideControllerForFormulaIdentifierAndResolveHandle
 * @param {import('./types.js').MakeMailbox} args.makeMailbox
 * @param {import('./types.js').MakeDirectoryNode} args.makeDirectoryNode
 */
export const makeGuestMaker = ({
  provideValueForFormulaIdentifier,
  provideControllerForFormulaIdentifierAndResolveHandle,
  makeMailbox,
  makeDirectoryNode,
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

    const mailbox = makeMailbox({
      petStore: specialStore,
      selfFormulaIdentifier: guestFormulaIdentifier,
      context,
    });
    const { petStore } = mailbox;
    const directory = makeDirectoryNode(petStore);

    const {
      has,
      identify,
      list,
      listIdentifiers,
      followChanges,
      lookup,
      reverseLookup,
      write,
      move,
      remove,
      copy,
      makeDirectory,
    } = directory;
    const {
      listMessages,
      followMessages,
      resolve,
      reject,
      adopt,
      dismiss,
      request,
      send,
      receive,
      respond,
    } = mailbox;

    /** @type {import('./types.js').EndoGuest} */
    const guest = {
      // Directory
      has,
      identify,
      list,
      listIdentifiers,
      followChanges,
      lookup,
      reverseLookup,
      write,
      move,
      remove,
      copy,
      makeDirectory,
      // Mail
      listMessages,
      followMessages,
      resolve,
      reject,
      adopt,
      dismiss,
      request,
      send,
    };

    const external = Far('EndoGuest', {
      ...guest,
      followChanges: () => makeIteratorRef(guest.followChanges()),
      followMessages: () => makeIteratorRef(guest.followMessages()),
    });
    const internal = harden({
      receive,
      respond,
      petStore,
    });

    return harden({ external, internal });
  };

  return makeIdentifiedGuestController;
};
