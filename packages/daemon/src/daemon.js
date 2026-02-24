// @ts-check
/* global setTimeout, clearTimeout */

import { makeExo } from '@endo/exo';
import { E, Far } from '@endo/far';
import { makeMarshal } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { makeError, q, X } from '@endo/errors';
import { makeRefReader } from './ref-reader.js';
import { makeDirectoryMaker } from './directory.js';
import { makeDeferredTasks } from './deferred-tasks.js';
import { assertMailboxStoreName, makeMailboxMaker } from './mail.js';
import { makeGuestMaker } from './guest.js';
import { makeHostMaker } from './host.js';
import { makeRemoteControlProvider } from './remote-control.js';
import {
  assertName,
  assertNamePath,
  assertNames,
  assertPetName,
  namePathFrom,
} from './pet-name.js';
import { formatLocator, idFromLocator } from './locator.js';
import { makeContextMaker } from './context.js';
import {
  assertValidId,
  assertValidNumber,
  assertFormulaNumber,
  assertNodeNumber,
  parseId,
  formatId,
} from './formula-identifier.js';
import { makeFormulaGraph } from './graph.js';
import { makeResidenceTracker } from './residence.js';
import { makeSerialJobs } from './serial-jobs.js';
import { makeWeakMultimap } from './multimap.js';
import { makeLoopbackNetwork } from './networks/loopback.js';
import { assertValidFormulaType } from './formula-type.js';
import {
  blobHelp,
  directoryHelp,
  endoHelp,
  guestHelp,
  makeHelp,
} from './help-text.js';

// Sorted:
import {
  DaemonFacetForWorkerInterface,
  GuestInterface,
  InspectorHubInterface,
  InspectorInterface,
  InvitationInterface,
  ResponderInterface,
  WorkerInterface,
  DirectoryInterface,
  BlobInterface,
  EndoInterface,
} from './interfaces.js';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef, FarRef } from '@endo/eventual-send' */
/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { Builtins, CapTpConnectionRegistrar, Context, Controller, DaemonCore, DaemonCoreExternal, DaemonicPowers, DeferredTasks, DirectoryFormula, EndoBootstrap, EndoDirectory, EndoFormula, EndoGateway, EndoGreeter, EndoGuest, EndoHost, EndoInspector, EndoNetwork, EndoPeer, EndoReadable, EndoWorker, EvalFormula, FarContext, Formula, FormulaIdentifier, FormulaNumber, FormulaMakerTable, FormulateResult, GuestFormula, HandleFormula, HostFormula, Invitation, InvitationDeferredTaskParams, InvitationFormula, KnownEndoInspectors, KnownPeersStore, LookupFormula, LoopbackNetworkFormula, MailboxStoreFormula, MailHubFormula, MakeBundleFormula, MakeCapletDeferredTaskParams, MakeUnconfinedFormula, MarshalDeferredTaskParams, MessageFormula, Name, NameHub, NamePath, NameOrPath, NodeNumber, PetName, PeerFormula, PeerInfo, PetInspectorFormula, PetStore, PetStoreFormula, PromiseFormula, Provide, ReadableBlobFormula, ResolverFormula, Sha512, Specials, MarshalFormula, WeakMultimap, WorkerDaemonFacet, WorkerFormula } from './types.js' */

/**
 * @param {number} ms
 * @param {Promise<never>} cancelled
 */
const delay = async (ms, cancelled) => {
  // Do not attempt to set up a timer if already cancelled.
  await Promise.race([cancelled, undefined]);
  return new Promise((resolve, reject) => {
    const handle = setTimeout(resolve, ms);
    cancelled.catch(error => {
      reject(error);
      clearTimeout(handle);
    });
  });
};

/**
 * Creates an inspector object for a formula.
 *
 * @param {string} type - The formula type.
 * @param {string} number - The formula number.
 * @param {Record<string, unknown>} record - A mapping from special names to formula values.
 * @returns {EndoInspector} The inspector for the given formula.
 */
const makeInspector = (type, number, record) =>
  makeExo(`Inspector (${type} ${number})`, InspectorInterface, {
    lookup: async petNameOrPath => {
      /** @type {string} */
      let petName;
      if (Array.isArray(petNameOrPath)) {
        if (petNameOrPath.length !== 1) {
          throw Error('Inspector.lookup(path) requires path length of 1');
        }
        petName = petNameOrPath[0];
      } else {
        petName = petNameOrPath;
      }
      assertName(petName);
      if (!Object.hasOwn(record, petName)) {
        return undefined;
      }
      return record[petName];
    },
    list: () => Object.keys(record),
  });

/**
 * @param {Context} context - The context to make far.
 * @returns {FarContext} The far context.
 */
const makeFarContext = context =>
  Far('Context', {
    id: () => context.id,
    cancel: context.cancel,
    whenCancelled: () => context.cancelled,
    whenDisposed: () => context.disposed,
    addDisposalHook: context.onCancel,
  });

/**
 *
 * @param {string} path
 * @param {string} rootNonce
 * @param {Sha512} digester
 * @returns {string}
 */
const deriveId = (path, rootNonce, digester) => {
  digester.updateText(rootNonce);
  digester.updateText(path);
  return digester.digestHex();
};

const messageNumberNamePattern = /^(0|[1-9][0-9]*)$/;
const MESSAGE_FROM_NAME = 'FROM';
const MESSAGE_TO_NAME = 'TO';
const MESSAGE_DATE_NAME = 'DATE';
const MESSAGE_TYPE_NAME = 'TYPE';
const MESSAGE_ID_NAME = 'MESSAGE';
const MESSAGE_REPLY_TO_NAME = 'REPLY';
const MESSAGE_DESCRIPTION_NAME = 'DESCRIPTION';
const MESSAGE_STRINGS_NAME = 'STRINGS';
const MESSAGE_PROMISE_NAME = 'PROMISE';
const MESSAGE_RESOLVER_NAME = 'RESOLVER';

/**
 * @param {string} name
 */
const isMessageNumberName = name => messageNumberNamePattern.test(name);

/**
 * @param {string} left
 * @param {string} right
 */
const compareMessageNames = (left, right) => {
  if (left === right) {
    return 0;
  }
  return BigInt(left) < BigInt(right) ? -1 : 1;
};

/** @type {PetName} */
const PROMISE_STATUS_NAME = /** @type {PetName} */ ('status');
// Stores the resolved formula identifier as a direct pet store entry so the
// formula graph keeps the resolved value reachable (prevents premature
// collection before the consumer names it).
const RESOLVED_VALUE_NAME = /** @type {PetName} */ ('value');

/**
 * Note: "pending" is intentionally omitted; pending is represented by the
 * absence of a status entry in the promise's pet store.
 * @typedef {(
 *   | { status: 'fulfilled'; valueId: string }
 *   | { status: 'rejected'; reason: string }
 * )} PromiseStatusRecord
 */

/**
 * @param {DaemonicPowers} powers
 * @param {string} rootEntropy
 * @param {object} args
 * @param {(error: Error) => void} args.cancel
 * @param {number} args.gracePeriodMs
 * @param {Specials} args.specials
 * @param {Promise<never>} args.gracePeriodElapsed
 */
