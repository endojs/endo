// @ts-check

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';
import { namePathFrom } from './pet-name.js';
import { guestHelp, directoryHelp, mailHelp, makeHelp } from './help-text.js';

/** @import { Context, EdgeName, EndoGuest, MakeDirectoryNode, MakeMailbox, Name, NameOrPath, NamesOrPaths, Provide } from './types.js' */
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
   * @param {string} [mailHubId] - Formula id for MAIL hub view (when provided, MAIL is added to special names)
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
    mailHubId,
  ) => {
    context.thisDiesIfThatDies(hostHandleId);
    context.thisDiesIfThatDies(hostAgentId);
    context.thisDiesIfThatDies(petStoreId);
    context.thisDiesIfThatDies(mailboxStoreId);
    context.thisDiesIfThatDies(mailHubId);
    context.thisDiesIfThatDies(mainWorkerId);

    const basePetStore = await provide(petStoreId, 'pet-store');
    const mailboxStore = await provide(mailboxStoreId, 'mailbox-store');
    const specialNames = {
      AGENT: guestId,
      SELF: handleId,
      HOST: hostHandleId,
    };
    if (mailHubId !== undefined) {
      specialNames.MAIL = mailHubId;
    }
    const specialStore = makePetSitter(basePetStore, specialNames);

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

    /**
     * Look up a value by its formula identifier directly.
     * @param {string} id - The formula identifier.
     * @returns {Promise<unknown>} The value for the given formula identifier.
     */
    const lookupById = async id => provide(id);
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
      deliver,
      evaluate: mailboxEvaluate,
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
     * Propose code evaluation to the host.
     * Same signature as Host.evaluate() - returns promise that resolves when Host grants.
     * @param {Name | undefined} workerPetName
     * @param {string} source
     * @param {Array<string>} codeNames
     * @param {NamesOrPaths} petNamesOrPaths
     * @param {NameOrPath} [resultNameOrPath]
     * @returns {Promise<unknown>} - Resolves with evaluation result when Host grants
     */
    const evaluate = async (
      workerPetName,
      source,
      codeNames,
      petNamesOrPaths,
      resultNameOrPath,
    ) => {
      const petNamePaths = petNamesOrPaths.map(namePathFrom);
      if (petNamePaths.length !== codeNames.length) {
        throw new Error(
          `Evaluation must have the same number of code names (${q(
            codeNames.length,
          )}) as pet names (${q(petNamePaths.length)})`,
        );
      }

      // Resolve all pet names to formula IDs from guest's namespace
      const ids = await Promise.all(
        petNamePaths.map(async petNamePath => {
          const id = await E(directory).identify(...petNamePath);
          if (id === undefined) {
            throw new Error(`Unknown pet name ${q(petNamePath)}`);
          }
          return id;
        }),
      );

      // Create edge names from the pet names (for display in the proposal)
      const edgeNames = /** @type {EdgeName[]} */ (
        petNamePaths.map(path => (Array.isArray(path) ? path.join('.') : path))
      );

      // Get optional result name and worker name as strings
      const resultName = resultNameOrPath
        ? namePathFrom(resultNameOrPath).join('.')
        : undefined;
      const workerName = workerPetName || undefined;

      // Send proposal to host and wait for grant
      return mailboxEvaluate(
        hostHandleId,
        source,
        codeNames,
        edgeNames,
        ids,
        workerName,
        resultName,
      );
    };


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
      lookupById,
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
      deliver,
      // Guest-specific: propose evaluation to host
      evaluate,
      // Used by daemon to provide MAIL hub view
      getMailHub: () => mailbox.getMailHub(),
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
