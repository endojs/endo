// @ts-check

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';

/**
 * @param {object} args
 * @param {import('./types.js').DaemonCore['provide']} args.provide
 * @param {import('./types.js').DaemonCore['provideControllerAndResolveHandle']} args.provideControllerAndResolveHandle
 * @param {import('./types.js').MakeMailbox} args.makeMailbox
 * @param {import('./types.js').MakeDirectoryNode} args.makeDirectoryNode
 */
export const makeGuestMaker = ({
  provide,
  provideControllerAndResolveHandle,
  makeMailbox,
  makeDirectoryNode,
}) => {
  /**
   * @param {string} guestId
   * @param {string} handleId
   * @param {string} hostAgentId
   * @param {string} hostHandleId
   * @param {string} petStoreId
   * @param {string} mainWorkerId
   * @param {import('./types.js').Context} context
   */
  const makeIdentifiedGuestController = async (
    guestId,
    handleId,
    hostAgentId,
    hostHandleId,
    petStoreId,
    mainWorkerId,
    context,
  ) => {
    context.thisDiesIfThatDies(hostHandleId);
    context.thisDiesIfThatDies(hostAgentId);
    context.thisDiesIfThatDies(petStoreId);
    context.thisDiesIfThatDies(mainWorkerId);

    const basePetStore = /** @type {import('./types.js').PetStore} */ (
      await provide(petStoreId)
    );
    const specialStore = makePetSitter(basePetStore, {
      AGENT: guestId,
      SELF: handleId,
      HOST: hostHandleId,
    });
    const hostController =
      /** @type {import('./types.js').EndoHostController} */
      (await provideControllerAndResolveHandle(hostHandleId));
    const hostPrivateFacet = await hostController.internal;
    const { respond: deliverToHost } = hostPrivateFacet;
    if (deliverToHost === undefined) {
      throw new Error(
        `panic: a host request function must exist for every host`,
      );
    }

    const mailbox = makeMailbox({
      petStore: specialStore,
      selfId: handleId,
      context,
    });
    const { petStore } = mailbox;
    const directory = makeDirectoryNode(petStore);

    const { reverseIdentify } = specialStore;
    const {
      has,
      identify,
      locate,
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

    const handle = makeExo(
      'EndoGuestHandle',
      M.interface('EndoGuestHandle', {}),
      {},
    );

    /** @type {import('./types.js').EndoGuest} */
    const guest = {
      // Agent
      handle: () => handle,
      // Directory
      has,
      identify,
      reverseIdentify,
      locate,
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

    const external = makeExo(
      'EndoGuest',
      M.interface('EndoGuest', {}, { defaultGuards: 'passable' }),
      {
        ...guest,
        followChanges: () => makeIteratorRef(guest.followChanges()),
        followMessages: () => makeIteratorRef(guest.followMessages()),
      },
    );
    const internal = harden({
      receive,
      respond,
      petStore,
    });

    return harden({ external, internal });
  };

  return makeIdentifiedGuestController;
};
