// @ts-check

import { E, Far } from '@endo/far';
import { makeIteratorRef } from './reader-ref.js';
import { assertPetName, petNamePathFrom } from './pet-name.js';
import { makePetSitter } from './pet-sitter.js';
import { makeDeferredTasks } from './deferred-tasks.js';

const { quote: q } = assert;

/**
 * @template {Record<string, string | string[]>} T
 * @typedef {import('./types.js').DeferredTasks<T>} DeferredTasks
 */

/**
 * @param {object} args
 * @param {import('./types.js').DaemonCore['provideValueForFormulaIdentifier']} args.provideValueForFormulaIdentifier
 * @param {import('./types.js').DaemonCore['provideControllerForFormulaIdentifier']} args.provideControllerForFormulaIdentifier
 * @param {import('./types.js').DaemonCore['cancelValue']} args.cancelValue
 * @param {import('./types.js').DaemonCore['incarnateWorker']} args.incarnateWorker
 * @param {import('./types.js').DaemonCore['incarnateHost']} args.incarnateHost
 * @param {import('./types.js').DaemonCore['incarnateGuest']} args.incarnateGuest
 * @param {import('./types.js').DaemonCore['incarnateEval']} args.incarnateEval
 * @param {import('./types.js').DaemonCore['incarnateUnconfined']} args.incarnateUnconfined
 * @param {import('./types.js').DaemonCore['incarnateBundle']} args.incarnateBundle
 * @param {import('./types.js').DaemonCore['incarnateWebBundle']} args.incarnateWebBundle
 * @param {import('./types.js').DaemonCore['storeReaderRef']} args.storeReaderRef
 * @param {import('./types.js').DaemonCore['getAllNetworkAddresses']} args.getAllNetworkAddresses
 * @param {import('./types.js').MakeMailbox} args.makeMailbox
 * @param {import('./types.js').MakeDirectoryNode} args.makeDirectoryNode
 * @param {string} args.ownNodeIdentifier
 */
