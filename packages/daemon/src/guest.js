// @ts-check

import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';
import { assertNamePath, namePathFrom } from './pet-name.js';
import { makeDeferredTasks } from './deferred-tasks.js';

/** @import { Context, DaemonCore, DeferredTasks, EdgeName, EndoGuest, FormulaIdentifier, GuestMessage, MakeDirectoryNode, MakeMailbox, MarshalDeferredTaskParams, Name, NameOrPath, NamesOrPaths, Provide, StampedMessage } from './types.js' */
import { GuestInterface } from './interfaces.js';
import { guestHelp, makeHelp } from './help-text.js';

/**
 * Transform a StampedMessage into a GuestMessage by stripping identifiers
 * and resolving the sender to a live handle reference and petnames.
 *
 * @param {StampedMessage} message
 * @param {object} deps
 * @param {Provide} deps.provide
 * @param {{ reverseIdentify: (id: string) => string[] }} deps.petStore
 * @returns {Promise<GuestMessage>}
 */
const toGuestMessage = async (message, { provide, petStore }) => {
  const { from, number, date, type, dismissed, dismisser } = message;

  let fromHandle;
  try {
    fromHandle = await provide(from, 'handle');
  } catch (_err) {
    // If the handle formula was garbage collected or is otherwise
    // unavailable, use a null sentinel so the message is still delivered.
    fromHandle = null;
  }
  const fromNames = petStore.reverseIdentify(from);

  /** @type {Record<string, unknown>} */
  const content = {};

  if (type === 'request') {
    content.description = message.description;
  } else if (type === 'package') {
    content.strings = message.strings;
    content.names = message.names;
    // replyTo is a FormulaNumber (random hex) without a node component,
    // safe to expose as an opaque correlation token for reply threading.
    if (message.replyTo !== undefined) {
      content.replyTo = message.replyTo;
    }
  } else if (type === 'eval-request') {
    content.source = message.source;
    content.codeNames = message.codeNames;
    content.petNamePaths = message.petNamePaths;
  } else if (type === 'definition') {
    content.source = message.source;
    content.slots = message.slots;
  } else if (type === 'form-request') {
    content.description = message.description;
    content.fields = message.fields;
  }

  return harden(
    /** @type {GuestMessage} */ ({
      number,
      date,
      type,
      fromHandle,
      fromNames: harden(fromNames),
      dismissed,
      dismisser,
      ...content,
    }),
  );
};

/**
 * @param {object} args
 * @param {Provide} args.provide
 * @param {DaemonCore['getIdForRef']} args.getIdForRef
 * @param {DaemonCore['formulateMarshalValue']} args.formulateMarshalValue
 * @param {MakeMailbox} args.makeMailbox
 * @param {MakeDirectoryNode} args.makeDirectoryNode
 * @param {() => Promise<void>} [args.collectIfDirty]
 */
export const makeGuestMaker = ({
  provide,
  getIdForRef,
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

    // Confined directory: only petname/value methods, no identifier methods.
    const {
      has,
      list,
      followNameChanges,
      lookup,
      reverseLookup,
      move,
      remove,
      copy,
      makeDirectory,
    } = directory;

    const {
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

    // Identity comparison on live values.
    /** @type {EndoGuest['equals']} */
    const equals = async (a, b) => {
      const resolvedA = await a;
      const resolvedB = await b;
      const idA = getIdForRef(resolvedA);
      const idB = getIdForRef(resolvedB);
      if (idA === undefined || idB === undefined) {
        return false;
      }
      return idA === idB;
    };

    // Transform messages to strip identifiers.
    const messageDeps = { provide, petStore: specialStore };

    /** @type {EndoGuest['listMessages']} */
    const listMessages = async () => {
      const rawMessages = await mailbox.listMessages();
      return Promise.all(
        rawMessages.map(msg => toGuestMessage(msg, messageDeps)),
      );
    };

    /** @type {EndoGuest['followMessages']} */
    const followMessages = async function* followMessages() {
      for await (const msg of mailbox.followMessages()) {
        yield toGuestMessage(msg, messageDeps);
      }
    };

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
      await formulateMarshalValue(value, tasks);
    };

    /** @type {EndoGuest} */
    const guest = {
      // Confined directory
      has,
      list,
      followNameChanges,
      lookup,
      reverseLookup,
      move,
      remove,
      copy,
      makeDirectory,
      equals,
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
        try {
          return await fn(...args);
        } finally {
          await collectIfDirty();
        }
      };

    const unwrappedMethods = new Set(['handle']);
    const wrappedGuest = Object.fromEntries(
      Object.entries(guest).map(([name, fn]) => [
        name,
        unwrappedMethods.has(name) ? fn : withCollection(fn),
      ]),
    );

    return makeExo('EndoGuest', GuestInterface, {
      help: makeHelp(guestHelp),
      ...wrappedGuest,
      help(_topic) {
        return 'A confined Endo guest. Operates on petnames and live values only.';
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
