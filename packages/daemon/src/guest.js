// @ts-check

import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';
import { assertNamePath, namePathFrom } from './pet-name.js';
import { makeDeferredTasks } from './deferred-tasks.js';

/** @import { Context, DaemonCore, DeferredTasks, EndoGuest, FormulaIdentifier, MakeDirectoryNode, MakeMailbox, MarshalDeferredTaskParams, Provide } from './types.js' */
import { GuestInterface } from './interfaces.js';
import { guestHelp, makeHelp } from './help-text.js';

/**
 * @param {object} args
 * @param {Provide} args.provide
 * @param {DaemonCore['formulateMarshalValue']} args.formulateMarshalValue
 * @param {MakeMailbox} args.makeMailbox
 * @param {MakeDirectoryNode} args.makeDirectoryNode
 * @param {() => Promise<void>} [args.collectIfDirty]
 */
export const makeGuestMaker = ({
  provide,
  formulateMarshalValue,
  makeMailbox,
  makeDirectoryNode,
  collectIfDirty = async () => {},
}) => {
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
      reply,
      request,
      send,
      deliver,
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
      await formulateMarshalValue(value, tasks);
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
      reply,
      request,
      send,
      deliver,
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
        try {
          return await fn(...args);
        } finally {
          await collectIfDirty();
        }
      };

    const unwrappedMethods = new Set([
      'handle',
      'reverseIdentify',
    ]);
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
