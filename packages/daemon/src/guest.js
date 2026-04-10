// @ts-check

import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { makeIteratorRef } from './reader-ref.js';
import { makePetSitter } from './pet-sitter.js';
import {
  assertName,
  assertNamePath,
  assertPetName,
  assertPetNamePath,
  namePathFrom,
} from './pet-name.js';
import { makeDeferredTasks } from './deferred-tasks.js';

/** @import { Context, DaemonCore, DeferredTasks, EndoGuest, EvalDeferredTaskParams, FormulaIdentifier, MakeDirectoryNode, MakeMailbox, MarshalDeferredTaskParams, Name, NameOrPath, NamePath, NodeNumber, NamesOrPaths, Provide, ReadableBlobDeferredTaskParams, WorkerDeferredTaskParams } from './types.js' */
import { GuestInterface } from './interfaces.js';
import { guestHelp, makeHelp } from './help-text.js';

/**
 * @param {object} args
 * @param {Provide} args.provide
 * @param {DaemonCore['provideStoreController']} args.provideStoreController
 * @param {DaemonCore['formulateEval']} args.formulateEval
 * @param {DaemonCore['formulateReadableBlob']} args.formulateReadableBlob
 * @param {DaemonCore['formulateMarshalValue']} args.formulateMarshalValue
 * @param {DaemonCore['getFormulaForId']} args.getFormulaForId
 * @param {DaemonCore['getAllNetworkAddresses']} args.getAllNetworkAddresses
 * @param {MakeMailbox} args.makeMailbox
 * @param {MakeDirectoryNode} args.makeDirectoryNode
 * @param {(node: string) => boolean} args.isLocalKey
 * @param {() => Promise<void>} [args.collectIfDirty]
 * @param {DaemonCore['pinTransient']} [args.pinTransient]
 * @param {DaemonCore['unpinTransient']} [args.unpinTransient]
 */
