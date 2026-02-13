// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { AgentDeferredTaskParams, Context, DaemonCore, DeferredTasks, EndoGuest, EndoHost, EnvRecord, EvalDeferredTaskParams, FormulaIdentifier, FormulaNumber, InvitationDeferredTaskParams, MakeCapletDeferredTaskParams, MakeCapletOptions, MakeDirectoryNode, MakeHostOrGuestOptions, MakeMailbox, Name, NameOrPath, NamePath, NodeNumber, PeerInfo, PetName, ReadableBlobDeferredTaskParams, MarshalDeferredTaskParams, WorkerDeferredTaskParams } from './types.js' */

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
import { makePetSitter } from './pet-sitter.js';
import { makeDeferredTasks } from './deferred-tasks.js';

import { HostInterface } from './interfaces.js';

/**
 * @param {string} name
 * @returns {asserts name is Name}
 */
const assertPowersName = name => {
  ['NONE', 'AGENT', 'ENDO'].includes(name) || assertPetName(name);
};

/**
 * @param {object} args
 * @param {DaemonCore['provide']} args.provide
 * @param {DaemonCore['provideController']} args.provideController
 * @param {DaemonCore['cancelValue']} args.cancelValue
 * @param {DaemonCore['formulateWorker']} args.formulateWorker
 * @param {DaemonCore['formulateHost']} args.formulateHost
 * @param {DaemonCore['formulateGuest']} args.formulateGuest
 * @param {DaemonCore['formulateMarshalValue']} args.formulateMarshalValue
 * @param {DaemonCore['formulateEval']} args.formulateEval
 * @param {DaemonCore['formulateUnconfined']} args.formulateUnconfined
 * @param {DaemonCore['formulateBundle']} args.formulateBundle
 * @param {DaemonCore['formulateReadableBlob']} args.formulateReadableBlob
 * @param {DaemonCore['formulateInvitation']} args.formulateInvitation
 * @param {DaemonCore['getAllNetworkAddresses']} args.getAllNetworkAddresses
 * @param {MakeMailbox} args.makeMailbox
 * @param {MakeDirectoryNode} args.makeDirectoryNode
 * @param {NodeNumber} args.localNodeNumber
 * @param {DaemonCore['getAgentIdForHandleId']} args.getAgentIdForHandleId
 * @param {() => Promise<void>} [args.collectIfDirty]
 */
