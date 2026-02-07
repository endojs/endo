// @ts-check

import { makeExo } from '@endo/exo';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';
import {
  guestHelp,
  directoryHelp,
  mailHelp,
  makeHelp,
} from './help-text.js';

/** @import { Context, EndoGuest, FormulaIdentifier, MakeDirectoryNode, MakeMailbox, Provide } from './types.js' */
import { GuestInterface } from './interfaces.js';

/**
 * @param {object} args
 * @param {Provide} args.provide
 * @param {MakeMailbox} args.makeMailbox
 * @param {MakeDirectoryNode} args.makeDirectoryNode
 */
export const makeGuestMaker = ({ provide, makeMailbox, makeDirectoryNode }) => {
  /**
   * @param {FormulaIdentifier} guestId
   * @param {FormulaIdentifier} handleId
   * @param {FormulaIdentifier} hostAgentId
   * @param {FormulaIdentifier} hostHandleId
   * @param {FormulaIdentifier} petStoreId
   * @param {FormulaIdentifier} mailboxStoreId
   * @param {FormulaIdentifier} mailHubId
   * @param {FormulaIdentifier} mainWorkerId
   * @param {Context} context
   */
  const makeGuest = async (
    guestId,
    handleId,
    hostAgentId,
    hostHandleId,
    petStoreId,
    mailboxStoreId,
    mailHubId,
    mainWorkerId,
    context,
  ) => {
    context.thisDiesIfThatDies(hostHandleId);
    context.thisDiesIfThatDies(hostAgentId);
    context.thisDiesIfThatDies(petStoreId);
    context.thisDiesIfThatDies(mailboxStoreId);
    context.thisDiesIfThatDies(mailHubId);
    context.thisDiesIfThatDies(mainWorkerId);

    const basePetStore = await provide(petStoreId, 'pet-store');
    const mailboxStore = await provide(mailboxStoreId, 'mailbox-store');
    const specialStore = makePetSitter(basePetStore, {
      AGENT: guestId,
      SELF: handleId,
      HOST: hostHandleId,
      MAIL: mailHubId,
    });

    const directory = makeDirectoryNode(specialStore);
    const mailbox = await makeMailbox({
      petStore: specialStore,
      mailboxStore,
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
      requestEvaluation: mailboxRequestEvaluation,
      define: mailboxDefine,
      form: mailboxForm,
      deliver,
    } = mailbox;

    /**
     * Request sandboxed evaluation. Sends an eval-request to HOST.
     * @param {string} source
     * @param {Array<string>} codeNames
     * @param {import('./types.js').NamesOrPaths} petNamePaths
     * @param {import('./types.js').NameOrPath} [resultName]
     * @returns {Promise<unknown>}
     */
    const requestEvaluation = (source, codeNames, petNamePaths, resultName) =>
      mailboxRequestEvaluation('HOST', source, codeNames, petNamePaths, resultName);

    /**
     * Propose code with named slots for host to endow.
     * @param {string} source
     * @param {Record<string, { label: string, pattern?: unknown }>} slots
     * @returns {Promise<unknown>}
     */
    const define = (source, slots) => mailboxDefine(source, slots);

    /**
     * Send a structured form request to a recipient.
     * @param {import('./types.js').NameOrPath} recipientName
     * @param {string} description
     * @param {Record<string, { label: string, pattern?: unknown }>} fields
     * @param {import('./types.js').NameOrPath} [responseName]
     * @returns {Promise<unknown>}
     */
    const form = (recipientName, description, fields, responseName) =>
      mailboxForm(recipientName, description, fields, responseName);

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
      requestEvaluation,
      define,
      form,
      deliver,
    };

    const help = makeHelp(guestHelp, [directoryHelp, mailHelp]);

    return makeExo('EndoGuest', GuestInterface, {
      ...guest,
      help,
      /** @param {string} locator */
      followLocatorNameChanges: locator =>
        makeIteratorRef(guest.followLocatorNameChanges(locator)),
      followMessages: () => makeIteratorRef(guest.followMessages()),
      followNameChanges: () => makeIteratorRef(guest.followNameChanges()),
    });
  };

  return makeGuest;
};