const makeDaemonCore = async (
  powers,
  rootEntropy,
  { cancel, gracePeriodMs, gracePeriodElapsed, specials },
) => {
  const {
    crypto: cryptoPowers,
    petStore: petStorePowers,
    persistence: persistencePowers,
    control: controlPowers,
  } = powers;
  const { randomHex512 } = cryptoPowers;
  const contentStore = persistencePowers.makeContentSha512Store();
  /** @type {WeakMap<object, ERef<WorkerDaemonFacet>>} */
  const workerDaemonFacets = new WeakMap();
  /** @type {Map<string, (reason?: Error) => Promise<void>>} */
  const workerTerminationByNumber = new Map();
  /**
   * Mutations of the formula graph must be serialized through this queue.
   * "Mutations" include:
   * - Formulation
   * - Removal
   * - Provision
   * - Cancellation
   */
  const formulaGraphJobs = makeSerialJobs();
  let formulaGraphLockDepth = 0;
  /**
   * @param {() => Promise<any>} [asyncFn]
   * @returns {Promise<any>}
   */
  const withFormulaGraphLock = async (asyncFn = async () => undefined) => {
    await null;
    if (formulaGraphLockDepth > 0) {
      // Already holding the lock; avoid deadlock.
      return asyncFn();
    }
    formulaGraphLockDepth += 1;
    try {
      return await formulaGraphJobs.enqueue(asyncFn);
    } finally {
      formulaGraphLockDepth -= 1;
    }
  };
  // This is the id of the node that is hosting the values.
  // This will likely get replaced with a public key in the future.
  const localNodeNumber = /** @type {NodeNumber} */ (
    deriveId('node', rootEntropy, cryptoPowers.makeSha512())
  );
  console.log('Node', localNodeNumber);
  const endoFormulaId = formatId({
    number: /** @type {FormulaNumber} */ (rootEntropy),
    node: localNodeNumber,
  });

  // We generate formulas for some entities that are presumed to exist
  // because they are parts of the daemon's root object.

  /**
   * @param {string} derivation
   * @param {Formula} formula
   */
  const preformulate = async (derivation, formula) => {
    const formulaNumber = /** @type {FormulaNumber} */ (
      deriveId(derivation, rootEntropy, cryptoPowers.makeSha512())
    );
    const id = formatId({
      number: formulaNumber,
      node: localNodeNumber,
    });
    await persistencePowers.writeFormula(formulaNumber, formula);
    return { id, formulaNumber };
  };

  const { id: knownPeersId } = await preformulate('peers', {
    type: 'known-peers-store',
  });
  const { id: leastAuthorityId } = await preformulate('least-authority', {
    type: 'least-authority',
  });
  const { id: mainWorkerId } = await preformulate('main', { type: 'worker' });

  /** @type {Builtins} */
  const builtins = {
    NONE: leastAuthorityId,
    MAIN: mainWorkerId,
    ENDO: endoFormulaId,
  };

  // Prepare platform formulas
  const platformNames = Object.fromEntries(
    await Promise.all(
      Object.entries(specials).map(async ([specialName, makeFormula]) => {
        const formula = makeFormula(builtins);
        const { id } = await preformulate(specialName, formula);
        return [specialName, id];
      }),
    ),
  );

  // The following are the root state tables for the daemon.

  /**
   * The two functions "formulate" and "provide" share a responsibility for
   * maintaining the memoization tables "controllerForId", "formulaForId", and
   * "idForRef".
   * "formulate" is used for creating and persisting new formulas, whereas
   * "provide" is used for "reincarnating" the values of stored formulas.
   */

  /**
   * Forward look-up, for answering "what is the value of this id".
   * @type {Map<FormulaIdentifier, Controller>}
   */
  const controllerForId = new Map();

  /**
   * Forward look-up, for answering "what is the formula for this id".
   * @type {Map<FormulaIdentifier, Formula>}
   */
  const formulaForId = new Map();

  /**
   * @param {Formula} formula
   * @returns {FormulaIdentifier[]}
   */
  const extractDeps = formula => {
    switch (formula.type) {
      case 'endo':
        return [
          formula.networks,
          formula.pins,
          formula.peers,
          formula.host,
          formula.leastAuthority,
        ];
      case 'host':
        return [
          formula.handle,
          formula.worker,
          formula.inspector,
          formula.petStore,
          formula.mailboxStore,
          formula.mailHub,
          formula.endo,
          formula.networks,
          formula.pins,
        ];
      case 'guest':
        return [
          formula.handle,
          formula.hostHandle,
          formula.hostAgent,
          formula.petStore,
          formula.mailboxStore,
          formula.mailHub,
          formula.worker,
        ];
      case 'marshal':
        return formula.slots ?? [];
      case 'eval':
        return [formula.worker, ...(formula.values ?? [])];
      case 'lookup':
        return [formula.hub];
      case 'make-unconfined':
        return [formula.worker, formula.powers];
      case 'make-bundle':
        return [formula.worker, formula.powers, formula.bundle];
      case 'peer':
        return [formula.networks];
      case 'handle':
        return [formula.agent];
      case 'mail-hub':
        return [formula.store];
      case 'message':
        return [
          formula.from,
          formula.to,
          ...(formula.ids ?? []),
          ...(formula.promiseId ? [formula.promiseId] : []),
          ...(formula.resolverId ? [formula.resolverId] : []),
        ];
      case 'promise':
      case 'resolver':
        return [formula.store];
      case 'pet-inspector':
        return [formula.petStore];
      case 'directory':
        return [formula.petStore];
      case 'invitation':
        return [formula.hostAgent, formula.hostHandle];
      default:
        return [];
    }
  };

  const isLocalId = id => parseId(id).node === localNodeNumber;

  const formulaGraph = makeFormulaGraph({ extractDeps, isLocalId });

  formulaGraph.addRoot(knownPeersId);
  formulaGraph.addRoot(leastAuthorityId);
  formulaGraph.addRoot(mainWorkerId);
  formulaGraph.addRoot(endoFormulaId);
  for (const id of Object.values(platformNames)) {
    formulaGraph.addRoot(/** @type {FormulaIdentifier} */ (id));
  }

  // Transient roots protect formulas from collection for the duration of
  // a command. Without this, a formula created by a command could be
  // collected before the command has a chance to assign it a pet name
  // (which would give it a durable reference). Transient roots are
  // pinned at the start of a command and unpinned in its finally block.
  /** @type {Set<FormulaIdentifier>} */
  const transientRoots = new Set();
  let transientRootsDirty = false;

  /**
   * Temporarily adds a formula to the root set, protecting it from
   * collection until unpinned.
   *
   * @param {FormulaIdentifier} id
   */
  const pinTransient = id => {
    transientRoots.add(id);
    transientRootsDirty = true;
  };

  /**
   * Removes a formula from the transient root set, allowing it to be
   * collected if no other references remain.
   *
   * @param {FormulaIdentifier} id
   */
  const unpinTransient = id => {
    if (transientRoots.delete(id)) {
      transientRootsDirty = true;
    }
  };

  /** @type {WeakMap<object, FormulaIdentifier>} */
  const agentIdForHandle = new WeakMap();

  // The following are functions that manage that state.

  /** @param {FormulaIdentifier} id */
  const getFormulaForId = async id => {
    // No synchronous preamble.
    await null;

    let formula = formulaForId.get(id);
    if (formula !== undefined) {
      return formula;
    }

    formula = await persistencePowers.readFormula(parseId(id).number);
    await withFormulaGraphLock(async () => {
      formulaForId.set(id, formula);
      formulaGraph.onFormulaAdded(id, formula);
    });
    return formula;
  };

  /** @param {FormulaIdentifier} id */
  const getTypeForId = async id => {
    if (parseId(id).node !== localNodeNumber) {
      return 'remote';
    }
    const { type } = await getFormulaForId(id);
    return type;
  };

  /**
   * Reverse look-up, for answering "what is my name for this near or far
   * reference", and not for "what is my name for this promise".
   * @type {WeakMultimap<Record<string | symbol, unknown>, FormulaIdentifier>}
   */
  const idForRef = makeWeakMultimap();

  /** @type {Map<FormulaIdentifier, object>} */
  const refForId = new Map();

  /** @type {WeakMultimap<Record<string | symbol, unknown>, FormulaIdentifier>['get']} */
  const getIdForRef = ref => idForRef.get(ref);

  /** @param {unknown} value */
  const getLocalIdForRef = value => {
    if (
      (typeof value !== 'object' || value === null) &&
      typeof value !== 'function'
    ) {
      return undefined;
    }
    const id = /** @type {FormulaIdentifier | undefined} */ (
      getIdForRef(/** @type {any} */ (value))
    );
    return id !== undefined && isLocalId(id) ? id : undefined;
  };

  const residenceTracker = makeResidenceTracker({
    getLocalIdForRef,
    getFormula: id => formulaForId.get(id),
    terminateWorker: (workerId, reason) => {
      const terminate = workerTerminationByNumber.get(workerId);
      if (terminate) {
        terminate(reason).catch(() => {});
      }
    },
  });

  const capTpConnectionRegistrar = residenceTracker.register;

  /** @type {Provide} */
  const provide = (id, _expectedType) =>
    /** @type {any} */ (
      // Behold, unavoidable forward-reference:
      // eslint-disable-next-line no-use-before-define
      provideController(id).value
    );

  const enableFormulaCollection = true;

  /** @param {FormulaIdentifier} id */
  const dropLiveValue = id => {
    controllerForId.delete(id);
    const ref = refForId.get(id);
    if (ref !== undefined) {
      refForId.delete(id);
      idForRef.delete(ref, id);
    }
  };

  const seedFormulaGraphFromPersistence = async () => {
    const formulaNumbers = await persistencePowers.listFormulas();
    const entries = await Promise.all(
      formulaNumbers.map(async formulaNumber => {
        const formula = await persistencePowers.readFormula(formulaNumber);
        const id = formatId({
          number: formulaNumber,
          node: localNodeNumber,
        });
        return { id, formula };
      }),
    );
    await withFormulaGraphLock(async () => {
      for (const { id, formula } of entries) {
        if (!formulaForId.has(id)) {
          formulaForId.set(id, formula);
        }
        formulaGraph.onFormulaAdded(id, formula);
      }
    });

    const petStoreTypes = new Map([
      ['pet-store', assertPetName],
      ['mailbox-store', assertMailboxStoreName],
      ['known-peers-store', assertValidNumber],
    ]);

    await Promise.all(
      entries.map(async ({ id, formula }) => {
        const assertValidName = petStoreTypes.get(formula.type);
        if (assertValidName === undefined) {
          return;
        }
        const { number: formulaNumber } = parseId(id);
        const petStore = await petStorePowers.makeIdentifiedPetStore(
          formulaNumber,
          /** @type {'pet-store' | 'mailbox-store' | 'known-peers-store'} */ (
            formula.type
          ),
          assertValidName,
        );
        const storedIds = petStore
          .list()
          .map(petName => petStore.identifyLocal(petName))
          .filter(storedId => storedId !== undefined);
        if (storedIds.length === 0) {
          return;
        }
        await withFormulaGraphLock(async () => {
          for (const storedId of storedIds) {
            formulaGraph.onPetStoreWrite(
              /** @type {FormulaIdentifier} */ (id),
              /** @type {FormulaIdentifier} */ (storedId),
            );
          }
        });
      }),
    );
  };

  const collectIfDirty = async () => {
    if (!enableFormulaCollection) {
      return;
    }
    // collectIfDirty is never called re-entrantly (only from
    // withCollection finally blocks), so we bypass withFormulaGraphLock
    // and use the raw mutex to avoid false re-entrancy bypasses from
    // the global depth counter.
    await null;
    await formulaGraphJobs.enqueue(async () => {
      if (!formulaGraph.isDirty() && !transientRootsDirty) {
        return;
      }

      const localIds = new Set(formulaForId.keys());
      /** @type {Map<FormulaIdentifier, Set<FormulaIdentifier>>} */
      const groupMembers = new Map();
      for (const id of localIds) {
        const group = formulaGraph.findGroup(id);
        const set = groupMembers.get(group) || new Set();
        set.add(id);
        groupMembers.set(group, set);
      }

      /** @type {Map<FormulaIdentifier, Set<FormulaIdentifier>>} */
      const groupDeps = new Map();
      const addGroupEdge = (fromGroup, toGroup) => {
        if (fromGroup === toGroup) {
          return;
        }
        const set = groupDeps.get(fromGroup) || new Set();
        set.add(toGroup);
        groupDeps.set(fromGroup, set);
      };

      for (const [id, deps] of formulaGraph.formulaDeps.entries()) {
        if (localIds.has(id)) {
          const fromGroup = formulaGraph.findGroup(id);
          for (const dep of deps) {
            if (localIds.has(dep)) {
              addGroupEdge(fromGroup, formulaGraph.findGroup(dep));
            }
          }
        }
      }

      for (const [storeId, ids] of formulaGraph.petStoreEdges.entries()) {
        if (localIds.has(storeId)) {
          const fromGroup = formulaGraph.findGroup(storeId);
          for (const id of ids) {
            if (localIds.has(id)) {
              addGroupEdge(fromGroup, formulaGraph.findGroup(id));
            }
          }
        }
      }

      /** @type {Map<FormulaIdentifier, number>} */
      const refCount = new Map();
      for (const group of groupMembers.keys()) {
        refCount.set(group, 0);
      }
      for (const deps of groupDeps.values()) {
        for (const dep of deps) {
          refCount.set(dep, (refCount.get(dep) || 0) + 1);
        }
      }

      /** @type {Set<FormulaIdentifier>} */
      const rootGroups = new Set();
      for (const rootId of formulaGraph.roots) {
        if (localIds.has(rootId)) {
          rootGroups.add(formulaGraph.findGroup(rootId));
        }
      }
      for (const rootId of transientRoots) {
        if (localIds.has(rootId)) {
          rootGroups.add(formulaGraph.findGroup(rootId));
        }
      }

      /** @type {FormulaIdentifier[]} */
      const queue = [];
      for (const [group, count] of refCount.entries()) {
        if (count === 0 && !rootGroups.has(group)) {
          queue.push(group);
        }
      }

      /** @type {Set<FormulaIdentifier>} */
      const collectedGroups = new Set();
      while (queue.length > 0) {
        const group = queue.shift();
        if (group !== undefined && !collectedGroups.has(group)) {
          collectedGroups.add(group);
          for (const dep of groupDeps.get(group) || []) {
            const nextCount = (refCount.get(dep) || 0) - 1;
            refCount.set(dep, nextCount);
            if (nextCount === 0 && !rootGroups.has(dep)) {
              queue.push(dep);
            }
          }
        }
      }

      if (collectedGroups.size === 0) {
        formulaGraph.clearDirty();
        transientRootsDirty = false;
        return;
      }

      /** @type {FormulaIdentifier[]} */
      const collectedIds = [];
      for (const group of collectedGroups) {
        const members = groupMembers.get(group);
        if (members !== undefined) {
          for (const id of members) {
            collectedIds.push(id);
          }
        }
      }

      /** @type {Map<FormulaIdentifier, Formula>} */
      const collectedFormulas = new Map();
      for (const id of collectedIds) {
        const formula = formulaForId.get(id);
        if (formula !== undefined) {
          collectedFormulas.set(id, formula);
        }
      }

      const cancelReason = new Error('Collected formula');
      await Promise.allSettled(
        collectedIds.map(async id => {
          await null;
          const controller = controllerForId.get(id);
          if (controller) {
            await controller.context.cancel(cancelReason, '!');
          }
        }),
      );

      for (const id of collectedIds) {
        dropLiveValue(id);
      }

      residenceTracker.disconnectRetainersHolding(collectedIds);

      for (const id of collectedIds) {
        const formula = collectedFormulas.get(id);
        if (formula !== undefined) {
          formulaForId.delete(id);
          formulaGraph.onFormulaRemoved(id);
          if (
            formula.type === 'pet-store' ||
            formula.type === 'mailbox-store' ||
            formula.type === 'known-peers-store'
          ) {
            formulaGraph.onPetStoreRemoveAll(id);
          }
        }
      }

      await Promise.allSettled(
        collectedIds.map(async id => {
          await null;
          await persistencePowers.deleteFormula(parseId(id).number);
        }),
      );

      await Promise.allSettled(
        Array.from(collectedFormulas.entries()).map(async ([id, formula]) => {
          await null;
          if (
            formula.type === 'pet-store' ||
            formula.type === 'mailbox-store' ||
            formula.type === 'known-peers-store'
          ) {
            await petStorePowers.deletePetStore(
              parseId(id).number,
              formula.type,
            );
          }
        }),
      );

      formulaGraph.clearDirty();
      transientRootsDirty = false;
    });

    try {
      const endoBootstrap = await provide(endoFormulaId, 'endo');
      await E(endoBootstrap).revivePins();
    } catch {
      // Ignore pin revival failures during collection.
    }
  };

  /**
   * @param {FormulaIdentifier} petStoreId
   * @param {PetStore} petStore
   */
  const wrapPetStore = (petStoreId, petStore) => {
    /**
     * @param {FormulaIdentifier} id
     */
    const removeEdgeIfUnreferenced = async id => {
      await null;
      const names = petStore.reverseIdentify(id);
      if (names.length === 0) {
        await withFormulaGraphLock(async () => {
          formulaGraph.onPetStoreRemove(petStoreId, id);
        });
      }
    };

    return harden({
      ...petStore,
      write: async (petName, id) => {
        const previousId = petStore.identifyLocal(petName);
        await petStore.write(petName, id);
        await withFormulaGraphLock(async () => {
          formulaGraph.onPetStoreWrite(petStoreId, id);
        });
        if (previousId && previousId !== id) {
          await removeEdgeIfUnreferenced(
            /** @type {FormulaIdentifier} */ (previousId),
          );
        }
      },
      remove: async petName => {
        const previousId = petStore.identifyLocal(petName);
        await petStore.remove(petName);
        if (previousId) {
          await removeEdgeIfUnreferenced(
            /** @type {FormulaIdentifier} */ (previousId),
          );
        }
      },
      rename: async (fromPetName, toPetName) => {
        const fromId = petStore.identifyLocal(fromPetName);
        const overwrittenId = petStore.identifyLocal(toPetName);
        await petStore.rename(fromPetName, toPetName);
        if (fromId) {
          await withFormulaGraphLock(async () => {
            formulaGraph.onPetStoreWrite(
              petStoreId,
              /** @type {FormulaIdentifier} */ (fromId),
            );
          });
        }
        if (overwrittenId && overwrittenId !== fromId) {
          await removeEdgeIfUnreferenced(
            /** @type {FormulaIdentifier} */ (overwrittenId),
          );
        }
      },
    });
  };

  // The following concern connections to other daemons.

  const provideRemoteControl = makeRemoteControlProvider(localNodeNumber);

  /**
   * @param {NodeNumber} remoteNodeNumber
   * @param {(error: Error) => void} cancelPeer
   * @param {Promise<never>} peerCancelled
   */
  const providePeer = async (remoteNodeNumber, cancelPeer, peerCancelled) => {
    const remoteControl = provideRemoteControl(remoteNodeNumber);
    return remoteControl.connect(
      async () => {
        // eslint-disable-next-line no-use-before-define
        const peerId = await getPeerIdForNodeIdentifier(remoteNodeNumber);
        return provide(peerId, 'peer');
      },
      cancelPeer,
      peerCancelled,
    );
  };

  // Gateway is equivalent to E's "nonce locator".
  // It provides a value for a formula identifier to a remote client.
  const localGateway = Far('Gateway', {
    /** @param {string} requestedId */
    provide: async requestedId => {
      assertValidId(requestedId);
      const { node } = parseId(requestedId);
      if (node !== localNodeNumber) {
        throw new Error(
          `Gateway can only provide local values. Got request for node ${q(
            node,
          )}`,
        );
      }
      return provide(requestedId);
    },
  });

  /** @type {EndoGreeter} */
  const localGreeter = Far('Greeter', {
    /**
     * @param {string} remoteNodeId
     * @param {Promise<EndoGateway>} remoteGateway
     * @param {ERef<(error: Error) => void>} cancelConnection
     * @param {Promise<never>} connectionCancelled
     */
    hello: async (
      remoteNodeId,
      remoteGateway,
      cancelConnection,
      connectionCancelled,
    ) => {
      assertNodeNumber(remoteNodeId);
      const remoteControl = provideRemoteControl(remoteNodeId);
      /** @param {Error} error */
      const wrappedCancel = error => E(cancelConnection)(error);
      remoteControl.accept(remoteGateway, wrappedCancel, connectionCancelled);
      return localGateway;
    },
  });

  /**
   * @param {string} workerId512
   */
  const makeDaemonFacetForWorker = async workerId512 => {
    return makeExo(
      `Endo facet for worker ${workerId512}`,
      DaemonFacetForWorkerInterface,
      {},
    );
  };

  /**
   * @param {string} workerId512
   * @param {Context} context
   * @param {string[]} [trustedShims]
   */
  const makeIdentifiedWorker = async (
    workerId512,
    context,
    trustedShims = undefined,
  ) => {
    const daemonWorkerFacet = makeDaemonFacetForWorker(workerId512);

    const { promise: forceCancelled, reject: forceCancel } =
      /** @type {PromiseKit<never>} */ (makePromiseKit());

    const { workerTerminated, workerDaemonFacet } =
      await controlPowers.makeWorker(
        workerId512,
        daemonWorkerFacet,
        Promise.race([forceCancelled, gracePeriodElapsed]),
        capTpConnectionRegistrar,
        trustedShims,
      );

    const terminateWorker = async (_reason = undefined) => {
      E.sendOnly(workerDaemonFacet).terminate();
      await Promise.race([
        workerTerminated,
        delay(gracePeriodMs, gracePeriodElapsed).catch(() => {}),
      ]).catch(() => {});
    };

    workerTerminationByNumber.set(workerId512, terminateWorker);
    workerTerminated.finally(() => {
      workerTerminationByNumber.delete(workerId512);
    });

    const gracefulCancel = async () => {
      E.sendOnly(workerDaemonFacet).terminate();
      const cancelWorkerGracePeriod = () => {
        throw new Error('Exited gracefully before grace period elapsed');
      };
      const workerGracePeriodCancelled = Promise.race([
        gracePeriodElapsed,
        workerTerminated,
      ]).then(cancelWorkerGracePeriod, cancelWorkerGracePeriod);
      await delay(gracePeriodMs, workerGracePeriodCancelled)
        .then(() => {
          throw new Error(
            `Worker termination grace period ${gracePeriodMs}ms elapsed`,
          );
        })
        .catch(forceCancel);
      await workerTerminated;
    };

    context.onCancel(gracefulCancel);

    const worker = makeExo('EndoWorker', WorkerInterface, {});

    workerDaemonFacets.set(worker, workerDaemonFacet);

    return worker;
  };

  /**
   * @param {string} sha512
   */
  const makeReadableBlob = sha512 => {
    const { text, json, streamBase64 } = contentStore.fetch(sha512);
    const help = makeHelp(blobHelp);
    /** @type {FarRef<EndoReadable>} */
    return makeExo(
      `Readable file with SHA-512 ${sha512.slice(0, 8)}...`,
      BlobInterface,
      {
        help,
        sha512: () => sha512,
        streamBase64,
        text,
        json,
      },
    );
  };

  /**
   * @param {FormulaIdentifier} workerId
   * @param {string} source
   * @param {Array<string>} codeNames
   * @param {Array<FormulaIdentifier>} ids
   * @param {Context} context
   */
  const makeEval = async (workerId, source, codeNames, ids, context) => {
    context.thisDiesIfThatDies(workerId);
    for (const id of ids) {
      context.thisDiesIfThatDies(id);
    }

    const worker = await provide(workerId, 'worker');
    const workerDaemonFacet = workerDaemonFacets.get(worker);
    assert(workerDaemonFacet, `Cannot evaluate using non-worker`);

    const endowmentValues = await Promise.all(ids.map(id => provide(id)));

    return E(workerDaemonFacet).evaluate(
      source,
      codeNames,
      endowmentValues,
      context.id,
      context.cancelled,
    );

    // TODO check whether the promise resolves to data that can be marshalled
    // into the content-address-store and truncate the dependency chain.
    // That will require some funny business around allowing eval formulas to
    // have a level of indirection where the settled formula depends on how
    // the indirect formula resolves.
    // That might mean racing two formulas and terminating the evaluator
    // if it turns out the value can be captured.
  };

  /**
   * Creates a controller for a `lookup` formula.
   *
   * @param {FormulaIdentifier} hubId
   * @param {NamePath} path
   * @param {Context} context
   */
  const makeLookup = async (hubId, path, context) => {
    context.thisDiesIfThatDies(hubId);

    const hub = provide(hubId, 'hub');
    return E(hub).lookup(path);
  };

  /**
   * @param {FormulaIdentifier} workerId
   * @param {FormulaIdentifier} powersId
   * @param {string} specifier
   * @param {Record<string, string>} env
   * @param {Context} context
   */
  const makeUnconfined = async (
    workerId,
    powersId,
    specifier,
    env,
    context,
  ) => {
    context.thisDiesIfThatDies(workerId);
    context.thisDiesIfThatDies(powersId);

    const worker = await provide(workerId, 'worker');
    const workerDaemonFacet = workerDaemonFacets.get(worker);
    assert(workerDaemonFacet, 'Cannot make unconfined plugin with non-worker');
    const powersP = provide(powersId);
    return E(workerDaemonFacet).makeUnconfined(
      specifier,
      // TODO fix type
      /** @type {any} */ (powersP),
      /** @type {any} */ (makeFarContext(context)),
      env,
    );
  };

  /**
   * @param {string} workerId
   * @param {string} powersId
   * @param {string} bundleId
   * @param {Record<string, string>} [env]
   * @param {Context} context
   */
  const makeBundle = async (workerId, powersId, bundleId, env, context) => {
    context.thisDiesIfThatDies(workerId);
    context.thisDiesIfThatDies(powersId);

    const worker = await provide(workerId, 'worker');
    const workerDaemonFacet = workerDaemonFacets.get(worker);
    assert(workerDaemonFacet, 'Cannot make caplet with non-worker');
    const readableBundleP = provide(bundleId, 'readable-blob');
    const powersP = provide(powersId);
    return E(workerDaemonFacet).makeBundle(
      readableBundleP,
      // TODO fix type
      /** @type {any} */ (powersP),
      /** @type {any} */ (makeFarContext(context)),
      env,
    );
  };

  /** @param {object} ref */
  const mustGetIdForRef = ref => {
    const id = idForRef.get(ref);
    if (id === undefined) {
      throw makeError(X`No corresponding formula for ${ref}`);
    }
    return id;
  };

  /** @param {FormulaIdentifier} id */
  const mustGetRefForId = id => {
    const ref = refForId.get(id);
    if (ref === undefined) {
      if (formulaForId.get(id) !== undefined) {
        throw makeError(X`Formula has not produced a ref ${id}`);
      }
      throw makeError(X`Unknown identifier ${id}`);
    }
    return ref;
  };

  const marshaller = makeMarshal(mustGetIdForRef, mustGetRefForId, {
    serializeBodyFormat: 'smallcaps',
  });

  /**
   * @param {unknown} record
   * @returns {PromiseStatusRecord}
   */
  const parsePromiseStatusRecord = record => {
    if (record && typeof record === 'object') {
      const data = /** @type {any} */ (record);
      if (data.status === 'fulfilled' && typeof data.valueId === 'string') {
        return { status: 'fulfilled', valueId: data.valueId };
      }
      if (data.status === 'rejected' && typeof data.reason === 'string') {
        return { status: 'rejected', reason: data.reason };
      }
    }
    throw new Error(`Invalid promise status record ${q(record)}`);
  };

  /**
   * @param {unknown} reason
   */
  const formatRejectionReason = reason => {
    if (reason instanceof Error) {
      return reason.message;
    }
    return typeof reason === 'string' ? reason : String(reason);
  };

  /**
   * @param {FormulaIdentifier} storeId
   * @param {Context} context
   */
  const makePromise = async (storeId, context) => {
    context.thisDiesIfThatDies(storeId);
    const petStore = await provide(storeId, 'pet-store');
    const { promise, resolve, reject } = makePromiseKit();
    let settled = false;

    /** @param {PromiseStatusRecord} record */
    const settle = record => {
      if (settled) {
        return;
      }
      settled = true;
      if (record.status === 'fulfilled') {
        resolve(record.valueId);
      } else {
        reject(harden(new Error(record.reason)));
      }
    };

    /** @param {string} statusId */
    const settleFromStatusId = async statusId => {
      await null;
      const recordValue = await provide(
        /** @type {FormulaIdentifier} */ (statusId),
      );
      const record = parsePromiseStatusRecord(recordValue);
      settle(record);
    };

    const existingStatusId = petStore.identifyLocal(PROMISE_STATUS_NAME);
    if (existingStatusId !== undefined) {
      settleFromStatusId(existingStatusId).catch(error => {
        if (!settled) {
          reject(error);
        }
      });
      return promise;
    }

    const iterator = petStore.followNameChanges();
    const closeIterator = async () => {
      await null;
      if (typeof iterator.return === 'function') {
        await iterator.return(undefined);
      }
    };

    context.onCancel(() => closeIterator());

    (async () => {
      await null;
      try {
        for await (const change of iterator) {
          if ('add' in change && change.add === PROMISE_STATUS_NAME) {
            const statusId = petStore.identifyLocal(PROMISE_STATUS_NAME);
            if (statusId !== undefined) {
              await settleFromStatusId(statusId);
              break;
            }
          }
        }
      } catch (error) {
        if (!settled) {
          reject(error);
        }
      } finally {
        await closeIterator();
      }
    })().catch(error => {
      if (!settled) {
        reject(error);
      }
    });

    return promise;
  };

  /**
   * @param {FormulaIdentifier} storeId
   * @param {Context} context
   */
  const makeResolver = async (storeId, context) => {
    context.thisDiesIfThatDies(storeId);
    const petStore = await provide(storeId, 'pet-store');
    const resolverJobs = makeSerialJobs();

    /** @param {PromiseStatusRecord} record */
    const writeStatus = async record => {
      if (petStore.identifyLocal(PROMISE_STATUS_NAME) !== undefined) {
        return;
      }
      /** @type {DeferredTasks<MarshalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      const hardenedRecord = harden(record);
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      const { id } = await formulateMarshalValue(
        hardenedRecord,
        tasks,
        pinTransient,
      );
      try {
        await petStore.write(PROMISE_STATUS_NAME, id);
      } finally {
        unpinTransient(id);
      }
    };

    return makeExo('EndoResolver', ResponderInterface, {
      resolveWithId: idOrPromise =>
        resolverJobs.enqueue(async () => {
          await null;
          if (petStore.identifyLocal(PROMISE_STATUS_NAME) !== undefined) {
            return;
          }
          try {
            const id = await idOrPromise;
            if (typeof id !== 'string') {
              throw new TypeError(
                `Promise resolution must be a formula identifier (${q(id)})`,
              );
            }
            assertValidId(id);
            // Write the resolved formula ID as a direct pet store entry so
            // the formula graph keeps the resolved value reachable.
            // This must happen before writeStatus because writeStatus
            // triggers the promise to resolve, and collection may run
            // before the consumer has a chance to name the result.
            await petStore.write(RESOLVED_VALUE_NAME, id);
            await writeStatus({ status: 'fulfilled', valueId: id });
          } catch (error) {
            const reason = formatRejectionReason(error);
            await writeStatus({ status: 'rejected', reason });
          }
        }),
    });
  };

  /**
   * @param {FormulaIdentifier} storeId
   * @param {Context} context
   */
  const makeMailHub = async (storeId, context) => {
    context.thisDiesIfThatDies(storeId);
    const mailboxStore = await provide(storeId, 'mailbox-store');

    const listMessageNames = () =>
      harden(
        mailboxStore
          .list()
          .filter(isMessageNumberName)
          .sort(compareMessageNames),
      );

    /**
     * @param {string} name
     */
    const identifyMessage = name =>
      isMessageNumberName(name)
        ? mailboxStore.identifyLocal(/** @type {Name} */ (name))
        : undefined;

    /** @type {NameHub} */
    let mailHub;

    /**
     * @param {string | string[]} petNameOrPath
     */
    const lookup = petNameOrPath => {
      const namePath = namePathFrom(petNameOrPath);
      const [headName, ...tailNames] = namePath;
      if (tailNames.length === 0) {
        const id = identifyMessage(headName);
        if (id === undefined) {
          throw new TypeError(`Unknown message number: ${q(headName)}`);
        }
        return provide(/** @type {FormulaIdentifier} */ (id), 'message');
      }
      return tailNames.reduce(
        (directory, petName) => E(directory).lookup(petName),
        lookup(headName),
      );
    };

    /**
     * @param {string[]} petNamePath
     * @returns {Promise<{ hub: NameHub, name: Name }>}
     */
    const lookupTailNameHub = async petNamePath => {
      assertNamePath(petNamePath);
      const tailName = petNamePath[petNamePath.length - 1];
      if (petNamePath.length === 1) {
        return { hub: mailHub, name: tailName };
      }
      const prefixPath = /** @type {NamePath} */ (petNamePath.slice(0, -1));
      const hub = /** @type {NameHub} */ (await lookup(prefixPath));
      return { hub, name: tailName };
    };

    const has = async (...petNamePath) => {
      assertNames(petNamePath);
      if (petNamePath.length === 1) {
        return identifyMessage(petNamePath[0]) !== undefined;
      }
      const { hub, name } = await lookupTailNameHub(
        /** @type {NamePath} */ (petNamePath),
      );
      return E(hub).has(name);
    };

    const identify = async (...petNamePath) => {
      assertNames(petNamePath);
      if (petNamePath.length === 1) {
        return identifyMessage(petNamePath[0]);
      }
      const { hub, name } = await lookupTailNameHub(
        /** @type {NamePath} */ (petNamePath),
      );
      return E(hub).identify(name);
    };

    const locate = async (...petNamePath) => {
      assertNames(petNamePath);
      const id = await identify(...petNamePath);
      if (id === undefined) {
        return undefined;
      }
      const formulaType = await getTypeForId(
        /** @type {FormulaIdentifier} */ (id),
      );
      return formatLocator(id, formulaType);
    };

    const reverseLocate = async locator => {
      const id = idFromLocator(locator);
      return /** @type {Name[]} */ (
        mailboxStore.reverseIdentify(id).filter(isMessageNumberName)
      );
    };

    const followLocatorNameChanges = async function* followLocatorNameChanges(
      locator,
    ) {
      const id = idFromLocator(locator);
      const names = mailboxStore
        .reverseIdentify(id)
        .filter(isMessageNumberName);
      if (names.length === 0) {
        return undefined;
      }
      yield { add: locator, names };
      return undefined;
    };

    const list = async (...petNamePath) => {
      assertNames(petNamePath);
      if (petNamePath.length === 0) {
        return listMessageNames();
      }
      const hub = /** @type {NameHub} */ (await lookup(petNamePath));
      return E(hub).list();
    };

    const listIdentifiers = async (...petNamePath) => {
      assertNames(petNamePath);
      const names = await list(...petNamePath);
      const identities = new Set();
      await Promise.all(
        names.map(async name => {
          const id = await identify(...petNamePath, name);
          if (id !== undefined) {
            identities.add(id);
          }
        }),
      );
      return harden(Array.from(identities).sort());
    };

    const followNameChanges = async function* followNameChanges(
      ...petNamePath
    ) {
      await null;
      assertNames(petNamePath);
      if (petNamePath.length === 0) {
        for await (const change of mailboxStore.followNameChanges()) {
          if ('add' in change) {
            if (isMessageNumberName(change.add)) {
              yield change;
            }
          } else if (isMessageNumberName(change.remove)) {
            yield change;
          }
        }
        return undefined;
      }
      const hub = /** @type {NameHub} */ (await lookup(petNamePath));
      yield* await E(hub).followNameChanges();
      return undefined;
    };

    const reverseLookup = presence => {
      const id = getIdForRef(presence);
      if (id === undefined) {
        return harden([]);
      }
      return harden(
        /** @type {Name[]} */ (
          mailboxStore.reverseIdentify(id).filter(isMessageNumberName)
        ),
      );
    };

    const disallowedMutation = async () => {
      throw new Error('not allowed');
    };

    mailHub = makeExo('MailHub', DirectoryInterface, {
      help: makeHelp(directoryHelp),
      has,
      identify,
      locate,
      reverseLocate,
      followLocatorNameChanges,
      list,
      listIdentifiers,
      followNameChanges,
      lookup,
      reverseLookup,
      write: disallowedMutation,
      remove: disallowedMutation,
      move: disallowedMutation,
      copy: disallowedMutation,
      makeDirectory: disallowedMutation,
    });

    return mailHub;
  };

  /**
   * @param {MessageFormula} messageFormula
   * @param {Context} context
   */
  const makeMessageHub = async (messageFormula, context) => {
    const {
      messageType,
      messageId,
      replyTo,
      from,
      to,
      date,
      description,
      promiseId,
      resolverId,
      strings,
      names,
      ids,
    } = messageFormula;

    if (
      typeof messageId !== 'string' ||
      typeof from !== 'string' ||
      typeof to !== 'string' ||
      typeof date !== 'string'
    ) {
      throw new Error('Message formula is incomplete');
    }
    assertFormulaNumber(messageId);
    if (replyTo !== undefined) {
      assertFormulaNumber(replyTo);
    }

    /** @type {Map<string, FormulaIdentifier>} */
    const idByName = new Map();
    /** @type {Map<string, unknown>} */
    const valueByName = new Map();
    /** @type {string[]} */
    const orderedNames = [];

    /**
     * @param {string} name
     * @param {FormulaIdentifier | undefined} id
     * @param {unknown} value
     */
    const registerName = (name, id, value) => {
      if (idByName.has(name) || valueByName.has(name)) {
        throw new Error(`Duplicate message name ${q(name)}`);
      }
      if (id !== undefined) {
        idByName.set(name, id);
        context.thisDiesIfThatDies(id);
      }
      if (value !== undefined) {
        valueByName.set(name, value);
      }
      orderedNames.push(name);
    };

    registerName(MESSAGE_FROM_NAME, from, undefined);
    registerName(MESSAGE_TO_NAME, to, undefined);
    registerName(MESSAGE_DATE_NAME, undefined, date);
    registerName(MESSAGE_TYPE_NAME, undefined, messageType);
    registerName(MESSAGE_ID_NAME, undefined, messageId);
    if (replyTo !== undefined) {
      registerName(MESSAGE_REPLY_TO_NAME, undefined, replyTo);
    }

    if (messageType === 'request') {
      if (
        typeof description !== 'string' ||
        promiseId === undefined ||
        resolverId === undefined
      ) {
        throw new Error('Request message formula is incomplete');
      }
      registerName(MESSAGE_DESCRIPTION_NAME, undefined, description);
      registerName(MESSAGE_PROMISE_NAME, promiseId, undefined);
      registerName(MESSAGE_RESOLVER_NAME, resolverId, undefined);
    } else if (messageType === 'package') {
      if (
        !Array.isArray(strings) ||
        !Array.isArray(names) ||
        !Array.isArray(ids)
      ) {
        throw new Error('Package message formula is incomplete');
      }
      if (names.length !== ids.length) {
        throw new Error(
          `Message must have one formula identifier (${q(
            ids.length,
          )}) for every edge name (${q(names.length)})`,
        );
      }
      registerName(MESSAGE_STRINGS_NAME, undefined, harden(strings));
      names.forEach((name, index) => {
        registerName(name, ids[index], undefined);
      });
    } else {
      throw new Error(`Unknown message type ${q(messageType)}`);
    }

    /**
     * @param {string | string[]} petNameOrPath
     */
    const lookup = petNameOrPath => {
      const namePath = namePathFrom(petNameOrPath);
      const [headName, ...tailNames] = namePath;
      if (tailNames.length === 0) {
        if (idByName.has(headName)) {
          const id = /** @type {FormulaIdentifier} */ (idByName.get(headName));
          if (headName === MESSAGE_FROM_NAME || headName === MESSAGE_TO_NAME) {
            return provide(id, 'handle');
          }
          if (headName === MESSAGE_PROMISE_NAME) {
            return provide(id, 'promise');
          }
          if (headName === MESSAGE_RESOLVER_NAME) {
            return provide(id, 'resolver');
          }
          return provide(id);
        }
        if (valueByName.has(headName)) {
          return valueByName.get(headName);
        }
        throw new TypeError(`Unknown message name: ${q(headName)}`);
      }
      return tailNames.reduce(
        (directory, petName) => E(directory).lookup(petName),
        lookup(headName),
      );
    };

    /**
     * @param {string[]} petNamePath
     * @returns {Promise<{ hub: NameHub, name: Name }>}
     */
    /** @type {NameHub} */
    let messageHub;

    const lookupTailNameHub = async petNamePath => {
      assertNamePath(petNamePath);
      const tailName = petNamePath[petNamePath.length - 1];
      if (petNamePath.length === 1) {
        return { hub: messageHub, name: tailName };
      }
      const prefixPath = /** @type {NamePath} */ (petNamePath.slice(0, -1));
      const hub = /** @type {NameHub} */ (await lookup(prefixPath));
      return { hub, name: tailName };
    };

    const has = async (...petNamePath) => {
      assertNames(petNamePath);
      if (petNamePath.length === 1) {
        return idByName.has(petNamePath[0]) || valueByName.has(petNamePath[0]);
      }
      const { hub, name } = await lookupTailNameHub(
        /** @type {NamePath} */ (petNamePath),
      );
      return E(hub).has(name);
    };

    const identify = async (...petNamePath) => {
      assertNames(petNamePath);
      if (petNamePath.length === 1) {
        return idByName.get(petNamePath[0]);
      }
      const { hub, name } = await lookupTailNameHub(
        /** @type {NamePath} */ (petNamePath),
      );
      return E(hub).identify(name);
    };

    const locate = async (...petNamePath) => {
      assertNames(petNamePath);
      const id = await identify(...petNamePath);
      if (id === undefined) {
        return undefined;
      }
      const formulaType = await getTypeForId(
        /** @type {FormulaIdentifier} */ (id),
      );
      return formatLocator(id, formulaType);
    };

    const reverseLocate = async locator => {
      const id = idFromLocator(locator);
      return harden(
        /** @type {Name[]} */ (
          orderedNames.filter(name => idByName.get(name) === id)
        ),
      );
    };

    const followLocatorNameChanges = async function* followLocatorNameChanges(
      locator,
    ) {
      const id = idFromLocator(locator);
      const locatorNames = orderedNames.filter(
        name => idByName.get(name) === id,
      );
      if (locatorNames.length === 0) {
        return undefined;
      }
      yield { add: locator, names: /** @type {Name[]} */ (locatorNames) };
      return undefined;
    };

    const list = async (...petNamePath) => {
      assertNames(petNamePath);
      if (petNamePath.length === 0) {
        return harden(/** @type {Name[]} */ ([...orderedNames]));
      }
      const hub = /** @type {NameHub} */ (await lookup(petNamePath));
      return E(hub).list();
    };

    const listIdentifiers = async (...petNamePath) => {
      assertNames(petNamePath);
      const listedNames = await list(...petNamePath);
      const identities = new Set();
      await Promise.all(
        listedNames.map(async name => {
          const id = await identify(...petNamePath, name);
          if (id !== undefined) {
            identities.add(id);
          }
        }),
      );
      return harden(Array.from(identities).sort());
    };

    const followNameChanges = async function* followNameChanges(
      ...petNamePath
    ) {
      assertNames(petNamePath);
      if (petNamePath.length === 0) {
        for (const name of orderedNames) {
          const id = idByName.get(name);
          if (id !== undefined) {
            yield { add: /** @type {Name} */ (name), value: parseId(id) };
          }
        }
        return undefined;
      }
      const hub = /** @type {NameHub} */ (await lookup(petNamePath));
      yield* await E(hub).followNameChanges();
      return undefined;
    };

    const reverseLookup = presence => {
      const id = getIdForRef(presence);
      if (id === undefined) {
        return harden([]);
      }
      return harden(
        /** @type {Name[]} */ (
          orderedNames.filter(name => idByName.get(name) === id)
        ),
      );
    };

    const disallowedMutation = async () => {
      throw new Error('not allowed');
    };

    messageHub = makeExo('MessageHub', DirectoryInterface, {
      help: makeHelp(directoryHelp),
      has,
      identify,
      locate,
      reverseLocate,
      followLocatorNameChanges,
      list,
      listIdentifiers,
      followNameChanges,
      lookup,
      reverseLookup,
      write: disallowedMutation,
      remove: disallowedMutation,
      move: disallowedMutation,
      copy: disallowedMutation,
      makeDirectory: disallowedMutation,
    });

    return messageHub;
  };

  /** @type {FormulaMakerTable} */
  const makers = {
    marshal: async ({ body, slots }) => {
      await Promise.all(slots.map(id => provide(id)));
      return marshaller.fromCapData({ body, slots });
    },
    eval: ({ worker, source, names, values }, context) =>
      makeEval(worker, source, names, values, context),
    'readable-blob': ({ content }) => makeReadableBlob(content),
    lookup: ({ hub, path }, context) =>
      makeLookup(
        hub,
        /** @type {import('./types.js').NamePath} */ (path),
        context,
      ),
    worker: (formula, context, _id, formulaNumber) =>
      makeIdentifiedWorker(formulaNumber, context, formula.trustedShims),
    'make-unconfined': (
      { worker: workerId, powers: powersId, specifier, env = {} },
      context,
    ) => makeUnconfined(workerId, powersId, specifier, env, context),
    'make-bundle': (
      { worker: workerId, powers: powersId, bundle: bundleId, env = {} },
      context,
    ) => makeBundle(workerId, powersId, bundleId, env, context),
    host: async (formula, context, id) => {
      const {
        hostHandle: hostHandleId,
        handle: handleId,
        petStore: petStoreId,
        mailboxStore: mailboxStoreId,
        mailHub: mailHubId,
        inspector: inspectorId,
        worker: workerId,
        endo: endoId,
        networks: networksId,
        pins: pinsId,
      } = formula;

      if (mailHubId === undefined) {
        throw new Error('Host formula missing mail hub');
      }
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      const agent = await makeHost(
        id,
        handleId,
        hostHandleId,
        petStoreId,
        mailboxStoreId,
        mailHubId,
        inspectorId,
        workerId,
        endoId,
        networksId,
        pinsId,
        leastAuthorityId,
        platformNames,
        context,
      );
      const handle = /** @type {any} */ (agent).handle();
      agentIdForHandle.set(handle, id);
      return agent;
    },
    guest: async (formula, context, id) => {
      const {
        handle: handleId,
        hostAgent: hostAgentId,
        hostHandle: hostHandleId,
        petStore: petStoreId,
        mailboxStore: mailboxStoreId,
        mailHub: mailHubId,
        worker: workerId,
      } = formula;

      if (mailHubId === undefined) {
        throw new Error('Guest formula missing mail hub');
      }
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      const agent = await makeGuest(
        id,
        handleId,
        hostAgentId,
        hostHandleId,
        petStoreId,
        mailboxStoreId,
        mailHubId,
        workerId,
        context,
      );
      const handle = /** @type {any} */ (agent).handle();
      agentIdForHandle.set(handle, id);
      return agent;
    },
    handle: async ({ agent: agentId }) => {
      const agent = await provide(agentId, 'agent');
      const handle = agent.handle();
      agentIdForHandle.set(handle, agentId);
      return handle;
    },
    endo: async ({
      host: hostId,
      networks: networksId,
      pins: pinsId,
      peers: peersId,
    }) => {
      const help = makeHelp(endoHelp);
      /** @type {FarRef<EndoBootstrap>} */
      const endoBootstrap = makeExo('Endo', EndoInterface, {
        help,
        ping: async () => 'pong',
        terminate: async () => {
          cancel(new Error('Termination requested'));
        },
        host: () => provide(hostId, 'host'),
        leastAuthority: () => provide(leastAuthorityId, 'guest'),
        greeter: async () => localGreeter,
        gateway: async () => localGateway,
        nodeId: () => localNodeNumber,
        reviveNetworks: async () => {
          const networksDirectory = await provide(networksId, 'directory');
          const networkIds = await networksDirectory.listIdentifiers();
          await Promise.allSettled(
            networkIds.map(id =>
              provide(/** @type {FormulaIdentifier} */ (id)),
            ),
          );
        },
        revivePins: async () => {
          const pinsDirectory = await provide(pinsId, 'directory');
          const pinIds = await pinsDirectory.listIdentifiers();
          await Promise.allSettled(
            pinIds.map(id => provide(/** @type {FormulaIdentifier} */ (id))),
          );
        },
        addPeerInfo: async peerInfo => {
          const knownPeers = /** @type {KnownPeersStore} */ (
            /** @type {unknown} */ (await provide(peersId, 'pet-store'))
          );
          const { node: nodeNumber, addresses } = peerInfo;
          assertNodeNumber(nodeNumber);
          if (knownPeers.has(nodeNumber)) {
            const existingPeerId = knownPeers.identifyLocal(nodeNumber);
            if (existingPeerId !== undefined) {
              const existingFormula = await getFormulaForId(existingPeerId);
              if (
                existingFormula.type === 'peer' &&
                JSON.stringify(existingFormula.addresses) !==
                  JSON.stringify(addresses)
              ) {
                console.log(
                  `addPeerInfo: replacing stale peer for node ${nodeNumber.slice(0, 16)}... (old: ${existingFormula.addresses.length} addr, new: ${addresses.length} addr)`,
                );
                // eslint-disable-next-line no-use-before-define
                await cancelValue(
                  existingPeerId,
                  new Error('Peer addresses updated'),
                );
                await knownPeers.remove(nodeNumber);
                const { id: peerId } =
                  // eslint-disable-next-line no-use-before-define
                  await formulatePeer(networksId, nodeNumber, addresses);
                await knownPeers.write(nodeNumber, peerId);
                return;
              }
            }
            return;
          }
          console.log(
            `addPeerInfo: new peer for node ${nodeNumber.slice(0, 16)}... with ${addresses.length} address(es)`,
          );
          const { id: peerId } =
            // eslint-disable-next-line no-use-before-define
            await formulatePeer(networksId, nodeNumber, addresses);
          await knownPeers.write(nodeNumber, peerId);
        },
      });
      return endoBootstrap;
    },
    'loopback-network': () =>
      makeLoopbackNetwork(Promise.resolve(localGateway)),
    'least-authority': () => {
      const disallowedFn = async () => {
        throw new Error('not allowed');
      };
      const disallowedSyncFn = () => {
        throw new Error('not allowed');
      };
      return /** @type {FarRef<EndoGuest>} */ (
        /** @type {unknown} */ (
          makeExo('EndoGuest', GuestInterface, {
            help: makeHelp(guestHelp),
            has: disallowedFn,
            identify: disallowedFn,
            reverseIdentify: disallowedSyncFn,
            locate: disallowedFn,
            reverseLocate: disallowedFn,
            followLocatorNameChanges: disallowedFn,
            list: disallowedFn,
            listIdentifiers: disallowedFn,
            followNameChanges: disallowedFn,
            lookup: disallowedFn,
            lookupById: disallowedFn,
            reverseLookup: disallowedFn,
            write: disallowedFn,
            remove: disallowedFn,
            move: disallowedFn,
            copy: disallowedFn,
            makeDirectory: disallowedFn,
            handle: disallowedSyncFn,
            listMessages: disallowedFn,
            followMessages: disallowedFn,
            resolve: disallowedFn,
            reject: disallowedFn,
            adopt: disallowedFn,
            dismiss: disallowedFn,
            dismissAll: disallowedFn,
            reply: disallowedFn,
            request: disallowedFn,
            send: disallowedFn,
            requestEvaluation: disallowedFn,
            evaluate: disallowedFn,
            define: disallowedFn,
            form: disallowedFn,
            storeValue: disallowedFn,
            deliver: disallowedSyncFn,
          })
        )
      );
    },
    'pet-store': async (_formula, _context, id, formulaNumber) => {
      await null;
      return wrapPetStore(
        id,
        await petStorePowers.makeIdentifiedPetStore(
          formulaNumber,
          'pet-store',
          assertPetName,
        ),
      );
    },
    'mailbox-store': async (_formula, _context, id, formulaNumber) => {
      await null;
      return wrapPetStore(
        id,
        await petStorePowers.makeIdentifiedPetStore(
          formulaNumber,
          'mailbox-store',
          assertMailboxStoreName,
        ),
      );
    },
    'mail-hub': ({ store: storeId }, context) => makeMailHub(storeId, context),
    message: (formula, context) => makeMessageHub(formula, context),
    promise: ({ store: storeId }, context) => makePromise(storeId, context),
    resolver: ({ store: storeId }, context) => makeResolver(storeId, context),
    'known-peers-store': async (_formula, _context, id, formulaNumber) => {
      await null;
      return wrapPetStore(
        id,
        await petStorePowers.makeIdentifiedPetStore(
          formulaNumber,
          'known-peers-store',
          // The known peers store is just a pet store that only accepts node identifiers
          // (i.e. formula numbers) as "names".
          assertValidNumber,
        ),
      );
    },
    'pet-inspector': ({ petStore: petStoreId }) =>
      // Behold, unavoidable forward-reference:
      // eslint-disable-next-line no-use-before-define
      makePetStoreInspector(petStoreId),
    directory: ({ petStore: petStoreId }, context) =>
      // Behold, forward-reference:
      // eslint-disable-next-line no-use-before-define
      makeIdentifiedDirectory({
        petStoreId,
        context,
      }),
    peer: (
      { networks: networksId, node: nodeId, addresses: addressesId },
      context,
    ) =>
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      makePeer(networksId, nodeId, addressesId, context),
    invitation: (
      { hostAgent: hostAgentId, hostHandle: hostHandleId, guestName },
      _context,
      id,
    ) =>
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      makeInvitation(
        id,
        hostAgentId,
        hostHandleId,
        /** @type {import('./types.js').PetName} */ (guestName),
      ),
  };

  /**
   * @param {FormulaIdentifier} id
   * @param {FormulaNumber} formulaNumber
   * @param {Formula} formula
   * @param {Context} context
   */
  const evaluateFormula = async (id, formulaNumber, formula, context) => {
    await null;
    if (Object.hasOwn(makers, formula.type)) {
      const make = makers[formula.type];
      const value = await /** @type {unknown} */ (
        // @ts-expect-error TypeScript is trying too hard to infer the unknown.
        make(formula, context, id, formulaNumber)
      );
      if (typeof value === 'object' && value !== null) {
        // @ts-expect-error TypeScript seems to believe the value might be a string here.
        idForRef.add(value, id);
        refForId.set(id, value);
      }
      return value;
    } else {
      throw new TypeError(`Invalid formula: ${q(formula)}`);
    }
  };

  /**
   * @param {FormulaIdentifier} id
   * @param {Context} context
   */
  const evaluateFormulaForId = async (id, context) => {
    const { number: formulaNumber, node: formulaNode } = parseId(id);
    const isRemote = formulaNode !== localNodeNumber;
    if (isRemote) {
      const peer = providePeer(formulaNode, context.cancel, context.cancelled);
      return E(peer).provide(id);
    }

    const formula = await getFormulaForId(id);
    console.log(`Reincarnating ${formula.type} ${id}`);
    assertValidFormulaType(formula.type);

    return evaluateFormula(id, formulaNumber, formula, context);
  };

  /** @type {DaemonCore['formulate']} */
  const formulate = async (formulaNumber, formula) => {
    const id = formatId({
      number: formulaNumber,
      node: localNodeNumber,
    });

    await withFormulaGraphLock(async () => {
      formulaForId.has(id) && assert.Fail`Formula already exists for id ${id}`;
      formulaForId.set(id, formula);
      formulaGraph.onFormulaAdded(id, formula);
    });

    // Memoize for lookup.
    console.log(`Making ${formula.type} ${id}`);
    const { promise, resolve } = /** @type {PromiseKit<unknown>} */ (
      makePromiseKit()
    );

    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const context = makeContext(id);
    promise.catch(context.cancel);
    const controller = harden({
      context,
      value: promise,
    });
    controllerForId.set(id, controller);

    // Ensure that failure to flush the formula to storage
    // causes a rejection for both the controller and the value.
    const written = persistencePowers.writeFormula(formulaNumber, formula);
    // The controller _must_ be constructed in the synchronous prelude of this function.
    const valuePromise = evaluateFormula(id, formulaNumber, formula, context);
    resolve(written.then(() => valuePromise));
    await written;

    return harden({
      id,
      value: controller.value,
    });
  };

  /** @type {DaemonCore['provideController']} */
  const provideController = id => {
    const existingController = controllerForId.get(id);
    if (existingController !== undefined) {
      return existingController;
    }

    const { promise, resolve } = /** @type {PromiseKit<unknown>} */ (
      makePromiseKit()
    );

    // Behold, recursion:
    // eslint-disable-next-line no-use-before-define
    const context = makeContext(id);
    promise.catch(context.cancel);
    const newController = harden({
      context,
      value: promise,
    });
    controllerForId.set(id, newController);

    // The controller must be in place before we evaluate the formula.
    resolve(evaluateFormulaForId(id, context));

    return newController;
  };

  /**
   * @param {NodeNumber} nodeNumber
   * @returns {Promise<FormulaIdentifier>}
   */
  const getPeerIdForNodeIdentifier = async nodeNumber => {
    if (nodeNumber === localNodeNumber) {
      throw new Error(`Cannot get peer formula identifier for self`);
    }
    const knownPeers = /** @type {KnownPeersStore} */ (
      /** @type {unknown} */ (await provide(knownPeersId, 'pet-store'))
    );
    // The knownPeers pet store uses node numbers as keys, not pet names.
    // This is a deliberate aberration of the pet store abstraction.
    const peerId = knownPeers.identifyLocal(nodeNumber);
    if (peerId === undefined) {
      throw new Error(`No peer found for node identifier ${q(nodeNumber)}.`);
    }
    parseId(peerId);
    return peerId;
  };

  /** @type {DaemonCore['cancelValue']} */
  const cancelValue = async (id, reason) => {
    // Wait for any in-flight graph operation (formulation, collection)
    // to finish before cancelling.
    await formulaGraphJobs.enqueue();
    const controller = provideController(id);
    console.log('Cancelled:');
    return controller.context.cancel(reason);
  };

  /** @type {DaemonCore['formulateReadableBlob']} */
  const formulateReadableBlob = async (readerRef, deferredTasks) => {
    return /** @type {FormulateResult<FarRef<EndoReadable>>} */ (
      withFormulaGraphLock(async () => {
        await null;
        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex512()
        );
        const contentSha512 = await contentStore.store(
          makeRefReader(readerRef),
        );

        await deferredTasks.execute({
          readableBlobId: formatId({
            number: formulaNumber,
            node: localNodeNumber,
          }),
        });

        /** @type {ReadableBlobFormula} */
        const formula = {
          type: 'readable-blob',
          content: contentSha512,
        };

        return formulate(formulaNumber, formula);
      })
    );
  };

  /**
   * @param {FormulaIdentifier} hostAgentId
   * @param {FormulaIdentifier} hostHandleId
   * @param {PetName} guestName
   * @param {DeferredTasks<InvitationDeferredTaskParams>} deferredTasks
   */
  const formulateInvitation = async (
    hostAgentId,
    hostHandleId,
    guestName,
    deferredTasks,
  ) => {
    return /** @type {FormulateResult<Invitation>} */ (
      withFormulaGraphLock(async () => {
        const invitationNumber = /** @type {FormulaNumber} */ (
          await randomHex512()
        );
        const invitationId = formatId({
          number: invitationNumber,
          node: localNodeNumber,
        });
        await deferredTasks.execute({
          invitationId,
        });

        /** @type {InvitationFormula} */
        const formula = {
          type: 'invitation',
          hostAgent: hostAgentId,
          hostHandle: hostHandleId,
          guestName,
        };

        return formulate(invitationNumber, formula);
      })
    );
  };

  /**
   * Unlike other formulate functions, formulateNumberedHandle *only* writes a
   * formula to the formula graph and does not attempt to incarnate it.
   * This is to break an incarnation cycle between agents and their handles.
   * The agent must be incarnated first, contains its own handle object, and
   * produces a agentIdForHandle entry as a side-effect.
   * Explicitly incarnating the handle formula later simply looks up the handle
   * reference on the already-incarnated agent.
   *
   * @param {FormulaNumber} formulaNumber - The formula number of the handle to formulate.
   * @param {FormulaIdentifier} agentId - The formula identifier of the handle's agent.
   * @returns {Promise<FormulaIdentifier>}
   */
  const formulateNumberedHandle = async (formulaNumber, agentId) => {
    /** @type {HandleFormula} */
    const formula = {
      type: 'handle',
      agent: agentId,
    };
    await persistencePowers.writeFormula(formulaNumber, formula);
    const id = formatId({
      number: formulaNumber,
      node: localNodeNumber,
    });
    await withFormulaGraphLock(async () => {
      formulaForId.set(id, formula);
      formulaGraph.onFormulaAdded(id, formula);
    });
    return id;
  };

  /**
   * Formulates a `pet-store` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {FormulaNumber} formulaNumber - The formula number of the pet store to formulate.
   * @returns {FormulateResult<PetStore>} The formulated pet store.
   */
  const formulateNumberedPetStore = async formulaNumber => {
    /** @type {PetStoreFormula} */
    const formula = {
      type: 'pet-store',
    };
    return /** @type {FormulateResult<PetStore>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * Formulates a `mailbox-store` formula and synchronously adds it to the
   * formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {FormulaNumber} formulaNumber - The formula number of the mailbox store.
   * @returns {FormulateResult<PetStore>} The formulated mailbox store.
   */
  const formulateNumberedMailboxStore = async formulaNumber => {
    /** @type {MailboxStoreFormula} */
    const formula = {
      type: 'mailbox-store',
    };
    return /** @type {FormulateResult<PetStore>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * Formulates a `mail-hub` formula and synchronously adds it to the
   * formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {FormulaNumber} formulaNumber - The mail hub formula number.
   * @param {FormulaIdentifier} mailboxStoreId
   * @returns {FormulateResult<NameHub>} The formulated mail hub.
   */
  const formulateNumberedMailHub = async (formulaNumber, mailboxStoreId) => {
    /** @type {MailHubFormula} */
    const formula = {
      type: 'mail-hub',
      store: mailboxStoreId,
    };
    return /** @type {FormulateResult<NameHub>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * @type {DaemonCore['formulateDirectory']}
   */
  const formulateDirectory = async () => {
    const { id: petStoreId } = await formulateNumberedPetStore(
      /** @type {FormulaNumber} */ (await randomHex512()),
    );
    const formulaNumber = /** @type {FormulaNumber} */ (await randomHex512());
    /** @type {DirectoryFormula} */
    const formula = {
      type: 'directory',
      petStore: petStoreId,
    };
    return /** @type {FormulateResult<EndoDirectory>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * Formulates a `worker` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {FormulaNumber} formulaNumber - The worker formula number.
   * @param {string[]} [trustedShims] - Module specifiers imported before lockdown.
   * @returns {ReturnType<DaemonCore['formulateWorker']>}
   */
  const formulateNumberedWorker = (formulaNumber, trustedShims = undefined) => {
    /** @type {WorkerFormula} */
    const formula = {
      type: 'worker',
      ...(trustedShims && trustedShims.length > 0
        ? { trustedShims }
        : undefined),
    };

    return /** @type {FormulateResult<EndoWorker>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * @type {DaemonCore['formulateWorker']}
   */
  const formulateWorker = async (deferredTasks, trustedShims = undefined) => {
    return withFormulaGraphLock(async () => {
      const formulaNumber = /** @type {FormulaNumber} */ (await randomHex512());

      await deferredTasks.execute({
        workerId: formatId({
          number: formulaNumber,
          node: localNodeNumber,
        }),
      });

      return formulateNumberedWorker(formulaNumber, trustedShims);
    });
  };

  /**
   * @type {DaemonCore['formulateHostDependencies']}
   */
  const formulateHostDependencies = async specifiedIdentifiers => {
    const { specifiedWorkerId, ...remainingSpecifiedIdentifiers } =
      specifiedIdentifiers;

    await null;
    const storeId = (
      await formulateNumberedPetStore(
        /** @type {FormulaNumber} */ (await randomHex512()),
      )
    ).id;
    const mailboxStoreId = (
      await formulateNumberedMailboxStore(
        /** @type {FormulaNumber} */ (await randomHex512()),
      )
    ).id;
    const mailHubId = (
      await formulateNumberedMailHub(
        /** @type {FormulaNumber} */ (await randomHex512()),
        mailboxStoreId,
      )
    ).id;

    const hostFormulaNumber = /** @type {FormulaNumber} */ (
      await randomHex512()
    );
    const hostId = formatId({
      number: hostFormulaNumber,
      node: localNodeNumber,
    });

    const handleId = await formulateNumberedHandle(
      /** @type {FormulaNumber} */ (await randomHex512()),
      hostId,
    );

    return harden({
      ...remainingSpecifiedIdentifiers,
      hostFormulaNumber,
      hostId,
      handleId,
      hostHandleId: remainingSpecifiedIdentifiers.hostHandleId ?? handleId,
      storeId,
      mailboxStoreId,
      mailHubId,
      /* eslint-disable no-use-before-define */
      inspectorId: (
        await formulateNumberedPetInspector(
          /** @type {FormulaNumber} */ (await randomHex512()),
          storeId,
        )
      ).id,
      workerId: await provideWorkerId(specifiedWorkerId),
      /* eslint-enable no-use-before-define */
    });
  };

  /** @type {DaemonCore['formulateNumberedHost']} */
  const formulateNumberedHost = identifiers => {
    /** @type {HostFormula} */
    const formula = {
      type: 'host',
      hostHandle: identifiers.hostHandleId,
      handle: identifiers.handleId,
      petStore: identifiers.storeId,
      mailboxStore: identifiers.mailboxStoreId,
      mailHub: identifiers.mailHubId,
      inspector: identifiers.inspectorId,
      worker: identifiers.workerId,
      endo: identifiers.endoId,
      networks: identifiers.networksDirectoryId,
      pins: identifiers.pinsDirectoryId,
    };

    return /** @type {FormulateResult<EndoHost>} */ (
      formulate(identifiers.hostFormulaNumber, formula)
    );
  };

  /** @type {DaemonCore['formulateHost']} */
  const formulateHost = async (
    endoId,
    networksDirectoryId,
    pinsDirectoryId,
    deferredTasks,
    specifiedWorkerId,
    hostHandleId,
  ) => {
    return withFormulaGraphLock(async () => {
      const identifiers = await formulateHostDependencies({
        endoId,
        networksDirectoryId,
        pinsDirectoryId,
        specifiedWorkerId,
        hostHandleId,
      });

      await deferredTasks.execute({
        agentId: identifiers.hostId,
        handleId: identifiers.handleId,
      });

      return formulateNumberedHost(identifiers);
    });
  };

  /** @type {DaemonCore['formulateGuestDependencies']} */
  const formulateGuestDependencies = async (hostAgentId, hostHandleId) => {
    const guestFormulaNumber = /** @type {FormulaNumber} */ (
      await randomHex512()
    );
    const guestId = formatId({
      number: guestFormulaNumber,
      node: localNodeNumber,
    });
    const handleId = await formulateNumberedHandle(
      /** @type {FormulaNumber} */ (await randomHex512()),
      guestId,
    );
    const mailboxStoreId = (
      await formulateNumberedMailboxStore(
        /** @type {FormulaNumber} */ (await randomHex512()),
      )
    ).id;
    const mailHubId = (
      await formulateNumberedMailHub(
        /** @type {FormulaNumber} */ (await randomHex512()),
        mailboxStoreId,
      )
    ).id;
    return harden({
      guestFormulaNumber,
      guestId,
      handleId,
      hostAgentId,
      hostHandleId,
      storeId: (
        await formulateNumberedPetStore(
          /** @type {FormulaNumber} */ (await randomHex512()),
        )
      ).id,
      mailboxStoreId,
      mailHubId,
      workerId: (
        await formulateNumberedWorker(
          /** @type {FormulaNumber} */ (await randomHex512()),
        )
      ).id,
    });
  };

  /** @type {DaemonCore['formulateNumberedGuest']} */
  const formulateNumberedGuest = identifiers => {
    /** @type {GuestFormula} */
    const formula = {
      type: 'guest',
      handle: identifiers.handleId,
      hostHandle: identifiers.hostHandleId,
      hostAgent: identifiers.hostAgentId,
      petStore: identifiers.storeId,
      mailboxStore: identifiers.mailboxStoreId,
      mailHub: identifiers.mailHubId,
      worker: identifiers.workerId,
    };

    return /** @type {FormulateResult<EndoGuest>} */ (
      formulate(identifiers.guestFormulaNumber, formula)
    );
  };

  /** @type {DaemonCore['formulateGuest']} */
  const formulateGuest = async (hostAgentId, hostHandleId, deferredTasks) => {
    return withFormulaGraphLock(async () => {
      const identifiers = await formulateGuestDependencies(
        hostAgentId,
        hostHandleId,
      );

      await deferredTasks.execute({
        agentId: identifiers.guestId,
        handleId: identifiers.handleId,
      });

      return formulateNumberedGuest(identifiers);
    });
  };

  /**
   * @param {FormulaIdentifier} [specifiedWorkerId]
   * @param {string[]} [trustedShims]
   */
  const provideWorkerId = async (
    specifiedWorkerId,
    trustedShims = undefined,
  ) => {
    await null;
    if (typeof specifiedWorkerId === 'string') {
      return specifiedWorkerId;
    }

    const workerFormulaNumber = /** @type {FormulaNumber} */ (
      await randomHex512()
    );
    const workerFormulation = await formulateNumberedWorker(
      workerFormulaNumber,
      trustedShims,
    );
    return workerFormulation.id;
  };

  /** @type {DaemonCore['formulateMarshalValue']} */
  async function formulateMarshalValue(value, deferredTasks, pin) {
    return /** @type {FormulateResult<void>} */ (
      withFormulaGraphLock(async () => {
        const ownFormulaNumber = /** @type {FormulaNumber} */ (
          await randomHex512()
        );
        const ownId = formatId({
          number: ownFormulaNumber,
          node: localNodeNumber,
        });
        // Pin before formulate so the formula is protected from
        // collection even if the lock is bypassed via re-entrancy.
        if (pin) {
          pin(ownId);
        }

        const identifiers = harden({
          marshalId: ownId,
          marshalFormulaNumber: ownFormulaNumber,
        });

        await deferredTasks.execute(identifiers);

        const { body, slots } = marshaller.toCapData(value);

        /** @type {MarshalFormula} */
        const formula = {
          type: 'marshal',
          body,
          slots,
        };
        return formulate(ownFormulaNumber, formula);
      })
    );
  }

  /** @type {DaemonCore['formulatePromise']} */
  const formulatePromise = async pin => {
    return withFormulaGraphLock(async () => {
      const storeFormulaNumber = /** @type {FormulaNumber} */ (
        await randomHex512()
      );
      const promiseFormulaNumber = /** @type {FormulaNumber} */ (
        await randomHex512()
      );
      const resolverFormulaNumber = /** @type {FormulaNumber} */ (
        await randomHex512()
      );

      const { id: storeId } =
        await formulateNumberedPetStore(storeFormulaNumber);

      /** @type {PromiseFormula} */
      const promiseFormula = {
        type: 'promise',
        store: storeId,
      };

      /** @type {ResolverFormula} */
      const resolverFormula = {
        type: 'resolver',
        store: storeId,
      };

      const { id: promiseId } = await formulate(
        promiseFormulaNumber,
        promiseFormula,
      );
      if (pin) {
        pin(promiseId);
      }
      const { id: resolverId } = await formulate(
        resolverFormulaNumber,
        resolverFormula,
      );
      if (pin) {
        pin(resolverId);
      }

      return harden({ promiseId, resolverId });
    });
  };

  /** @type {DaemonCore['formulateMessage']} */
  const formulateMessage = async (messageFormula, pin) => {
    return withFormulaGraphLock(async () => {
      const formulaNumber = /** @type {FormulaNumber} */ (await randomHex512());
      // Pin before formulate so the formula is protected from
      // collection even if the lock is bypassed via re-entrancy.
      if (pin) {
        const messageId = formatId({
          number: formulaNumber,
          node: localNodeNumber,
        });
        pin(messageId);
      }
      return /** @type {FormulateResult<NameHub>} */ (
        formulate(formulaNumber, messageFormula)
      );
    });
  };

  /** @type {DaemonCore['formulateEval']} */
  const formulateEval = async (
    nameHubId,
    source,
    codeNames,
    endowmentIdsOrPaths,
    deferredTasks,
    specifiedWorkerId,
    pin,
  ) => {
    return /** @type {FormulateResult<unknown>} */ (
      withFormulaGraphLock(async () => {
        const ownFormulaNumber = /** @type {FormulaNumber} */ (
          await randomHex512()
        );
        const ownId = formatId({
          number: ownFormulaNumber,
          node: localNodeNumber,
        });
        // Pin before formulate so the formula is protected from
        // collection even if the lock is bypassed via re-entrancy.
        if (pin) {
          pin(ownId);
        }

        const identifiers = harden({
          workerId: await provideWorkerId(specifiedWorkerId),
          endowmentIds: await Promise.all(
            endowmentIdsOrPaths.map(async formulaIdOrPath => {
              if (typeof formulaIdOrPath === 'string') {
                return formulaIdOrPath;
              }
              await null;
              return (
                /* eslint-disable no-use-before-define */
                (
                  await formulateNumberedLookup(
                    /** @type {FormulaNumber} */ (await randomHex512()),
                    nameHubId,
                    /** @type {NamePath} */ (formulaIdOrPath),
                  )
                ).id
                /* eslint-enable no-use-before-define */
              );
            }),
          ),
          evalId: ownId,
          evalFormulaNumber: ownFormulaNumber,
        });
        await deferredTasks.execute(identifiers);

        /** @type {EvalFormula} */
        const formula = {
          type: 'eval',
          worker: identifiers.workerId,
          source,
          names: codeNames,
          values: identifiers.endowmentIds,
        };
        return formulate(identifiers.evalFormulaNumber, formula);
      })
    );
  };

  /**
   * Formulates a `lookup` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   * @param {FormulaNumber} formulaNumber - The lookup formula's number.
   * @param {FormulaIdentifier} hubId - The formula identifier of the naming
   * hub to call `lookup` on. A "naming hub" is an objected with a variadic
   * lookup method. It includes objects such as guests and hosts.
   * @param {NamePath} petNamePath - The pet name path to look up.
   * @returns {Promise<{ id: FormulaIdentifier, value: EndoWorker }>}
   */
  const formulateNumberedLookup = (formulaNumber, hubId, petNamePath) => {
    /** @type {LookupFormula} */
    const formula = {
      type: 'lookup',
      hub: hubId,
      path: petNamePath,
    };

    return /** @type {FormulateResult<EndoWorker>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /**
   * @param {FormulaIdentifier} hostAgentId
   * @param {FormulaIdentifier} hostHandleId
   * @param {FormulaIdentifier} [specifiedPowersId]
   */
  const providePowersId = async (
    hostAgentId,
    hostHandleId,
    specifiedPowersId,
  ) => {
    await null;
    if (typeof specifiedPowersId === 'string') {
      return specifiedPowersId;
    }

    const guestFormulationData = await formulateGuestDependencies(
      hostAgentId,
      hostHandleId,
    );
    const guestFormulation = await formulateNumberedGuest(guestFormulationData);
    return guestFormulation.id;
  };

  /**
   * Helper for `formulateUnconfined` and `formulateBundle`.
   * @param {FormulaIdentifier} hostAgentId
   * @param {FormulaIdentifier} hostHandleId
   * @param {DeferredTasks<MakeCapletDeferredTaskParams>} deferredTasks
   * @param {FormulaIdentifier} [specifiedWorkerId]
   * @param {FormulaIdentifier} [specifiedPowersId]
   * @param {string[]} [trustedShims]
   */
  const formulateCapletDependencies = async (
    hostAgentId,
    hostHandleId,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
    trustedShims = undefined,
  ) => {
    const ownFormulaNumber = /** @type {FormulaNumber} */ (
      await randomHex512()
    );
    const identifiers = harden({
      powersId: await providePowersId(
        hostAgentId,
        hostHandleId,
        specifiedPowersId,
      ),
      capletId: formatId({
        number: ownFormulaNumber,
        node: localNodeNumber,
      }),
      capletFormulaNumber: ownFormulaNumber,
      workerId: await provideWorkerId(specifiedWorkerId, trustedShims),
    });
    await deferredTasks.execute(identifiers);
    return identifiers;
  };

  /** @type {DaemonCore['formulateUnconfined']} */
  const formulateUnconfined = async (
    hostAgentId,
    hostHandleId,
    specifier,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
    env = {},
    trustedShims = undefined,
  ) => {
    return withFormulaGraphLock(async () => {
      const { powersId, capletFormulaNumber, workerId } =
        await formulateCapletDependencies(
          hostAgentId,
          hostHandleId,
          deferredTasks,
          specifiedWorkerId,
          specifiedPowersId,
          trustedShims,
        );

      /** @type {MakeUnconfinedFormula} */
      const formula = {
        type: 'make-unconfined',
        worker: workerId,
        powers: powersId,
        specifier,
        env,
      };
      return formulate(capletFormulaNumber, formula);
    });
  };

  /** @type {DaemonCore['formulateBundle']} */
  const formulateBundle = async (
    hostAgentId,
    hostHandleId,
    bundleId,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
    env = {},
    trustedShims = undefined,
  ) => {
    return withFormulaGraphLock(async () => {
      const { powersId, capletFormulaNumber, workerId } =
        await formulateCapletDependencies(
          hostAgentId,
          hostHandleId,
          deferredTasks,
          specifiedWorkerId,
          specifiedPowersId,
          trustedShims,
        );

      /** @type {MakeBundleFormula} */
      const formula = {
        type: 'make-bundle',
        worker: workerId,
        powers: powersId,
        bundle: bundleId,
        env,
      };
      return formulate(capletFormulaNumber, formula);
    });
  };

  /**
   * @param {FormulaNumber} formulaNumber
   * @param {FormulaIdentifier} petStoreId
   */
  const formulateNumberedPetInspector = (formulaNumber, petStoreId) => {
    /** @type {PetInspectorFormula} */
    const formula = {
      type: 'pet-inspector',
      petStore: petStoreId,
    };
    return /** @type {FormulateResult<EndoInspector>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /** @type {DaemonCore['formulatePeer']} */
  const formulatePeer = async (networksDirectoryId, nodeNumber, addresses) => {
    const formulaNumber = /** @type {FormulaNumber} */ (await randomHex512());
    // TODO: validate addresses
    // TODO: mutable state like addresses should not be stored in formula
    /** @type {PeerFormula} */
    const formula = {
      type: 'peer',
      networks: networksDirectoryId,
      node: nodeNumber,
      addresses,
    };
    return /** @type {FormulateResult<EndoPeer>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /** @type {DaemonCore['formulateLoopbackNetwork']} */
  const formulateLoopbackNetwork = async () => {
    const formulaNumber = /** @type {FormulaNumber} */ (await randomHex512());
    /** @type {LoopbackNetworkFormula} */
    const formula = {
      type: 'loopback-network',
    };
    return /** @type {FormulateResult<EndoNetwork>} */ (
      formulate(formulaNumber, formula)
    );
  };

  /** @type {DaemonCore['formulateNetworksDirectory']} */
  const formulateNetworksDirectory = async () => {
    const { id, value } = await formulateDirectory();
    // Make default networks.
    const { id: loopbackNetworkId } = await formulateLoopbackNetwork();
    await E(value).write(/** @type {NamePath} */ (['loop']), loopbackNetworkId);
    return { id, value };
  };

  /** @type {DaemonCore['formulateEndo']} */
  const formulateEndo = async specifiedFormulaNumber => {
    return /** @type {FormulateResult<FarRef<EndoBootstrap>>} */ (
      withFormulaGraphLock(async () => {
        const formulaNumber = /** @type {FormulaNumber} */ (
          await (specifiedFormulaNumber ?? randomHex512())
        );
        const endoId = formatId({
          number: formulaNumber,
          node: localNodeNumber,
        });

        const { id: defaultHostWorkerId } = await formulateNumberedWorker(
          /** @type {FormulaNumber} */ (await randomHex512()),
        );
        const { id: networksDirectoryId } = await formulateNetworksDirectory();
        const { id: pinsDirectoryId } = await formulateDirectory();

        // Ensure the default host is formulated and persisted.
        const { id: defaultHostId } = await formulateNumberedHost(
          await formulateHostDependencies({
            endoId,
            networksDirectoryId,
            pinsDirectoryId,
            specifiedWorkerId: defaultHostWorkerId,
          }),
        );

        /** @type {EndoFormula} */
        const formula = {
          type: 'endo',
          networks: networksDirectoryId,
          pins: pinsDirectoryId,
          peers: knownPeersId,
          host: defaultHostId,
          leastAuthority: leastAuthorityId,
        };

        const result = await formulate(formulaNumber, formula);
        formulaGraph.addRoot(result.id);
        return result;
      })
    );
  };

  /**
   * @param {FormulaIdentifier} networksDirectoryId
   * @returns {Promise<EndoNetwork[]>}
   */
  const getAllNetworks = async networksDirectoryId => {
    const networksDirectory = await provide(networksDirectoryId, 'directory');
    const networkIds = await networksDirectory.listIdentifiers();
    const networks = await Promise.all(
      networkIds.map(id =>
        provide(/** @type {FormulaIdentifier} */ (id), 'network'),
      ),
    );
    return networks;
  };

  /** @type {DaemonCore['getAllNetworkAddresses']} */
  const getAllNetworkAddresses = async networksDirectoryId => {
    const networks = await getAllNetworks(networksDirectoryId);
    const addresses = (
      await Promise.all(
        networks.map(async network => {
          return E(network).addresses();
        }),
      )
    ).flat();
    return addresses;
  };

  /**
   * @param {FormulaIdentifier} networksDirectoryId
   * @param {NodeNumber} nodeId
   * @param {string[]} addresses
   * @param {Context} context
   */
  const makePeer = async (networksDirectoryId, nodeId, addresses, context) => {
    console.log(
      `makePeer: connecting to node ${nodeId.slice(0, 16)}... with ${addresses.length} address(es)`,
    );
    const remoteControl = provideRemoteControl(nodeId);
    return remoteControl.connect(
      async () => {
        // TODO race networks that support protocol for connection
        // TODO retry, exponential back-off, with full jitter
        const networks = await getAllNetworks(networksDirectoryId);
        console.log(
          `makePeer: found ${networks.length} network(s), trying ${addresses.length} address(es)`,
        );
        // Connect on first support address.
        for (const address of addresses) {
          const { protocol } = new URL(address);
          for (const network of networks) {
            // eslint-disable-next-line no-await-in-loop
            if (await E(network).supports(protocol)) {
              console.log(`makePeer: dialing ${address.slice(0, 80)}...`);
              try {
                return await E(network).connect(
                  address,
                  makeFarContext(context),
                );
              } catch (connectError) {
                console.log(
                  `makePeer: connect failed: ${/** @type {Error} */ (connectError).message}`,
                );
                throw connectError;
              }
            }
          }
        }
        throw new Error('Cannot connect to peer: no supported addresses');
      },
      context.cancel,
      context.cancelled,
      () => dropLiveValue(context.id),
    );
  };

  /**
   * @param {string} id
   * @param {string} hostAgentId
   * @param {string} hostHandleId
   * @param {import('./types.js').PetName} guestName
   */
  const makeInvitation = async (id, hostAgentId, hostHandleId, guestName) => {
    const hostAgent = /** @type {EndoHost} */ (await provide(hostAgentId));

    const locate = async () => {
      const { node, addresses } = await hostAgent.getPeerInfo();
      const { number: hostHandleNumber } = parseId(hostHandleId);
      const { number } = parseId(id);
      const url = new URL('endo://');
      url.hostname = node;
      url.searchParams.set('id', number);
      url.searchParams.set('from', hostHandleNumber);
      for (const address of addresses) {
        url.searchParams.append('at', address);
      }
      return url.href;
    };

    /**
     * @param {string} guestHandleLocator
     */
    const accept = async guestHandleLocator => {
      const url = new URL(guestHandleLocator);
      const guestHandleNumber = url.searchParams.get('id');
      const addresses = url.searchParams.getAll('at');
      const guestNodeNumber = url.hostname;

      if (!guestHandleNumber) {
        throw makeError('Handle locator must have an "id" parameter');
      }
      assertNodeNumber(guestNodeNumber);
      assertFormulaNumber(guestHandleNumber);

      const guestHandleId = formatId({
        node: guestNodeNumber,
        number: guestHandleNumber,
      });

      /** @type {PeerInfo} */
      const peerInfo = {
        node: guestNodeNumber,
        addresses,
      };
      await hostAgent.addPeerInfo(peerInfo);

      // TODO ensure that this is sufficient to cancel the previous
      // incarnation, this invitation, such that it can no longer be redeemed,
      // and such that overwriting the invitation also revokes the invitation.
      await withFormulaGraphLock();
      const controller = provideController(id);
      console.log('Cancelled:');
      await controller.context.cancel(new Error('Invitation accepted'));

      await E(hostAgent).write(
        /** @type {NamePath} */ ([guestName]),
        guestHandleId,
      );

      return provide(guestHandleId);
    };

    return makeExo('Invitation', InvitationInterface, { accept, locate });
  };

  const makeContext = makeContextMaker({
    controllerForId,
    provideController,
  });

  const { makeIdentifiedDirectory, makeDirectoryNode } = makeDirectoryMaker({
    provide,
    getIdForRef,
    getTypeForId,
    formulateDirectory,
  });

  const makeMailbox = makeMailboxMaker({
    provide,
    formulateMarshalValue,
    formulatePromise,
    formulateMessage,
    getFormulaForId,
    getTypeForId,
    randomHex512,
    pinTransient,
    unpinTransient,
  });

  const makeGuest = makeGuestMaker({
    provide,
    formulateMarshalValue,
    makeMailbox,
    makeDirectoryNode,
    collectIfDirty,
  });

  /**
   * Look up the agent formula ID for a given handle formula ID.
   *
   * @param {FormulaIdentifier} handleId
   * @returns {Promise<FormulaIdentifier>}
   */
  const getAgentIdForHandleId = async handleId => {
    const handle = await provide(handleId, 'handle');
    const agentId = agentIdForHandle.get(handle);
    if (agentId === undefined) {
      throw makeError(X`No agent found for handle ${q(handleId)}`);
    }
    return agentId;
  };

  const makeHost = makeHostMaker({
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
    makeMailbox,
    makeDirectoryNode,
    getAllNetworkAddresses,
    localNodeNumber,
    getAgentIdForHandleId,
    collectIfDirty,
    pinTransient,
    unpinTransient,
  });

  /**
   * Creates an inspector for the current agent's pet store, used to create
   * inspectors for values therein. Notably, can provide references to otherwise
   * un-nameable values such as the `MAIN` worker. See `KnownEndoInspectors` for
   * more details.
   *
   * @param {FormulaIdentifier} petStoreId
   * @returns {Promise<EndoInspector>}
   */
  const makePetStoreInspector = async petStoreId => {
    const petStore = await provide(petStoreId, 'pet-store');

    /**
     * @param {string | string[]} petNameOrPath - The pet name to inspect.
     * @returns {Promise<KnownEndoInspectors[string]>} An
     * inspector for the value of the given pet name.
     */
    const lookup = async petNameOrPath => {
      /** @type {string} */
      let petName;
      if (Array.isArray(petNameOrPath)) {
        if (petNameOrPath.length !== 1) {
          throw Error(
            'PetStoreInspector.lookup(path) requires path length of 1',
          );
        }
        petName = petNameOrPath[0];
      } else {
        petName = petNameOrPath;
      }
      assertName(petName);
      const id = petStore.identifyLocal(petName);
      if (id === undefined) {
        throw new Error(`Unknown pet name ${petName}`);
      }
      const { number: formulaNumber } = parseId(id);
      const formula = await getFormulaForId(id);
      if (
        !['eval', 'lookup', 'make-unconfined', 'make-bundle', 'guest'].includes(
          formula.type,
        )
      ) {
        return makeInspector(formula.type, formulaNumber, harden({}));
      }
      if (formula.type === 'eval') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            endowments: Object.fromEntries(
              formula.names.map((name, index) => {
                return [name, provide(formula.values[index])];
              }),
            ),
            source: formula.source,
            worker: provide(formula.worker, 'worker'),
          }),
        );
      } else if (formula.type === 'lookup') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            hub: provide(formula.hub, 'hub'),
            path: formula.path,
          }),
        );
      } else if (formula.type === 'guest') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            hostAgent: provide(formula.hostAgent, 'host'),
            hostHandle: provide(formula.hostHandle, 'handle'),
          }),
        );
      } else if (formula.type === 'make-bundle') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            bundle: provide(formula.bundle, 'readable-blob'),
            powers: provide(formula.powers),
            worker: provide(formula.worker, 'worker'),
          }),
        );
      } else if (formula.type === 'make-unconfined') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            powers: provide(formula.powers),
            specifier: formula.type,
            worker: provide(formula.worker, 'worker'),
          }),
        );
      } else if (formula.type === 'peer') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            NODE: formula.node,
            ADDRESSES: formula.addresses,
          }),
        );
      }
      return makeInspector(formula.type, formulaNumber, harden({}));
    };

    /** @returns {Name[]} The list of all names in the pet store. */
    const list = () => petStore.list();

    const info = makeExo('EndoInspectorHub', InspectorHubInterface, {
      lookup,
      list,
    });

    return info;
  };

  /** @type {DaemonCoreExternal} */
  await seedFormulaGraphFromPersistence();
  return {
    formulateEndo,
    provide,
    nodeNumber: localNodeNumber,
    capTpConnectionRegistrar,
  };
};