export const makeHostMaker = ({
  provideValueForFormulaIdentifier,
  provideControllerForFormulaIdentifier,
  cancelValue,
  incarnateWorker,
  incarnateHost,
  incarnateGuest,
  incarnateEval,
  incarnateUnconfined,
  incarnateBundle,
  incarnateWebBundle,
  storeReaderRef,
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
    context,
  ) => {
    context.thisDiesIfThatDies(storeFormulaIdentifier);
    context.thisDiesIfThatDies(mainWorkerFormulaIdentifier);

    const basePetStore = /** @type {import('./types.js').PetStore} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(storeFormulaIdentifier)
    );
    const specialStore = makePetSitter(basePetStore, {
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
          await provideValueForFormulaIdentifier(endoFormulaIdentifier)
        );
      return endoBootstrap;
    };

    /**
     * @param {string} formulaIdentifier - The guest or host formula identifier.
     * @param {Record<string,string>} introducedNames - The names to introduce.
     * @returns {Promise<void>}
     */
    const introduceNamesToParty = async (
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
     * @param {string} [petName]
     * @param {import('./types.js').MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{formulaIdentifier: string, value: Promise<import('./types.js').EndoGuest>}>}
     */
    const makeGuest = async (petName, { introducedNames = {} } = {}) => {
      if (petName !== undefined) {
        const formulaIdentifier = petStore.identifyLocal(petName);
        if (formulaIdentifier !== undefined) {
          if (formulaIdentifier.startsWith('guest:')) {
            throw new Error(
              `Existing pet name does not designate a guest powers capability: ${q(
                petName,
              )}`,
            );
          }

          // TODO: Should this be awaited?
          introduceNamesToParty(formulaIdentifier, introducedNames);
          const guestController =
            provideControllerForFormulaIdentifier(formulaIdentifier);
          return {
            formulaIdentifier,
            value: /** @type {Promise<import('./types.js').EndoGuest>} */ (
              guestController.external
            ),
          };
        }
      }

      /** @type {DeferredTasks<import('./types.js').GuestDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      if (petName !== undefined) {
        tasks.push(identifiers =>
          petStore.write(petName, identifiers.guestFormulaIdentifier),
        );
      }

      const { value, formulaIdentifier } =
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        await incarnateGuest(hostFormulaIdentifier, tasks);
      // TODO: Should this be awaited?
      introduceNamesToParty(formulaIdentifier, introducedNames);

      return {
        value: Promise.resolve(value),
        formulaIdentifier,
      };
    };

    /** @type {import('./types.js').EndoHost['provideGuest']} */
    const provideGuest = async (petName, opts) => {
      const { value } = await makeGuest(petName, opts);
      return value;
    };

    /**
     * @param {import('@endo/eventual-send').ERef<AsyncIterableIterator<string>>} readerRef
     * @param {string} [petName]
     */
    const store = async (readerRef, petName) => {
      if (petName !== undefined) {
        assertPetName(petName);
      }

      const formulaIdentifier = await storeReaderRef(readerRef);

      if (petName !== undefined) {
        await petStore.write(petName, formulaIdentifier);
      }
    };

    /**
     * @param {string} workerName
     */
    const provideWorker = async workerName => {
      if (typeof workerName !== 'string') {
        throw new Error('worker name must be string');
      }
      let workerFormulaIdentifier = petStore.identifyLocal(workerName);
      if (workerFormulaIdentifier === undefined) {
        ({ formulaIdentifier: workerFormulaIdentifier } =
          await incarnateWorker());
        assertPetName(workerName);
        await petStore.write(workerName, workerFormulaIdentifier);
      } else if (!workerFormulaIdentifier.startsWith('worker:')) {
        throw new Error(`Not a worker ${q(workerName)}`);
      }
      return /** @type {Promise<import('./types.js').EndoWorker>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(workerFormulaIdentifier)
      );
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     */
    const provideWorkerFormulaIdentifier = async workerName => {
      if (workerName === 'MAIN') {
        return mainWorkerFormulaIdentifier;
      } else if (workerName === 'NEW') {
        const { formulaIdentifier: workerFormulaIdentifier } =
          await incarnateWorker();
        return workerFormulaIdentifier;
      }

      assertPetName(workerName);
      let workerFormulaIdentifier = petStore.identifyLocal(workerName);
      if (workerFormulaIdentifier === undefined) {
        ({ formulaIdentifier: workerFormulaIdentifier } =
          await incarnateWorker());
        assertPetName(workerName);
        await petStore.write(workerName, workerFormulaIdentifier);
      }
      return workerFormulaIdentifier;
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     * @param {DeferredTasks<{ workerFormulaIdentifier: string }>['push']} deferTask
     * @returns {string | undefined}
     */
    const provideWorkerFormulaIdentifierSync = (workerName, deferTask) => {
      if (workerName === 'MAIN') {
        return mainWorkerFormulaIdentifier;
      } else if (workerName === 'NEW') {
        return undefined;
      }

      assertPetName(workerName);
      const workerFormulaIdentifier = petStore.identifyLocal(workerName);
      if (workerFormulaIdentifier === undefined) {
        deferTask(identifiers =>
          petStore.write(workerName, identifiers.workerFormulaIdentifier),
        );
        return undefined;
      }
      return workerFormulaIdentifier;
    };

    /**
     * @param {string | 'NONE' | 'SELF' | 'ENDO'} partyName
     * @returns {Promise<string>}
     */
    const providePowersFormulaIdentifier = async partyName => {
      let guestFormulaIdentifier = petStore.identifyLocal(partyName);
      if (guestFormulaIdentifier === undefined) {
        ({ formulaIdentifier: guestFormulaIdentifier } = await makeGuest(
          partyName,
        ));
        if (guestFormulaIdentifier === undefined) {
          throw new Error(
            `panic: makeGuest must return a guest with a corresponding formula identifier`,
          );
        }
      }
      return guestFormulaIdentifier;
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

      /** @type {DeferredTasks<import('./types.js').EvalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const workerFormulaIdentifier = provideWorkerFormulaIdentifierSync(
        workerName,
        tasks.push,
      );

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

    /** @type {import('./types.js').EndoHost['makeUnconfined']} */
    const makeUnconfined = async (
      workerName,
      specifier,
      powersName,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { formulaIdentifier, value } = await incarnateUnconfined(
        workerFormulaIdentifier,
        powersFormulaIdentifier,
        specifier,
      );
      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }
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
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      const bundleFormulaIdentifier = petStore.identifyLocal(bundleName);
      if (bundleFormulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name for bundle: ${bundleName}`);
      }

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value, formulaIdentifier } = await incarnateBundle(
        powersFormulaIdentifier,
        workerFormulaIdentifier,
        bundleFormulaIdentifier,
      );

      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }

      return value;
    };

    /**
     * @param {string} [petName]
     * @returns {Promise<import('./types.js').EndoWorker>}
     */
    const makeWorker = async petName => {
      // Behold, recursion:
      const { formulaIdentifier, value } = await incarnateWorker();
      if (petName !== undefined) {
        assertPetName(petName);
        await petStore.write(petName, formulaIdentifier);
      }
      return /** @type {import('./types.js').EndoWorker} */ (value);
    };

    /**
     * @param {string} [petName]
     * @param {import('./types.js').MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{formulaIdentifier: string, value: Promise<import('./types.js').EndoHost>}>}
     */
    const makeHost = async (petName, { introducedNames = {} } = {}) => {
      /** @type {string | undefined} */
      let formulaIdentifier;
      if (petName !== undefined) {
        formulaIdentifier = petStore.identifyLocal(petName);
      }
      if (formulaIdentifier === undefined) {
        const { formulaIdentifier: newFormulaIdentifier, value } =
          await incarnateHost(
            endoFormulaIdentifier,
            networksDirectoryFormulaIdentifier,
            leastAuthorityFormulaIdentifier,
          );
        if (petName !== undefined) {
          assertPetName(petName);
          await petStore.write(petName, newFormulaIdentifier);
        }
        return {
          formulaIdentifier: newFormulaIdentifier,
          value: Promise.resolve(value),
        };
      } else if (!formulaIdentifier.startsWith('host:')) {
        throw new Error(
          `Existing pet name does not designate a host powers capability: ${q(
            petName,
          )}`,
        );
      }

      introduceNamesToParty(formulaIdentifier, introducedNames);
      const newHostController =
        /** @type {import('./types.js').Controller<>} */ (
          provideControllerForFormulaIdentifier(formulaIdentifier)
        );
      return {
        formulaIdentifier,
        value: /** @type {Promise<import('./types.js').EndoHost>} */ (
          newHostController.external
        ),
      };
    };

    /** @type {import('./types.js').EndoHost['provideHost']} */
    const provideHost = async (petName, opts) => {
      const { value } = await makeHost(petName, opts);
      return value;
    };

    /**
     * @param {string} webPageName
     * @param {string} bundleName
     * @param {string | 'NONE' | 'SELF' | 'ENDO'} powersName
     */
    const provideWebPage = async (webPageName, bundleName, powersName) => {
      const bundleFormulaIdentifier = petStore.identifyLocal(bundleName);
      if (bundleFormulaIdentifier === undefined) {
        throw new Error(`Unknown pet name: ${q(bundleName)}`);
      }

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      // Behold, recursion:
      const { value, formulaIdentifier } = await incarnateWebBundle(
        powersFormulaIdentifier,
        bundleFormulaIdentifier,
      );

      if (webPageName !== undefined) {
        assertPetName(webPageName);
        await petStore.write(webPageName, formulaIdentifier);
      }

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
      makeWorker,
      provideWorker,
      evaluate,
      makeUnconfined,
      makeBundle,
      provideWebPage,
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

    await provideValueForFormulaIdentifier(mainWorkerFormulaIdentifier);

    return harden({ external, internal });
  };

  return makeIdentifiedHost;
};
