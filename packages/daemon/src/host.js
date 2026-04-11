// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { AgentDeferredTaskParams, ChannelDeferredTaskParams, Context, DaemonCore, DeferredTasks, EndoGuest, EndoHost, EnvRecord, EvalDeferredTaskParams, FormulaIdentifier, FormulaNumber, InvitationDeferredTaskParams, MakeCapletDeferredTaskParams, MakeCapletOptions, MakeDirectoryNode, MakeHostOrGuestOptions, MakeMailbox, MountDeferredTaskParams, Name, NameOrPath, NamePath, NodeNumber, PeerInfo, PetName, ReadableBlobDeferredTaskParams, ReadableTreeDeferredTaskParams, MarshalDeferredTaskParams, ScratchMountDeferredTaskParams, WorkerDeferredTaskParams } from './types.js' */

import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { makeError, q } from '@endo/errors';
import { makeIteratorRef } from './reader-ref.js';
import {
  assertPetName,
  assertPetNamePath,
  assertName,
  assertNamePath,
  namePathFrom,
} from './pet-name.js';
import {
  assertFormulaNumber,
  assertNodeNumber,
  parseId,
  formatId,
} from './formula-identifier.js';
import { addressesFromLocator, formatLocator } from './locator.js';
import { toHex, fromHex } from './hex.js';
import { makePetSitter } from './pet-sitter.js';

import { makeDeferredTasks } from './deferred-tasks.js';

import { HostInterface } from './interfaces.js';
import { hostHelp, makeHelp } from './help-text.js';

/**
 * @param {string} name
 * @returns {asserts name is Name}
 */
const assertPowersName = name => {
  ['@none', '@agent', '@endo'].includes(name) || assertPetName(name);
};

/**
 * Normalizes host or guest options, providing default values.
 * @param {MakeHostOrGuestOptions | undefined} opts
 * @returns {{ introducedNames: Record<Name, PetName>, agentName?: PetName }}
 */
const normalizeHostOrGuestOptions = opts => {
  const agentName = /** @type {PetName | undefined} */ (opts?.agentName);
  return {
    introducedNames: /** @type {Record<Name, PetName>} */ (
      opts?.introducedNames ?? Object.create(null)
    ),
    ...(agentName !== undefined && { agentName }),
  };
};

/**
 * @param {object} args
 * @param {DaemonCore['provide']} args.provide
 * @param {DaemonCore['provideStoreController']} args.provideStoreController
 * @param {DaemonCore['cancelValue']} args.cancelValue
 * @param {DaemonCore['formulateWorker']} args.formulateWorker
 * @param {DaemonCore['formulateHost']} args.formulateHost
 * @param {DaemonCore['formulateGuest']} args.formulateGuest
 * @param {DaemonCore['formulateMarshalValue']} args.formulateMarshalValue
 * @param {DaemonCore['formulateEval']} args.formulateEval
 * @param {DaemonCore['formulateUnconfined']} args.formulateUnconfined
 * @param {DaemonCore['formulateBundle']} args.formulateBundle
 * @param {DaemonCore['formulateReadableBlob']} args.formulateReadableBlob
 * @param {DaemonCore['checkinTree']} args.checkinTree
 * @param {DaemonCore['formulateMount']} args.formulateMount
 * @param {DaemonCore['formulateScratchMount']} args.formulateScratchMount
 * @param {DaemonCore['formulateInvitation']} args.formulateInvitation
 * @param {DaemonCore['formulateSyncedPetStore']} args.formulateSyncedPetStore
 * @param {DaemonCore['formulateDirectoryForStore']} args.formulateDirectoryForStore
 * @param {DaemonCore['getPeerIdForNodeIdentifier']} args.getPeerIdForNodeIdentifier
 * @param {DaemonCore['formulateChannel']} args.formulateChannel
 * @param {DaemonCore['formulateTimer']} args.formulateTimer
 * @param {DaemonCore['getAllNetworkAddresses']} args.getAllNetworkAddresses
 * @param {DaemonCore['getTypeForId']} args.getTypeForId
 * @param {DaemonCore['getFormulaForId']} args.getFormulaForId
 * @param {MakeMailbox} args.makeMailbox
 * @param {MakeDirectoryNode} args.makeDirectoryNode
 * @param {NodeNumber} args.localNodeNumber
 * @param {(node: string) => boolean} args.isLocalKey
 * @param {DaemonCore['getAgentIdForHandleId']} args.getAgentIdForHandleId
 * @param {() => Promise<void>} [args.collectIfDirty]
 * @param {DaemonCore['pinTransient']} [args.pinTransient]
 * @param {DaemonCore['unpinTransient']} [args.unpinTransient]
 * @param {DaemonCore['getFormulaGraphSnapshot']} [args.getFormulaGraphSnapshot]
 */
