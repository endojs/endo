// @ts-check

import { makeExo } from '@endo/exo';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';

/** @import { Context, EndoGuest, MakeDirectoryNode, MakeMailbox, Provide } from './types.js' */
import { GuestInterface } from './interfaces.js';

/**
 * @param {object} args
 * @param {Provide} args.provide
 * @param {MakeMailbox} args.makeMailbox
 * @param {MakeDirectoryNode} args.makeDirectoryNode
 */
export const makeGuestMaker = ({ provide, makeMailbox, makeDirectoryNode }) => {
  /**
   * @param {string} guestId
   * @param {string} handleId
   * @param {string} hostAgentId
   * @param {string} hostHandleId
   * @param {string} petStoreId
   * @param {string} mainWorkerId
   * @param {Context} context
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

    const directory = makeDirectoryNode(specialStore);
    const mailbox = makeMailbox({
      petStore: specialStore,
      directory,
      selfId: handleId,
      context,
    });
    const { handle } = mailbox;

    const { reverseIdentify } = specialStore;
    const {
      has,
      identify,
      locate,
      reverseLocate,
      list,
      listIdentifiers,
      followNameChanges,
      followLocatorNameChanges,
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

    /** @type {EndoGuest} */
    const guest = {
      // Directory
      has,
      identify,
      reverseIdentify,
      locate,
      reverseLocate,
      list,
      listIdentifiers,
      followLocatorNameChanges,
      followNameChanges,
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

    return makeExo('EndoGuest', GuestInterface, {
      ...guest,
      /** @param {string} locator */
      followLocatorNameChanges: locator =>
        makeIteratorRef(guest.followLocatorNameChanges(locator)),
      followMessages: () => makeIteratorRef(guest.followMessages()),
      followNameChanges: () => makeIteratorRef(guest.followNameChanges()),
    });
  };

  return makeGuest;
};