export const makeHostMaker = ({
  provide,
  provideController,
  cancelValue,
  formulateWorker,
  formulateHost,
  formulateGuest,
  formulateMarshalValue,
  formulateEval,
  formulateUnconfined,
  formulateBundle,
  formulateReadableBlob,
  formulateInvitation,
  getAllNetworkAddresses,
  makeMailbox,
  makeDirectoryNode,
  localNodeNumber,
  getAgentIdForHandleId,
  collectIfDirty = async () => {},
}) => {
  /**
   * @param {string} hostId
   * @param {string} handleId
   * @param {string | undefined} hostHandleId
   * @param {string} storeId
   * @param {string} mailboxStoreId
   * @param {string} mailHubId
   * @param {string} inspectorId
   * @param {string} mainWorkerId
   * @param {string} endoId
   * @param {string} networksDirectoryId
   * @param {string} pinsDirectoryId
   * @param {string} leastAuthorityId
   * @param {{[name: string]: string}} platformNames
   * @param {Context} context
   * @param {string} [mailHubId] - Formula id for MAIL hub view (when provided, MAIL is added to special names)
   */
  const makeHost = async (
    hostId,
    handleId,
    hostHandleId,
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
    context.thisDiesIfThatDies(mailHubId);

    const basePetStore = await provide(storeId, 'pet-store');
    const mailboxStore = await provide(mailboxStoreId, 'mailbox-store');
    const specialNames = {
      ...platformNames,
      AGENT: hostId,
      SELF: handleId,
      HOST: hostHandleId ?? handleId,
      MAIN: mainWorkerId,
      ENDO: endoId,
      NETS: networksDirectoryId,
      PINS: pinsDirectoryId,
      INFO: inspectorId,
      NONE: leastAuthorityId,
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
        E(directory).write(namePath, identifiers.readableBlobId),
      );

      const { value } = await formulateReadableBlob(readerRef, tasks);
      return value;
    };

    /** @type {EndoHost['storeValue']} */
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
        E(directory).write(namePath, identifiers.workerId),
      );
      const { value } = await formulateWorker(tasks);
      return value;
    };

    /**
     * @param {Name | undefined} workerName
     * @param {DeferredTasks<WorkerDeferredTaskParams>['push']} deferTask
     */
    const prepareWorkerFormulation = (workerName, deferTask) => {
      if (workerName === undefined) {
        return undefined;
      }
      const workerId = /** @type {FormulaIdentifier | undefined} */ (
        petStore.identifyLocal(workerName)
      );
      if (workerId === undefined) {
        assertPetName(workerName);
        const petName = workerName;
        deferTask(identifiers => {
          return petStore.write(petName, identifiers.workerId);
        });
        return undefined;
      }
      return workerId;
    };

    /**
     * Evaluate code directly in a worker.
     * Note: This is the Host's evaluate, which executes code immediately.
     * Guest.evaluate instead sends an eval-proposal to the Host for approval.
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

      const workerId = prepareWorkerFormulation(workerName, tasks.push);

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
          E(directory).write(resultNamePath, identifiers.evalId),
        );
      }

      const { value } = await formulateEval(
        hostId,
        source,
        codeNames,
        endowmentFormulaIdsOrPaths,
        tasks,
        workerId,
      );
      return value;
    };

    /**
     * Helper function for makeUnconfined and makeBundle.
     * @param {Name | undefined} workerName
     * @param {MakeCapletOptions} [options]
     */
    const prepareMakeCaplet = (workerName, options = {}) => {
      const { powersName = 'NONE', resultName, env = {} } = options;
      if (workerName !== undefined) {
        assertName(workerName);
      }
      assertPowersName(powersName);

      /** @type {DeferredTasks<MakeCapletDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const workerId = prepareWorkerFormulation(workerName, tasks.push);

      const powersId = petStore.identifyLocal(/** @type {Name} */ (powersName));
      if (powersId === undefined) {
        assertPetName(powersName);
        const powersPetName = powersName;
        tasks.push(identifiers => {
          return petStore.write(powersPetName, identifiers.powersId);
        });
      }

      if (resultName !== undefined) {
        tasks.push(identifiers =>
          E(directory).write(namePathFrom(resultName), identifiers.capletId),
        );
      }

      return { tasks, workerId, powersId, env };
    };

    /** @type {EndoHost['makeUnconfined']} */
    const makeUnconfined = async (workerName, specifier, options) => {
      const { tasks, workerId, powersId, env } = prepareMakeCaplet(
        workerName,
        options,
      );

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
      );
      return value;
    };

    /** @type {EndoHost['makeBundle']} */
    const makeBundle = async (workerName, bundleName, options) => {
      const bundleId = petStore.identifyLocal(bundleName);
      if (bundleId === undefined) {
        throw new TypeError(`Unknown pet name for bundle: ${q(bundleName)}`);
      }

      const { tasks, workerId, powersId, env } = prepareMakeCaplet(
        workerName,
        options,
      );

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value } = await formulateBundle(
        hostId,
        handleId,
        bundleId,
        tasks,
        workerId,
        powersId,
        env,
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
          await agent.write([childName], introducedId);
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
          return petStore.write(handlePetName, identifiers.handleId);
        });
      }
      if (agentName !== undefined) {
        assertPetName(agentName);
        const agentPetName = agentName;
        tasks.push(identifiers => {
          return petStore.write(agentPetName, identifiers.agentId);
        });
      }
      return tasks;
    };

    /**
     * @param {PetName} [petName]
     * @param {MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{id: string, value: Promise<EndoHost>}>}
     */
    const makeChildHost = async (
      petName,
      { introducedNames = Object.create(null), agentName = undefined } = {},
    ) => {
      let host = getNamedAgent(petName, 'host');
      await null;
      if (host === undefined) {
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
          );
        host = { value: Promise.resolve(value), id };
      }

      await introduceNamesToAgent(host.id, introducedNames);

      /** @type {{ id: FormulaIdentifier, value: Promise<EndoHost> }} */
      return host;
    };

    /** @type {EndoHost['provideHost']} */
    const provideHost = async (petName, opts) => {
      if (petName !== undefined) {
        assertName(petName);
      }
      const normalizedOpts = normalizeHostOrGuestOptions(opts);
      const { value } = await makeChildHost(petName, normalizedOpts);
      return value;
    };

    /**
     * @param {PetName} [handleName]
     * @param {MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{id: string, value: Promise<EndoGuest>}>}
     */
    const makeGuest = async (
      handleName,
      { introducedNames = Object.create(null), agentName = undefined } = {},
    ) => {
      let guest = getNamedAgent(handleName, 'guest');
      await null;
      if (guest === undefined) {
        const { value, id } =
          // Behold, recursion:
          await formulateGuest(
            hostId,
            handleId,
            getDeferredTasksForAgent(
              handleName,
              /** @type {PetName | undefined} */ (agentName),
            ),
          );
        guest = { value: Promise.resolve(value), id };
      }

      await introduceNamesToAgent(guest.id, introducedNames);

      /** @type {{ id: FormulaIdentifier, value: Promise<EndoGuest> }} */
      return guest;
    };

    /** @type {EndoHost['provideGuest']} */
    const provideGuest = async (petName, opts) => {
      if (petName !== undefined) {
        assertName(petName);
      }
      const normalizedOpts = normalizeHostOrGuestOptions(opts);
      const { value } = await makeGuest(petName, normalizedOpts);
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
        petStore.write(guestName, identifiers.invitationId),
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

      const guestHandleId = formatId({
        number: remoteHandleNumber,
        node: nodeNumber,
      });
      const invitationId = formatId({
        number: invitationNumber,
        node: nodeNumber,
      });

      const { number: handleNumber } = parseId(handleId);
      // eslint-disable-next-line no-use-before-define
      const { addresses: hostAddresses } = await getPeerInfo();
      const handleUrl = new URL('endo://');
      handleUrl.hostname = localNodeNumber;
      handleUrl.searchParams.set('id', handleNumber);
      for (const address of hostAddresses) {
        handleUrl.searchParams.append('at', address);
      }
      const handleLocator = handleUrl.href;

      const invitation = await provide(invitationId, 'invitation');
      await E(invitation).accept(handleLocator);
      await petStore.write(guestName, guestHandleId);
    };

    /** @type {EndoHost['cancel']} */
    const cancel = async (petName, reason = new Error('Cancelled')) => {
      assertPetName(petName);
      const id = petStore.identifyLocal(petName);
      if (id === undefined) {
        throw new TypeError(`Unknown pet name: ${q(petName)}`);
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

    /** @type {EndoHost['addPeerInfo']} */
    const addPeerInfo = async peerInfo => {
      const endoBootstrap = getEndoBootstrap();
      await E(endoBootstrap).addPeerInfo(peerInfo);
    };

    /** @type {EndoHost['getPeerInfo']} */
    const getPeerInfo = async () => {
      const addresses = await getAllNetworkAddresses(networksDirectoryId);
      const peerInfo = {
        node: localNodeNumber,
        addresses,
      };
      return peerInfo;
    };

    const { reverseIdentify } = specialStore;
    const {
      has,
      identify,
      lookup,
      locate,
      reverseLocate,
      list,
      listIdentifiers,
      followNameChanges,
      followLocatorNameChanges,
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
      reply,
      request,
      send,
      deliver,
    } = mailbox;

    /** @type {EndoHost['approveEvaluation']} */
    const approveEvaluation = async (messageNumber, workerName) => {
      if (workerName !== undefined) {
        assertName(workerName);
      }
      const { source, codeNames, petNamePaths, resolverId, guestHandleId } =
        mailbox.getEvalRequest(messageNumber);

      assertNames(codeNames);

      const guestAgentId = await getAgentIdForHandleId(
        /** @type {FormulaIdentifier} */ (guestHandleId),
      );
      const guestAgent = await provide(guestAgentId, 'agent');

      // Resolve endowments from the guest's namespace
      /** @type {(FormulaIdentifier | NamePath)[]} */
      const endowmentFormulaIdsOrPaths = await Promise.all(
        petNamePaths.map(async petNamePath => {
          if (petNamePath.length === 1) {
            const id = await E(guestAgent).identify(petNamePath[0]);
            if (id === undefined) {
              throw new Error(
                `Unknown pet name ${q(petNamePath[0])} in guest namespace`,
              );
            }
            return /** @type {FormulaIdentifier} */ (id);
          }
          return petNamePath;
        }),
      );

      /** @type {DeferredTasks<EvalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      const workerId = prepareWorkerFormulation(workerName, tasks.push);

      const { id: evalId } = await formulateEval(
        guestAgentId,
        source,
        codeNames,
        endowmentFormulaIdsOrPaths,
        tasks,
        workerId,
      );
      const resolver = await provide(resolverId, 'resolver');
      E.sendOnly(resolver).resolveWithId(evalId);
    };

    /** @type {EndoHost['endow']} */
    const endow = async (messageNumber, bindings, workerName, resultName) => {
      if (workerName !== undefined) {
        assertName(workerName);
      }
      const { source, slots, resolverId, guestHandleId } =
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
      const workerId = prepareWorkerFormulation(workerName, tasks.push);

      if (resultName !== undefined) {
        const resultNamePath = namePathFrom(resultName);
        tasks.push(identifiers =>
          E(directory).write(resultNamePath, identifiers.evalId),
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
      const resolver = await provide(resolverId, 'resolver');
      E.sendOnly(resolver).resolveWithId(evalId);
    };

    /** @type {EndoHost['respondForm']} */
    const respondForm = async (messageNumber, values) => {
      const { fields, resolverId } = mailbox.getFormRequest(messageNumber);

      // Validate that values cover every field
      const fieldKeys = Object.keys(fields);
      for (const key of fieldKeys) {
        if (!(key in values)) {
          throw new Error(`Missing value for field ${q(key)}`);
        }
      }

      // Marshal the values record
      /** @type {DeferredTasks<MarshalDeferredTaskParams>} */
      const marshalTasks = makeDeferredTasks();
      const { id: marshalledId } = await formulateMarshalValue(
        /** @type {import('@endo/pass-style').Passable} */ (harden(values)),
        marshalTasks,
      );
      const resolver = await provide(resolverId, 'resolver');
      E.sendOnly(resolver).resolveWithId(marshalledId);
    };

    const { reverseIdentify } = specialStore;

    /**
     * Look up a value by its formula identifier.
     * @param {string} id - The formula identifier.
     * @returns {Promise<unknown>} The value.
     */
    const lookupById = async id => provide(id);
    const {
      has,
      identify,
      lookup,
      locate,
      reverseLocate,
      list,
      listIdentifiers,
      followNameChanges,
      followLocatorNameChanges,
      reverseLookup,
      write,
      remove,
      move,
      copy,
      makeDirectory: makeDirectoryLocal,
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
      // Note: We intentionally do not extract `evaluate` from mailbox.
      // Host has its own `evaluate` method that executes code directly,
      // whereas mailbox.evaluate sends an eval-proposal (used by Guest).
      grantEvaluate: mailboxGrantEvaluate,
      counterEvaluate: mailboxCounterEvaluate,
    } = mailbox;

    /**
     * Grant an eval-proposal by executing the proposed code.
     * @param {number} messageNumber - The message number of the eval-proposal
     */
    const grantEvaluate = async messageNumber => {
      // Create an executor callback that uses formulateEval
      const executeEval = async (
        source,
        codeNames,
        ids,
        workerName,
        proposal,
      ) => {
        /** @type {DeferredTasks<EvalDeferredTaskParams>} */
        const tasks = makeDeferredTasks();

        const workerId = prepareWorkerFormulation(workerName, tasks.push);

        let nameHubId = hostId;
        let endowmentIdsOrPaths = ids;

        if (proposal?.from) {
          const guestAgentId = await getAgentIdForHandleId(proposal.from);
          nameHubId = guestAgentId;

          if (proposal.petNamePaths) {
            if (proposal.petNamePaths.length !== codeNames.length) {
              throw new Error(
                `Eval proposal must have one pet name path for each code name`,
              );
            }

            const guestAgent = await provide(guestAgentId, 'agent');

            // Resolve endowments from the guest's namespace
            endowmentIdsOrPaths = await Promise.all(
              proposal.petNamePaths.map(async petNamePath => {
                if (petNamePath.length === 1) {
                  const id = await E(guestAgent).identify(petNamePath[0]);
                  if (id === undefined) {
                    throw new Error(
                      `Unknown pet name ${q(petNamePath[0])} in guest namespace`,
                    );
                  }
                  return /** @type {FormulaIdentifier} */ (id);
                }
                return petNamePath;
              }),
            );
          }
        }

        const { id, value } = await formulateEval(
          nameHubId,
          source,
          codeNames,
          endowmentIdsOrPaths,
          tasks,
          workerId,
        );
        return { id, value };
      };

      return mailboxGrantEvaluate(messageNumber, executeEval);
    };

    /**
     * Send a counter-proposal back to the original proposer.
     * @param {number} messageNumber - The message number of the original eval-proposal
     * @param {string} source - Modified JavaScript source code
     * @param {string[]} codeNames - Variable names used in source
     * @param {(string | string[])[]} petNamesOrPaths - Pet names for values (host's namespace)
     * @param {string} [workerName] - Worker to execute on
     * @param {string[]} [resultName] - Where to store result
     */
    const counterEvaluate = async (
      messageNumber,
      source,
      codeNames,
      petNamesOrPaths,
      workerName,
      resultName,
    ) => {
      const petNamePaths = petNamesOrPaths.map(namePathFrom);
      if (petNamePaths.length !== codeNames.length) {
        throw new Error(
          `Counter must have the same number of code names (${q(
            codeNames.length,
          )}) as pet names (${q(petNamePaths.length)})`,
        );
      }

      // Resolve all pet names to formula IDs from host's namespace
      const ids = await Promise.all(
        petNamePaths.map(async petNamePath => {
          const id = await E(directory).identify(...petNamePath);
          if (id === undefined) {
            throw new Error(`Unknown pet name ${q(petNamePath)}`);
          }
          return id;
        }),
      );

      // Create edge names from the pet names (for display in the counter-proposal)
      const edgeNames = /** @type {import('./types.js').EdgeName[]} */ (
        petNamePaths.map(path => (Array.isArray(path) ? path.join('.') : path))
      );

      // Get optional result name and worker name as strings
      const resultNameStr = resultName ? resultName.join('.') : undefined;
      const workerNameStr = workerName || undefined;

      await mailboxCounterEvaluate(
        messageNumber,
        source,
        codeNames,
        petNamePaths,
        edgeNames,
        ids,
        workerNameStr,
        resultNameStr,
      );
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
      followLocatorNameChanges,
      followNameChanges,
      lookup,
      reverseLookup,
      write,
      remove,
      move,
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
      // Host
      storeBlob,
      storeValue,
      provideGuest,
      provideHost,
      provideWorker,
      evaluate,
      makeUnconfined,
      makeBundle,
      cancel,
      gateway,
      greeter,
      getPeerInfo,
      addPeerInfo,
      deliver,
      invite,
      accept,
      approveEvaluation,
      // Eval-proposal handling
      grantEvaluate,
      counterEvaluate,
      endow,
      respondForm,
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

    const iteratorMethods = new Set([
      'followLocatorNameChanges',
      'followMessages',
      'followNameChanges',
    ]);
    const wrappedHost = Object.fromEntries(
      Object.entries(host).map(([name, fn]) => [
        name,
        iteratorMethods.has(name) ? fn : withCollection(fn),
      ]),
    );

    const hostExo = makeExo('EndoHost', HostInterface, {
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
    });

    await provide(mainWorkerId, 'worker');

    return hostExo;
  };

  return makeHost;
};
