// @ts-check

import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';
import { assertNamePath, namePathFrom } from './pet-name.js';
import { makeDeferredTasks } from './deferred-tasks.js';

/** @import { Context, DaemonCore, DeferredTasks, EdgeName, EndoGuest, FormulaIdentifier, MakeDirectoryNode, MakeMailbox, MarshalDeferredTaskParams, Name, NameOrPath, NamesOrPaths, Provide } from './types.js' */
import { GuestInterface } from './interfaces.js';
import { guestHelp, makeHelp } from './help-text.js';

/**
 * @param {object} args
 * @param {Provide} args.provide
 * @param {DaemonCore['formulateMarshalValue']} args.formulateMarshalValue
 * @param {MakeMailbox} args.makeMailbox
 * @param {MakeDirectoryNode} args.makeDirectoryNode
 * @param {() => Promise<void>} [args.collectIfDirty]
 * @param {DaemonCore['pinTransient']} [args.pinTransient]
 * @param {DaemonCore['unpinTransient']} [args.unpinTransient]
 */
export const makeGuestMaker = ({
  provide,
  formulateMarshalValue,
  makeMailbox,
  makeDirectoryNode,
  collectIfDirty = async () => {},
  pinTransient = /** @param {any} _id */ _id => {},
  unpinTransient = /** @param {any} _id */ _id => {},
}) => {
  /**
   * @param {FormulaIdentifier} guestId
   * @param {FormulaIdentifier} handleId
   * @param {FormulaIdentifier} keypairId
   * @param {FormulaIdentifier} hostAgentId
   * @param {FormulaIdentifier} hostHandleId
   * @param {FormulaIdentifier} petStoreId
   * @param {FormulaIdentifier} mailboxStoreId
   * @param {FormulaIdentifier | undefined} mailHubId
   * @param {FormulaIdentifier} mainWorkerId
   * @param {Context} context
   */
  const makeGuest = async (
    guestId,
    handleId,
    keypairId,
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
    if (mailHubId !== undefined) {
      context.thisDiesIfThatDies(mailHubId);
    }
    context.thisDiesIfThatDies(mainWorkerId);

    const basePetStore = await provide(petStoreId, 'pet-store');
    const mailboxStore = await provide(mailboxStoreId, 'mailbox-store');
    const specialNames = {
      AGENT: guestId,
      SELF: handleId,
      HOST: hostHandleId,
      KEYPAIR: keypairId,
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
    const lookupById = async id => provide(/** @type {FormulaIdentifier} */ (id));
    const {
      listMessages,
      followMessages,
      resolve,
      reject,
      adopt,
      dismiss,
      dismissAll,
      reply,
      request,
      send,
      deliver,
      evaluate: mailboxEvaluate,
      requestEvaluation: mailboxRequestEvaluation,
      define: mailboxDefine,
      form: mailboxForm,
    } = mailbox;

    /** @type {EndoGuest['requestEvaluation']} */
    const requestEvaluation = (source, codeNames, petNamePaths, resultName) =>
      mailboxRequestEvaluation(
        'HOST',
        source,
        codeNames,
        petNamePaths,
        resultName,
      );

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
        petNamePaths,
        edgeNames,
        ids,
        workerName,
        resultName,
      );
    };

    /** @type {EndoGuest['define']} */
    const define = (source, slots) => mailboxDefine(source, slots);

    /** @type {EndoGuest['form']} */
    const form = (recipientName, description, fields, responseName) =>
      mailboxForm(recipientName, description, fields, responseName);

    /** @type {EndoGuest['storeValue']} */
    const storeValue = async (value, petName) => {
      const namePath = namePathFrom(petName);
      assertNamePath(namePath);
      /** @type {DeferredTasks<MarshalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).write(namePath, identifiers.marshalId),
      );
      const { id } = await formulateMarshalValue(value, tasks, pinTransient);
      unpinTransient(id);
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
      dismissAll,
      reply,
      request,
      send,
      deliver,
      // Guest-specific: propose evaluation to host
      evaluate,
      // Eval/Define/Form
      requestEvaluation,
      define,
      form,
      storeValue,
    };

    /** @param {Function} fn */
    const withCollection =
      fn =>
      async (...args) => {
        await null;
        try {
          return await fn(...args);
        } finally {
          await collectIfDirty();
        }
      };

    const unwrappedMethods = new Set(['handle', 'reverseIdentify']);
    const wrappedGuest = Object.fromEntries(
      Object.entries(guest).map(([name, fn]) => [
        name,
        unwrappedMethods.has(name) ? fn : withCollection(fn),
      ]),
    );

    return makeExo('EndoGuest', GuestInterface, {
      help: makeHelp(guestHelp),
      ...wrappedGuest,
      /** @param {string} locator */
      followLocatorNameChanges: async locator => {
        const iterator = guest.followLocatorNameChanges(locator);
        await collectIfDirty();
        return makeIteratorRef(iterator);
      },
      followMessages: async () => {
        const iterator = guest.followMessages();
        await collectIfDirty();
        return makeIteratorRef(iterator);
      },
      followNameChanges: async () => {
        const iterator = guest.followNameChanges();
        await collectIfDirty();
        return makeIteratorRef(iterator);
      },
    });
  };

  return makeGuest;
};
