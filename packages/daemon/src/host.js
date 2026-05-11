// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { AgentDeferredTaskParams, ChannelDeferredTaskParams, Context, DaemonCore, DeferredTasks, EndoGuest, EndoHost, EnvRecord, EvalDeferredTaskParams, FormulaIdentifier, FormulaNumber, InvitationDeferredTaskParams, MakeCapletDeferredTaskParams, MakeCapletOptions, MakeDirectoryNode, MakeHostOrGuestOptions, MakeMailbox, MountDeferredTaskParams, Name, NameOrPath, NamePath, NodeNumber, PeerInfo, PetName, ReadableBlobDeferredTaskParams, ReadableTreeDeferredTaskParams, MarshalDeferredTaskParams, ScratchMountDeferredTaskParams, WorkerDeferredTaskParams } from './types.js' */

import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { makeError, q, X } from '@endo/errors';
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
 * @param {DaemonCore['formulateArchive']} args.formulateArchive
 * @param {DaemonCore['formulateFromTree']} args.formulateFromTree
 * @param {(id: FormulaIdentifier) => string} args.getScratchMountPath
 * @param {DaemonCore['formulateReadableBlob']} args.formulateReadableBlob
 * @param {DaemonCore['checkinTree']} args.checkinTree
 * @param {DaemonCore['formulateMount']} args.formulateMount
 * @param {DaemonCore['formulateScratchMount']} args.formulateScratchMount
 * @param {DaemonCore['formulateInvitation']} args.formulateInvitation
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
 * @param {(publicKey: string, daemonNode: string) => void} [args.writeRemoteAgentKey]
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
  formulateArchive,
  formulateFromTree,
  getScratchMountPath,
  formulateReadableBlob,
  checkinTree,
  formulateMount,
  formulateScratchMount,
  formulateInvitation,
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
  writeRemoteAgentKey = /** @param {string} _pk @param {string} _dn */ (
    _pk,
    _dn,
  ) => {},
  pinTransient = /** @param {any} _id */ _id => {},
  unpinTransient = /** @param {any} _id */ _id => {},
  getFormulaGraphSnapshot = /** @param {any[]} _ids */ async _ids =>
    harden({ nodes: [], edges: [] }),
}) => {
  /**
   * @param {FormulaIdentifier} hostId
   * @param {FormulaIdentifier} handleId
   * @param {FormulaIdentifier | undefined} hostHandleId
   * @param {NodeNumber} agentNodeNumber
   * @param {(message: Uint8Array) => Uint8Array} agentSignBytes
   * @param {FormulaIdentifier} storeId
   * @param {FormulaIdentifier} mailboxStoreId
   * @param {FormulaIdentifier | undefined} mailHubId
   * @param {FormulaIdentifier} inspectorId
   * @param {FormulaIdentifier} mainWorkerId
   * @param {FormulaIdentifier} nodeWorkerId
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
    agentNodeNumber,
    agentSignBytes,
    storeId,
    mailboxStoreId,
    mailHubId,
    inspectorId,
    mainWorkerId,
    nodeWorkerId,
    endoId,
    networksDirectoryId,
    pinsDirectoryId,
    leastAuthorityId,
    platformNames,
    context,
  ) => {
    context.thisDiesIfThatDies(storeId);
    context.thisDiesIfThatDies(mainWorkerId);
    context.thisDiesIfThatDies(nodeWorkerId);
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
      '@main': mainWorkerId,
      '@node': nodeWorkerId,
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
      await unpinTransient(id);
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
        // Unpin after the value resolves and drain any resulting
        // collection cleanup (worker termination, etc.).
        try {
          return await value;
        } finally {
          await unpinTransient(id);
        }
      }
      return value;
    };

    /**
     * Helper function for makeUnconfined and makeArchive.
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
      // makeUnconfined is unconditionally Node-shaped (loads a plugin
      // by filesystem path through Node's module loader).  When no
      // worker is named *and* the caller has not requested trusted
      // shims (which require a fresh worker pre-lockdown), default
      // to the host's shared @node worker rather than spawning a
      // fresh single-use Node worker per call.
      const wantsFreshWorker =
        options?.workerTrustedShims !== undefined &&
        options.workerTrustedShims.length > 0;
      const effectiveWorkerName =
        workerName ?? (wantsFreshWorker ? undefined : '@node');
      const {
        tasks,
        workerId,
        workerLabel: explicitLabel,
        powersId,
        env,
        workerTrustedShims,
      } = prepareMakeCaplet(
        /** @type {Name | undefined} */ (effectiveWorkerName),
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

    /** @type {EndoHost['makeArchive']} */
    const makeArchive = async (workerName, archiveName, options) => {
      const archiveId = petStore.identifyLocal(
        /** @type {Name} */ (archiveName),
      );
      if (archiveId === undefined) {
        throw new TypeError(`Unknown pet name for archive: ${q(archiveName)}`);
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
          : `archive:${archiveName}`);

      const { value } = await formulateArchive(
        hostId,
        handleId,
        /** @type {FormulaIdentifier} */ (archiveId),
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
     * Walk a ReadableTree or Mount and materialise every file into the
     * destination Mount via `writeText`.  Children are identified by
     * their advertised method names: anything with `text` is a
     * blob/file; anything with `list` is a subtree.  Both Mount and
     * ReadableTree surfaces participate.
     *
     * @param {any} src - source readable-tree or mount
     * @param {any} dst - destination scratch mount (must be writable)
     * @param {string[]} [pathSegments]
     */
    const materializeTree = async (src, dst, pathSegments = []) => {
      const names = await E(src).list(...pathSegments);
      for (const name of names) {
        // Defense against an adversarial source tree that advertises
        // path-traversal segments.  Mount.writeText would clamp
        // these at the confinement root, but they would still cause
        // the discovery walk to revisit parent directories.
        if (name === '.' || name === '..' || name.includes('/')) {
          throw makeError(
            X`Invalid tree entry name ${q(name)} at ${q(pathSegments)}`,
          );
        }
        const subPath = [...pathSegments, name];
        // eslint-disable-next-line no-await-in-loop
        const child = await E(src).lookup(subPath);
        const methodNames =
          // eslint-disable-next-line no-await-in-loop, no-underscore-dangle
          await E(child).__getMethodNames__();
        const looksLikeBlob = methodNames.includes('text');
        const looksLikeTree = methodNames.includes('list');
        if (looksLikeBlob && looksLikeTree) {
          throw makeError(
            X`Tree entry ${q(subPath)} has both text and list — ambiguous shape`,
          );
        } else if (looksLikeBlob) {
          // eslint-disable-next-line no-await-in-loop
          const content = await E(child).text();
          // eslint-disable-next-line no-await-in-loop
          await E(dst).writeText(subPath, content);
        } else if (looksLikeTree) {
          // Subdirectory — create it then recurse.
          // eslint-disable-next-line no-await-in-loop
          await E(dst).makeDirectory(subPath);
          // eslint-disable-next-line no-await-in-loop
          await materializeTree(src, dst, subPath);
        } else {
          throw makeError(
            X`Tree entry ${q(subPath)} is neither a blob nor a subtree (methods: ${q(methodNames)})`,
          );
        }
      }
    };

    /**
     * Like stageTree, but returns both the ScratchMount capability and
     * its on-disk formula identifier — callers that need the
     * underlying filesystem path (e.g. `makeUnconfinedFromTree`) use
     * the id with `getScratchMountPath`.  The public `stageTree`
     * surface exposes only the mount capability.
     *
     * @param {string | string[]} treeName
     * @param {string} scratchPetName
     */
    const stageTreeInternal = async (treeName, scratchPetName) => {
      assertPetName(scratchPetName);
      const treeNamePath = namePathFrom(/** @type {NameOrPath} */ (treeName));
      assertNamePath(treeNamePath);
      // Use identify + provide instead of a lookup chain to keep the
      // source invariant (so Mount sub-node wrapping doesn't confuse
      // the materialise walk).
      const treeId = await E(directory).identify(...treeNamePath);
      if (treeId === undefined) {
        throw new TypeError(`Unknown pet name for tree: ${q(treeName)}`);
      }
      const tree = await provide(/** @type {FormulaIdentifier} */ (treeId));
      // For live mounts, prefer to snapshot the source first so
      // concurrent writes to the mount cannot perturb the running
      // caplet.  ReadableTrees are already immutable.  Mount's
      // `snapshot()` is not implemented at the time of writing
      // (mount.js:305 throws); we therefore swallow that "not yet
      // implemented" rejection and fall back to walking the live
      // mount.  When mount.snapshot lands, this code path becomes
      // automatically isolated.
      let sourceForWalk = tree;
      try {
        // eslint-disable-next-line no-underscore-dangle
        const methods = await E(/** @type {any} */ (tree)).__getMethodNames__();
        if (methods.includes('snapshot')) {
          sourceForWalk = await E(/** @type {any} */ (tree)).snapshot();
        }
      } catch (err) {
        const msg = String((err && /** @type {any} */ (err).message) || err);
        if (!msg.includes('not yet implemented')) throw err;
      }
      const scratchMount = await provideScratchMount(scratchPetName);
      await materializeTree(sourceForWalk, scratchMount, []);
      // Resolve the scratch mount's identifier after it's been stored
      // by the deferred pet-store task inside provideScratchMount.
      const scratchId = await E(directory).identify(scratchPetName);
      if (scratchId === undefined) {
        throw new TypeError(
          `Internal error: scratch mount ${q(scratchPetName)} was not stored`,
        );
      }
      const typedScratchId = /** @type {FormulaIdentifier} */ (scratchId);
      return { scratchMount, scratchId: typedScratchId };
    };

    /** @type {EndoHost['stageTree']} */
    const stageTree = async (treeName, scratchPetName) => {
      const { scratchMount } = await stageTreeInternal(
        treeName,
        scratchPetName,
      );
      return scratchMount;
    };

    /** @type {EndoHost['makeUnconfinedFromTree']} */
    const makeUnconfinedFromTree = async (workerName, treeName, options) => {
      const entry = options?.entry ?? 'index.js';
      const resultLabel =
        options?.resultName !== undefined
          ? `${options.resultName}`
          : `tree-unconfined-${await (async () => {
              // eslint-disable-next-line no-bitwise
              const r = Math.floor(Math.random() * 0xffffff);
              return r.toString(16);
            })()}`;
      // Scratch mount carries a derived pet name so the caller can
      // observe / cancel it explicitly if desired.
      const scratchPetName = `scratch-${resultLabel}`;
      const { scratchId } = await stageTreeInternal(treeName, scratchPetName);
      const scratchPath = getScratchMountPath(scratchId);
      const entryPath = `${scratchPath}/${entry}`;
      // Reuse the existing makeUnconfined flow (which already defaults
      // to @node when no worker is named and handles env/powers).
      // Encode path components so that characters like '#' (used in
      // test directory suffixes) don't get interpreted as URL fragments.
      const encodedPath = entryPath
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
      const fileUrl = `file://${encodedPath}`;
      return makeUnconfined(
        workerName,
        fileUrl,
        /** @type {MakeCapletOptions} */ (options ?? {}),
      );
    };

    /** @type {EndoHost['makeFromTree']} */
    const makeFromTree = async (workerName, treeName, options) => {
      const namePath = namePathFrom(treeName);
      assertNamePath(namePath);
      const treeId = await E(directory).identify(...namePath);
      if (treeId === undefined) {
        throw new TypeError(`Unknown pet name for tree: ${q(treeName)}`);
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
          : `tree:${Array.isArray(treeName) ? treeName.join('/') : treeName}`);

      const { value } = await formulateFromTree(
        hostId,
        handleId,
        /** @type {FormulaIdentifier} */ (treeId),
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
      const daemonNode = url.hostname;
      const invitationNumber = url.searchParams.get('id');
      const remoteHandleNumber = url.searchParams.get('from');
      // The remote handle's node may differ from the daemon node when
      // agent keys are used as formula nodes.
      const remoteHandleNodeParam = url.searchParams.get('fromNode');
      const addresses = url.searchParams.getAll('at');

      daemonNode || assert.Fail`Invitation must have a hostname`;
      if (!remoteHandleNumber) {
        throw makeError(`Invitation must have a "from" parameter`);
      }
      if (invitationNumber === null) {
        throw makeError(`Invitation must have an "id" parameter`);
      }
      assertNodeNumber(daemonNode);
      assertFormulaNumber(remoteHandleNumber);
      assertFormulaNumber(invitationNumber);

      /** @type {PeerInfo} */
      const peerInfo = {
        node: daemonNode,
        addresses,
      };
      // eslint-disable-next-line no-use-before-define
      await addPeerInfo(peerInfo);

      // Register the remote agent key so we can route to its daemon.
      if (remoteHandleNodeParam && remoteHandleNodeParam !== daemonNode) {
        writeRemoteAgentKey(remoteHandleNodeParam, daemonNode);
      }

      const invitationId = formatId({
        number: invitationNumber,
        node: daemonNode,
      });

      const { number: handleNumber, node: handleNode } = parseId(handleId);
      // eslint-disable-next-line no-use-before-define
      const { addresses: hostAddresses } = await getPeerInfo();
      const handleUrl = new URL('endo://');
      handleUrl.hostname = localNodeNumber;
      handleUrl.searchParams.set('id', handleNumber);
      // Include the handle's node if it differs from the daemon node
      // (i.e. it uses an agent key).
      if (handleNode !== localNodeNumber) {
        handleUrl.searchParams.set('handleNode', handleNode);
      }
      for (const address of hostAddresses) {
        handleUrl.searchParams.append('at', address);
      }
      const handleLocator = handleUrl.href;

      const invitation = await provide(invitationId, 'invitation');
      await E(invitation).accept(handleLocator, guestName);

      // Create a local guest with a regular pet store.
      // Pin the guest handle via deferred task to prevent premature
      // collection, then store the durable name after the lock releases.
      /** @type {import('./types.js').DeferredTasks<import('./types.js').AgentDeferredTaskParams>} */
      const guestTasks = makeDeferredTasks();
      guestTasks.push(async identifiers => pinTransient(identifiers.handleId));
      const { id: localGuestId } = await formulateGuest(
        hostId,
        handleId,
        guestTasks,
        `guest:${guestName}`,
      );

      // Look up the local guest's handle from its formula so we can
      // name it.  Incarnating the handle transitively incarnates the
      // guest.
      const localGuestFormula =
        /** @type {import('./types.js').GuestFormula} */ (
          await getFormulaForId(localGuestId)
        );

      // Store the durable name and release the transient pin.
      await E(directory).storeIdentifier(
        ['@pins', `guest-${guestName}`],
        localGuestFormula.handle,
      );
      await unpinTransient(localGuestFormula.handle);

      // Store the remote handle under guestName for mail delivery.
      // Use the handle's actual node (which may be an agent key) if
      // provided, falling back to the daemon node.
      const remoteHandleNode = remoteHandleNodeParam || daemonNode;
      const remoteHandleId = formatId({
        number: /** @type {import('./types.js').FormulaNumber} */ (
          remoteHandleNumber
        ),
        node: /** @type {import('./types.js').NodeNumber} */ (remoteHandleNode),
      });
      const remoteHandleLocator = formatLocator(remoteHandleId, 'handle');
      await E(directory).storeLocator([guestName], remoteHandleLocator);
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
        node: localNodeNumber,
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
      makeArchive,
      makeFromTree,
      stageTree,
      makeUnconfinedFromTree,
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
      endow,
      submit,
      sendValue,
      // Graph
      getFormulaGraph,
    };

    const hostExo = makeExo(
      'EndoHost',
      HostInterface,
      /** @type {any} */ ({
        help: makeHelp(hostHelp),
        ...host,
        /** @param {string} locator */
        followLocatorNameChanges: async locator => {
          const iterator = host.followLocatorNameChanges(locator);
          return makeIteratorRef(iterator);
        },
        followMessages: async () => {
          const iterator = host.followMessages();
          return makeIteratorRef(iterator);
        },
        followNameChanges: async () => {
          const iterator = host.followNameChanges();
          return makeIteratorRef(iterator);
        },
        followPeerChanges: async () => {
          const iterator = await host.followPeerChanges();
          return makeIteratorRef(iterator);
        },
      }),
    );

    await provide(mainWorkerId, 'worker');
    await provide(nodeWorkerId, 'worker');

    return hostExo;
  };

  return makeHost;
};