export const makeGuestMaker = ({
  provide,
  provideStoreController,
  formulateEval,
  formulateReadableBlob,
  formulateMarshalValue,
  getFormulaForId,
  getAllNetworkAddresses,
  makeMailbox,
  makeDirectoryNode,
  isLocalKey,
  collectIfDirty = async () => {},
  pinTransient = /** @param {any} _id */ _id => {},
  unpinTransient = /** @param {any} _id */ _id => {},
}) => {
  /**
   * @param {FormulaIdentifier} guestId
   * @param {FormulaIdentifier} handleId
   * @param {FormulaIdentifier} keypairId
   * @param {NodeNumber} agentNodeNumber
   * @param {FormulaIdentifier} hostAgentId
   * @param {FormulaIdentifier} hostHandleId
   * @param {FormulaIdentifier} petStoreId
   * @param {FormulaIdentifier} mailboxStoreId
   * @param {FormulaIdentifier | undefined} mailHubId
   * @param {FormulaIdentifier} mainWorkerId
   * @param {FormulaIdentifier} networksDirectoryId
   * @param {Context} context
   */
  const makeGuest = async (
    guestId,
    handleId,
    keypairId,
    agentNodeNumber,
    hostAgentId,
    hostHandleId,
    petStoreId,
    mailboxStoreId,
    mailHubId,
    mainWorkerId,
    networksDirectoryId,
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
    context.thisDiesIfThatDies(networksDirectoryId);

    const baseController = await provideStoreController(petStoreId);
    const mailboxController = await provideStoreController(mailboxStoreId);
    const specialNames = {
      '@agent': guestId,
      '@self': handleId,
      '@host': hostHandleId,
      '@keypair': keypairId,
    };
    if (mailHubId !== undefined) {
      specialNames['@mail'] = mailHubId;
    }
    specialNames['@nets'] = networksDirectoryId;
    const specialStore = makePetSitter(baseController, specialNames);

    const getNetworkAddresses = () =>
      getAllNetworkAddresses(networksDirectoryId);
    const directory = makeDirectoryNode(
      specialStore,
      agentNodeNumber,
      isLocalKey,
      getNetworkAddresses,
    );
    const mailbox = await makeMailbox({
      petStore: specialStore,
      agentNodeNumber,
      mailboxStore: mailboxController,
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
      listLocators,
      followNameChanges,
      followLocatorNameChanges,
      lookup,
      maybeLookup,
      reverseLookup,
      storeIdentifier: directoryStoreIdentifier,
      storeLocator: directoryStoreLocator,
      readText: directoryReadText,
      maybeReadText: directoryMaybeReadText,
      writeText: directoryWriteText,
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
    const lookupById = async id =>
      provide(/** @type {FormulaIdentifier} */ (id));
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
      requestEvaluation: mailboxRequestEvaluation,
      define: mailboxDefine,
      form: mailboxForm,
      submit: mailboxSubmit,
      sendValue: mailboxSendValue,
    } = mailbox;

    /** @type {EndoGuest['requestEvaluation']} */
    const requestEvaluation = (source, codeNames, petNamePaths, resultName) =>
      mailboxRequestEvaluation(
        '@host',
        source,
        codeNames,
        petNamePaths,
        resultName,
      );

    /**
     * @param {Name | undefined} workerName
     * @param {DeferredTasks<WorkerDeferredTaskParams>['push']} deferTask
     */
    const prepareWorkerFormulation = (workerName, deferTask) => {
      if (workerName === undefined) {
        return undefined;
      }
      const workerId = /** @type {FormulaIdentifier | undefined} */ (
        specialStore.identifyLocal(workerName)
      );
      if (workerId === undefined) {
        assertPetName(workerName);
        const petName = workerName;
        deferTask(identifiers => {
          return specialStore.storeIdentifier(petName, identifiers.workerId);
        });
        return undefined;
      }
      return workerId;
    };

    /**
     * Evaluate code directly in a worker, constrained only by reachable
     * capabilities in the guest's namespace.
     * @param {Name | undefined} workerName
     * @param {string} source
     * @param {Array<string>} codeNames
     * @param {NamesOrPaths} petNamesOrPaths
     * @param {NameOrPath} [resultName]
     * @returns {Promise<unknown>}
     */
    const evaluate = async (
      workerName,
      source,
      codeNames,
      petNamesOrPaths,
      resultName,
    ) => {
      if (workerName !== undefined) {
        assertName(workerName);
      }
      if (!Array.isArray(codeNames)) {
        throw new Error('Evaluator requires an array of code names');
      }
      for (const codeName of codeNames) {
        if (typeof codeName !== 'string') {
          throw new Error(`Invalid endowment name: ${q(codeName)}`);
        }
      }
      if (resultName !== undefined) {
        const resultNamePath = namePathFrom(resultName);
        assertNamePath(resultNamePath);
      }
      if (petNamesOrPaths.length !== codeNames.length) {
        throw new Error('Evaluator requires one pet name for each code name');
      }

      /** @type {DeferredTasks<EvalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const workerId = prepareWorkerFormulation(workerName, tasks.push);

      /** @type {(FormulaIdentifier | NamePath)[]} */
      const endowmentFormulaIdsOrPaths = petNamesOrPaths.map(petNameOrPath => {
        const petNamePath = namePathFrom(petNameOrPath);
        if (petNamePath.length === 1) {
          const id = specialStore.identifyLocal(petNamePath[0]);
          if (id === undefined) {
            throw new Error(`Unknown pet name ${q(petNamePath[0])}`);
          }
          return /** @type {FormulaIdentifier} */ (id);
        }

        return petNamePath;
      });

      if (resultName !== undefined) {
        const resultNamePath = namePathFrom(resultName);
        tasks.push(identifiers =>
          E(directory).storeIdentifier(resultNamePath, identifiers.evalId),
        );
      }

      const { id, value } = await formulateEval(
        guestId,
        source,
        codeNames,
        endowmentFormulaIdsOrPaths,
        tasks,
        workerId,
        resultName === undefined ? pinTransient : undefined,
      );
      if (resultName === undefined) {
        try {
          return await value;
        } finally {
          unpinTransient(id);
        }
      }
      return value;
    };

    /** @type {EndoGuest['define']} */
    const define = (source, slots) => mailboxDefine(source, slots);

    /** @type {EndoGuest['form']} */
    const form = (recipientName, description, fields) =>
      mailboxForm(recipientName, description, fields);

    /** @type {EndoGuest['submit']} */
    const submit = (messageNumber, values) =>
      mailboxSubmit(messageNumber, values);

    /** @type {EndoGuest['sendValue']} */
    const sendValue = (messageNumber, petNameOrPath) =>
      mailboxSendValue(messageNumber, petNameOrPath);

    /** @type {EndoGuest['storeBlob']} */
    const storeBlob = async (readerRef, petName) => {
      if (petName === undefined) {
        throw new TypeError('storeBlob requires a pet name');
      }
      const { namePath } = assertPetNamePath(namePathFrom(petName));

      /** @type {DeferredTasks<ReadableBlobDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.readableBlobId),
      );

      const { value: blob } = await formulateReadableBlob(readerRef, tasks);
      return blob;
    };

    /** @type {EndoGuest['storeValue']} */
    const storeValue = async (value, petName) => {
      const namePath = namePathFrom(petName);
      assertNamePath(namePath);
      /** @type {DeferredTasks<MarshalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.marshalId),
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
      listLocators,
      followLocatorNameChanges,
      followNameChanges,
      lookup,
      maybeLookup,
      lookupById,
      reverseLookup,
      storeIdentifier: directoryStoreIdentifier,
      storeLocator: directoryStoreLocator,
      move,
      remove,
      copy,
      makeDirectory,
      readText: directoryReadText,
      maybeReadText: directoryMaybeReadText,
      writeText: directoryWriteText,
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
      evaluate,
      // Eval/Define/Form
      requestEvaluation,
      define,
      form,
      storeBlob,
      storeValue,
      submit,
      sendValue,
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

    const unwrappedMethods = new Set([
      'handle',
      'reverseIdentify',
      'submit',
      'sendValue',
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
