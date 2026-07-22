// @ts-check

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { makePetSitter } from './pet-sitter.js';
import {
  assertPetNamePath,
  namePathFrom,
  petNamePathFrom,
} from './pet-name.js';
import { makeDeferredTasks } from './deferred-tasks.js';
import { idFromLocator } from './locator.js';

/** @import { Context, ContentLoadable, DaemonCore, DeferredTasks, EndoGuest, EvalDeferredTaskParams, FormulaIdentifier, MakeDirectoryNode, MakeMailbox, MarshalDeferredTaskParams, Name, NameOrPath, NamePath, NodeNumber, NamesOrPaths, Provide, ReadableBlobDeferredTaskParams, WorkerDeferredTaskParams } from './types.js' */
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
 * @param {DaemonCore['getAllContentSources']} args.getAllContentSources
 * @param {ContentLoadable['loadContent']} args.loadContent
 * @param {MakeMailbox} args.makeMailbox
 * @param {MakeDirectoryNode} args.makeDirectoryNode
 * @param {(node: string) => boolean} args.isLocalKey
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
  getAllContentSources,
  loadContent,
  makeMailbox,
  makeDirectoryNode,
  isLocalKey,
  pinTransient = /** @param {any} _id */ _id => {},
  unpinTransient = /** @param {any} _id */ _id => {},
}) => {
  /**
   * @param {FormulaIdentifier} guestId
   * @param {FormulaIdentifier} handleId
   * @param {NodeNumber} agentNodeNumber
   * @param {FormulaIdentifier} hostAgentId
   * @param {FormulaIdentifier} hostHandleId
   * @param {FormulaIdentifier} petStoreId
   * @param {FormulaIdentifier} mailboxStoreId
   * @param {FormulaIdentifier | undefined} mailHubId
   * @param {FormulaIdentifier} mainWorkerId
   * @param {FormulaIdentifier} networksDirectoryId
   * @param {FormulaIdentifier} planesDirectoryId
   * @param {Context} context
   */
  const makeGuest = async (
    guestId,
    handleId,
    agentNodeNumber,
    hostAgentId,
    hostHandleId,
    petStoreId,
    mailboxStoreId,
    mailHubId,
    mainWorkerId,
    networksDirectoryId,
    planesDirectoryId,
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
    context.thisDiesIfThatDies(planesDirectoryId);

    const baseController = await provideStoreController(petStoreId);
    const mailboxController = await provideStoreController(mailboxStoreId);
    const specialNames = {
      '@agent': guestId,
      '@self': handleId,
      '@host': hostHandleId,
    };
    if (mailHubId !== undefined) {
      specialNames['@mail'] = mailHubId;
    }
    specialNames['@nets'] = networksDirectoryId;
    specialNames['@planes'] = planesDirectoryId;
    const specialStore = makePetSitter(baseController, specialNames);

    const getNetworkAddresses = () =>
      getAllNetworkAddresses(networksDirectoryId);
    const getContentSources = identity =>
      getAllContentSources(planesDirectoryId, identity);
    const directory = makeDirectoryNode(
      specialStore,
      agentNodeNumber,
      isLocalKey,
      getNetworkAddresses,
      getContentSources,
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
      locateContent,
      listContent,
      storeContent,
      reverseLocateContent,
      internalizeContentLocator,
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

    /**
     * Look up a value by an `endo://` locator. Mail attachments are delivered
     * as locators (the portable, cross-node form), so this is what callers use
     * to resolve an attachment reference.
     * @param {string} locator - An `endo://` locator.
     * @returns {Promise<unknown>} The value for the given locator.
     */
    const lookupByLocator = async locator => provide(idFromLocator(locator));
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
      editMessage,
      messageHistory,
      define: mailboxDefine,
      form: mailboxForm,
      submit: mailboxSubmit,
      sendValue: mailboxSendValue,
    } = mailbox;

    /**
     * @param {NameOrPath | undefined} workerName
     * @param {DeferredTasks<WorkerDeferredTaskParams>['push']} deferTask
     */
    const prepareWorkerFormulation = async (workerName, deferTask) => {
      if (workerName === undefined) {
        return undefined;
      }
      const workerNamePath = namePathFrom(workerName);
      // A single segment resolves against the guest's own pet store; a
      // path resolves through the directory.
      const workerId = /** @type {FormulaIdentifier | undefined} */ (
        workerNamePath.length === 1
          ? specialStore.identifyLocal(workerNamePath[0])
          : await E(directory).identify(...workerNamePath)
      );
      if (workerId === undefined) {
        const { namePath, petName } = assertPetNamePath(workerNamePath);
        deferTask(identifiers =>
          namePath.length === 1
            ? specialStore.storeIdentifier(petName, identifiers.workerId)
            : E(directory).storeIdentifier(namePath, identifiers.workerId),
        );
        return undefined;
      }
      return workerId;
    };

    /**
     * Evaluate code directly in a worker, constrained only by reachable
     * capabilities in the guest's namespace.
     * @param {NameOrPath | undefined} workerName
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
      if (!Array.isArray(codeNames)) {
        throw new Error('Evaluator requires an array of code names');
      }
      for (const codeName of codeNames) {
        if (typeof codeName !== 'string') {
          throw new Error(`Invalid endowment name: ${q(codeName)}`);
        }
      }
      if (petNamesOrPaths.length !== codeNames.length) {
        throw new Error('Evaluator requires one pet name for each code name');
      }

      /** @type {DeferredTasks<EvalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const workerId = await prepareWorkerFormulation(workerName, tasks.push);

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
        const { namePath: resultNamePath } = petNamePathFrom(resultName);
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
          await unpinTransient(id);
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
      const { namePath } = petNamePathFrom(petName);

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
      const { namePath } = petNamePathFrom(petName);
      /** @type {DeferredTasks<MarshalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.marshalId),
      );
      const { id } = await formulateMarshalValue(value, tasks, pinTransient);
      await unpinTransient(id);
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
      locateContent,
      listContent,
      storeContent,
      reverseLocateContent,
      internalizeContentLocator,
      loadContent,
      followLocatorNameChanges,
      followNameChanges,
      lookup,
      maybeLookup,
      lookupById,
      lookupByLocator,
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
      editMessage,
      messageHistory,
      evaluate,
      // Define/Form
      define,
      form,
      storeBlob,
      storeValue,
      submit,
      sendValue,
    };

    return makeExo(
      'EndoGuest',
      GuestInterface,
      /** @type {any} */ ({
        help: makeHelp(guestHelp),
        ...guest,
        /** @param {string} locator */
        followLocatorNameChanges: async locator => {
          const iterator = guest.followLocatorNameChanges(locator);
          return readerFromIterator(iterator);
        },
        followMessages: async () => {
          const iterator = guest.followMessages();
          return readerFromIterator(/** @type {any} */ (iterator));
        },
        followNameChanges: async () => {
          const iterator = guest.followNameChanges();
          return readerFromIterator(iterator);
        },
      }),
    );
  };

  return makeGuest;
};
