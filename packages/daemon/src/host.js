// @ts-check
/** @import { EndoGit } from '@endo/exo-git' */
/// <reference types="ses"/>
/* global process */

/** @import { ERef } from '@endo/eventual-send' */
/** @import { PassableBytesReader } from '@endo/exo-stream' */
/** @import { AgentDeferredTaskParams, ChannelDeferredTaskParams, Context, DaemonCore, DeferredTasks, EndoDiagnostics, EndoGuest, EndoHost, EnvRecord, EvalDeferredTaskParams, FormulaIdentifier, FormulaNumber, FormulaRecord, GitCredentialDeferredTaskParams, GitDeferredTaskParams, GitRemoteDeferredTaskParams, InvitationDeferredTaskParams, MakeCapletDeferredTaskParams, MakeCapletOptions, MakeDirectoryNode, MakeHostOrGuestOptions, MakeMailbox, MountDeferredTaskParams, Name, NameOrPath, NamePath, NodeNumber, PeerInfo, PetName, ReadableBlobDeferredTaskParams, ReadableTreeDeferredTaskParams, MarshalDeferredTaskParams, ScratchMountDeferredTaskParams, ShellDeferredTaskParams, WorkerDeferredTaskParams } from './types.js' */
/** @import { makeTraceAggregator } from './trace-aggregator.js' */

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { makeError, q, X } from '@endo/errors';
import {
  getGitCredentialController as getGitCredentialControllerForCap,
  getGitRemoteController as getGitRemoteControllerForCap,
  isGitReadOnly,
  makeGitCloner,
  makeGitRemoteEndpoint,
} from '@endo/exo-git';
import { gitClone } from '@endo/git';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import {
  assertPetName,
  assertPetNamePath,
  namePathFrom,
  petNamePathFrom,
} from './pet-name.js';
import {
  assertFormulaNumber,
  parseId,
  formatId,
} from './formula-identifier.js';
import {
  formatLocator,
  formatLocatorWithHints,
  idFromLocator,
  internalizeLocator,
  parseLocator,
} from './locator.js';
import { toHex, fromHex } from './hex.js';
import { makePetSitter } from './pet-sitter.js';

import { makeDeferredTasks } from './deferred-tasks.js';
import { makeFormulaRecord } from './formula-record.js';

import {
  DiagnosticsInterface,
  HostInterface,
  TracesInterface,
} from './interfaces.js';
import { hostHelp, makeHelp } from './help-text.js';
import { assertValidTreeEntryName, getMountBacking } from './mount.js';

/**
 * @param {string} name
 * @returns {asserts name is Name}
 */
const assertPowersName = name => {
  ['@none', '@agent', '@endo'].includes(name) || assertPetName(name);
};

/**
 * Validate a powers name or directory path.  A single segment must be a
 * special powers name (`@none` / `@agent` / `@endo`) or a pet name; a
 * multi-segment path is validated as a name path by {@link namePathFrom},
 * letting a caller reference powers that live inside a directory rather
 * than at the agent's top level.
 * @param {string | string[]} nameOrPath
 */
const assertPowersNameOrPath = nameOrPath => {
  const namePath = namePathFrom(nameOrPath);
  if (namePath.length === 1) {
    assertPowersName(namePath[0]);
  }
};

/**
 * Normalizes host or guest options, providing default values.
 * @param {MakeHostOrGuestOptions | undefined} opts
 * @returns {{ introducedNames: Record<Name, PetName>, agentName?: NameOrPath }}
 */
const normalizeHostOrGuestOptions = opts => {
  const agentName = /** @type {NameOrPath | undefined} */ (opts?.agentName);
  return {
    introducedNames: /** @type {Record<Name, PetName>} */ (
      opts?.introducedNames ?? Object.create(null)
    ),
    ...(agentName !== undefined && { agentName }),
  };
};

/**
 * Validate and normalize a caller-supplied `ShellPolicy` into the frozen record
 * baked into the `shell` formula.  Rejects a malformed policy up front so a
 * doomed formula is never persisted.
 *
 * @param {unknown} policy
 * @returns {import('./types.js').ShellPolicy}
 */