export const makeHostMaker = ({
  provide,
  provideStoreController,
  cancelValue,
  formulateWorker,
  formulateHost,
  formulateGuest,
  formulateMarshalValue,
  formulateEval,
  formulateUnconfined,
  formulateBundle,
  formulateReadableBlob,
  checkinTree,
  formulateMount,
  formulateScratchMount,
  formulateInvitation,
  formulateSyncedPetStore,
  formulateDirectoryForStore,
  getPeerIdForNodeIdentifier,
  formulateChannel,
  formulateTimer,
  getAllNetworkAddresses,
  getTypeForId,
  getFormulaForId,
  makeMailbox,
  makeDirectoryNode,
  localNodeNumber,
  isLocalKey,
  getAgentIdForHandleId,
  collectIfDirty = async () => {},
  pinTransient = /** @param {any} _id */ _id => {},
  unpinTransient = /** @param {any} _id */ _id => {},
  getFormulaGraphSnapshot = /** @param {any[]} _ids */ async _ids =>
    harden({ nodes: [], edges: [] }),
}) => {
  /**
   * @param {FormulaIdentifier} hostId
   * @param {FormulaIdentifier} handleId
   * @param {FormulaIdentifier | undefined} hostHandleId
   * @param {FormulaIdentifier} keypairId
   * @param {NodeNumber} agentNodeNumber
   * @param {(message: Uint8Array) => Uint8Array} agentSignBytes
   * @param {FormulaIdentifier} storeId
   * @param {FormulaIdentifier} mailboxStoreId
   * @param {FormulaIdentifier | undefined} mailHubId
   * @param {FormulaIdentifier} inspectorId
   * @param {FormulaIdentifier} mainWorkerId
   * @param {FormulaIdentifier} endoId
   * @param {FormulaIdentifier} networksDirectoryId
   * @param {FormulaIdentifier} pinsDirectoryId
   * @param {FormulaIdentifier} leastAuthorityId
   * @param {{[name: string]: FormulaIdentifier}} platformNames
   * @param {Context} context
   */
  const makeHost = async (
    hostId,
    handleId,
    hostHandleId,
    keypairId,
    agentNodeNumber,
    agentSignBytes,
    storeId,
    mailboxStoreId,
    mailHubId,
    inspectorId,
    mainWorkerId,
    endoId,
    networksDirectoryId,
    pinsDirectoryId,
    leastAuthorityId,
    platformNames,
    context,
  ) => {
    context.thisDiesIfThatDies(storeId);
    context.thisDiesIfThatDies(mainWorkerId);
    context.thisDiesIfThatDies(mailboxStoreId);
    if (mailHubId !== undefined) {
      context.thisDiesIfThatDies(mailHubId);
    }

    const baseController = await provideStoreController(storeId);
    const mailboxController = await provideStoreController(mailboxStoreId);

    /** @type {Record<string, FormulaIdentifier>} */
    const specialNames = {
      ...platformNames,
      '@agent': hostId,
      '@self': handleId,
      '@host': hostHandleId ?? handleId,
      '@keypair': keypairId,
      '@main': mainWorkerId,
      '@endo': endoId,
      '@nets': networksDirectoryId,
      '@pins': pinsDirectoryId,
      '@info': inspectorId,
      '@none': leastAuthorityId,
    };
    if (mailHubId !== undefined) {
      specialNames['@mail'] = mailHubId;
    }
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
    const { petStore, handle } = mailbox;
    const getEndoBootstrap = async () => provide(endoId, 'endo');

    /**
     * @param {ERef<AsyncIterableIterator<string>>} readerRef
     * @param {NameOrPath} petName
     */
    const storeBlob = async (readerRef, petName) => {
      const { namePath } = assertPetNamePath(namePathFrom(petName));

      /** @type {DeferredTasks<ReadableBlobDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.readableBlobId),
      );

      const { value } = await formulateReadableBlob(readerRef, tasks);
      return value;
    };

    /**
     * Check in a remote readable-tree Exo, storing it content-addressed.
     * @param {unknown} remoteTree - Remote Exo providing the readable-tree interface.
     * @param {NameOrPath} petName
     */
    const storeTree = async (remoteTree, petName) => {
      const { namePath } = assertPetNamePath(namePathFrom(petName));

      /** @type {DeferredTasks<ReadableTreeDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.readableTreeId),
      );

      const { value } = await checkinTree(remoteTree, tasks);
      return value;
    };

    /**
     * Mount an external filesystem directory.
     *
     * @param {string} mountPath - Absolute path to the directory.
     * @param {NameOrPath} petName
     * @param {object} [options]
     * @param {boolean} [options.readOnly]
     */
    const provideMount = async (mountPath, petName, options = {}) => {
      const { readOnly = false } = options;
      const { namePath } = assertPetNamePath(namePathFrom(petName));

      /** @type {DeferredTasks<MountDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.mountId),
      );

      const { value } = await formulateMount(mountPath, readOnly, tasks);
      return value;
    };

    /**
     * Create a daemon-managed scratch mount.
     *
     * @param {NameOrPath} petName
     * @param {object} [options]
     * @param {boolean} [options.readOnly]
     */
    const provideScratchMount = async (petName, options = {}) => {
      const { readOnly = false } = options;
      const { namePath } = assertPetNamePath(namePathFrom(petName));

      /** @type {DeferredTasks<ScratchMountDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.scratchMountId),
      );

      const { value } = await formulateScratchMount(readOnly, tasks);
      return value;
    };

    /** @type {EndoHost['storeValue']} */
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

    /**
     * @param {NameOrPath} workerNamePath
     */
    const provideWorker = async workerNamePath => {
      const namePath = namePathFrom(workerNamePath);
      assertNamePath(namePath);
      const workerId = await E(directory).identify(...namePath);

      if (workerId !== undefined) {
        return provide(/** @type {FormulaIdentifier} */ (workerId), 'worker');
      }

      /** @type {DeferredTasks<WorkerDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.workerId),
      );
      const workerLabel = namePath[namePath.length - 1];
      const { value } = await formulateWorker(tasks, undefined, workerLabel);
      return value;
    };

    /**
     * @param {Name | undefined} workerName
     * @param {DeferredTasks<WorkerDeferredTaskParams>['push']} deferTask
     * @returns {{ workerId: FormulaIdentifier | undefined, workerLabel: string | undefined }}
     */
    const prepareWorkerFormulation = (workerName, deferTask) => {
      if (workerName === undefined) {
        return { workerId: undefined, workerLabel: undefined };
      }
      const workerId = /** @type {FormulaIdentifier | undefined} */ (
        petStore.identifyLocal(workerName)
      );
      if (workerId === undefined) {
        assertPetName(workerName);
        const petName = workerName;
        deferTask(identifiers => {
          return petStore.storeIdentifier(petName, identifiers.workerId);
        });
        return { workerId: undefined, workerLabel: petName };
      }
      return { workerId, workerLabel: /** @type {string} */ (workerName) };
    };

    /**
     * Evaluate code directly in a worker.
     * @param {Name | undefined} workerName
     * @param {string} source
     * @param {Array<string>} codeNames
     * @param {(string | string[])[]} petNamePaths
     * @param {NameOrPath | undefined} resultName
     */
    const evaluate = async (
      workerName,
      source,
      codeNames,
      petNamePaths,
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
      if (petNamePaths.length !== codeNames.length) {
        throw new Error('Evaluator requires one pet name for each code name');
      }

      /** @type {DeferredTasks<EvalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const { workerId, workerLabel: explicitLabel } = prepareWorkerFormulation(
        workerName,
        tasks.push,
      );
      const workerLabel =
        explicitLabel ??
        (resultName !== undefined ? `eval:${resultName}` : 'eval');

      /** @type {(FormulaIdentifier | NamePath)[]} */
      const endowmentFormulaIdsOrPaths = petNamePaths.map(petNameOrPath => {
        const petNamePath = namePathFrom(petNameOrPath);
        if (petNamePath.length === 1) {
          const id = petStore.identifyLocal(petNamePath[0]);
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
        hostId,
        source,
        codeNames,
        endowmentFormulaIdsOrPaths,
        tasks,
        workerId,
        resultName === undefined ? pinTransient : undefined,
        workerLabel,
      );
      if (resultName === undefined) {
        // Ephemeral eval: the formula was pinned inside formulateEval
        // (inside the lock) so concurrent collection can't reclaim it.
        // Unpin after the value resolves.
        try {
          return await value;
        } finally {
          unpinTransient(id);
        }
      }
      return value;
    };

    /**
     * Helper function for makeUnconfined and makeBundle.
     * @param {Name | undefined} workerName
     * @param {MakeCapletOptions} [options]
     */
    const prepareMakeCaplet = (workerName, options = {}) => {
      const {
        powersName = '@none',
        resultName,
        env = {},
        workerTrustedShims,
      } = options;
      if (workerName !== undefined) {
        assertName(workerName);
      }
      assertPowersName(powersName);

      /** @type {DeferredTasks<MakeCapletDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const { workerId, workerLabel } = prepareWorkerFormulation(
        workerName,
        tasks.push,
      );

      const powersId = /** @type {FormulaIdentifier | undefined} */ (
        petStore.identifyLocal(/** @type {Name} */ (powersName))
      );
      if (powersId === undefined) {
        assertPetName(powersName);
        const powersPetName = powersName;
        tasks.push(identifiers => {
          return petStore.storeIdentifier(powersPetName, identifiers.powersId);
        });
      }

      if (resultName !== undefined) {
        tasks.push(identifiers =>
          E(directory).storeIdentifier(
            namePathFrom(resultName),
            identifiers.capletId,
          ),
        );
      }

      return {
        tasks,
        workerId,
        workerLabel,
        powersId,
        env,
        workerTrustedShims,
      };
    };

    /** @type {EndoHost['makeUnconfined']} */
    const makeUnconfined = async (workerName, specifier, options) => {
      const {
        tasks,
        workerId,
        workerLabel: explicitLabel,
        powersId,
        env,
        workerTrustedShims,
      } = prepareMakeCaplet(
        /** @type {Name | undefined} */ (workerName),
        options,
      );
      const workerLabel =
        explicitLabel ??
        (options?.resultName !== undefined
          ? `${options.resultName}`
          : `unconfined:${specifier}`);

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value } = await formulateUnconfined(
        hostId,
        handleId,
        specifier,
        tasks,
        workerId,
        powersId,
        env,
        workerTrustedShims,
        workerLabel,
      );
      return value;
    };

    /** @type {EndoHost['makeBundle']} */
    const makeBundle = async (workerName, bundleName, options) => {
      const bundleId = petStore.identifyLocal(/** @type {Name} */ (bundleName));
      if (bundleId === undefined) {
        throw new TypeError(`Unknown pet name for bundle: ${q(bundleName)}`);
      }

      const {
        tasks,
        workerId,
        workerLabel: explicitLabel,
        powersId,
        env,
        workerTrustedShims,
      } = prepareMakeCaplet(
        /** @type {Name | undefined} */ (workerName),
        options,
      );
      const workerLabel =
        explicitLabel ??
        (options?.resultName !== undefined
          ? `${options.resultName}`
          : `bundle:${bundleName}`);

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value } = await formulateBundle(
        hostId,
        handleId,
        /** @type {FormulaIdentifier} */ (bundleId),
        tasks,
        workerId,
        powersId,
        env,
        workerTrustedShims,
        workerLabel,
      );
      return value;
    };

    /**
     * Attempts to introduce the given names to the specified agent. The agent in question
     * must be formulated before this function is called.
     *
     * @param {FormulaIdentifier} agentId - The agent's formula identifier.
     * @param {Record<Name, PetName>} introducedNames - The names to introduce.
     * @returns {Promise<void>}
     */
    const introduceNamesToAgent = async (agentId, introducedNames) => {
      const agent = await provide(agentId, 'agent');
      await Promise.all(
        Object.entries(introducedNames).map(async ([parentName, childName]) => {
          const introducedId = petStore.identifyLocal(
            /** @type {Name} */ (parentName),
          );
          if (introducedId === undefined) {
            return;
          }
          await agent.storeIdentifier([childName], introducedId);
        }),
      );
    };

    /**
     * @template {'host' | 'guest' | 'agent'} T
     * @param {Name} [petName] - The agent's potential pet name.
     * @param {T} [type]
     */
    const getNamedAgent = (petName, type) => {
      if (petName !== undefined) {
        const id = petStore.identifyLocal(petName);
        if (id !== undefined) {
          const formulaId = /** @type {FormulaIdentifier} */ (id);
          return {
            id: formulaId,
            value: provide(formulaId, type),
          };
        }
      }
      return undefined;
    };

    /**
     * @param {PetName} [handleName] - The pet name of the handle.
     * @param {PetName} [agentName] - The pet name of the agent.
     */
    const getDeferredTasksForAgent = (handleName, agentName) => {
      /** @type {DeferredTasks<AgentDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      if (handleName !== undefined) {
        assertPetName(handleName);
        const handlePetName = handleName;
        tasks.push(identifiers => {
          return petStore.storeIdentifier(handlePetName, identifiers.handleId);
        });
      }
      if (agentName !== undefined) {
        assertPetName(agentName);
        const agentPetName = agentName;
        tasks.push(identifiers => {
          return petStore.storeIdentifier(agentPetName, identifiers.agentId);
        });
      }
      return tasks;
    };

    /**
     * @param {PetName} [petName]
     * @param {MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{id: FormulaIdentifier, value: Promise<EndoHost>}>}
     */
    const makeChildHost = async (
      petName,
      { introducedNames = Object.create(null), agentName = undefined } = {},
    ) => {
      let host = getNamedAgent(petName, 'host');
      await null;
      if (host === undefined) {
        const hostLabel = agentName
          ? `host:${agentName}`
          : petName
            ? `host:${petName}`
            : 'host';
        const { value, id } =
          // Behold, recursion:
          await formulateHost(
            endoId,
            networksDirectoryId,
            pinsDirectoryId,
            getDeferredTasksForAgent(
              petName,
              /** @type {PetName | undefined} */ (agentName),
            ),
            undefined,
            handleId,
            hostLabel,
          );
        host = { value: Promise.resolve(value), id };
      }

      await introduceNamesToAgent(
        host.id,
        /** @type {Record<import('./types.js').Name, import('./types.js').PetName>} */ (
          introducedNames
        ),
      );

      /** @type {{ id: FormulaIdentifier, value: Promise<EndoHost> }} */
      return host;
    };

    /** @type {EndoHost['provideHost']} */
    const provideHost = async (petName, opts) => {
      if (petName !== undefined) {
        assertName(petName);
      }
      const normalizedOpts = normalizeHostOrGuestOptions(opts);
      const { value } = await makeChildHost(
        /** @type {PetName | undefined} */ (petName),
        normalizedOpts,
      );
      return value;
    };

    /**
     * @param {PetName} [handleName]
     * @param {MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{id: FormulaIdentifier, value: Promise<EndoGuest>}>}
     */
    const makeGuest = async (
      handleName,
      { introducedNames = Object.create(null), agentName = undefined } = {},
    ) => {
      let guest = getNamedAgent(handleName, 'guest');
      await null;
      if (guest === undefined) {
        const guestLabel = agentName
          ? `guest:${agentName}`
          : handleName
            ? `guest:${handleName}`
            : 'guest';
        const { value, id } =
          // Behold, recursion:
          await formulateGuest(
            hostId,
            handleId,
            getDeferredTasksForAgent(
              handleName,
              /** @type {PetName | undefined} */ (agentName),
            ),
            guestLabel,
          );
        guest = { value: Promise.resolve(value), id };
      }

      await introduceNamesToAgent(
        guest.id,
        /** @type {Record<import('./types.js').Name, import('./types.js').PetName>} */ (
          introducedNames
        ),
      );

      /** @type {{ id: FormulaIdentifier, value: Promise<EndoGuest> }} */
      return guest;
    };

    /** @type {EndoHost['provideGuest']} */
    const provideGuest = async (petName, opts) => {
      if (petName !== undefined) {
        assertName(petName);
      }
      const normalizedOpts = normalizeHostOrGuestOptions(opts);
      const { value } = await makeGuest(
        /** @type {PetName | undefined} */ (petName),
        normalizedOpts,
      );
      return value;
    };

    /**
     * Create a timer that fires at a specified interval.
     *
     * @param {PetName} petName - Pet name to store the timer under
     * @param {number} intervalMs - Interval in milliseconds
     * @param {string} [label] - Optional label for the timer
     */
    const makeTimerCmd = async (petName, intervalMs, label) => {
      assertPetName(petName);
      /** @type {DeferredTasks<{ timerId: import('./types.js').FormulaIdentifier }>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        petStore.storeIdentifier(petName, identifiers.timerId),
      );
      const { value } = await formulateTimer(
        Number(intervalMs),
        label || petName,
        tasks,
      );
      return value;
    };

    /**
     * Create a new channel and store it under the given pet name.
     * @param {PetName} petName - Pet name to store the channel under.
     * @param {string} channelProposedName - Display name for the channel creator.
     */
    const makeChannelCmd = async (petName, channelProposedName) => {
      assertPetName(petName);
      /** @type {DeferredTasks<ChannelDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        petStore.storeIdentifier(petName, identifiers.channelId),
      );
      const { value } = await formulateChannel(
        hostId,
        handleId,
        channelProposedName,
        tasks,
      );
      return value;
    };

    /**
     * @param {PetName} guestName
     */
    const invite = async guestName => {
      assertPetName(guestName);
      // We must immediately retain a formula under guestName so that we
      // preserve the invitation across restarts, but we must replace the
      // guestName with the handle of the guest that accepts the invitation.
      // We need to return the locator for the invitation regardless of what
      // we store.
      // Overwriting the guestName must cancel the pending invitation (consume
      // once) so that the invitation can no longer modify the petStore entry
      // for the guestName.
      /** @type {DeferredTasks<InvitationDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        petStore.storeIdentifier(guestName, identifiers.invitationId),
      );
      const { value } = await formulateInvitation(
        hostId,
        handleId,
        guestName,
        tasks,
      );
      return value;
    };

    /**
     * @param {string} invitationLocator
     * @param {PetName} guestName
     */
    const accept = async (invitationLocator, guestName) => {
      assertPetName(guestName);
      const url = new URL(invitationLocator);
      const nodeNumber = url.hostname;
      const invitationNumber = url.searchParams.get('id');
      const remoteHandleNumber = url.searchParams.get('from');
      const addresses = url.searchParams.getAll('at');

      nodeNumber || assert.Fail`Invitation must have a hostname`;
      if (!remoteHandleNumber) {
        throw makeError(`Invitation must have a "from" parameter`);
      }
      if (invitationNumber === null) {
        throw makeError(`Invitation must have an "id" parameter`);
      }
      assertNodeNumber(nodeNumber);
      assertFormulaNumber(remoteHandleNumber);
      assertFormulaNumber(invitationNumber);

      /** @type {PeerInfo} */
      const peerInfo = {
        node: nodeNumber,
        addresses,
      };
      // eslint-disable-next-line no-use-before-define
      await addPeerInfo(peerInfo);

      const invitationId = formatId({
        number: invitationNumber,
        node: nodeNumber,
      });

      const { number: handleNumber } = parseId(handleId);
      // eslint-disable-next-line no-use-before-define
      const { addresses: hostAddresses } = await getPeerInfo();
      const handleUrl = new URL('endo://');
      handleUrl.hostname = agentNodeNumber;
      handleUrl.searchParams.set('id', handleNumber);
      for (const address of hostAddresses) {
        handleUrl.searchParams.append('at', address);
      }
      const handleLocator = handleUrl.href;

      const invitation = await provide(invitationId, 'invitation');
      const acceptResult = await E(invitation).accept(handleLocator, guestName);

      // The host's accept handler returns the synced store number.
      const { syncedStoreNumber } =
        /** @type {{ syncedStoreNumber: import('./types.js').FormulaNumber }} */ (
          acceptResult
        );

      // Create a synced-pet-store (grantee role) paired with the host's store.
      const peerId = await getPeerIdForNodeIdentifier(
        /** @type {import('./types.js').NodeNumber} */ (nodeNumber),
      );
      const { id: syncedStoreId } = await formulateSyncedPetStore(
        peerId,
        'grantee',
        /** @type {import('./types.js').FormulaNumber} */ (syncedStoreNumber),
        peerId, // store dependency
      );

      // Create a local guest backed by the synced store.
      /** @type {import('./types.js').DeferredTasks<import('./types.js').AgentDeferredTaskParams>} */
      const guestTasks = makeDeferredTasks();
      const { id: localGuestId } = await formulateGuest(
        hostId,
        handleId,
        guestTasks,
        `guest:${guestName}`,
        syncedStoreId,
      );

      // Look up the local guest's handle from its formula so we can
      // name it.  Incarnating the handle transitively incarnates the
      // guest and its synced pet store, starting synchronisation.
      const localGuestFormula =
        /** @type {import('./types.js').GuestFormula} */ (
          await getFormulaForId(localGuestId)
        );
      await E(directory).storeIdentifier(
        ['@pins', `guest-${guestName}`],
        localGuestFormula.handle,
      );

      // Store the remote handle under guestName for mail delivery.
      const remoteHandleId = formatId({
        number: /** @type {import('./types.js').FormulaNumber} */ (
          remoteHandleNumber
        ),
        node: /** @type {import('./types.js').NodeNumber} */ (nodeNumber),
      });
      const remoteHandleLocator = formatLocator(remoteHandleId, 'handle');
      await E(directory).storeLocator([guestName], remoteHandleLocator);
    };

    /** @type {EndoHost['registerSyncedStore']} */
    const registerSyncedStore = async (_petName, _syncedStoreId) => {
      // No-op: the synced store is now discovered via the formula
      // graph (guest handle → guest → petStore).  Retained for
      // interface compatibility.
    };

    /** @type {EndoHost['getSyncedStore']} */
    const getSyncedStore = async petName => {
      // Traverse the formula graph:
      // @pins/guest-<name> → local guest handle
      //   → handle formula.agent → guest formula
      //     → guest formula.petStore → synced store
      const localHandleId = await E(directory).identify(
        '@pins',
        `guest-${petName}`,
      );
      if (localHandleId === undefined) {
        throw new Error(`No synced store for ${q(petName)}`);
      }
      const handleFormula = /** @type {import('./types.js').HandleFormula} */ (
        await getFormulaForId(/** @type {FormulaIdentifier} */ (localHandleId))
      );
      const guestFormula = /** @type {import('./types.js').GuestFormula} */ (
        await getFormulaForId(handleFormula.agent)
      );
      return provide(guestFormula.petStore, 'synced-pet-store');
    };

    /** @type {EndoHost['cancel']} */
    const cancel = async (petNameOrPath, reason = new Error('Cancelled')) => {
      const namePath = namePathFrom(petNameOrPath);
      const id = await E(directory).identify(...namePath);
      if (id === undefined) {
        throw new TypeError(`Unknown pet name: ${q(petNameOrPath)}`);
      }
      return cancelValue(/** @type {FormulaIdentifier} */ (id), reason);
    };

    /** @type {EndoHost['gateway']} */
    const gateway = async () => {
      const endoBootstrap = getEndoBootstrap();
      return E(endoBootstrap).gateway();
    };

    /** @type {EndoHost['greeter']} */
    const greeter = async () => {
      const endoBootstrap = getEndoBootstrap();
      return E(endoBootstrap).greeter();
    };

    /** @type {EndoHost['sign']} */
    const sign = async hexBytes => {
      return toHex(agentSignBytes(fromHex(hexBytes)));
    };

    /** @type {EndoHost['addPeerInfo']} */
    const addPeerInfo = async peerInfo => {
      const endoBootstrap = getEndoBootstrap();
      await E(endoBootstrap).addPeerInfo(peerInfo);
    };

    /** @type {EndoHost['listKnownPeers']} */
    const listKnownPeers = async () => {
      const endoBootstrap = getEndoBootstrap();
      return E(endoBootstrap).listKnownPeers();
    };

    /** @type {EndoHost['followPeerChanges']} */
    const followPeerChanges = async () => {
      const endoBootstrap = getEndoBootstrap();
      return E(endoBootstrap).followPeerChanges();
    };

    /** @type {EndoHost['getPeerInfo']} */
    const getPeerInfo = async () => {
      const addresses = await getAllNetworkAddresses(networksDirectoryId);
      const peerInfo = {
        node: agentNodeNumber,
        addresses,
      };
      return peerInfo;
    };

    /** @type {EndoHost['locateForSharing']} */
    const locateForSharing = async (...petNamePath) => {
      return E(directory).locate(...petNamePath);
    };

    /** @type {EndoHost['adoptFromLocator']} */
    const adoptFromLocator = async (locator, petNameOrPath) => {
      const namePath = namePathFrom(petNameOrPath);
      assertNamePath(namePath);
      const url = new URL(locator);
      const nodeNumber = url.hostname;
      assertNodeNumber(nodeNumber);
      const addresses = addressesFromLocator(locator);
      if (addresses.length > 0) {
        /** @type {PeerInfo} */
        const peerInfo = {
          node: nodeNumber,
          addresses,
        };
        await addPeerInfo(peerInfo);
      }
      const formulaNumber = url.searchParams.get('id');
      if (!formulaNumber) {
        throw makeError('Locator must have an "id" parameter');
      }
      const id = formatId({
        number: /** @type {import('./types.js').FormulaNumber} */ (
          formulaNumber
        ),
        node: /** @type {NodeNumber} */ (nodeNumber),
      });
      await E(directory).storeIdentifier(namePath, id);
    };

    const { reverseIdentify } = specialStore;
    const {
      has,
      identify,
      lookup,
      maybeLookup,
      locate,
      reverseLocate,
      list,
      listIdentifiers,
      listLocators,
      followNameChanges,
      followLocatorNameChanges,
      reverseLookup,
      remove,
      move,
      copy,
      makeDirectory: makeDirectoryLocal,
      storeIdentifier: directoryStoreIdentifier,
      storeLocator: directoryStoreLocator,
      readText: directoryReadText,
      maybeReadText: directoryMaybeReadText,
      writeText: directoryWriteText,
    } = directory;

    const makeDirectory = async petNameOrPath => {
      const namePath = namePathFrom(petNameOrPath);
      return makeDirectoryLocal(namePath);
    };
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
      form,
      submit,
      sendValue,
      deliverValueById,
    } = mailbox;

    /**
     * Look up a value by its formula identifier.
     * @param {FormulaIdentifier} id - The formula identifier.
     * @returns {Promise<unknown>} The value.
     */
    const lookupById = async id => provide(id);

    /** @type {EndoHost['endow']} */
    const endow = async (messageNumber, bindings, workerName, resultName) => {
      if (workerName !== undefined) {
        assertName(workerName);
      }
      const { source, slots, guestHandleId } =
        mailbox.getDefineRequest(messageNumber);

      // Validate bindings cover every slot
      const slotKeys = Object.keys(slots);
      for (const key of slotKeys) {
        if (!(key in bindings)) {
          throw new Error(`Missing binding for slot ${q(key)}`);
        }
      }

      const guestAgentId = await getAgentIdForHandleId(
        /** @type {FormulaIdentifier} */ (guestHandleId),
      );

      // Resolve each binding pet name to a formula identifier from the host's namespace
      const codeNames = slotKeys;
      const endowmentFormulaIdsOrPaths = codeNames.map(codeName => {
        const petNameOrPath = bindings[codeName];
        const petNamePath = namePathFrom(petNameOrPath);
        if (petNamePath.length === 1) {
          const id = petStore.identifyLocal(petNamePath[0]);
          if (id === undefined) {
            throw new Error(`Unknown pet name ${q(petNamePath[0])}`);
          }
          return /** @type {FormulaIdentifier} */ (id);
        }
        return petNamePath;
      });

      /** @type {DeferredTasks<EvalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      const { workerId } = prepareWorkerFormulation(workerName, tasks.push);

      if (resultName !== undefined) {
        const resultNamePath = namePathFrom(resultName);
        tasks.push(identifiers =>
          E(directory).storeIdentifier(resultNamePath, identifiers.evalId),
        );
      }

      const { id: evalId } = await formulateEval(
        guestAgentId,
        source,
        codeNames,
        endowmentFormulaIdsOrPaths,
        tasks,
        workerId,
      );

      // Deliver the eval result to the host's own inbox only.
      // Using deliverValueById (not sendValue/post) ensures the value
      // message does NOT appear in the proposer's inbox.
      await deliverValueById(messageNumber, evalId);
    };

    /**
     * Returns a snapshot of the formula dependency graph for all formulas
     * reachable from this agent's pet store entries.
     */
    const getFormulaGraph = async () => {
      const names = await list();
      /** @type {import('./types.js').FormulaIdentifier[]} */
      const seedIds = [];
      await Promise.all(
        names.map(async name => {
          const id = await identify(name);
          if (id !== undefined) {
            seedIds.push(
              /** @type {import('./types.js').FormulaIdentifier} */ (id),
            );
          }
        }),
      );
      return getFormulaGraphSnapshot(seedIds);
    };

    /** @type {EndoHost} */
    const host = {
      // Directory
      has,
      identify,
      reverseIdentify,
      lookupById,
      locate,
      reverseLocate,
      list,
      listIdentifiers,
      listLocators,
      followLocatorNameChanges,
      followNameChanges,
      lookup,
      maybeLookup,
      reverseLookup,
      storeIdentifier: directoryStoreIdentifier,
      storeLocator: directoryStoreLocator,
      remove,
      move,
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
      form,
      // Host
      storeBlob,
      storeValue,
      storeTree,
      provideMount,
      provideScratchMount,
      provideGuest,
      provideHost,
      provideWorker,
      evaluate,
      makeUnconfined,
      makeBundle,
      cancel,
      gateway,
      greeter,
      sign,
      getPeerInfo,
      addPeerInfo,
      listKnownPeers,
      followPeerChanges,
      locateForSharing,
      adoptFromLocator,
      deliver,
      makeChannel: makeChannelCmd,
      makeTimer: makeTimerCmd,
      invite,
      accept,
      getSyncedStore,
      registerSyncedStore,
      endow,
      submit,
      sendValue,
      // Graph
      getFormulaGraph,
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

    // Methods that create formulas and resolve them through promise chains
    // (E.sendOnly(resolver).resolveWithId) must NOT trigger collection on
    // return, because the resolver runs asynchronously and hasn't written
    // the formula ID to the pet store yet. Collection at this point would
    // find the just-created formula unreachable and delete it.
    const unwrappedMethods = new Set([
      'handle',
      'reverseIdentify',
      'endow',
      'submit',
      'sendValue',
    ]);
    const wrappedHost = Object.fromEntries(
      Object.entries(host).map(([name, fn]) => [
        name,
        unwrappedMethods.has(name) ? fn : withCollection(fn),
      ]),
    );

    const hostExo = makeExo(
      'EndoHost',
      HostInterface,
      /** @type {any} */ ({
        help: makeHelp(hostHelp),
        ...wrappedHost,
        /** @param {string} locator */
        followLocatorNameChanges: async locator => {
          const iterator = host.followLocatorNameChanges(locator);
          await collectIfDirty();
          return makeIteratorRef(iterator);
        },
        followMessages: async () => {
          const iterator = host.followMessages();
          await collectIfDirty();
          return makeIteratorRef(iterator);
        },
        followNameChanges: async () => {
          const iterator = host.followNameChanges();
          await collectIfDirty();
          return makeIteratorRef(iterator);
        },
        followPeerChanges: async () => {
          const iterator = await host.followPeerChanges();
          await collectIfDirty();
          return makeIteratorRef(iterator);
        },
      }),
    );

    await provide(mainWorkerId, 'worker');

    return hostExo;
  };

  return makeHost;
};
