// @ts-check

import { E, Far } from '@endo/far';
import { makeIteratorRef } from './reader-ref.js';
import { assertPetName, petNamePathFrom } from './pet-name.js';
import { makePetSitter } from './pet-sitter.js';
import { makeDeferredTasks } from './deferred-tasks.js';

const { quote: q } = assert;

/** @param {string} name */
const assertPowersName = name => {
  ['NONE', 'SELF', 'ENDO'].includes(name) || assertPetName(name);
};

/**
 * @param {object} args
 * @param {import('./types.js').DaemonCore['provide']} args.provide
 * @param {import('./types.js').DaemonCore['provideControllerForFormulaIdentifier']} args.provideControllerForFormulaIdentifier
 * @param {import('./types.js').DaemonCore['cancelValue']} args.cancelValue
 * @param {import('./types.js').DaemonCore['incarnateWorker']} args.incarnateWorker
 * @param {import('./types.js').DaemonCore['incarnateHost']} args.incarnateHost
 * @param {import('./types.js').DaemonCore['incarnateGuest']} args.incarnateGuest
 * @param {import('./types.js').DaemonCore['incarnateEval']} args.incarnateEval
 * @param {import('./types.js').DaemonCore['incarnateUnconfined']} args.incarnateUnconfined
 * @param {import('./types.js').DaemonCore['incarnateBundle']} args.incarnateBundle
 * @param {import('./types.js').DaemonCore['incarnateReadableBlob']} args.incarnateReadableBlob
 * @param {import('./types.js').DaemonCore['getAllNetworkAddresses']} args.getAllNetworkAddresses
 * @param {import('./types.js').MakeMailbox} args.makeMailbox
 * @param {import('./types.js').MakeDirectoryNode} args.makeDirectoryNode
 * @param {string} args.ownNodeIdentifier
 */