export const normalizeShellPolicy = policy => {
  if (!policy || typeof policy !== 'object') {
    throw makeError(X`provideShell: policy must be an object`);
  }
  const { allowedCommands, timeoutMs, maxOutputBytes, env, searchPath } =
    /** @type {Record<string, unknown>} */ (policy);
  if (
    !Array.isArray(allowedCommands) ||
    allowedCommands.length === 0 ||
    !allowedCommands.every(c => typeof c === 'string' && c.length > 0)
  ) {
    throw makeError(
      X`provideShell: policy.allowedCommands must be a non-empty array of command-name strings`,
    );
  }
  if (!Number.isInteger(timeoutMs) || /** @type {number} */ (timeoutMs) <= 0) {
    throw makeError(
      X`provideShell: policy.timeoutMs must be a positive integer`,
    );
  }
  if (
    !Number.isInteger(maxOutputBytes) ||
    /** @type {number} */ (maxOutputBytes) <= 0
  ) {
    throw makeError(
      X`provideShell: policy.maxOutputBytes must be a positive integer`,
    );
  }
  /** @type {Record<string, string>} */
  const normalizedEnv = {};
  if (env !== undefined) {
    if (typeof env !== 'object' || env === null || Array.isArray(env)) {
      throw makeError(
        X`provideShell: policy.env must be a record of string values`,
      );
    }
    for (const [key, val] of Object.entries(env)) {
      if (typeof val !== 'string') {
        throw makeError(
          X`provideShell: policy.env[${q(key)}] must be a string`,
        );
      }
      normalizedEnv[key] = val;
    }
  }
  const normalizedSearchPath =
    searchPath === undefined ? process.env.PATH || '' : searchPath;
  if (typeof normalizedSearchPath !== 'string') {
    throw makeError(X`provideShell: policy.searchPath must be a string`);
  }
  const timeoutMsValue = /** @type {number} */ (timeoutMs);
  const maxOutputBytesValue = /** @type {number} */ (maxOutputBytes);
  return harden({
    allowedCommands: harden([...allowedCommands]),
    timeoutMs: timeoutMsValue,
    maxOutputBytes: maxOutputBytesValue,
    env: harden(normalizedEnv),
    searchPath: normalizedSearchPath,
  });
};
harden(normalizeShellPolicy);

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
 * @param {(id: FormulaIdentifier) => string} args.getMountHostPath
 * @param {(ref: unknown) => FormulaIdentifier | undefined} args.getIdForRef
 * @param {DaemonCore['formulateReadableBlob']} args.formulateReadableBlob
 * @param {DaemonCore['checkinTree']} args.checkinTree
 * @param {DaemonCore['formulateMount']} args.formulateMount
 * @param {DaemonCore['formulateScratchMount']} args.formulateScratchMount
 * @param {DaemonCore['formulateGit']} args.formulateGit
 * @param {DaemonCore['formulateShell']} args.formulateShell
 * @param {DaemonCore['formulateGitCredential']} args.formulateGitCredential
 * @param {DaemonCore['formulateGitRemote']} args.formulateGitRemote
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
 * @param {DaemonCore['listRetentionPaths']} [args.listRetentionPaths]
 * @param {DaemonCore['followRetentionPaths']} [args.followRetentionPaths]
 * @param {ReturnType<typeof makeTraceAggregator>} [args.traceAggregator]
 *   Optional. When provided, `host.traces()` returns an Exo whose
 *   methods proxy to this aggregator. Without it, `host.traces()`
 *   throws.
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
  formulateGit,
  formulateShell,
  formulateGitCredential,
  formulateGitRemote,
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
  getMountHostPath = /** @param {FormulaIdentifier} _id */ _id => {
    throw makeError(X`getMountHostPath not wired into makeHostMaker`);
  },
  getIdForRef = /** @param {unknown} _ref */ _ref => undefined,
  writeRemoteAgentKey = /** @param {string} _pk @param {string} _dn */ (
    _pk,
    _dn,
  ) => {},
  pinTransient = /** @param {any} _id */ _id => {},
  unpinTransient = /** @param {any} _id */ _id => {},
  getFormulaGraphSnapshot = /** @param {any[]} _ids */ async _ids =>
    harden({ nodes: [], edges: [] }),
  // Retention-path introspection is an opt-in instrumentation
  // surface: embedders that do not wire the daemon-side path
  // resolver still satisfy the `EndoHost` shape, and clients see
  // an empty path list rather than a hard error. Contrast
  // `getMountHostPath` below, where a missing wire indicates a
  // configuration bug worth surfacing loudly: there the no-wire
  // default throws an explicit `makeError`. Diagnose retention
  // gaps via `endo paths --json` returning `[]` for an id whose
  // formula clearly exists.
  listRetentionPaths = /** @param {any} _id */ async _id => harden([]),
  /**
   * @param {any} _id
   * @returns {AsyncGenerator<
   *   import('./retention-path-accumulator.js').RetentionPathDelta,
   *   undefined,
   *   undefined
   * >}
   */
  // eslint-disable-next-line require-yield
  followRetentionPaths = async function* _follow(_id) {
    return undefined;
  },
  traceAggregator = undefined,
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

    // Note: `inspectorId` is retained on the host formula for
    // forward-load compatibility with hosts whose formulas were
    // written before `getFormula` replaced the `@info` name hub.
    // The id no longer participates in any special-name lookup;
    // `getFormula(identifier)` is the user-facing replacement.
    // See `designs/formula-inspector.md` "Removing the `@info` name hub".
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
     * @param {ERef<PassableBytesReader>} readerRef
     * @param {NameOrPath} petName
     */
    const storeBlob = async (readerRef, petName) => {
      const { namePath } = petNamePathFrom(petName);

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
      const { namePath } = petNamePathFrom(petName);

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
      const { namePath } = petNamePathFrom(petName);

      /** @type {DeferredTasks<MountDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.mountId),
      );

      const { value } = await formulateMount(mountPath, readOnly, tasks);
      return value;
    };

    /**
     * Resolve a `Mount` capability to its host filesystem path.
     *
     * This is the privileged operation that bridges the Endo
     * capability graph and the kernel's bind-mount surface — the
     * sandbox factory (`@endo/sandbox`) calls this for every granted
     * mount before assembling the driver's `SliceSpec`.  Sandbox
     * drivers themselves never call it; only the factory does.
     * Since EndoHost is a fully privileged host-authority cap, any
     * holder of one can intentionally recover host paths for
     * daemon-minted top-level mounts. Less trusted code must receive
     * an EndoGuest or narrower powers object instead.
     *
     * The resolver rejects any cap the daemon did not mint as a
     * top-level `mount` or `scratch-mount` formula, including
     * subdirectory views minted by `Mount.lookup()` and read-only
     * attenuations minted by `Mount.readOnly()` — those exos do not
     * have a formula identifier so we cannot prove they were minted
     * by this daemon.  Callers that need to grant a subdirectory
     * should mint a fresh `provideMount(absolutePath, …)` against the
     * subdirectory's host path instead.
     *
     * @param {unknown} cap
     * @returns {Promise<string>}
     */
    const provideHostPath = async cap => {
      await null;
      // Only locally-minted mount formulas are resolvable.  CapTP
      // round-trips preserve exo identity, so a cap originating from
      // this daemon's `provideMount` / `provideScratchMount` will
      // resolve to the formula identifier it was registered against
      // even when it has been passed through a worker boundary.
      const id = getIdForRef(cap);
      if (id === undefined) {
        throw makeError(X`provideHostPath: cap is not a daemon-minted mount`);
      }
      // getMountHostPath asserts the formula is a top-level
      // `mount` / `scratch-mount` and surfaces the same structured
      // error pattern the rest of the daemon uses.
      return getMountHostPath(/** @type {FormulaIdentifier} */ (id));
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
      const { namePath } = petNamePathFrom(petName);

      /** @type {DeferredTasks<ScratchMountDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.scratchMountId),
      );

      const { value } = await formulateScratchMount(readOnly, tasks);
      return value;
    };

    /**
     * @param {unknown} value
     * @param {string} fieldName
     * @returns {string}
     */
    const requireGitCredentialString = (value, fieldName) => {
      if (typeof value !== 'string' || value.length === 0) {
        throw makeError(X`${fieldName} must be a non-empty string`);
      }
      if (value.includes('\0')) {
        throw makeError(X`${fieldName} must not contain NUL bytes`);
      }
      return value;
    };

    /** @type {EndoHost['provideGit']} */
    const provideGit = async (mountCap, petName) => {
      const { namePath } = petNamePathFrom(petName);
      const mountId = getIdForRef(mountCap);
      if (mountId === undefined) {
        throw makeError(
          X`provideGit: first argument must be a daemon-minted mount cap`,
        );
      }

      /** @type {DeferredTasks<GitDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.gitId),
      );

      const { value } = await formulateGit(mountId, tasks);
      return /** @type {EndoGit} */ (value);
    };

    /** @type {EndoHost['provideShell']} */
    const provideShell = async (mountCap, petName, policy) => {
      const { namePath } = petNamePathFrom(petName);
      const mountId = getIdForRef(mountCap);
      if (mountId === undefined) {
        throw makeError(
          X`provideShell: first argument must be a daemon-minted mount cap`,
        );
      }
      const normalizedPolicy = normalizeShellPolicy(policy);
      // A child process holds OS-level write authority over its working tree;
      // a read-only mount cannot bound that, and a "read-only shell" would
      // misrepresent the authority actually granted.  Reject it before a
      // formula is persisted (the maker re-checks at reincarnation).
      const backing = getMountBacking(mountCap);
      if (backing !== undefined && backing.readOnly) {
        throw makeError(
          X`provideShell: cannot construct a shell over a read-only mount`,
        );
      }

      /** @type {DeferredTasks<ShellDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.shellId),
      );

      const { value } = await formulateShell(mountId, normalizedPolicy, tasks);
      return value;
    };

    /** @type {EndoHost['provideBearerCredential']} */
    const provideBearerCredential = async (petName, options) => {
      const { namePath } = petNamePathFrom(petName);
      if (!options || typeof options !== 'object') {
        throw makeError(
          X`provideBearerCredential: options must include audience and token`,
        );
      }
      const audience = requireGitCredentialString(
        options.audience,
        'provideBearerCredential: audience',
      );
      const token = requireGitCredentialString(
        options.token,
        'provideBearerCredential: token',
      );

      /** @type {DeferredTasks<GitCredentialDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.gitCredentialId),
      );

      const { value } = await formulateGitCredential(
        'bearer',
        audience,
        harden({ token }),
        tasks,
      );
      return value;
    };

    /** @type {EndoHost['provideBasicCredential']} */
    const provideBasicCredential = async (petName, options) => {
      const { namePath } = petNamePathFrom(petName);
      if (!options || typeof options !== 'object') {
        throw makeError(
          X`provideBasicCredential: options must include audience, username, and password`,
        );
      }
      const audience = requireGitCredentialString(
        options.audience,
        'provideBasicCredential: audience',
      );
      const username = requireGitCredentialString(
        options.username,
        'provideBasicCredential: username',
      );
      const password = requireGitCredentialString(
        options.password,
        'provideBasicCredential: password',
      );

      /** @type {DeferredTasks<GitCredentialDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.gitCredentialId),
      );

      const { value } = await formulateGitCredential(
        'basic',
        audience,
        harden({ username, password }),
        tasks,
      );
      return value;
    };

    /** @type {EndoHost['getGitCredentialController']} */
    const getGitCredentialController = async credentialCap => {
      await null;
      const controller = getGitCredentialControllerForCap(credentialCap);
      if (controller === undefined) {
        throw makeError(
          X`getGitCredentialController: argument must be a daemon-minted Git credential cap`,
        );
      }
      return controller;
    };

    /** @type {EndoHost['getGitRemoteController']} */
    const getGitRemoteController = async remoteCap => {
      await null;
      const controller = getGitRemoteControllerForCap(remoteCap);
      if (controller === undefined) {
        throw makeError(
          X`getGitRemoteController: argument must be a daemon-minted GitRemote cap`,
        );
      }
      return controller;
    };

    /** @type {EndoHost['provideGitRemote']} */
    const provideGitRemote = async (gitCap, petName, opts) => {
      const { namePath } = petNamePathFrom(petName);
      const gitId = getIdForRef(gitCap);
      if (gitId === undefined) {
        throw makeError(
          X`provideGitRemote: first argument must be a daemon-minted Git cap`,
        );
      }
      if (isGitReadOnly(gitCap)) {
        throw makeError(
          X`provideGitRemote: cannot construct a remote from a read-only Git cap`,
        );
      }
      if (
        !opts ||
        typeof opts !== 'object' ||
        typeof opts.name !== 'string' ||
        typeof opts.url !== 'string'
      ) {
        throw makeError(
          X`provideGitRemote: options must include a string name and url`,
        );
      }
      /** @type {FormulaIdentifier | undefined} */
      let credentialId;
      if (opts.credential !== undefined) {
        credentialId = getIdForRef(opts.credential);
        if (credentialId === undefined) {
          throw makeError(
            X`provideGitRemote: credential must be a daemon-minted Git credential cap`,
          );
        }
      }
      const policy = harden({
        url: opts.url,
        allowedDirections: harden([...(opts.allowedDirections || ['fetch'])]),
        fetchRefspecs: harden([...(opts.fetchRefspecs || [])]),
        pushRefspecs: harden([...(opts.pushRefspecs || [])]),
        ...(opts.allowedBranches !== undefined
          ? { allowedBranches: harden([...opts.allowedBranches]) }
          : {}),
        ...(opts.allowForcePush !== undefined
          ? { allowForcePush: opts.allowForcePush }
          : {}),
        ...(opts.allowTags !== undefined ? { allowTags: opts.allowTags } : {}),
        ...(opts.allowDelete !== undefined
          ? { allowDelete: opts.allowDelete }
          : {}),
        ...(opts.allowLocalFileTransport !== undefined
          ? { allowLocalFileTransport: opts.allowLocalFileTransport }
          : {}),
      });

      /** @type {DeferredTasks<GitRemoteDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        E(directory).storeIdentifier(namePath, identifiers.gitRemoteId),
      );

      const { value } = await formulateGitRemote(
        gitId,
        credentialId,
        opts.name,
        policy,
        tasks,
      );
      return value;
    };

    /** @type {EndoHost['provideGitClone']} */
    const provideGitClone = async opts => {
      if (!opts || typeof opts !== 'object') {
        throw makeError(X`provideGitClone: options must be an object`);
      }
      if (typeof opts.endpoint !== 'object' || opts.endpoint === null) {
        throw makeError(X`provideGitClone: endpoint must be an object`);
      }
      const { destMount, endpoint: endpointOptions } = opts;
      const destMountId = getIdForRef(destMount);
      if (destMountId === undefined) {
        throw makeError(
          X`provideGitClone: destMount must be a daemon-minted mount cap`,
        );
      }
      const destFormula = await getFormulaForId(destMountId);
      if (
        (destFormula.type === 'mount' ||
          destFormula.type === 'scratch-mount') &&
        destFormula.readOnly
      ) {
        throw makeError(
          X`provideGitClone: destMount must be writable; read-only mounts cannot be clone destinations`,
        );
      }
      const endpointRecord =
        /** @type {{ url?: unknown, credential?: unknown, allowLocalFileTransport?: unknown }} */ (
          endpointOptions
        );
      if (typeof endpointRecord.url !== 'string') {
        throw makeError(X`provideGitClone: endpoint.url must be a string`);
      }
      if (
        endpointRecord.allowLocalFileTransport !== undefined &&
        typeof endpointRecord.allowLocalFileTransport !== 'boolean'
      ) {
        throw makeError(
          X`provideGitClone: endpoint.allowLocalFileTransport must be a boolean`,
        );
      }
      /** @type {FormulaIdentifier | undefined} */
      let credentialId;
      if (endpointRecord.credential !== undefined) {
        credentialId = getIdForRef(endpointRecord.credential);
        if (credentialId === undefined) {
          throw makeError(
            X`provideGitClone: endpoint.credential must be a daemon-minted Git credential cap`,
          );
        }
      }
      const credential =
        endpointRecord.credential === undefined
          ? undefined
          : /** @type {object} */ (endpointRecord.credential);
      const endpoint = makeGitRemoteEndpoint({
        url: endpointRecord.url,
        credential,
        allowLocalFileTransport:
          endpointRecord.allowLocalFileTransport === undefined
            ? false
            : endpointRecord.allowLocalFileTransport,
      });
      const destPath = await getMountHostPath(
        /** @type {FormulaIdentifier} */ (destMountId),
      );
      /** @type {FormulaIdentifier | undefined} */
      let clonedGitId;
      const cloner = makeGitCloner({
        endpoint,
        clone: gitClone,
        makeGit: async () => {
          /** @type {DeferredTasks<GitDeferredTaskParams>} */
          const tasks = makeDeferredTasks();
          const { value, id } = await formulateGit(destMountId, tasks);
          clonedGitId = id;
          return value;
        },
        makeRemote: async ({ endpoint: remoteEndpoint }) => {
          await null;
          if (clonedGitId === undefined) {
            throw makeError(X`provideGitClone: cloned Git id was not minted`);
          }
          const policy = harden({
            url: remoteEndpoint.url,
            allowedDirections: harden(
              /** @type {Array<'fetch' | 'push'>} */ (['fetch', 'push']),
            ),
            fetchRefspecs: harden(['+refs/heads/*:refs/remotes/origin/*']),
            pushRefspecs: harden(['refs/heads/*:refs/heads/*']),
            allowLocalFileTransport: remoteEndpoint.allowLocalFileTransport,
          });
          /** @type {DeferredTasks<GitRemoteDeferredTaskParams>} */
          const tasks = makeDeferredTasks();
          const { value } = await formulateGitRemote(
            clonedGitId,
            credentialId,
            'origin',
            policy,
            tasks,
          );
          return value;
        },
      });
      const { git, remote } = await cloner.clone({
        destMount,
        destPath,
      });
      const gitCap = /** @type {EndoGit} */ (git);
      return harden({
        git: gitCap,
        remote,
      });
    };

    /** @type {EndoHost['storeValue']} */
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

    /**
     * @param {NameOrPath} workerNamePath
     */
    const provideWorker = async workerNamePath => {
      const namePath = namePathFrom(workerNamePath);
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
     * @param {NameOrPath | undefined} workerName
     * @param {DeferredTasks<WorkerDeferredTaskParams>['push']} deferTask
     * @returns {Promise<{ workerId: FormulaIdentifier | undefined, workerLabel: string | undefined }>}
     */
    const prepareWorkerFormulation = async (workerName, deferTask) => {
      if (workerName === undefined) {
        return { workerId: undefined, workerLabel: undefined };
      }
      const workerNamePath = namePathFrom(workerName);
      // A single segment resolves against the agent's own pet store
      // (including special workers like `@main` / `@node`); a path
      // resolves through the directory, matching provideWorker.
      const workerId = /** @type {FormulaIdentifier | undefined} */ (
        workerNamePath.length === 1
          ? petStore.identifyLocal(workerNamePath[0])
          : await E(directory).identify(...workerNamePath)
      );
      if (workerId === undefined) {
        const { namePath, petName } = assertPetNamePath(workerNamePath);
        deferTask(identifiers =>
          namePath.length === 1
            ? petStore.storeIdentifier(petName, identifiers.workerId)
            : E(directory).storeIdentifier(namePath, identifiers.workerId),
        );
        return { workerId: undefined, workerLabel: petName };
      }
      return {
        workerId,
        workerLabel: workerNamePath[workerNamePath.length - 1],
      };
    };

    /**
     * Evaluate code directly in a worker.
     * @param {NameOrPath | undefined} workerName
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
      if (!Array.isArray(codeNames)) {
        throw new Error('Evaluator requires an array of code names');
      }
      for (const codeName of codeNames) {
        if (typeof codeName !== 'string') {
          throw new Error(`Invalid endowment name: ${q(codeName)}`);
        }
      }
      if (petNamePaths.length !== codeNames.length) {
        throw new Error('Evaluator requires one pet name for each code name');
      }

      /** @type {DeferredTasks<EvalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const { workerId, workerLabel: explicitLabel } =
        await prepareWorkerFormulation(workerName, tasks.push);
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
        const { namePath: resultNamePath } = petNamePathFrom(resultName);
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
     * @param {NameOrPath | undefined} workerName
     * @param {MakeCapletOptions} [options]
     */
    const prepareMakeCaplet = async (workerName, options = {}) => {
      const {
        powersName = '@none',
        resultName,
        env = {},
        workerTrustedShims,
      } = options;
      assertPowersNameOrPath(powersName);
      const powersNamePath = namePathFrom(powersName);

      /** @type {DeferredTasks<MakeCapletDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const { workerId, workerLabel } = await prepareWorkerFormulation(
        workerName,
        tasks.push,
      );

      // A single segment resolves against the agent's own pet store
      // (preserving special-name powers like `@agent`); a path resolves
      // through the directory so powers can live inside a subdirectory.
      const powersId = /** @type {FormulaIdentifier | undefined} */ (
        powersNamePath.length === 1
          ? petStore.identifyLocal(/** @type {Name} */ (powersNamePath[0]))
          : await E(directory).identify(...powersNamePath)
      );
      if (powersId === undefined) {
        const { petName: powersPetName } = assertPetNamePath(powersNamePath);
        tasks.push(identifiers =>
          powersNamePath.length === 1
            ? petStore.storeIdentifier(powersPetName, identifiers.powersId)
            : E(directory).storeIdentifier(
                powersNamePath,
                identifiers.powersId,
              ),
        );
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
      } = await prepareMakeCaplet(
        /** @type {NameOrPath | undefined} */ (effectiveWorkerName),
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
      // A single segment resolves against the agent's own pet store; a
      // path resolves the source archive through the directory.
      const archiveNamePath = namePathFrom(archiveName);
      const archiveId =
        archiveNamePath.length === 1
          ? petStore.identifyLocal(/** @type {Name} */ (archiveNamePath[0]))
          : await E(directory).identify(...archiveNamePath);
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
      } = await prepareMakeCaplet(
        /** @type {NameOrPath | undefined} */ (workerName),
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
     * Walk a ReadableTree or Mount and materialise every entry into the
     * destination Mount via `write()`, preserving blob bytes instead
     * of passing through text decoding. Children are identified by
     * their advertised method names: anything with `streamBase64` is a
     * blob/file; anything with `list` is a subtree. Both Mount and
     * ReadableTree surfaces participate.
     *
     * Why not just `E(dst).write([], src)`? `EndoMount.write()` performs
     * the same discovery shape internally, so the walker reads as
     * duplication.  It is kept here as a per-leaf seam: stageTree
     * callers (sandbox provisioning, fae/lal tool surfaces) want a
     * place to land per-entry diagnostics, progress reporting, or
     * per-leaf policy hooks without re-entering the mount's write
     * machinery.  Removing the walker in favor of a single `write()`
     * call would push any future per-leaf work back through the
     * mount-side primitive, which is the wrong site for host-level
     * concerns.
     *
     * @param {any} src - source readable-tree or mount
     * @param {any} dst - destination scratch mount (must be writable)
     * @param {string[]} [pathSegments]
     */
    const materializeTree = async (src, dst, pathSegments = []) => {
      const names = await E(src).list(...pathSegments);
      for (const name of names) {
        assertValidTreeEntryName(name);
        const subPath = [...pathSegments, name];
        // eslint-disable-next-line no-await-in-loop
        const child = await E(src).lookup(subPath);
        const methodNames =
          // eslint-disable-next-line no-await-in-loop, no-underscore-dangle
          await E(child).__getMethodNames__();
        const looksLikeBlob = methodNames.includes('streamBase64');
        const looksLikeTree = methodNames.includes('list');
        if (looksLikeBlob && looksLikeTree) {
          throw makeError(
            X`Tree entry ${q(subPath)} has both streamBase64 and list — ambiguous shape`,
          );
        } else if (looksLikeBlob || looksLikeTree) {
          // eslint-disable-next-line no-await-in-loop
          await E(dst).write(subPath, child);
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
     * @param {NameOrPath} scratchPetName
     */
    const stageTreeInternal = async (treeName, scratchPetName) => {
      // provideScratchMount validates the scratch name/path and stores it
      // through the directory, so a path nests the scratch mount.
      const scratchNamePath = namePathFrom(scratchPetName);
      const treeNamePath = namePathFrom(/** @type {NameOrPath} */ (treeName));
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
      // caplet. ReadableTrees are already immutable. Older mounts
      // may still reject snapshot(), so keep the live-walk fallback
      // for compatibility with remote or stale providers.
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
      const scratchMount = await provideScratchMount(scratchNamePath);
      await materializeTree(sourceForWalk, scratchMount, []);
      // Resolve the scratch mount's identifier after it's been stored
      // by the deferred pet-store task inside provideScratchMount.
      const scratchId = await E(directory).identify(...scratchNamePath);
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
        /** @type {NameOrPath} */ (scratchPetName),
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
              const r = Math.floor(Math.random() * 0xff_ffff);
              return r.toString(16);
            })()}`;
      // Scratch mount carries a derived pet name so the caller can
      // observe / cancel it explicitly if desired.
      const scratchPetName = `scratch-${resultLabel}`;
      const { scratchId } = await stageTreeInternal(
        treeName,
        /** @type {NameOrPath} */ (scratchPetName),
      );
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
      } = await prepareMakeCaplet(
        /** @type {NameOrPath | undefined} */ (workerName),
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
     * @param {NameOrPath} [nameOrPath] - The agent's potential pet name or
     * directory path.
     * @param {T} [type]
     */
    const getNamedAgent = async (nameOrPath, type) => {
      if (nameOrPath !== undefined) {
        const namePath = namePathFrom(nameOrPath);
        // A single segment resolves against the agent's own pet store; a
        // path resolves through the directory so an agent can be named
        // (and found again, idempotently) inside a subdirectory.
        const id =
          namePath.length === 1
            ? petStore.identifyLocal(namePath[0])
            : await E(directory).identify(...namePath);
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
     * @param {NameOrPath} [handleName] - The pet name or directory path of
     * the handle.
     * @param {NameOrPath} [agentName] - The pet name or directory path of
     * the agent.
     */
    const getDeferredTasksForAgent = (handleName, agentName) => {
      /** @type {DeferredTasks<AgentDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      if (handleName !== undefined) {
        const { namePath: handlePath, petName: handlePetName } =
          petNamePathFrom(handleName);
        tasks.push(identifiers =>
          handlePath.length === 1
            ? petStore.storeIdentifier(handlePetName, identifiers.handleId)
            : E(directory).storeIdentifier(handlePath, identifiers.handleId),
        );
      }
      if (agentName !== undefined) {
        const { namePath: agentPath, petName: agentPetName } =
          petNamePathFrom(agentName);
        tasks.push(identifiers =>
          agentPath.length === 1
            ? petStore.storeIdentifier(agentPetName, identifiers.agentId)
            : E(directory).storeIdentifier(agentPath, identifiers.agentId),
        );
      }
      return tasks;
    };

    /**
     * @param {NameOrPath} [petName]
     * @param {MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{id: FormulaIdentifier, value: Promise<EndoHost>}>}
     */
    const makeChildHost = async (
      petName,
      { introducedNames = Object.create(null), agentName = undefined } = {},
    ) => {
      let host = await getNamedAgent(petName, 'host');
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
              /** @type {NameOrPath | undefined} */ (agentName),
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
        petNamePathFrom(petName);
      }
      const normalizedOpts = normalizeHostOrGuestOptions(opts);
      const { value } = await makeChildHost(
        /** @type {NameOrPath | undefined} */ (petName),
        normalizedOpts,
      );
      return value;
    };

    /**
     * @param {NameOrPath} [handleName]
     * @param {MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{id: FormulaIdentifier, value: Promise<EndoGuest>}>}
     */
    const makeGuest = async (
      handleName,
      { introducedNames = Object.create(null), agentName = undefined } = {},
    ) => {
      let guest = await getNamedAgent(handleName, 'guest');
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
              /** @type {NameOrPath | undefined} */ (agentName),
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
        petNamePathFrom(petName);
      }
      const normalizedOpts = normalizeHostOrGuestOptions(opts);
      const { value } = await makeGuest(
        /** @type {NameOrPath | undefined} */ (petName),
        normalizedOpts,
      );
      return value;
    };

    /**
     * Create a timer that fires at a specified interval.
     *
     * @param {NameOrPath} petName - Pet name or path to store the timer under
     * @param {number} intervalMs - Interval in milliseconds
     * @param {string} [label] - Optional label for the timer
     */
    const makeTimerCmd = async (petName, intervalMs, label) => {
      const { namePath, petName: timerPetName } = petNamePathFrom(petName);
      /** @type {DeferredTasks<{ timerId: import('./types.js').FormulaIdentifier }>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        namePath.length === 1
          ? petStore.storeIdentifier(timerPetName, identifiers.timerId)
          : E(directory).storeIdentifier(namePath, identifiers.timerId),
      );
      const { value } = await formulateTimer(
        Number(intervalMs),
        label || timerPetName,
        tasks,
      );
      return value;
    };

    /**
     * Create a new channel and store it under the given pet name.
     * @param {NameOrPath} petName - Pet name or path to store the channel under.
     * @param {string} channelProposedName - Display name for the channel creator.
     */
    const makeChannelCmd = async (petName, channelProposedName) => {
      const { namePath, petName: channelPetName } = petNamePathFrom(petName);
      /** @type {DeferredTasks<ChannelDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        namePath.length === 1
          ? petStore.storeIdentifier(channelPetName, identifiers.channelId)
          : E(directory).storeIdentifier(namePath, identifiers.channelId),
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
     * @param {NameOrPath} guestName
     */
    const invite = async guestName => {
      const { namePath, petName: guestPetName } = petNamePathFrom(guestName);
      // We must immediately retain a formula under guestName so that we
      // preserve the invitation across restarts, but we must replace the
      // guestName with the handle of the guest that accepts the invitation.
      // We need to return the locator for the invitation regardless of what
      // we store.
      // Overwriting the guestName must cancel the pending invitation (consume
      // once) so that the invitation can no longer modify the petStore entry
      // for the guestName.
      // A path nests the invitation (and, once redeemed, the guest)
      // inside a directory; the parent directory must already exist.
      /** @type {DeferredTasks<InvitationDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        namePath.length === 1
          ? petStore.storeIdentifier(guestPetName, identifiers.invitationId)
          : E(directory).storeIdentifier(namePath, identifiers.invitationId),
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
     * @param {NameOrPath} guestName
     */
    const accept = async (invitationLocator, guestName) => {
      // A path nests the accepted guest inside a directory; the parent
      // directory must already exist.
      const { namePath: guestNamePath, petName: guestLeaf } =
        petNamePathFrom(guestName);
      const {
        number: invitationNumber,
        node: peerKey,
        hints,
      } = parseLocator(invitationLocator);
      const url = new URL(invitationLocator);
      const remoteHandleNumber = url.searchParams.get('from');
      // The remote handle's node may differ from the peer key when
      // agent keys are used as formula nodes.
      const remoteHandleNodeParam = url.searchParams.get('fromNode');

      if (!remoteHandleNumber) {
        throw makeError(`Invitation must have a "from" parameter`);
      }
      assertFormulaNumber(remoteHandleNumber);

      /** @type {PeerInfo} */
      const peerInfo = {
        node: peerKey,
        addresses: hints,
      };
      // eslint-disable-next-line no-use-before-define
      await addPeerInfo(peerInfo);

      // Register the remote agent key so we can route to its daemon.
      if (remoteHandleNodeParam && remoteHandleNodeParam !== peerKey) {
        writeRemoteAgentKey(remoteHandleNodeParam, peerKey);
      }

      const invitationId = formatId({
        number: invitationNumber,
        node: peerKey,
      });

      const { number: handleNumber, node: handleNode } = parseId(handleId);
      // eslint-disable-next-line no-use-before-define
      const { addresses: hostAddresses } = await getPeerInfo();
      const handleLocatorWithoutHandleNode = formatLocatorWithHints(
        formatId({ number: handleNumber, node: localNodeNumber }),
        'handle',
        hostAddresses,
      );
      const handleUrl = new URL(handleLocatorWithoutHandleNode);
      // Include the handle's node if it differs from the daemon node
      // (i.e. it uses an agent key).
      if (handleNode !== localNodeNumber) {
        handleUrl.searchParams.set('handleNode', handleNode);
      }
      const handleLocator = handleUrl.href;

      const invitation = await provide(invitationId, 'invitation');
      // The remote invitation ignores this name (`_hostNameFromGuest`),
      // so the leaf pet name suffices for the protocol.
      await E(invitation).accept(handleLocator, guestLeaf);

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
        `guest:${guestLeaf}`,
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
        ['@pins', `guest-${guestLeaf}`],
        localGuestFormula.handle,
      );
      await unpinTransient(localGuestFormula.handle);

      // Store the remote handle under guestName for mail delivery.
      // Use the handle's actual node (which may be an agent key) if
      // provided, falling back to the daemon node.
      const remoteHandleNode = remoteHandleNodeParam || peerKey;
      const remoteHandleId = formatId({
        number: /** @type {import('./types.js').FormulaNumber} */ (
          remoteHandleNumber
        ),
        node: /** @type {import('./types.js').NodeNumber} */ (remoteHandleNode),
      });
      const remoteHandleLocator = formatLocator(remoteHandleId, 'handle');
      await E(directory).storeLocator(guestNamePath, remoteHandleLocator);
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

    /** @type {EndoHost['locateWithHints']} */
    const locateWithHints = async (...petNamePath) => {
      return E(directory).locate(...petNamePath);
    };

    /** @type {EndoHost['adoptFromLocator']} */
    const adoptFromLocator = async (locator, petNameOrPath) => {
      const { namePath } = petNamePathFrom(petNameOrPath);
      const { id, hints } = internalizeLocator(locator);
      if (hints.length > 0) {
        const { node: nodeNumber } = parseId(id);
        /** @type {PeerInfo} */
        const peerInfo = {
          node: nodeNumber,
          addresses: hints,
        };
        await addPeerInfo(peerInfo);
      }
      await E(directory).storeIdentifier(namePath, id);
    };

    /**
     * Retrieve the formula record for a local formula identifier.
     *
     * Per `designs/formula-inspector.md`, this is the host-only
     * replacement for the prior `@info` name hub. The identifier must
     * name a formula this daemon hosts locally — either on its own node
     * or under one of the agent keys it holds (`isLocalKey`); locators
     * on genuinely remote peers are rejected with a clear error.
     *
     * @param {FormulaIdentifier} identifier
     * @returns {Promise<FormulaRecord>}
     */
    const getFormula = async identifier => {
      await null;
      if (typeof identifier !== 'string') {
        throw new TypeError(
          `getFormula requires a formula identifier string, got ${q(identifier)}`,
        );
      }
      const { number, node } = parseId(identifier);
      if (!isLocalKey(node)) {
        throw new Error(
          `getFormula rejects cross-peer locators: ${q(identifier)}`,
        );
      }
      let formula;
      try {
        formula = await getFormulaForId(
          /** @type {FormulaIdentifier} */ (identifier),
        );
      } catch (err) {
        // Normalize the persistence-layer "No reference exists at path
        // ..." `ReferenceError` (and any other read failure) into a
        // surface-level error that cites the requested identifier
        // rather than the on-disk path. The persistence-layer message
        // leaks the filesystem layout and does not name the input the
        // caller used.
        const cause = /** @type {Error} */ (err);
        throw makeError(
          `getFormula could not resolve unknown identifier: ${q(identifier)}`,
          undefined,
          { cause },
        );
      }
      // A scratch-mount carries no path on disk; resolve the daemon-
      // managed host path so the formula record can surface it. Other
      // formula types (including `mount`, whose path lives in the
      // formula itself) need no host-side resolution here.
      let mountHostPath;
      if (formula.type === 'scratch-mount') {
        mountHostPath = getMountHostPath(
          /** @type {FormulaIdentifier} */ (identifier),
        );
      }
      return makeFormulaRecord(formula, number, { mountHostPath });
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
      editMessage,
      messageHistory,
    } = mailbox;

    /**
     * Look up a value by its formula identifier.
     * @param {FormulaIdentifier} id - The formula identifier.
     * @returns {Promise<unknown>} The value.
     */
    const lookupById = async id => provide(id);

    /**
     * Look up a value by an `endo://` locator. Mail attachments are delivered
     * as locators (the portable, cross-node form), so this is what callers use
     * to resolve an attachment reference.
     * @param {string} locator - An `endo://` locator.
     * @returns {Promise<unknown>} The value.
     */
    const lookupByLocator = async locator => provide(idFromLocator(locator));

    /** @type {EndoHost['endow']} */
    const endow = async (messageNumber, bindings, workerName, resultName) => {
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
      const { workerId } = await prepareWorkerFormulation(
        /** @type {NameOrPath | undefined} */ (workerName),
        tasks.push,
      );

      if (resultName !== undefined) {
        const { namePath: resultNamePath } = petNamePathFrom(resultName);
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
     * Returns the privileged trace facet for this daemon. The facet is
     * a fresh Exo each call so that pet-store revocation tracks per
     * call site, but the underlying aggregator is shared across all
     * facets the daemon hands out.
     */
    const traces = async () => {
      if (traceAggregator === undefined) {
        throw makeError(
          X`The error-trace aggregator is unavailable in this daemon`,
        );
      }
      return makeExo('EndoTraces', TracesInterface, {
        help: () =>
          'Privileged error-trace lookup. Use lookup(errorId) to fetch a trace report, recent({workerId, limit}) for a recent list, clear() to drop everything, stats() for accounting.',
        /** @param {string} errorId */
        lookup: async errorId => traceAggregator.lookup(errorId),
        /**
         * @param {{ workerId?: string, limit?: number }} [opts]
         */
        recent: async opts => traceAggregator.recent(opts),
        /** @param {string} [workerId] */
        clear: async workerId => traceAggregator.clear(workerId),
        stats: async () => traceAggregator.stats(),
      });
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

    /**
     * Snapshot every retention path from a GC root to the target,
     * named by an endo:// locator. Pet-store edges along each path
     * render as `pet:<name>` labels by reverse-resolving the
     * referencing store's name table; other labels (field names,
     * `retention`, `transient`) pass through. See
     * `designs/daemon-retention-paths.md` § Notation.
     *
     * @param {string} locator
     * @returns {Promise<import('./graph.js').RetentionPath[]>}
     */
    const listRetentionPathsForHost = async locator => {
      const { id } = internalizeLocator(locator);
      return listRetentionPaths(
        /** @type {import('./types.js').FormulaIdentifier} */ (id),
      );
    };

    /**
     * Subscribe to retention-path changes for the target locator.
     * First delta is a `{ snapshot }`; subsequent deltas are
     * `{ added, removed }` diffs over a microtask-coalesced batch
     * window. Drop the returned far reference to release the
     * subscription, matching `followNameChanges` /
     * `followLocatorNameChanges`.
     *
     * @param {string} locator
     * @returns {AsyncGenerator<
     *   import('./retention-path-accumulator.js').RetentionPathDelta,
     *   undefined,
     *   undefined
     * >}
     */
    const followRetentionPathsForHost =
      async function* followRetentionPathsForHost(locator) {
        const { id } = internalizeLocator(locator);
        yield* followRetentionPaths(
          /** @type {import('./types.js').FormulaIdentifier} */ (id),
        );
        return undefined;
      };

    /**
     * Returns the privileged diagnostics facet for this daemon: formula
     * records, the formula dependency graph, and the error-trace
     * aggregator. A fresh Exo each call so that pet-store revocation
     * tracks per call site, while the underlying functions and trace
     * aggregator are shared across all facets the daemon hands out.
     */
    const diagnostics = async () =>
      // Cast as for the host exo below: `getFormula` takes a branded
      // `FormulaIdentifier`, which the `IdShape` (plain string) method
      // guard cannot express, so the exo methods cannot be checked
      // structurally against the guard.
      /** @type {EndoDiagnostics} */ (
        makeExo(
          'EndoDiagnostics',
          DiagnosticsInterface,
          /** @type {any} */ ({
            help: () =>
              'Privileged read-only diagnostics. Use getFormula(id) for a formula record, getFormulaGraph() for the dependency graph reachable from this agent, and traces() for the error-trace aggregator.',
            getFormula,
            getFormulaGraph,
            traces,
          }),
        )
      );

    /** @type {EndoHost} */
    const host = {
      // Directory
      has,
      identify,
      reverseIdentify,
      lookupById,
      lookupByLocator,
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
      editMessage,
      messageHistory,
      form,
      // Host
      storeBlob,
      storeValue,
      storeTree,
      provideMount,
      provideScratchMount,
      provideGit,
      provideShell,
      provideGitRemote,
      provideGitClone,
      provideBearerCredential,
      provideBasicCredential,
      getGitCredentialController,
      getGitRemoteController,
      provideHostPath,
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
      locateWithHints,
      adoptFromLocator,
      deliver,
      makeChannel: makeChannelCmd,
      makeTimer: makeTimerCmd,
      invite,
      accept,
      endow,
      submit,
      sendValue,
      // Diagnostics (formula records, dependency graph, error traces)
      diagnostics,
      listRetentionPaths: listRetentionPathsForHost,
      followRetentionPaths: followRetentionPathsForHost,
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
          return readerFromIterator(iterator);
        },
        followMessages: async () => {
          const iterator = host.followMessages();
          return readerFromIterator(/** @type {any} */ (iterator));
        },
        followNameChanges: async () => {
          const iterator = host.followNameChanges();
          return readerFromIterator(iterator);
        },
        followPeerChanges: async () => {
          const iterator = await host.followPeerChanges();
          return readerFromIterator(iterator);
        },
        /** @param {string} locator */
        followRetentionPaths: async locator => {
          const iterator = host.followRetentionPaths(locator);
          return readerFromIterator(iterator);
        },
      }),
    );

    await provide(mainWorkerId, 'worker');
    await provide(nodeWorkerId, 'worker');

    return hostExo;
  };

  return makeHost;
};
harden(makeHostMaker);
