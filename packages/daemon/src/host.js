// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { AgentDeferredTaskParams, Context, DaemonCore, DeferredTasks, EndoGuest, EndoHost, EvalDeferredTaskParams, FormulaIdentifier, FormulaNumber, InvitationDeferredTaskParams, MakeCapletDeferredTaskParams, MakeDirectoryNode, MakeHostOrGuestOptions, MakeMailbox, Name, NameOrPath, NamePath, NodeNumber, PeerInfo, PetName, ReadableBlobDeferredTaskParams, MarshalDeferredTaskParams, WorkerDeferredTaskParams } from './types.js' */

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
   * @param {FormulaIdentifier} hostId
   * @param {FormulaIdentifier} handleId
   * @param {FormulaIdentifier} storeId
   * @param {FormulaIdentifier} mailboxStoreId
   * @param {FormulaIdentifier} mailHubId
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
    const specialStore = makePetSitter(basePetStore, {
      ...platformNames,
      AGENT: hostId,
      SELF: handleId,
      MAIN: mainWorkerId,
      ENDO: endoId,
      NETS: networksDirectoryId,
      PINS: pinsDirectoryId,
      INFO: inspectorId,
      MAIL: mailHubId,
      NONE: leastAuthorityId,
    });

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
     * @param {MakeHostOrGuestOptions | undefined} opts
     * @returns {{ introducedNames: Record<Name, PetName>, agentName?: PetName }}
     */
    const normalizeHostOrGuestOptions = opts => {
      const { introducedNames: introducedNamesRecord, agentName } = opts ?? {};
      /** @type {Record<Name, PetName>} */
      const introducedNames = Object.create(null);
      if (introducedNamesRecord !== undefined) {
        for (const [edgeName, introducedPetName] of Object.entries(
          introducedNamesRecord,
        )) {
          assertName(edgeName);
          assertPetName(introducedPetName);
          introducedNames[edgeName] = introducedPetName;
        }
      }
      if (agentName !== undefined) {
        assertPetName(agentName);
      }
      return {
        introducedNames,
        agentName,
      };
    };

    /**
     * @param {ERef<AsyncIterableIterator<string>>} readerRef
     * @param {string | string[]} petName
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
     * @param {string | string[]} workerNamePath
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
     * @param {string | undefined} workerName
     * @param {string} source
     * @param {Array<string>} codeNames
     * @param {(string | string[])[]} petNamePaths
     * @param {string | string[] | undefined} resultName
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
     * @param {string} powersName
     * @param {Name | undefined} workerName
     * @param {string | string[]} [resultName]
     */
    const prepareMakeCaplet = (powersName, workerName, resultName) => {
      assertPowersName(powersName);

      /** @type {DeferredTasks<MakeCapletDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const workerId = prepareWorkerFormulation(workerName, tasks.push);

      const powersId = /** @type {FormulaIdentifier | undefined} */ (
        petStore.identifyLocal(powersName)
      );
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

      return { tasks, workerId, powersId };
    };

    /** @type {EndoHost['makeUnconfined']} */
    const makeUnconfined = async (
      workerName,
      specifier,
      powersName,
      resultName,
    ) => {
      if (workerName !== undefined) {
        assertName(workerName);
      }
      assertPowersName(powersName);
      const { tasks, workerId, powersId } = prepareMakeCaplet(
        powersName,
        workerName,
        resultName,
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
      );
      return value;
    };

    /**
     * @param {string | undefined} workerName
     * @param {string} bundleName
     * @param {string} powersName
     * @param {string | string[] | undefined} resultName
     */
    const makeBundle = async (
      workerName,
      bundleName,
      powersName,
      resultName,
    ) => {
      if (workerName !== undefined) {
        assertName(workerName);
      }
      assertName(bundleName);
      assertPowersName(powersName);
      const bundleId = /** @type {FormulaIdentifier | undefined} */ (
        petStore.identifyLocal(bundleName)
      );
      if (bundleId === undefined) {
        throw new TypeError(`Unknown pet name for bundle: ${q(bundleName)}`);
      }

      const { tasks, workerId, powersId } = prepareMakeCaplet(
        powersName,
        workerName,
        resultName,
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
     * @param {string} [handleName] - The pet name of the handle.
     * @param {string} [agentName] - The pet name of the agent.
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
     * @param {Name} [petName]
     * @param {{ introducedNames?: Record<Name, PetName>, agentName?: PetName }} [opts]
     * @returns {Promise<{id: FormulaIdentifier, value: Promise<EndoHost>}>}
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
            getDeferredTasksForAgent(petName, agentName),
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
     * @param {Name} [handleName]
     * @param {{ introducedNames?: Record<Name, PetName>, agentName?: PetName }} [opts]
     * @returns {Promise<{id: FormulaIdentifier, value: Promise<EndoGuest>}>}
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
            getDeferredTasksForAgent(handleName, agentName),
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
     * @param {string} guestName
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
     * @param {string} guestName
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

    /** @type {EndoHost} */
    const host = {
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