/**
 * @param {DaemonicPowers} powers
 * @param {object} args
 * @param {(error: Error) => void} args.cancel
 * @param {number} args.gracePeriodMs
 * @param {Promise<never>} args.gracePeriodElapsed
 * @param {Specials} args.specials
 * @returns {Promise<{ endoBootstrap: FarRef<EndoBootstrap>, capTpConnectionRegistrar: CapTpConnectionRegistrar }>}
 */
const provideEndoBootstrap = async (
  powers,
  { cancel, gracePeriodMs, gracePeriodElapsed, specials },
) => {
  const { persistence: persistencePowers } = powers;
  const { rootNonce: endoFormulaNumber, isNewlyCreated } =
    await persistencePowers.provideRootNonce();
  const daemonCore = await makeDaemonCore(powers, endoFormulaNumber, {
    cancel,
    gracePeriodMs,
    gracePeriodElapsed,
    specials,
  });
  const { capTpConnectionRegistrar } = daemonCore;
  const isInitialized = !isNewlyCreated;
  if (isInitialized) {
    const endoId = formatId({
      number: endoFormulaNumber,
      node: daemonCore.nodeNumber,
    });
    const endoBootstrap = /** @type {FarRef<EndoBootstrap>} */ (
      await daemonCore.provide(endoId)
    );
    return { endoBootstrap, capTpConnectionRegistrar };
  } else {
    const { value: endoBootstrap } =
      await daemonCore.formulateEndo(endoFormulaNumber);
    return { endoBootstrap, capTpConnectionRegistrar };
  }
};

