// @ts-check

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';

/**
 * @param {object} args
 * @param {import('./types.js').DaemonCore['provide']} args.provide
 * @param {import('./types.js').MakeMailbox} args.makeMailbox
 * @param {import('./types.js').MakeDirectoryNode} args.makeDirectoryNode
 */
export const makeGuestMaker = ({ provide, makeMailbox, makeDirectoryNode }) => {
  /**
   * @param {string} guestId
   * @param {string} handleId
   * @param {string} hostAgentId
   * @param {string} hostHandleId
   * @param {string} petStoreId
   * @param {string} mainWorkerId
   * @param {import('./types.js').Context} context
   */
  const makeGuest = async (
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

    const basePetStore = await provide(petStoreId, 'pet-store');
    const specialStore = makePetSitter(basePetStore, {
      AGENT: guestId,
      SELF: handleId,
      HOST: hostHandleId,
    });

    const mailbox = makeMailbox({
      petStore: specialStore,
      selfId: handleId,
      context,
    });
    const { petStore, handle } = mailbox;
    const directory = makeDirectoryNode(petStore);

    const { reverseIdentify } = specialStore;
    const {
      has,
      identify,
      locate,
      reverseLocate,
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
      deliver,
    } = mailbox;

    /** @type {import('./types.js').EndoGuest} */
    const guest = {
      // Directory
      has,
      identify,
      reverseIdentify,
      locate,
      reverseLocate,
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
      handle,
      listMessages,
      followMessages,
      resolve,
      reject,
      adopt,
      dismiss,
      request,
      send,
      deliver,
    };

    return makeExo(
      'EndoGuest',
      M.interface('EndoGuest', {}, { defaultGuards: 'passable' }),
      {
        ...guest,
        followChanges: () => makeIteratorRef(guest.followChanges()),
        followMessages: () => makeIteratorRef(guest.followMessages()),
      },
    );
  };

  return makeGuest;
};