export const makeHostMaker = ({
  provide,
  provideControllerForFormulaIdentifier,
  cancelValue,
  incarnateWorker,
  incarnateHost,
  incarnateGuest,
  incarnateEval,
  incarnateUnconfined,
  incarnateBundle,
  incarnateReadableBlob,
  getAllNetworkAddresses,
  makeMailbox,
  makeDirectoryNode,
  ownNodeIdentifier,
}) => {
  /**
   * @param {string} hostFormulaIdentifier
   * @param {string} storeFormulaIdentifier
   * @param {string} inspectorFormulaIdentifier
   * @param {string} mainWorkerFormulaIdentifier
   * @param {string} endoFormulaIdentifier
   * @param {string} networksDirectoryFormulaIdentifier
   * @param {string} leastAuthorityFormulaIdentifier
   * @param {{[name: string]: string}} platformNames
   * @param {import('./types.js').Context} context
   */
  const makeIdentifiedHost = async (
    hostFormulaIdentifier,
    storeFormulaIdentifier,
    inspectorFormulaIdentifier,
    mainWorkerFormulaIdentifier,
    endoFormulaIdentifier,
    networksDirectoryFormulaIdentifier,
    leastAuthorityFormulaIdentifier,
    platformNames,
    context,
  ) => {
    context.thisDiesIfThatDies(storeFormulaIdentifier);
    context.thisDiesIfThatDies(mainWorkerFormulaIdentifier);

    const basePetStore = /** @type {import('./types.js').PetStore} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      await provide(storeFormulaIdentifier)
    );
    const specialStore = makePetSitter(basePetStore, {
      ...platformNames,
      SELF: hostFormulaIdentifier,
      ENDO: endoFormulaIdentifier,
      NETS: networksDirectoryFormulaIdentifier,
      INFO: inspectorFormulaIdentifier,
      NONE: leastAuthorityFormulaIdentifier,
    });

    const mailbox = makeMailbox({
      petStore: specialStore,
      selfFormulaIdentifier: hostFormulaIdentifier,
      context,
    });
    const { petStore } = mailbox;
    const directory = makeDirectoryNode(petStore);
    const { lookup } = directory;

    const getEndoBootstrap = async () => {
      const endoBootstrap =
        /** @type {import('./types.js').FarEndoBootstrap} */ (
          await provide(endoFormulaIdentifier)
        );
      return endoBootstrap;
    };

    /**
     * @param {import('@endo/eventual-send').ERef<AsyncIterableIterator<string>>} readerRef
     * @param {string} [petName]
     */
    const store = async (readerRef, petName) => {
      /** @type {import('./types.js').DeferredTasks<import('./types.js').ReadableBlobDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      if (petName !== undefined) {
        assertPetName(petName);
        tasks.push(identifiers =>
          petStore.write(petName, identifiers.readableBlobFormulaIdentifier),
        );
      }

      const { value } = await incarnateReadableBlob(readerRef, tasks);
      return value;
    };

    /**
     * @param {string} workerName
     */
    const provideWorker = async workerName => {
      /** @type {import('./types.js').DeferredTasks<import('./types.js').WorkerDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      // eslint-disable-next-line no-use-before-define
      const workerFormulaIdentifier = tryGetWorkerFormulaIdentifier(workerName);
      // eslint-disable-next-line no-use-before-define
      prepareWorkerIncarnation(workerName, workerFormulaIdentifier, tasks.push);

      if (workerFormulaIdentifier !== undefined) {
        return /** @type {Promise<import('./types.js').EndoWorker>} */ (
          // Behold, recursion:
          provide(workerFormulaIdentifier)
        );
      }

      const { value } = await incarnateWorker(tasks);
      return value;
    };

    /**
     * @param {string} workerName
     * @returns {string | undefined}
     */
    const tryGetWorkerFormulaIdentifier = workerName => {
      if (workerName === 'MAIN') {
        return mainWorkerFormulaIdentifier;
      } else if (workerName === 'NEW') {
        return undefined;
      }
      return petStore.identifyLocal(workerName);
    };

    /**
     * @param {string} workerName
     * @param {string | undefined} workerFormulaIdentifier
     * @param {import('./types.js').DeferredTasks<{ workerFormulaIdentifier: string }>['push']} deferTask
     */
    const prepareWorkerIncarnation = (
      workerName,
      workerFormulaIdentifier,
      deferTask,
    ) => {
      if (workerFormulaIdentifier === undefined) {
        deferTask(identifiers =>
          petStore.write(workerName, identifiers.workerFormulaIdentifier),
        );
      }
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     * @param {string} source
     * @param {string[]} codeNames
     * @param {(string | string[])[]} petNamePaths
     * @param {string} resultName
     */
    const evaluate = async (
      workerName,
      source,
      codeNames,
      petNamePaths,
      resultName,
    ) => {
      if (resultName !== undefined) {
        assertPetName(resultName);
      }
      if (petNamePaths.length !== codeNames.length) {
        throw new Error('Evaluator requires one pet name for each code name');
      }

      /** @type {import('./types.js').DeferredTasks<import('./types.js').EvalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const workerFormulaIdentifier = tryGetWorkerFormulaIdentifier(workerName);
      prepareWorkerIncarnation(workerName, workerFormulaIdentifier, tasks.push);

      /** @type {(string | string[])[]} */
      const endowmentFormulaIdsOrPaths = petNamePaths.map(
        (petNameOrPath, index) => {
          if (typeof codeNames[index] !== 'string') {
            throw new Error(`Invalid endowment name: ${q(codeNames[index])}`);
          }

          const petNamePath = petNamePathFrom(petNameOrPath);
          if (petNamePath.length === 1) {
            const formulaIdentifier = petStore.identifyLocal(petNamePath[0]);
            if (formulaIdentifier === undefined) {
              throw new Error(`Unknown pet name ${q(petNamePath[0])}`);
            }
            return formulaIdentifier;
          }

          return petNamePath;
        },
      );

      if (resultName !== undefined) {
        tasks.push(identifiers =>
          petStore.write(resultName, identifiers.evalFormulaIdentifier),
        );
      }

      const { value } = await incarnateEval(
        hostFormulaIdentifier,
        source,
        codeNames,
        endowmentFormulaIdsOrPaths,
        tasks,
        workerFormulaIdentifier,
      );
      return value;
    };

    /**
     * Helper function for makeUnconfined and makeBundle.
     * @param {string} powersName
     * @param {string} workerName
     * @param {string} [resultName]
     */
    const prepareMakeCaplet = (powersName, workerName, resultName) => {
      assertPowersName(powersName);

      /** @type {import('./types.js').DeferredTasks<import('./types.js').MakeCapletDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const workerFormulaIdentifier = tryGetWorkerFormulaIdentifier(workerName);
      prepareWorkerIncarnation(workerName, workerFormulaIdentifier, tasks.push);

      const powersFormulaIdentifier = petStore.identifyLocal(powersName);
      if (powersFormulaIdentifier === undefined) {
        tasks.push(identifiers =>
          petStore.write(powersName, identifiers.powersFormulaIdentifier),
        );
      }

      if (resultName !== undefined) {
        tasks.push(identifiers =>
          petStore.write(resultName, identifiers.capletFormulaIdentifier),
        );
      }

      return { tasks, workerFormulaIdentifier, powersFormulaIdentifier };
    };

    /** @type {import('./types.js').EndoHost['makeUnconfined']} */
    const makeUnconfined = async (
      workerName,
      specifier,
      powersName,
      resultName,
    ) => {
      const { tasks, workerFormulaIdentifier, powersFormulaIdentifier } =
        prepareMakeCaplet(powersName, workerName, resultName);

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value } = await incarnateUnconfined(
        hostFormulaIdentifier,
        specifier,
        tasks,
        workerFormulaIdentifier,
        powersFormulaIdentifier,
      );
      return value;
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     * @param {string} bundleName
     * @param {string | 'NONE' | 'SELF' | 'ENDO'} powersName
     * @param {string} resultName
     */
    const makeBundle = async (
      workerName,
      bundleName,
      powersName,
      resultName,
    ) => {
      const bundleFormulaIdentifier = petStore.identifyLocal(bundleName);
      if (bundleFormulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name for bundle: ${q(bundleName)}`);
      }

      const { tasks, workerFormulaIdentifier, powersFormulaIdentifier } =
        prepareMakeCaplet(powersName, workerName, resultName);

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value } = await incarnateBundle(
        hostFormulaIdentifier,
        bundleFormulaIdentifier,
        tasks,
        workerFormulaIdentifier,
        powersFormulaIdentifier,
      );
      return value;
    };

    /**
     * Attempts to introduce the given names to the specified agent. The agent in question
     * must be incarnated before this function is called.
     *
     * @param {string} formulaIdentifier - The agent's formula identifier.
     * @param {Record<string,string>} introducedNames - The names to introduce.
     * @returns {Promise<void>}
     */
    const introduceNamesToAgent = async (
      formulaIdentifier,
      introducedNames,
    ) => {
      /** @type {import('./types.js').Controller<any, any>} */
      const controller =
        provideControllerForFormulaIdentifier(formulaIdentifier);
      const { petStore: newPetStore } = await controller.internal;
      await Promise.all(
        Object.entries(introducedNames).map(async ([parentName, childName]) => {
          const introducedFormulaIdentifier =
            petStore.identifyLocal(parentName);
          if (introducedFormulaIdentifier === undefined) {
            return;
          }
          await newPetStore.write(childName, introducedFormulaIdentifier);
        }),
      );
    };

    /**
     * @param {string} [petName] - The agent's potential pet name.
     */
    const getNamedAgent = petName => {
      if (petName !== undefined) {
        const formulaIdentifier = petStore.identifyLocal(petName);
        if (formulaIdentifier !== undefined) {
          return {
            formulaIdentifier,
            value: /** @type {Promise<any>} */ (
              provideControllerForFormulaIdentifier(formulaIdentifier).external
            ),
          };
        }
      }
      return undefined;
    };

    /**
     * @param {string} [petName] - The pet name of the agent.
     */
    const getDeferredTasksForAgent = petName => {
      /** @type {import('./types.js').DeferredTasks<import('./types.js').AgentDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      if (petName !== undefined) {
        tasks.push(identifiers =>
          petStore.write(petName, identifiers.agentFormulaIdentifier),
        );
      }
      return tasks;
    };

    /**
     * @param {string} [petName]
     * @param {import('./types.js').MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{formulaIdentifier: string, value: Promise<import('./types.js').EndoHost>}>}
     */
    const makeHost = async (petName, { introducedNames = {} } = {}) => {
      let host = getNamedAgent(petName);
      if (host === undefined) {
        const { value, formulaIdentifier } =
          // Behold, recursion:
          await incarnateHost(
            endoFormulaIdentifier,
            networksDirectoryFormulaIdentifier,
            getDeferredTasksForAgent(petName),
          );
        host = { value: Promise.resolve(value), formulaIdentifier };
      }

      await introduceNamesToAgent(host.formulaIdentifier, introducedNames);

      /** @type {{ formulaIdentifier: string, value: Promise<import('./types.js').EndoHost> }} */
      return host;
    };

    /** @type {import('./types.js').EndoHost['provideHost']} */
    const provideHost = async (petName, opts) => {
      const { value } = await makeHost(petName, opts);
      return value;
    };

    /**
     * @param {string} [petName]
     * @param {import('./types.js').MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{formulaIdentifier: string, value: Promise<import('./types.js').EndoGuest>}>}
     */
    const makeGuest = async (petName, { introducedNames = {} } = {}) => {
      let guest = getNamedAgent(petName);
      if (guest === undefined) {
        const { value, formulaIdentifier } =
          // Behold, recursion:
          await incarnateGuest(
            hostFormulaIdentifier,
            getDeferredTasksForAgent(petName),
          );
        guest = { value: Promise.resolve(value), formulaIdentifier };
      }

      await introduceNamesToAgent(guest.formulaIdentifier, introducedNames);

      /** @type {{ formulaIdentifier: string, value: Promise<import('./types.js').EndoGuest> }} */
      return guest;
    };

    /** @type {import('./types.js').EndoHost['provideGuest']} */
    const provideGuest = async (petName, opts) => {
      const { value } = await makeGuest(petName, opts);
      return value;
    };

    /** @type {import('./types.js').EndoHost['cancel']} */
    const cancel = async (petName, reason = new Error('Cancelled')) => {
      const formulaIdentifier = petStore.identifyLocal(petName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name: ${q(petName)}`);
      }
      return cancelValue(formulaIdentifier, reason);
    };

    /** @type {import('./types.js').EndoHost['gateway']} */
    const gateway = async () => {
      const endoBootstrap = getEndoBootstrap();
      return E(endoBootstrap).gateway();
    };

    /** @type {import('./types.js').EndoHost['addPeerInfo']} */
    const addPeerInfo = async peerInfo => {
      const endoBootstrap = getEndoBootstrap();
      await E(endoBootstrap).addPeerInfo(peerInfo);
    };

    /** @type {import('./types.js').EndoHost['getPeerInfo']} */
    const getPeerInfo = async () => {
      const addresses = await getAllNetworkAddresses(
        networksDirectoryFormulaIdentifier,
      );
      const peerInfo = {
        node: ownNodeIdentifier,
        addresses,
      };
      return peerInfo;
    };

    const {
      has,
      identify,
      list,
      listIdentifiers,
      followChanges,
      reverseLookup,
      write,
      remove,
      move,
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

    /** @type {import('./types.js').EndoHost} */
    const host = {
      // Directory
      has,
      identify,
      list,
      listIdentifiers,
      followChanges,
      lookup,
      reverseLookup,
      write,
      remove,
      move,
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
      // Host
      store,
      provideGuest,
      provideHost,
      provideWorker,
      evaluate,
      makeUnconfined,
      makeBundle,
      cancel,
      gateway,
      getPeerInfo,
      addPeerInfo,
    };

    const external = Far('EndoHost', {
      ...host,
      followChanges: () => makeIteratorRef(host.followChanges()),
      followMessages: () => makeIteratorRef(host.followMessages()),
    });
    const internal = harden({ receive, respond, petStore });

    await provide(mainWorkerFormulaIdentifier);

    return harden({ external, internal });
  };

  return makeIdentifiedHost;
};