/**
 * @param {DaemonicPowers} powers
 * @param {string} daemonLabel
 * @param {(error: Error) => void} cancel
 * @param {Promise<never>} cancelled
 * @param {Specials} [specials]
 */
export const makeDaemon = async (
  powers,
  daemonLabel,
  cancel,
  cancelled,
  specials = {},
) => {
  const { promise: gracePeriodCancelled, reject: cancelGracePeriod } =
    /** @type {PromiseKit<never>} */ (makePromiseKit());

  // TODO thread through command arguments.
  const gracePeriodMs = 100;

  /** @type {Promise<never>} */
  const gracePeriodElapsed = cancelled.catch(async error => {
    await delay(gracePeriodMs, gracePeriodCancelled);
    console.log(
      `Endo daemon grace period ${gracePeriodMs}ms elapsed for ${daemonLabel}`,
    );
    throw error;
  });

  const { endoBootstrap, capTpConnectionRegistrar } =
    await provideEndoBootstrap(powers, {
      cancel,
      gracePeriodMs,
      gracePeriodElapsed,
      specials,
    });

  await Promise.allSettled([
    E(endoBootstrap).reviveNetworks(),
    E(endoBootstrap).revivePins(),
  ]);

  return { endoBootstrap, cancelGracePeriod, capTpConnectionRegistrar };
};
