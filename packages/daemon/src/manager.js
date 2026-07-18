// @ts-check
/** @import { EndoGit, WritableGitWorktree } from '@endo/exo-git' */
/* eslint-disable no-await-in-loop */
/* global clearTimeout, globalThis, process, setTimeout */

import harden from '@endo/harden';
import { makeExo } from '@endo/exo';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { makeMarshal } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { makeError, q, X } from '@endo/errors';
import { ZipWriter } from '@endo/zip/writer.js';
import { encodeBase64 } from '@endo/base64';
import { mapReader } from '@endo/stream';
import { bytesFromText } from '@endo/bytes/from-string.js';
import { bytesToText } from '@endo/bytes/to-string.js';
import {
  checkinTree as platformCheckinTree,
  snapshotTreeMethods,
} from '@endo/platform/fs/lite';
import { toSafeNumber } from '@endo/platform/fs/extended/shared/helpers.js';
import { makeNativeGitBackend } from '@endo/git';
import {
  makeBasicCredential,
  makeBearerCredential,
  makeGit,
  makeGitRemote,
  makeUnavailableGitCredential,
} from '@endo/exo-git';
import { makeShell } from '@endo/exo-shell';
import { makeHostSpawner } from '@endo/host-spawner';
import { makeHttpClientAndControl } from '@endo/exo-http-client';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { makeReaderPump } from '@endo/exo-stream/reader-pump.js';
import { checkinTarTree } from './tar-checkin.js';
import { makeDirectoryMaker } from './directory.js';
import { makeContentDataPlaneRegistry } from './content-data-plane.js';
import { makeDeferredTasks } from './deferred-tasks.js';
import { assertMailboxStoreName, makeMailboxMaker } from './mail.js';
import { makeGuestMaker } from './guest.js';
import { makeChannelMaker } from './channel.js';
import { makeHostMaker } from './host.js';
import { makeRemoteControlProvider } from './remote-control.js';
import {
  assertName,
  assertNamePath,
  assertNames,
  assertPetName,
  namePathFrom,
} from './pet-name.js';
import {
  formatLocator,
  idFromLocator,
  internalizeLocator,
  externalizeId,
} from './locator.js';
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
import { makeChangeTopic } from './pubsub.js';
import { makeRetentionAccumulator } from './retention-accumulator.js';
import { makeRetentionPathAccumulator } from './retention-path-accumulator.js';
import { makeResidenceTracker } from './residence.js';
import { toHex, fromHex } from './hex.js';
import { makeSerialJobs } from './serial-jobs.js';
import { makeLocalStoreController } from './store-controller.js';
import { makeWeakMultimap } from './multimap.js';
import { makeLoopbackNetwork } from './networks/loopback.js';
import { assertValidFormulaType } from './formula-type.js';
import {
  blobHelp,
  directoryHelp,
  endoHelp,
  guestHelp,
  makeHelp,
  readableTreeHelp,
} from './help-text.js';
import { getMountBacking, lineageOf, makeRevocableMount } from './mount.js';

// Sorted:
import {
  DaemonFacetForWorkerInterface,
  GuestInterface,
  InspectorHubInterface,
  InspectorInterface,
  InvitationInterface,
  PeerGatewayInterface,
  ResponderInterface,
  WorkerInterface,
  DirectoryInterface,
  BlobInterface,
  ReadableTreeInterface,
  EndoInterface,
} from './interfaces.js';
import { makeTraceAggregator } from './trace-aggregator.js';
import { getUnredactedStackString } from './unredacted-stack.js';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef, FarRef } from '@endo/eventual-send' */
/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { ReadableBlobRange, SnapshotTree } from '@endo/platform/fs/lite/types' */
/** @import { ArchiveTreeMethods } from './tar-checkin.js' */
/** @import { AgentDeferredTaskParams, Builtins, CapTpConnectionRegistrar, Context, Controller, DaemonCore, DaemonCoreExternal, DaemonicPowers, DeferredTasks, DirectoryFormula, EndoBootstrap, EndoDirectory, EndoFormula, EndoGateway, EndoGreeter, EndoGuest, EndoHost, EndoInspector, EndoMount, EndoNetwork, EndoPeer, EndoReadable, EndoWorker, EvalFormula, FarContext, Formula, FormulaIdentifier, FormulaNumber, FormulaMakerTable, FormulateResult, GuestFormula, HandleFormula, HostFormula, Invitation, InvitationDeferredTaskParams, InvitationFormula, KnownEndoInspectors, KnownPeersStore, LogChunk, LookupFormula, LoopbackNetworkFormula, MailboxStoreFormula, MailHubFormula, MakeArchiveFormula, MakeCapletDeferredTaskParams, MakeFromTreeFormula, MakeUnconfinedFormula, MarshalDeferredTaskParams, MessageFormula, Name, NameHub, NamePath, NameOrPath, NodeNumber, PetName, PeerFormula, PeerInfo, PetInspectorFormula, PetStore, PetStoreFormula, PromiseFormula, Provide, ReadableBlobFormula, ResolverFormula, Sha256, Specials, MarshalFormula, WeakMultimap, WorkerDaemonFacet, WorkerFormula, TimerFormula } from './types.js' */

/**
 * @typedef {{ kind: 'bearer', token: string } | { kind: 'basic', username: string, password: string }} GitCredentialMaterial
 */

/**
 * The daemon's filesystem content store always surfaces the optional `size` /
 * `readRange` members of the host-side `ContentStoreBlob`, so its `fetch`
 * result can be narrowed to require them.
 * This backing value is consumed here to implement the public `EndoBlob` Exo;
 * it is never exposed over CapTP.
 *
 * @typedef {import('@endo/platform/fs/lite/types').ContentStoreBlob & {
 *   size: () => Promise<bigint>,
 *   readRange: (offset: number, length: number) => Promise<Uint8Array>,
 * }} DaemonContentStoreBlob
 */

/**
 * Wrap a byte range as a `PassableBytesReader`, the CapTP-passable bytes
 * stream `BlobRef.fetch` returns. Empty ranges yield a reader that is
 * immediately done. Mirrors the extended layer's `makeBytesReaderFromBytes`.
 *
 * @param {Uint8Array} bytes
 */
const bytesFromRange = bytes => {
  function* generator() {
    if (bytes.length > 0) {
      yield bytes;
    }
  }
  return bytesReaderFromIterator(generator());
};
harden(bytesFromRange);

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 */
const parseTraceEnvironmentNumber = (raw, fallback) => {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
};

/**
 * Extract the wire-level errorId stamped onto a decoded error by
 * `@endo/marshal`'s `decodeErrorCommon`. Falls back to scraping the
 * SES error tag (the parenthesized form of `err.name`) for
 * environments where the marshal patch is unavailable.
 *
 * @param {Error & { errorId?: string }} err
 * @returns {string | undefined}
 */
const extractInboundErrorId = err => {
  if (!err) return undefined;
  if (typeof err.errorId === 'string') return err.errorId;
  if (typeof err.name !== 'string') return undefined;
  const m = /\(error:[^)]+\)/.exec(err.name);
  if (m === null) return undefined;
  return m[0].slice(1, -1);
};

/**
 * Construct a `marshalSaveError` hook that the daemon installs on its
 * outbound CapTP connections. On every outbound error the daemon
 * forwards, the hook checks the WeakMap of worker-decoded errors and,
 * if the error came from a worker, registers an alias from the
 * outbound errorId to the worker-side `(workerId, errorId)` record.
 * If the error came from the daemon itself, records a stub trace.
 *
 * @param {ReturnType<typeof makeTraceAggregator>} aggregator
 * @param {WeakMap<Error, { workerId: string, errorId: string }>} inboundOrigin
 */
const makeOutboundMarshalSaveError =
  (aggregator, inboundOrigin) =>
  /**
   * @param {Error} err
   * @param {string} [outboundErrorId]
   */
  (err, outboundErrorId) => {
    if (outboundErrorId === undefined) return;
    const origin = inboundOrigin.get(err);
    if (origin !== undefined) {
      aggregator.alias({
        workerId: origin.workerId,
        errorId: origin.errorId,
        aliasErrorId: outboundErrorId,
      });
      return;
    }
    const inboundErrorId = extractInboundErrorId(err);
    if (inboundErrorId !== undefined) {
      aggregator.aliasByErrorId(inboundErrorId, outboundErrorId);
      return;
    }
    // Daemon-internal error with no preceding worker push. Record a
    // stub so `lookup(outboundErrorId)` at least returns something
    // with the daemon-side context. The daemon itself runs in the
    // start compartment, so `getUnredactedStackString` taps SES's
    // privileged unredaction hook (the same one `@endo/ses-ava` uses)
    // and returns the full unredacted rendering rather than the
    // redacted `err.stack` view.
    aggregator.record('@daemon', {
      errorId: outboundErrorId,
      workerId: '@daemon',
      name: typeof err.name === 'string' ? err.name : 'Error',
      message: typeof err.message === 'string' ? err.message : `${err}`,
      stack: getUnredactedStackString(err),
      annotations: [],
      causes: [],
      t: Date.now(),
      site: 'daemon',
    });
  };

/**
 * Creates a delayed promise that can be cancelled.
 *
 * This function creates a timeout that resolves after the specified number of milliseconds.
 * If cancelled, the promise will be rejected
 * with the cancellation reason
 * after the grace period
 * (or immediately if already cancelled).
 *
 * @param {number} ms - The number of milliseconds to delay before resolving.
 * @param {Promise<never>} cancelled - A promise that resolves/rejects when cancelled.
 * @returns {Promise<void>} A promise that resolves after the delay or rejects if cancelled.
 *
 * @example
 * ```js
 * const cancelled = makePromiseKit();
 * await delay(5000, cancelled.promise);
 * ```
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
  makeExo(
    `Inspector (${type} ${number})`,
    InspectorInterface,
    /** @type {any} */ ({
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
    }),
  );

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
 * Derives a unique ID by digesting the path with the root nonce.
 *
 * This function creates a deterministic ID from a path and root nonce using
 * the provided digester.
 * The root nonce is first added to the digester, followed by the path.
 *
 * @param {string} path - The path to derive the ID from.
 * @param {string} rootNonce - The root nonce to use as a base for derivation.
 * @param {Sha256} digester - A SHA256 digester instance
 * @returns {string} The hex digest ID derived from the path and root nonce.
 *
 * @example
 * ```js
 * const digester = makeSha256();
 * const id = deriveId('/my/path', 'root-123', digester);
 * ```
 */
const deriveId = (path, rootNonce, digester) => {
  digester.updateText(rootNonce);
  digester.updateText(path);
  return digester.digestHex();
};

const messageNumberNamePattern = /^(0|[1-9][0-9]*)$/;
const MESSAGE_FROM_NAME = '@from';
const MESSAGE_TO_NAME = '@to';
const MESSAGE_DATE_NAME = '@date';
const MESSAGE_TYPE_NAME = '@type';
const MESSAGE_ID_NAME = '@message';
const MESSAGE_REPLY_TO_NAME = '@reply';
const MESSAGE_DESCRIPTION_NAME = '@description';
const MESSAGE_STRINGS_NAME = '@strings';
const MESSAGE_PROMISE_NAME = '@promise';
const MESSAGE_RESOLVER_NAME = '@resolver';

/**
 * Checks if a string is a valid message number.
 *
 * Message numbers are non-negative integers without leading zeros.
 *
 * @param {string} name - The string to check.
 * @returns {boolean} True if the string is a valid message number.
 *
 * @example
 * ```js
 * console.log(isMessageNumberName('0'));    // true
 * console.log(isMessageNumberName('5'));    // true
 * console.log(isMessageNumberName('10'));   // true
 * console.log(isMessageNumberName('01'));   // false
 * console.log(isMessageNumberName('-1'));   // false
 * ```
 */
const isMessageNumberName = name => messageNumberNamePattern.test(name);

/**
 * Compares two message names for ordering.
 *
 * This function compares message names as numeric values.
 * It returns -1 if the first name is less than the second, 1 if greater, and 0 if equal.
 * The comparison uses BigInt to handle potentially large message numbers.
 *
 * @param {string} left - The first message name to compare.
 * @param {string} right - The second message name to compare.
 * @returns {number} -1 if left < right, 1 if left > right, or 0 if equal.
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
 * Creates the core daemon infrastructure with formula graph management.
 *
 * This function sets up the fundamental components of an Endo daemon, including:
 * - Formula graph serialization and persistence
 * - Worker termination management
 * - Built-in formula references (ENDO, NONE, MAIN)
 * - Special formula support for user-defined entities
 * - Inspectors for accessing formula graph contents
 *
 * The daemon maintains a persistent formula graph that is loaded from storage on startup.
 * All formula mutations (formulation, removal, provision, cancellation) are
 * serialized to prevent concurrent modifications.
 *
 * @param {DaemonicPowers} powers - The daemon powers including crypto,
 * petStore, persistence, and control capabilities.
 * @param {FormulaNumber} rootEntropy - A root entropy value used for deriving
 * formula IDs for this daemon instance.
 * @param {object} args
 * @param {(error: Error) => void} args.cancel - Function to call when daemon needs to cancel.
 * @param {number} args.gracePeriodMs - Grace period in milliseconds for worker shutdown.
 * @param {Specials} args.specials - Map of special names to formula generators.
 * @param {Promise<never>} args.gracePeriodElapsed - A promise that resolves/cancels when the grace period expires.
 * @param {NodeNumber} args.localNodeNumber - The local node number for this daemon.
 * @param {(bytes: Uint8Array) => Uint8Array} args.signBytes - Sign bytes with the daemon's root Ed25519 key.
 * @param {boolean} [args.gcEnabled] - Enable garbage collection of worker daemons.
 * @param {'locked' | 'node'} [args.defaultWorkerKind] - Default kind for newly formulated workers (defaults to 'node').
 *
 * @example
 * ```js
 * const core = await makeDaemonCore(powers, 'entropy-abc123', {
 *   cancel: onError,
 *   gracePeriodMs: 5000,
 *   gracePeriodElapsed: onCancelled,
 *   specials: mySpecials,
 *   localNodeNumber: 'node-123'
 * });
 * ```
 */
const makeDaemonCore = async (
  powers,
  rootEntropy,
  {
    cancel,
    gracePeriodMs,
    gracePeriodElapsed,
    specials,
    localNodeNumber,
    signBytes,
    gcEnabled = true,
    defaultWorkerKind = 'node',
  },
) => {
  const {
    crypto: cryptoPowers,
    petStore: petStorePowers,
    persistence: persistencePowers,
    control: controlPowers,
    filePowers,
  } = powers;
  const { randomHex256, generateEd25519Keypair } = cryptoPowers;
  const contentStore = persistencePowers.makeContentStore();
  /** @type {WeakMap<object, ERef<WorkerDaemonFacet>>} */
  const workerDaemonFacets = new WeakMap();
  /** @type {Map<string, (reason?: Error) => Promise<void>>} */
  const workerTerminationByNumber = new Map();
  /**
   * Side WeakMap that the daemon's per-worker CapTP populates via its
   * `marshalLoadError` hook: each decoded error from a worker is
   * stamped with `{ workerId, errorId }` so the daemon's outbound
   * CLI-facing `marshalSaveError` can register an alias entry from
   * the new daemon-minted errorId to the worker's already-aggregated
   * record.
   *
   * @type {WeakMap<Error, { workerId: string, errorId: string }>}
   */
  const inboundErrorOrigin = new WeakMap();

  /**
   * In-process aggregator for error traces pushed by workers and
   * minted by the daemon's outbound CapTP. Configurable via
   * ENDO_TRACE_RECORDS, ENDO_TRACE_BYTES, ENDO_TRACE_WORKERS.
   */
  const traceAggregator = makeTraceAggregator({
    // eslint-disable-next-line no-undef
    maxRecordsPerWorker: parseTraceEnvironmentNumber(
      // eslint-disable-next-line no-undef
      typeof process !== 'undefined'
        ? process.env.ENDO_TRACE_RECORDS
        : undefined,
      1024,
    ),
    maxBytes: parseTraceEnvironmentNumber(
      // eslint-disable-next-line no-undef
      typeof process !== 'undefined' ? process.env.ENDO_TRACE_BYTES : undefined,
      8 * 1024 * 1024,
    ),
    maxWorkers: parseTraceEnvironmentNumber(
      // eslint-disable-next-line no-undef
      typeof process !== 'undefined'
        ? process.env.ENDO_TRACE_WORKERS
        : undefined,
      64,
    ),
  });
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
   * Async cleanup work scheduled by onCollect. Drained by
   * withFormulaGraphLock after each graph mutation completes.
   *
   * @type {Array<() => Promise<void>>}
   */
  const pendingCollectionCleanup = [];
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
    let result;
    try {
      result = await formulaGraphJobs.enqueue(asyncFn);
    } finally {
      formulaGraphLockDepth -= 1;
    }
    // Drain any async collection cleanup scheduled during this
    // graph operation. This runs AFTER the serial job token is
    // released so that cleanup operations that need the lock
    // (e.g., CapTP messages triggering graph mutations on a
    // remote callback) can acquire it without deadlock.
    // eslint-disable-next-line no-use-before-define
    await drainCollectionCleanup();
    return result;
  };
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
      deriveId(derivation, rootEntropy, cryptoPowers.makeSha256())
    );
    const id = formatId({
      number: formulaNumber,
      node: localNodeNumber,
    });
    await persistencePowers.writeFormula(
      formulaNumber,
      localNodeNumber,
      formula,
    );
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
   * Publishes `{ add: formulaNumber, node }` when a formula is
   * added and `{ remove: formulaNumber, node }` when collected.
   * Used by `followRetentionSet` to stream retention changes to
   * connected peers.
   * @type {import('./types.js').Topic<{ add?: string, remove?: string, node: string }>}
   */
  const formulaChangeTopic = makeChangeTopic();

  // eslint-disable-next-line no-undef
  const lifecycleLogEnabled =
    typeof process === 'undefined' || process.env.ENDO_LIFECYCLE_LOG !== '0';
  const lifecycleT0 = Date.now();
  /**
   * @param {FormulaIdentifier} id
   * @param {string} event
   * @param {string} [detail]
   */
  const logLifecycle = (id, event, detail = '') => {
    if (!lifecycleLogEnabled) {
      return;
    }
    const elapsed = Date.now() - lifecycleT0;
    const formula = formulaForId.get(id);
    const type = formula?.type || '?';
    console.log(
      `T+${elapsed}ms\t${id.slice(0, 12)}\t${type}\t${event}\t${detail}`,
    );
  };

  /**
   * Returns [label, id] pairs for each dependency of a formula,
   * providing meaningful edge labels (e.g. "worker", "handle") for the
   * graph snapshot.
   *
   * @param {Formula} formula
   * @returns {Array<[string, FormulaIdentifier]>}
   */
  const extractLabeledDeps = formula => {
    switch (formula.type) {
      case 'endo':
        return [
          ['networks', formula.networks],
          ['pins', formula.pins],
          ['peers', formula.peers],
          ['host', formula.host],
          ['leastAuthority', formula.leastAuthority],
        ];
      case 'channel':
        return [
          ['handle', formula.handle],
          ['creator', formula.creatorAgent],
          ['messages', formula.messageStore],
          ['members', formula.memberStore],
        ];
      case 'host':
        return [
          ['handle', formula.handle],
          ['hostHandle', formula.hostHandle],
          ['mainWorker', formula.mainWorker],
          ['nodeWorker', formula.nodeWorker],
          ['inspector', formula.inspector],
          ['petStore', formula.petStore],
          ['mailbox', formula.mailboxStore],
          ['mailHub', formula.mailHub],
          ['endo', formula.endo],
          ['networks', formula.networks],
          ['planes', formula.planes],
          ['pins', formula.pins],
        ];
      case 'guest':
        return [
          ['handle', formula.handle],
          ['hostHandle', formula.hostHandle],
          ['hostAgent', formula.hostAgent],
          ['petStore', formula.petStore],
          ['mailbox', formula.mailboxStore],
          ['mailHub', formula.mailHub],
          ['worker', formula.worker],
          ['networks', formula.networks],
          ['planes', formula.planes],
        ];
      case 'marshal':
        return (formula.slots ?? []).map((s, i) => [`slot${i}`, s]);
      case 'eval':
        return [
          ['worker', formula.worker],
          ...(formula.values ?? []).map(
            (v, i) =>
              /** @type {[string, FormulaIdentifier]} */ ([
                formula.names?.[i] || `val${i}`,
                v,
              ]),
          ),
        ];
      case 'lookup':
        return [['hub', formula.hub]];
      case 'make-unconfined': {
        /** @type {Array<[string, FormulaIdentifier]>} */
        const deps = [
          ['worker', formula.worker],
          ['powers', formula.powers],
        ];
        if (formula.cancelWithWorker) {
          deps.push(['cancelWithWorker', formula.cancelWithWorker]);
        }
        return deps;
      }
      case 'make-archive': {
        /** @type {Array<[string, FormulaIdentifier]>} */
        const deps = [
          ['worker', formula.worker],
          ['powers', formula.powers],
          ['archive', formula.archive],
        ];
        if (formula.cancelWithWorker) {
          deps.push(['cancelWithWorker', formula.cancelWithWorker]);
        }
        return deps;
      }
      case 'make-from-tree': {
        /** @type {Array<[string, FormulaIdentifier]>} */
        const deps = [
          ['worker', formula.worker],
          ['powers', formula.powers],
          ['tree', formula.tree],
        ];
        if (formula.cancelWithWorker) {
          deps.push(['cancelWithWorker', formula.cancelWithWorker]);
        }
        return deps;
      }
      case 'peer':
        return [['networks', formula.networks]];
      case 'handle':
        return [['agent', formula.agent]];
      case 'mail-hub':
        return [['store', formula.store]];
      case 'message': {
        /** @type {Array<[string, FormulaIdentifier]>} */
        const messageDeps = [
          ['from', formula.from],
          ['to', formula.to],
          ...(formula.ids ?? []).map(
            (id, i) =>
              /** @type {[string, FormulaIdentifier]} */ ([`ref${i}`, id]),
          ),
        ];
        if (formula.promiseId) {
          messageDeps.push(['promise', formula.promiseId]);
        }
        if (formula.resolverId) {
          messageDeps.push(['resolver', formula.resolverId]);
        }
        if (formula.valueId) {
          messageDeps.push(['value', formula.valueId]);
        }
        return messageDeps;
      }
      case 'promise':
      case 'resolver':
        return [['store', formula.store]];
      case 'readable-tree':
        return [];
      case 'mount':
        return [];
      case 'scratch-mount':
        return [];
      case 'git':
        return [['mount', formula.mountId]];
      case 'shell':
        return [['mount', formula.mountId]];
      case 'http-client':
        // The HTTP client is rooted in a host-owned `fetch` seam, not a mount
        // or any other daemon-minted capability, so it has no formula deps.
        return [];
      case 'git-credential':
        return [];
      case 'git-remote': {
        /** @type {Array<[string, FormulaIdentifier]>} */
        const deps = [['git', formula.gitId]];
        if (formula.credentialId !== undefined) {
          deps.push(['credential', formula.credentialId]);
        }
        return deps;
      }
      case 'pet-inspector':
        return [['petStore', formula.petStore]];
      case 'directory':
        return [['petStore', formula.petStore]];
      case 'invitation':
        return [
          ['hostAgent', formula.hostAgent],
          ['hostHandle', formula.hostHandle],
        ];
      default:
        return [];
    }
  };

  /** @param {string} node */
  const isLocalKey = node =>
    node === localNodeNumber ||
    persistencePowers.hasAgentKey(/** @type {NodeNumber} */ (node));

  /** @param {string} id */
  const isLocalId = id => {
    const { node } = parseId(id);
    return isLocalKey(node);
  };

  const enableFormulaCollection = gcEnabled;
  if (!enableFormulaCollection) {
    console.log('Formula collection disabled (ENDO_GC=0)');
  }

  /**
   * Collection callback invoked synchronously by the formula graph
   * when a group's reference count drops to zero.
   *
   * Phase 1 (synchronous): delete from DB and in-memory caches to
   * prevent resurrection. Phase 2 (async, queued): cancel
   * controllers, disconnect retainers, revive pins.
   *
   * @param {FormulaIdentifier[]} collectedIds
   */
  const onCollect = collectedIds => {
    if (!enableFormulaCollection) return;

    for (const id of collectedIds) {
      // eslint-disable-next-line no-use-before-define
      logLifecycle(id, 'COLLECTED');
    }

    // Phase 1 (synchronous): remove from in-memory caches so that
    // concurrent operations cannot see the collected formulas.
    // Persistence deletion is deferred to the async phase so that
    // implementations are free to use async I/O.
    /** @type {Map<FormulaIdentifier, Formula>} */
    const collectedFormulas = new Map();
    for (const id of collectedIds) {
      const formula = formulaForId.get(id);
      if (formula !== undefined) {
        collectedFormulas.set(id, formula);
      }
    }

    for (const id of collectedIds) {
      const formula = collectedFormulas.get(id);
      if (formula !== undefined) {
        const { number: collectedNumber, node: collectedNode } = parseId(id);
        if (formula.type === 'git-credential') {
          gitCredentialMaterialForId.delete(id);
        }
        formulaForId.delete(id);
        formulaChangeTopic.publisher.next(
          harden({ remove: collectedNumber, node: collectedNode }),
        );
        if (
          formula.type === 'pet-store' ||
          formula.type === 'mailbox-store' ||
          formula.type === 'known-peers-store'
        ) {
          formulaGraph.onPetStoreRemoveAll(id);
        }
      }
    }

    // Snapshot controllers before dropping live values, then drop
    // synchronously so no stale controllers are accessible.
    /** @type {Array<{id: FormulaIdentifier, controller: Controller}>} */
    const controllersToCancel = [];
    for (const id of collectedIds) {
      const controller = controllerForId.get(id);
      if (controller) {
        controllersToCancel.push({ id, controller });
      }
      // eslint-disable-next-line no-use-before-define
      dropLiveValue(id);
    }

    // Phase 2 (async): schedule persistence deletion, controller
    // cancellation, and worker disconnection to run after the
    // current graph lock holder completes.
    const collectedFormulaTypes = new Map(
      [...collectedFormulas.entries()].map(([id, f]) => [id, f.type]),
    );
    pendingCollectionCleanup.push(async () => {
      // Delete from durable storage.
      await Promise.allSettled(
        collectedIds.map(id =>
          persistencePowers.deleteFormula(parseId(id).number),
        ),
      );
      await Promise.allSettled(
        [...collectedFormulas.entries()].map(async ([id, formula]) => {
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

      // Reclaim daemon-local storage owned by collected formulas.
      // Content-store blobs use sweep-time reference counting because
      // multiple readable-blob and readable-tree formulas can dedupe
      // on the same sha256.  Scratch-mount directories have a 1:1
      // relationship with their formula and need no reference count.
      // eslint-disable-next-line no-use-before-define
      await reclaimCollectedStorage(collectedFormulas);

      // Cancel controllers and disconnect workers.
      const cancelReason = new Error(
        'became unreachable by any pet name path and was collected',
      );
      await Promise.allSettled(
        controllersToCancel.map(async ({ controller }) => {
          await null;
          await controller.context.cancel(cancelReason, '!');
        }),
      );

      // eslint-disable-next-line no-use-before-define
      residenceTracker.disconnectRetainersHolding(
        collectedIds,
        collectedFormulaTypes,
      );
    });
  };

  /**
   * Walk a `readable-tree` content tree and add every transitively
   * reachable content-store hash (the root tree JSON, every nested
   * tree JSON, every leaf blob) to `accum`.  Tree JSON is an array of
   * `[name, type, childSha256]` tuples (see
   * `packages/platform/src/fs/snapshot-tree.js`); `type` is `"blob"`
   * or `"tree"`.
   *
   * The walk visits each tree hash at most once via the `accum` set,
   * so cycles or shared subtrees do not cause repeated I/O.  Errors
   * fetching or parsing a tree-JSON entry are swallowed: a malformed
   * or already-missing entry just stops the descent for that branch
   * and the visited hashes are still candidates for removal.
   *
   * @param {string} rootHash
   * @param {Set<string>} accum
   * @returns {Promise<void>}
   */
  const collectTransitiveTreeHashes = async (rootHash, accum) => {
    await null;
    /** @type {string[]} */
    const stack = [rootHash];
    while (stack.length > 0) {
      const hash = /** @type {string} */ (stack.pop());
      if (!accum.has(hash)) {
        accum.add(hash);
        let entries;
        try {
          // eslint-disable-next-line no-await-in-loop
          entries = await contentStore.fetch(hash).json();
        } catch (_err) {
          // Tree JSON is missing or unparseable; nothing more to
          // walk for this branch.  The hash is still in `accum` so
          // the caller may still attempt to remove it.
          entries = undefined;
        }
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            if (Array.isArray(entry) && entry.length >= 3) {
              const [, childType, childHash] = entry;
              if (typeof childHash === 'string') {
                if (childType === 'blob') {
                  accum.add(childHash);
                } else if (childType === 'tree') {
                  stack.push(childHash);
                }
              }
            }
          }
        }
      }
    }
  };

  /**
   * Add every content-store hash a formula keeps reachable to
   * `accum`.  For `readable-blob`, that is the single content hash.
   * For `readable-tree`, that is the root tree-JSON hash plus every
   * transitively reachable child blob and subtree hash.  See the
   * design note in `designs/daemon-content-store-gc.md` on the
   * sweep-time refcount for the precise contract.
   *
   * @param {Formula} formula
   * @param {Set<string>} accum
   * @returns {Promise<void>}
   */
  const collectFormulaHashes = async (formula, accum) => {
    await null;
    if (formula.type === 'readable-blob') {
      accum.add(formula.content);
    } else if (formula.type === 'readable-tree') {
      await collectTransitiveTreeHashes(formula.content, accum);
    }
  };

  /**
   * Reclaim daemon-local on-disk storage owned by a batch of just-
   * collected formulas: orphaned content-store blobs and scratch-mount
   * backing directories.
   *
   * Content-store cleanup uses a sweep-time reference count.  The
   * candidate set is the union of every collected formula's reachable
   * content hashes (a single hash for `readable-blob`; the root tree
   * hash plus every transitively reachable child hash for
   * `readable-tree`), minus the union of every surviving formula's
   * reachable hashes (`formulaForId.values()` at sweep time, so any
   * formula added concurrently is honored as a survivor and its
   * hashes are protected).
   *
   * Scratch-mount cleanup unlinks `{statePath}/mounts/{formulaNumber}`
   * for every collected `scratch-mount` formula.
   *
   * @param {Map<FormulaIdentifier, Formula>} collectedFormulasByid
   * @returns {Promise<void>}
   */
  const reclaimCollectedStorage = async collectedFormulasByid => {
    /** @type {Set<string>} */
    const candidateHashes = new Set();
    for (const formula of collectedFormulasByid.values()) {
      // eslint-disable-next-line no-await-in-loop
      await collectFormulaHashes(formula, candidateHashes);
    }
    if (candidateHashes.size > 0) {
      // Subtract hashes still referenced by any surviving formula.
      // formulaForId at this point reflects the post-Phase-1 state
      // (the collected formulas are already removed) plus any
      // formulas added concurrently while this cleanup was queued.
      // For a surviving readable-tree the entire reachable hash set
      // must be subtracted, not just the root, so that a child blob
      // shared between a collected and a surviving tree is preserved.
      /** @type {Set<string>} */
      const survivingHashes = new Set();
      for (const formula of formulaForId.values()) {
        // eslint-disable-next-line no-await-in-loop
        await collectFormulaHashes(formula, survivingHashes);
      }
      for (const hash of survivingHashes) {
        candidateHashes.delete(hash);
      }
      await Promise.allSettled(
        [...candidateHashes].map(hash => contentStore.remove(hash)),
      );
    }

    // Scratch-mount backing dirs are 1:1 with their formula; no
    // reference count needed.
    const scratchMountNumbers = [];
    for (const [id, formula] of collectedFormulasByid) {
      if (formula.type === 'scratch-mount') {
        scratchMountNumbers.push(parseId(id).number);
      }
    }
    await Promise.allSettled(
      scratchMountNumbers.map(formulaNumber => {
        const mountPath = filePowers.joinPath(
          persistencePowers.statePath,
          'mounts',
          /** @type {string} */ (formulaNumber),
        );
        return filePowers.removeDirectory(mountPath);
      }),
    );
  };

  const formulaGraph = makeFormulaGraph({
    extractLabeledDeps,
    isLocalId,
    onCollect,
  });

  formulaGraph.addRoot(knownPeersId);
  formulaGraph.addRoot(leastAuthorityId);
  formulaGraph.addRoot(mainWorkerId);
  formulaGraph.addRoot(endoFormulaId);
  for (const id of Object.values(platformNames)) {
    formulaGraph.addRoot(/** @type {FormulaIdentifier} */ (id));
  }

  const pinTransient = /** @param {FormulaIdentifier} id */ id =>
    formulaGraph.pinTransient(id);

  /**
   * Drain pending collection cleanup. Callers that unpin outside
   * `withFormulaGraphLock` must call this to ensure async cleanup
   * (controller cancellation, worker termination) completes.
   */
  const drainCollectionCleanup = async () => {
    while (pendingCollectionCleanup.length > 0) {
      const cleanup = /** @type {() => Promise<void>} */ (
        pendingCollectionCleanup.shift()
      );
      await cleanup();
    }
  };

  /**
   * Unpin a transient formula and drain any resulting collection
   * cleanup. Returns a promise that resolves when all async
   * cleanup (controller cancellation, worker termination) is done.
   *
   * Inside `withFormulaGraphLock`, cleanup is deferred to the lock's
   * finally block. Outside the lock, cleanup runs immediately.
   *
   * @param {FormulaIdentifier} id
   * @returns {Promise<void>}
   */
  const unpinTransient = async id => {
    formulaGraph.unpinTransient(id);
    if (formulaGraphLockDepth === 0) {
      await drainCollectionCleanup();
    }
  };

  /** @type {WeakMap<object, FormulaIdentifier>} */
  const agentIdForHandle = new WeakMap();
  /** @type {Map<FormulaIdentifier, GitCredentialMaterial>} */
  const gitCredentialMaterialForId = new Map();
  // Host-private companion map from an `http-client` formula's use-facing
  // `HttpClient` exo to its policy-bearing `HttpClientControl`, populated in the
  // `http-client` maker on every (re)incarnation.  `host.getHttpClientControl`
  // recovers the control from the client cap, mirroring `getGitRemoteController`
  // — the guest holds only the client, the host retains the control.
  /** @type {WeakMap<object, object>} */
  const httpClientControlForClient = new WeakMap();
  /** @param {unknown} client */
  const getHttpClientControlForClient = client =>
    httpClientControlForClient.get(/** @type {object} */ (client));

  /**
   * @param {FormulaIdentifier} id
   * @param {'bearer' | 'basic'} kind
   * @param {Record<string, unknown>} material
   */
  const rememberGitCredentialMaterial = (id, kind, material) => {
    if (kind === 'bearer' && typeof material.token === 'string') {
      gitCredentialMaterialForId.set(
        id,
        harden({ kind, token: material.token }),
      );
      return;
    }
    if (
      kind === 'basic' &&
      typeof material.username === 'string' &&
      typeof material.password === 'string'
    ) {
      gitCredentialMaterialForId.set(
        id,
        harden({
          kind,
          username: material.username,
          password: material.password,
        }),
      );
      return;
    }
    gitCredentialMaterialForId.delete(id);
  };
  harden(rememberGitCredentialMaterial);

  // The following are functions that manage that state.

  /** @param {FormulaIdentifier} inputId */
  const getFormulaForId = async inputId => {
    const id = inputId;
    // No synchronous preamble.
    await null;

    let formula = formulaForId.get(id);
    if (formula !== undefined) {
      return formula;
    }

    const { number: fNum } = parseId(id);
    ({ formula } = await persistencePowers.readFormula(fNum));
    await withFormulaGraphLock(async () => {
      formulaForId.set(id, formula);
      formulaGraph.onFormulaAdded(id, formula);
    });
    return formula;
  };

  /** @param {FormulaIdentifier} inputId */
  const getTypeForId = async inputId => {
    if (!isLocalId(inputId)) {
      return 'remote';
    }
    const { type } = await getFormulaForId(inputId);
    return type;
  };

  /**
   * The content identity (SHA-256 content address + kind) of a content-bearing
   * formula, or `undefined` for any other formula type. A `readable-blob` and a
   * `readable-tree` each carry their content's SHA-256 hash as the formula's
   * `content` field (the same hash the CAS keys on), which is the `xt` a
   * content locator names (`designs/endo-content-locators-magnet-urn.md`). A
   * remote formula's content is not resolvable locally, so it is not
   * content-locatable here.
   *
   * @type {DaemonCore['getContentIdentityForId']}
   */
  const getContentIdentityForId = async inputId => {
    if (!isLocalId(inputId)) {
      return undefined;
    }
    const formula = await getFormulaForId(inputId);
    if (formula.type === 'readable-blob') {
      return harden({ hash: formula.content, kind: 'blob' });
    }
    if (formula.type === 'readable-tree') {
      return harden({ hash: formula.content, kind: 'tree' });
    }
    return undefined;
  };

  /**
   * Reverse look-up, for answering "what is my name for this near or far
   * reference", and not for "what is my name for this promise".
   * @type {WeakMultimap<Record<string | symbol, unknown>, FormulaIdentifier>}
   */
  const idForRef = makeWeakMultimap();

  /** @type {Map<FormulaIdentifier, object>} */
  const refForId = new Map();

  /** @type {DaemonCore['getIdForRef']} */
  const getIdForRef = ref => idForRef.get(/** @type {any} */ (ref));

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
      // When a retainer's node worker is terminated by GC, also
      // terminate any cancelWithWorker (original XS worker) referenced
      // by make-unconfined/make-archive formulas on this worker.
      const terminatedId = formatId({
        number: /** @type {FormulaNumber} */ (workerId),
        node: localNodeNumber,
      });
      for (const formula of formulaForId.values()) {
        if (
          (formula.type === 'make-unconfined' ||
            formula.type === 'make-archive' ||
            formula.type === 'make-from-tree') &&
          formula.worker === terminatedId &&
          formula.cancelWithWorker
        ) {
          const { number: cwNumber } = parseId(formula.cancelWithWorker);
          const cwTerminate = workerTerminationByNumber.get(cwNumber);
          if (cwTerminate) {
            cwTerminate(reason).catch(() => {});
          }
        }
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
    const formulaRecords = await persistencePowers.listFormulas();
    const entries = await Promise.all(
      formulaRecords.map(async ({ number: formulaNumber, node }) => {
        const fNum = /** @type {FormulaNumber} */ (formulaNumber);
        const { formula } = await persistencePowers.readFormula(fNum);
        const id = formatId({
          number: fNum,
          node: /** @type {NodeNumber} */ (node || localNodeNumber),
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
        // Handle regular pet stores.
        const assertValidName = petStoreTypes.get(formula.type);
        if (assertValidName !== undefined) {
          const { number: formulaNumber } = parseId(id);
          const petStore = await petStorePowers.makeIdentifiedPetStore(
            formulaNumber,
            /** @type {'pet-store' | 'mailbox-store' | 'known-peers-store'} */ (
              formula.type
            ),
            assertValidName,
          );
          const controller = makeLocalStoreController(
            /** @type {FormulaIdentifier} */ (id),
            petStore,
            gcHooks,
          );
          await controller.seedGcEdges();
        }
      }),
    );

    // Load retention edges from SQLite into the graph.
    const agentKeys = persistencePowers.listAgentKeys();
    await withFormulaGraphLock(async () => {
      for (const { publicKey, agentId } of agentKeys) {
        const retentionEntries = persistencePowers.listRetention(publicKey);
        const agentIdStr = /** @type {FormulaIdentifier} */ (agentId);
        for (const { formulaNumber } of retentionEntries) {
          const retainedId = formatId({
            number: /** @type {FormulaNumber} */ (formulaNumber),
            node: localNodeNumber,
          });
          if (formulaForId.has(retainedId)) {
            formulaGraph.addRetention(agentIdStr, retainedId);
          }
        }
      }
    });

    // One-time sweep for formulas unreachable after loading all edges.
    // Run inside the lock so that any resulting collection cleanup is
    // drained before the function returns.
    await withFormulaGraphLock(async () => {
      formulaGraph.sweepUnreachable();
    });
  };

  /** @type {import('./types.js').GcHooks} */
  const gcHooks = harden({
    onPetStoreWrite: (storeId, id) => formulaGraph.onPetStoreWrite(storeId, id),
    onPetStoreRemove: (storeId, id) =>
      formulaGraph.onPetStoreRemove(storeId, id),
    isLocalId,
    withFormulaGraphLock,
  });

  /** @type {Map<FormulaIdentifier, import('./types.js').StoreController>} */
  const controllerCache = new Map();

  /**
   * Wraps a raw pet store in a StoreController. Controllers are cached
   * so the same store ID always yields the same controller instance.
   *
   * @param {FormulaIdentifier} storeId
   * @returns {Promise<import('./types.js').StoreController>}
   */
  const provideStoreController = async storeId => {
    const cached = controllerCache.get(storeId);
    if (cached !== undefined) {
      return cached;
    }
    const store =
      /** @type {import('./types.js').PetStore} */
      (await provide(storeId));
    const controller = makeLocalStoreController(storeId, store, gcHooks);
    controllerCache.set(storeId, controller);
    return controller;
  };

  // The following concern connections to other daemons.

  const provideRemoteControl = makeRemoteControlProvider(localNodeNumber);

  // Gateway is equivalent to E's "nonce locator".
  // It provides a value for a locator to a remote client.
  const localGateway = Far('Gateway', {
    /** @param {string} requestedId */
    provide: async requestedId => {
      assertValidId(requestedId);
      if (!isLocalId(requestedId)) {
        const { node } = parseId(requestedId);
        throw new Error(
          `Gateway can only provide local values. Got request for node ${q(
            node,
          )}`,
        );
      }
      return provide(requestedId);
    },
    /**
     * Return the formula numbers from `peerNodeNumber` that this
     * daemon currently holds, followed by incremental updates.
     * Each yielded value has shape `{ add: string[], remove: string[] }`.
     * The first delta is the snapshot (all adds, no removes).
     * Subsequent deltas are batched over microtasks.
     *
     * @param {string} peerNodeNumber
     * @returns {Promise<import('@endo/exo-stream').PassableReader<import('./retention-accumulator.js').RetentionDelta, undefined>>}
     */
    followRetentionSet: async peerNodeNumber => {
      const snapshot =
        persistencePowers.listFormulaNumbersByNode(peerNodeNumber);
      const accumulator = makeRetentionAccumulator({ snapshot });

      // Feed formula change events into the accumulator, filtered
      // by the peer's node number.
      const subscription = formulaChangeTopic.subscribe();
      (async () => {
        for await (const change of subscription) {
          if (change.node === peerNodeNumber) {
            if (change.add !== undefined) {
              accumulator.add(change.add);
            } else if (change.remove !== undefined) {
              accumulator.remove(change.remove);
            }
          }
        }
      })();

      return /** @type {any} */ (
        readerFromIterator(/** @type {any} */ (accumulator.subscribe()))
      );
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
      console.log(
        `Endo daemon received inbound peer connection from node ${remoteNodeId.slice(0, 8)}`,
      );
      const remoteControl = provideRemoteControl(remoteNodeId);
      /** @param {Error} error */
      const wrappedCancel = error => E(cancelConnection)(error);
      remoteControl.accept(remoteGateway, wrappedCancel, connectionCancelled);

      // Follow retention set changes in the background.
      const consumeRetention = async () => {
        const iter = await E(remoteGateway).followRetentionSet(localNodeNumber);
        // Resolve the local agent formula ID for this peer so
        // retention edges land in the right place in the graph.
        const agentKeyRecord = persistencePowers.getAgentKey(remoteNodeId);
        const agentIdStr = agentKeyRecord
          ? /** @type {FormulaIdentifier} */ (agentKeyRecord.agentId)
          : undefined;

        let isFirst = true;
        for await (const rawDelta of iterateReader(/** @type {any} */ (iter))) {
          const delta =
            /** @type {import('./retention-accumulator.js').RetentionDelta} */ (
              /** @type {any} */ (rawDelta)
            );
          if (isFirst) {
            // First delta is the full snapshot.
            persistencePowers.replaceRetention(remoteNodeId, delta.add);
            if (agentIdStr !== undefined) {
              await withFormulaGraphLock(async () => {
                formulaGraph.replaceRetention(
                  agentIdStr,
                  delta.add.map(num =>
                    formatId({
                      number: /** @type {FormulaNumber} */ (num),
                      node: localNodeNumber,
                    }),
                  ),
                );
              });
            }
            isFirst = false;
          } else {
            for (const num of delta.add) {
              persistencePowers.writeRetention(remoteNodeId, num);
            }
            for (const num of delta.remove) {
              persistencePowers.deleteRetention(remoteNodeId, num);
            }
            if (agentIdStr !== undefined) {
              await withFormulaGraphLock(async () => {
                for (const num of delta.add) {
                  formulaGraph.addRetention(
                    agentIdStr,
                    formatId({
                      number: /** @type {FormulaNumber} */ (num),
                      node: localNodeNumber,
                    }),
                  );
                }
                for (const num of delta.remove) {
                  formulaGraph.removeRetention(
                    agentIdStr,
                    formatId({
                      number: /** @type {FormulaNumber} */ (num),
                      node: localNodeNumber,
                    }),
                  );
                }
              });
            }
          }
        }
      };
      consumeRetention().catch(err => {
        console.log(
          `Retention sync ended for inbound peer ${remoteNodeId.slice(0, 8)}: ${/** @type {Error} */ (err).message}`,
        );
      });

      return localGateway;
    },
  });

  /**
   * @param {string} workerId512
   */
  const makeDaemonFacetForWorker = workerId512 => {
    // The trace record's `workerId` must be a full formula identifier
    // (`number:node`) so a UI can pass it straight to `lookupById` /
    // `getFormula` (Show Value); `workerId512` alone is only the
    // formula number and fails `parseId` with "Invalid formula
    // identifier". Workers are always local, so the node is this
    // daemon's node.
    const workerFormulaId = formatId({
      number: /** @type {FormulaNumber} */ (workerId512),
      node: localNodeNumber,
    });
    return makeExo(
      `Endo facet for worker ${workerId512}`,
      DaemonFacetForWorkerInterface,
      {
        /**
         * Push a trace record from the worker. The daemon stamps the
         * authoritative workerId from the connection identity so a
         * worker cannot forge entries under another worker's id.
         *
         * The guard accepts any record; `traceAggregator.record`
         * performs structural validation and rejects malformed
         * payloads, so the cast at the boundary is safe.
         *
         * @param {Record<string, any>} record
         */
        reportTrace: async record => {
          try {
            traceAggregator.record(
              workerFormulaId,
              /** @type {import('./trace-aggregator.js').TraceRecord} */ (
                record
              ),
            );
          } catch (err) {
            // Never let a malformed worker push interfere with the
            // worker's progress. Log and drop.
            console.error(
              `Endo trace push from worker ${workerId512} rejected:`,
              /** @type {Error} */ (err).message,
            );
          }
        },
      },
    );
  };

  /**
   * @param {string} workerId512
   * @param {Context} context
   * @param {'locked' | 'node'} [kind]
   * @param {string[]} [trustedShims]
   * @param {string} [label]
   */
  const makeIdentifiedWorker = async (
    workerId512,
    context,
    kind = undefined,
    trustedShims = undefined,
    label = undefined,
  ) => {
    const daemonWorkerFacet = makeDaemonFacetForWorker(workerId512);

    const { promise: forceCancelled, reject: forceCancel } =
      /** @type {PromiseKit<never>} */ (makePromiseKit());

    const { promise: workerCancelled, reject: cancelWorker } =
      /** @type {PromiseKit<never>} */ (makePromiseKit());

    /**
     * Stamp every error we decode from this worker with its origin so
     * the daemon's outbound CapTP hook can alias forwarded errorIds.
     *
     * @param {Error} err
     * @param {string} [errorId]
     */
    const workerFormulaId = formatId({
      number: /** @type {FormulaNumber} */ (workerId512),
      node: localNodeNumber,
    });
    const recordInboundOrigin = (err, errorId) => {
      if (errorId === undefined) return;
      // Key by the full formula identifier so it matches the `workerId`
      // that `reportTrace` records under (see `makeDaemonFacetForWorker`).
      inboundErrorOrigin.set(err, { workerId: workerFormulaId, errorId });
    };

    const { workerTerminated, workerDaemonFacet } =
      await controlPowers.makeWorker(
        workerId512,
        daemonWorkerFacet,
        workerCancelled,
        Promise.race([forceCancelled, gracePeriodElapsed]),
        capTpConnectionRegistrar,
        trustedShims,
        label,
        kind,
        recordInboundOrigin,
      );

    /** @param {Error} [_reason] */
    const terminateWorker = async _reason => {
      E.sendOnly(workerDaemonFacet).terminate();
      await Promise.race([
        workerTerminated,
        delay(gracePeriodMs, gracePeriodElapsed).catch(() => {}),
      ]).catch(() => {});
    };

    logLifecycle(context.id, 'WORKER_READY');

    workerTerminationByNumber.set(workerId512, terminateWorker);
    workerTerminated.finally(() => {
      workerTerminationByNumber.delete(workerId512);
    });

    const gracefulCancel = async () => {
      cancelWorker(new Error('Worker cancelled'));
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
   * @param {string} sha256
   */
  const makeReadableBlob = sha256 => {
    const { makeFileReader, text, json, size, readRange } =
      /** @type {DaemonContentStoreBlob} */ (contentStore.fetch(sha256));
    /** @satisfies {ReadableBlobRange} */
    const readableBlobMethods = {
      /** @param {import('@endo/eventual-send').ERef<unknown>} synPromise */
      streamBase64(synPromise) {
        const pump = makeReaderPump(mapReader(makeFileReader(), encodeBase64));
        return pump(/** @type {any} */ (synPromise));
      },
      text,
      json,
      // Range-I/O surface (aligns with the extended `BlobRef`): the
      // `{ algorithm, hash, size }` triple in one round-trip, then a
      // windowed `fetch`. `hash` is base64 to match `BlobRef.getInfo`
      // (this `EndoBlob` cap no longer carries a hex `sha256()` accessor;
      // the hex spelling lives only in the internal content-store address).
      async getInfo() {
        return harden({
          algorithm: 'sha256',
          hash: encodeBase64(fromHex(sha256)),
          size: await size(),
        });
      },
      /**
       * @param {bigint} offset
       * @param {bigint} length
       */
      async fetch(offset, length) {
        // Validate at the bigint→Number boundary (same `toSafeNumber`
        // the extended `BlobRef.fetch` uses) so negative or out-of-range
        // windows throw `EINVAL` rather than silently losing precision.
        const bytes = await readRange(
          toSafeNumber(offset, 'offset'),
          toSafeNumber(length, 'length'),
        );
        return bytesFromRange(bytes);
      },
      help: makeHelp(blobHelp),
    };
    return makeExo(
      `Readable file with SHA-256 ${sha256.slice(0, 8)}...`,
      BlobInterface,
      readableBlobMethods,
    );
  };

  /**
   * @param {string} sha256
   */
  const makeReadableTree = sha256 =>
    makeExo(
      'ReadableTree',
      ReadableTreeInterface,
      /** @type {any} */ ({
        ...snapshotTreeMethods(contentStore, sha256),
        help: makeHelp(readableTreeHelp),
      }),
    );

  /**
   * @param {object} tree
   * @returns {Promise<SnapshotTree>}
   */
  const snapshotMountTree = async tree => {
    const { sha256 } = await platformCheckinTree(tree, contentStore);
    return makeReadableTree(sha256);
  };

  /**
   * @param {string} filePath
   */
  const snapshotMountFile = async filePath => {
    const sha256 = await contentStore.store(
      filePowers.makeFileReader(filePath),
    );
    return makeReadableBlob(sha256);
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
    cancelWithWorker,
  ) => {
    context.thisDiesIfThatDies(workerId);
    context.thisDiesIfThatDies(powersId);
    if (cancelWithWorker) {
      context.thisDiesIfThatDies(cancelWithWorker);
    }

    const worker = await provide(workerId, 'worker');
    const workerDaemonFacet = workerDaemonFacets.get(worker);
    assert(workerDaemonFacet, 'Cannot make unconfined plugin with non-worker');
    const powersP = provide(powersId);
    return E(/** @type {any} */ (workerDaemonFacet)).makeUnconfined(
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
   * @param {string} archiveId
   * @param {Record<string, string> | undefined} env
   * @param {Context} context
   * @param {string} [cancelWithWorker]
   */
  const makeArchive = async (
    workerId,
    powersId,
    archiveId,
    env,
    context,
    cancelWithWorker,
  ) => {
    context.thisDiesIfThatDies(workerId);
    context.thisDiesIfThatDies(powersId);
    if (cancelWithWorker) {
      context.thisDiesIfThatDies(cancelWithWorker);
    }

    const worker = await provide(
      /** @type {FormulaIdentifier} */ (workerId),
      'worker',
    );
    const workerDaemonFacet = workerDaemonFacets.get(worker);
    assert(workerDaemonFacet, 'Cannot make caplet with non-worker');
    const readableArchiveP = provide(
      /** @type {FormulaIdentifier} */ (archiveId),
      'readable-blob',
    );
    const powersP = provide(/** @type {FormulaIdentifier} */ (powersId));
    return E(/** @type {any} */ (workerDaemonFacet)).makeArchive(
      readableArchiveP,
      // TODO fix type
      /** @type {any} */ (powersP),
      /** @type {any} */ (makeFarContext(context)),
      env,
    );
  };

  /**
   * Load a source-only tree (ReadableTree or Mount) into a worker and
   * invoke its entry `make(powers, context, { env })`.  Mirrors
   * {@link makeArchive} but the source comes from a tree capability
   * rather than a ZIP blob.
   *
   * @param {string} workerId
   * @param {string} powersId
   * @param {string} treeId
   * @param {Record<string, string> | undefined} env
   * @param {Context} context
   * @param {string} [cancelWithWorker]
   */
  const makeFromTree = async (
    workerId,
    powersId,
    treeId,
    env,
    context,
    cancelWithWorker,
  ) => {
    context.thisDiesIfThatDies(workerId);
    context.thisDiesIfThatDies(powersId);
    context.thisDiesIfThatDies(treeId);
    if (cancelWithWorker) {
      context.thisDiesIfThatDies(cancelWithWorker);
    }

    const worker = await provide(
      /** @type {FormulaIdentifier} */ (workerId),
      'worker',
    );
    const workerDaemonFacet = workerDaemonFacets.get(worker);
    assert(workerDaemonFacet, 'Cannot make caplet with non-worker');
    const treeP = provide(/** @type {FormulaIdentifier} */ (treeId));
    const powersP = provide(/** @type {FormulaIdentifier} */ (powersId));

    // XS (locked) workers cannot run @endo/compartment-mapper's
    // parseArchive themselves yet, so the daemon walks the tree
    // here, packs it into a synthesized archive, and routes through
    // the existing makeArchive worker method which is implemented
    // for both Node and XS via hostImportArchive.  A worker is
    // "locked" if its formula explicitly says so, OR if the
    // formula has no `kind` and the daemon's defaultWorkerKind is
    // 'locked' (i.e. the Rust supervisor path).
    const workerFormula = formulaForId.get(
      /** @type {FormulaIdentifier} */ (workerId),
    );
    const workerKind =
      workerFormula?.type === 'worker'
        ? (workerFormula.kind ?? defaultWorkerKind)
        : undefined;
    const isLockedWorker = workerKind === 'locked';
    if (isLockedWorker) {
      // eslint-disable-next-line no-use-before-define
      const archiveBytes = await packTreeIntoArchiveBytes(treeP);
      // eslint-disable-next-line no-use-before-define
      const transientBlob = makeBytesBlob(archiveBytes);
      return E(/** @type {any} */ (workerDaemonFacet)).makeArchive(
        /** @type {any} */ (transientBlob),
        /** @type {any} */ (powersP),
        /** @type {any} */ (makeFarContext(context)),
        env,
      );
    }

    return E(/** @type {any} */ (workerDaemonFacet)).makeFromTree(
      /** @type {any} */ (treeP),
      /** @type {any} */ (powersP),
      /** @type {any} */ (makeFarContext(context)),
      env,
    );
  };

  /**
   * Walk a ReadableTree or Mount whose layout matches a
   * compartment-mapper archive (`compartment-map.json` at root plus
   * modules at their referenced `<compartmentName>/<moduleLocation>`
   * paths) and pack it into ZIP bytes that {@link makeArchive} can
   * load via `parseArchive` / `hostImportArchive`.
   *
   * @param {Promise<unknown> | unknown} treeP
   * @returns {Promise<Uint8Array>}
   */
  const packTreeIntoArchiveBytes = async treeP => {
    const mapBlob = await E(/** @type {any} */ (treeP)).lookup(
      'compartment-map.json',
    );
    const mapText = await E(/** @type {any} */ (mapBlob)).text();
    let compartmentMap;
    try {
      compartmentMap = JSON.parse(mapText);
    } catch (err) {
      throw makeError(
        X`Tree's compartment-map.json is not valid JSON: ${q(err)}`,
      );
    }
    if (
      !compartmentMap ||
      typeof compartmentMap !== 'object' ||
      typeof compartmentMap.compartments !== 'object' ||
      compartmentMap.compartments === null
    ) {
      throw makeError(
        X`Tree's compartment-map.json is missing the compartments map`,
      );
    }

    const zip = new ZipWriter();
    zip.write('compartment-map.json', bytesFromText(mapText));

    // Pipeline the per-module reads via Promise.all to avoid the
    // round-trip-per-file stall that a naive sequential walk would
    // suffer when daemon and worker live in different processes.
    // Sort entries so the resulting ZIP is deterministic (helpful
    // for tests and for content-addressable storage).
    const sortedCompartments = Object.entries(
      /** @type {Record<string, any>} */ (compartmentMap.compartments),
    ).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    /** @type {Array<{ archivePath: string, srcP: Promise<string> }>} */
    const moduleReads = [];
    for (const [compartmentName, descriptor] of sortedCompartments) {
      const modules = descriptor.modules || {};
      const sortedModules = Object.values(modules).sort((a, b) => {
        const al =
          a && typeof a === 'object' && 'location' in a
            ? String(/** @type {any} */ (a).location)
            : '';
        const bl =
          b && typeof b === 'object' && 'location' in b
            ? String(/** @type {any} */ (b).location)
            : '';
        return al < bl ? -1 : al > bl ? 1 : 0;
      });
      for (const moduleInfo of sortedModules) {
        if (
          typeof moduleInfo === 'object' &&
          moduleInfo !== null &&
          'location' in moduleInfo &&
          typeof moduleInfo.location === 'string'
        ) {
          const archivePath = `${compartmentName}/${moduleInfo.location}`;
          const pathSegments = archivePath.split('/').filter(Boolean);
          const srcP = E(/** @type {any} */ (treeP))
            .lookup(pathSegments)
            .then(blob => E(/** @type {any} */ (blob)).text());
          moduleReads.push({ archivePath, srcP });
        }
      }
    }
    const sources = await Promise.all(moduleReads.map(r => r.srcP));
    moduleReads.forEach(({ archivePath }, i) => {
      zip.write(archivePath, bytesFromText(sources[i]));
    });

    return zip.snapshot();
  };

  /**
   * Wrap an in-memory Uint8Array as a transient blob exo that
   * implements the `EndoBlob` surface (sha256 / streamBase64 / text
   * / json) just well enough for the worker's `makeArchive` method
   * to consume it.  The blob is not persisted in CAS — its lifetime
   * is the duration of the eventual-send.
   *
   * @param {Uint8Array} bytes
   */
  const makeBytesBlob = bytes => {
    const sha256Hex = (() => {
      const digester = cryptoPowers.makeSha256();
      digester.update(bytes);
      return digester.digestHex();
    })();
    const info = harden({
      algorithm: 'sha256',
      hash: encodeBase64(fromHex(sha256Hex)),
      size: BigInt(bytes.length),
    });
    return makeExo(
      'TransientBlob',
      BlobInterface,
      /** @type {any} */ ({
        help: () => 'Transient in-memory blob',
        /** @param {import('@endo/eventual-send').ERef<unknown>} synPromise */
        streamBase64(synPromise) {
          const pump = makeReaderPump(
            mapReader(
              /** @type {any} */ ([bytes][Symbol.iterator]()),
              encodeBase64,
            ),
          );
          return pump(/** @type {any} */ (synPromise));
        },
        text: async () => bytesToText(bytes),
        json: async () => JSON.parse(bytesToText(bytes)),
        getInfo: () => info,
        /**
         * @param {bigint} offset
         * @param {bigint} length
         */
        fetch: async (offset, length) => {
          const off = toSafeNumber(offset, 'offset');
          const len = toSafeNumber(length, 'length');
          const end = Math.min(off + len, bytes.length);
          const slice =
            off >= bytes.length || len <= 0
              ? new Uint8Array(0)
              : bytes.subarray(off, end);
          return bytesFromRange(slice);
        },
      }),
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
    const petStore = await provideStoreController(storeId);
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
    const petStore = await provideStoreController(storeId);
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
        await petStore.storeIdentifier(PROMISE_STATUS_NAME, id);
      } finally {
        await unpinTransient(id);
      }
    };

    return makeExo('EndoResolver', ResponderInterface, {
      resolveWithId: async idOrPromise => {
        await resolverJobs.enqueue(async () => {
          await null;
          if (petStore.identifyLocal(PROMISE_STATUS_NAME) !== undefined) {
            return;
          }
          try {
            let id = await idOrPromise;
            if (typeof id !== 'string') {
              throw new TypeError(
                `Promise resolution must be a formula identifier (${q(id)})`,
              );
            }
            // Accept either a raw formula ID or an endo:// locator.
            // A locator carries the sender's actual node number so we
            // don't misinterpret local node identifiers across daemon boundaries.
            if (id.startsWith('endo://')) {
              const internalized = internalizeLocator(id);
              id = internalized.id;
            }
            assertValidId(id);
            // Write the resolved formula ID as a direct pet store entry so
            // the formula graph keeps the resolved value reachable.
            // This must happen before writeStatus because writeStatus
            // triggers the promise to resolve, and collection may run
            // before the consumer has a chance to name the result.
            await petStore.storeIdentifier(RESOLVED_VALUE_NAME, id);
            await writeStatus({ status: 'fulfilled', valueId: id });
          } catch (error) {
            const reason = formatRejectionReason(error);
            await writeStatus({ status: 'rejected', reason });
          }
        });
      },
    });
  };

  /**
   * @param {FormulaIdentifier} storeId
   * @param {Context} context
   */
  const makeMailHub = async (storeId, context) => {
    context.thisDiesIfThatDies(storeId);
    const mailboxStore = await provideStoreController(storeId);

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

    const maybeLookup = petNameOrPath => {
      const namePath = namePathFrom(petNameOrPath);
      const [headName, ...tailNames] = namePath;
      const id = identifyMessage(headName);
      if (id === undefined) {
        return undefined;
      }
      const value = provide(/** @type {FormulaIdentifier} */ (id), 'message');
      return tailNames.reduce(
        (directory, petName) =>
          /** @type {Promise<NameHub>} */ (
            /** @type {unknown} */ (E(directory).lookup(petName))
          ),
        /** @type {Promise<NameHub>} */ (/** @type {unknown} */ (value)),
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

    const listLocators = async (...petNamePath) => {
      assertNames(petNamePath);
      if (petNamePath.length === 0) {
        const names = listMessageNames();
        /** @type {Record<string, string>} */
        const record = {};
        await Promise.all(
          names.map(async name => {
            const locator = await locate(name);
            if (locator !== undefined) {
              record[name] = locator;
            }
          }),
        );
        return harden(record);
      }
      const hub = /** @type {NameHub} */ (await lookup(petNamePath));
      return E(hub).listLocators();
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
      throw new Error('Mailbox directory is read-only');
    };
    const notSupported = async () => {
      throw new Error('Text I/O is not supported on mailbox directories');
    };

    mailHub = /** @type {NameHub} */ (
      /** @type {unknown} */ (
        makeExo(
          'MailHub',
          DirectoryInterface,
          /** @type {any} */ ({
            help: makeHelp(directoryHelp),
            has,
            identify,
            locate,
            reverseLocate,
            followLocatorNameChanges: locator =>
              readerFromIterator(followLocatorNameChanges(locator)),
            list,
            listIdentifiers,
            listLocators,
            followNameChanges: (...petNamePath) =>
              readerFromIterator(followNameChanges(...petNamePath)),
            lookup,
            maybeLookup,
            reverseLookup,
            storeIdentifier: disallowedMutation,
            storeLocator: disallowedMutation,
            remove: disallowedMutation,
            move: disallowedMutation,
            copy: disallowedMutation,
            makeDirectory: disallowedMutation,
            readText: notSupported,
            maybeReadText: notSupported,
            writeText: disallowedMutation,
          }),
        )
      )
    );

    return mailHub;
  };

  /**
   * @param {MessageFormula} messageFormula
   * @param {Context} context
   */
  const makeMessageHub = async (messageFormula, context) => {
    const formula = messageFormula;
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
      source,
      slots,
    } = formula;

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
    } else if (messageType === 'form') {
      if (typeof description !== 'string') {
        throw new Error('Form message formula is incomplete');
      }
      registerName(MESSAGE_DESCRIPTION_NAME, undefined, description);
    } else if (messageType === 'value') {
      const { valueId } = formula;
      if (valueId === undefined) {
        throw new Error('Value message formula is incomplete');
      }
      registerName('@value', valueId, undefined);
    } else if (messageType === 'definition') {
      if (
        typeof source !== 'string' ||
        slots === undefined ||
        promiseId === undefined ||
        resolverId === undefined
      ) {
        throw new Error('Definition message formula is incomplete');
      }
      registerName('@source', undefined, source);
      registerName('@slots', undefined, slots);
      registerName(MESSAGE_PROMISE_NAME, promiseId, undefined);
      registerName(MESSAGE_RESOLVER_NAME, resolverId, undefined);
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
          if (headName === '@result') {
            // Follow the promise resolution to provide the underlying value.
            return Promise.resolve(provide(id, 'promise')).then(
              resolutionId => {
                if (typeof resolutionId === 'string') {
                  return provide(
                    /** @type {FormulaIdentifier} */ (resolutionId),
                  );
                }
                return resolutionId;
              },
            );
          }
          if (headName === MESSAGE_RESOLVER_NAME) {
            return provide(id, 'resolver');
          }
          return provide(id);
        }
        if (valueByName.has(headName)) {
          return Promise.resolve(valueByName.get(headName));
        }
        throw new TypeError(`Unknown message name: ${q(headName)}`);
      }
      return tailNames.reduce(
        (directory, petName) => E(directory).lookup(petName),
        lookup(headName),
      );
    };

    const maybeLookup = petNameOrPath => {
      const namePath = namePathFrom(petNameOrPath);
      const [headName, ...tailNames] = namePath;
      if (tailNames.length === 0) {
        if (!idByName.has(headName) && !valueByName.has(headName)) {
          return undefined;
        }
      }
      return lookup(petNameOrPath);
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

    const listLocators = async (...petNamePath) => {
      assertNames(petNamePath);
      if (petNamePath.length === 0) {
        /** @type {Record<string, string>} */
        const record = {};
        await Promise.all(
          orderedNames.map(async name => {
            const locator = await locate(name);
            if (locator !== undefined) {
              record[name] = locator;
            }
          }),
        );
        return harden(record);
      }
      const hub = /** @type {NameHub} */ (await lookup(petNamePath));
      return E(hub).listLocators();
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
      throw new Error('Message directory is read-only');
    };
    const notSupported = async () => {
      throw new Error('Text I/O is not supported on message directories');
    };

    messageHub = /** @type {NameHub} */ (
      /** @type {unknown} */ (
        makeExo(
          'MessageHub',
          DirectoryInterface,
          /** @type {any} */ ({
            help: makeHelp(directoryHelp),
            has,
            identify,
            locate,
            reverseLocate,
            followLocatorNameChanges: locator =>
              readerFromIterator(followLocatorNameChanges(locator)),
            list,
            listIdentifiers,
            listLocators,
            followNameChanges: (...petNamePath) =>
              readerFromIterator(followNameChanges(...petNamePath)),
            lookup,
            maybeLookup,
            reverseLookup,
            storeIdentifier: disallowedMutation,
            storeLocator: disallowedMutation,
            remove: disallowedMutation,
            move: disallowedMutation,
            copy: disallowedMutation,
            makeDirectory: disallowedMutation,
            readText: notSupported,
            maybeReadText: notSupported,
            writeText: disallowedMutation,
          }),
        )
      )
    );

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
    'readable-tree': ({ content }) => makeReadableTree(content),
    mount: async ({ path: mountPath, readOnly, deniedSegments }, context) => {
      // Verify the mount path exists.
      const pathExists = await filePowers.exists(mountPath);
      if (!pathExists) {
        throw new Error(`Mount path does not exist: ${q(mountPath)}`);
      }
      const isDir = await filePowers.isDirectory(mountPath);
      if (!isDir) {
        throw new Error(`Mount path is not a directory: ${q(mountPath)}`);
      }
      const { mount, control } = makeRevocableMount({
        rootPath: mountPath,
        readOnly,
        filePowers,
        snapshotTree: snapshotMountTree,
        snapshotFile: snapshotMountFile,
        deniedSegments,
      });
      // Tie revocation to the mount formula's lifetime: when the formula is
      // cancelled, the caretaker trips the shared liveness flag and every
      // derived face begins throwing. The control stays captive in this
      // closure — callers only ever receive `mount`.
      context.onCancel(() => {
        /** @type {{ revoke: () => void }} */ (control).revoke();
      });
      return mount;
    },
    'scratch-mount': async (
      { readOnly, deniedSegments },
      context,
      _id,
      formulaNumber,
    ) => {
      const rootPath = filePowers.joinPath(
        persistencePowers.statePath,
        'mounts',
        /** @type {string} */ (formulaNumber),
      );
      await filePowers.makePath(rootPath);
      const { mount, control } = makeRevocableMount({
        rootPath,
        readOnly,
        filePowers,
        snapshotTree: snapshotMountTree,
        snapshotFile: snapshotMountFile,
        deniedSegments,
      });
      context.onCancel(() => {
        /** @type {{ revoke: () => void }} */ (control).revoke();
      });
      return mount;
    },
    git: async (
      { mountId, allowHistoryRewrite = false, identity },
      context,
    ) => {
      context.thisDiesIfThatDies(mountId);
      const mount = await provide(mountId);
      const backing = getMountBacking(mount);
      if (!backing) {
        throw makeError(
          X`Git formula's mountId ${q(mountId)} does not name a daemon-minted mount`,
        );
      }
      if (backing.kind !== 'physical') {
        throw makeError(
          X`Git requires a physical mount, got ${q(backing.kind)}`,
        );
      }
      if (backing.physicalRoot !== backing.currentDir) {
        throw makeError(
          X`Git requires the mount root, not a sub-mount; received ${q(backing.currentDir)} under root ${q(backing.physicalRoot)}`,
        );
      }
      const gitMetadataPath = filePowers.joinPath(backing.physicalRoot, '.git');
      if (!(await filePowers.exists(gitMetadataPath))) {
        throw makeError(
          X`Mount root ${q(backing.physicalRoot)} is not a git worktree (no .git entry at root)`,
        );
      }
      const backend = makeNativeGitBackend({
        repoRoot: backing.physicalRoot,
        identity,
      });
      await backend.assertRepositoryRoot();
      return makeGit(
        {
          // `provide(mountId)` returns a union of cap types; the
          // `getMountBacking` check above guarantees an `EndoMount`,
          // but TS can't narrow through it.
          // eslint-disable-next-line object-shorthand
          mount: /** @type {WritableGitWorktree} */ (mount),
          backend,
          lineageOf,
        },
        { readOnly: backing.readOnly, allowHistoryRewrite },
      );
    },
    shell: async ({ mountId, policy }, context) => {
      context.thisDiesIfThatDies(mountId);
      const mount = await provide(mountId);
      const backing = getMountBacking(mount);
      if (!backing) {
        throw makeError(
          X`Shell formula's mountId ${q(mountId)} does not name a daemon-minted mount`,
        );
      }
      if (backing.kind !== 'physical') {
        throw makeError(
          X`Shell requires a physical mount, got ${q(backing.kind)}`,
        );
      }
      // A child process holds OS-level write authority over its working tree;
      // a read-only mount cannot bound that, so a "read-only shell" would
      // misrepresent the authority actually granted.  Refuse it (design
      // § Shell capability).  `provideShell` rejects earlier; this is the
      // reincarnation-time defense so a persisted formula cannot smuggle one in.
      if (backing.readOnly) {
        throw makeError(
          X`Shell requires a writable mount; refusing to construct a shell over a read-only mount`,
        );
      }
      // PATH is policy-owned and baked at provideShell time.  A legacy formula
      // without `searchPath` gets an empty path rather than reincarnating with
      // ambient daemon process authority.
      const searchPath =
        typeof policy.searchPath === 'string' ? policy.searchPath : '';
      const baseEnv = harden({ PATH: searchPath, LC_ALL: 'C' });
      // `killProcessGroup` so the exo-shell timeout's SIGTERM→SIGKILL
      // escalation reaps a child that traps the signal (and any descendant it
      // forked holding the stdio pipes), rather than leaking it and hanging
      // `exec` past the deadline.
      const spawner = makeHostSpawner({
        searchPath,
        defaultEnv: baseEnv,
        killProcessGroup: true,
      });
      return makeShell({
        cwd: backing.currentDir,
        policy: harden({
          allowedCommands: harden([...policy.allowedCommands]),
          timeoutMs: policy.timeoutMs,
          maxOutputBytes: policy.maxOutputBytes,
          env: harden({ ...(policy.env || {}) }),
        }),
        spawner,
        readOnly: false,
      });
    },
    'http-client': ({ policy }) => {
      // The Network (HTTP) tier is the deliberate exception to "everything
      // derives from the mount": there is no filesystem to root it in, so its
      // root authority is a host-owned `fetch` (and `now`) seam, injected here
      // in the daemon (host) process exactly as the shell maker injects its
      // host spawner.  The policy is formula-owned and baked at
      // `provideHttpClient` time, so the capability reconstitutes across daemon
      // restart with identical bounds.
      const { client, control } = makeHttpClientAndControl({
        // Native Node `fetch` is structurally a `FetchLike` (its `body` is
        // `BodyInit` where `FetchLike` accepts `unknown`); cast at the seam as
        // `@endo/exo-http-client` does for its own `globalThis.fetch` default.
        fetch: /** @type {import('@endo/exo-http-client').FetchLike} */ (
          globalThis.fetch
        ),
        now: Date.now,
        allowedOrigins: harden([...policy.allowedOrigins]),
        maxRequestsPerMinute: policy.maxRequestsPerMinute,
        maxResponseBytes: policy.maxResponseBytes,
        policyMode: policy.policyMode,
      });
      // Control / client split: only the use-facing `client` is returned (and
      // bound into the guest petstore); the policy-bearing `control` is
      // retained host-side, reachable via `host.getHttpClientControl(client)`.
      // Re-registered on every reincarnation because the maker reruns.
      httpClientControlForClient.set(client, control);
      return client;
    },
    'git-credential': ({ kind, audience }, _context, id) => {
      const material = gitCredentialMaterialForId.get(id);
      const onRotate = rotated =>
        rememberGitCredentialMaterial(
          id,
          kind,
          /** @type {Record<string, unknown>} */ (rotated),
        );
      const onRevoke = () => gitCredentialMaterialForId.delete(id);
      if (kind === 'bearer' && material?.kind === 'bearer') {
        return makeBearerCredential({
          audience,
          token: material.token,
          onRotate,
          onRevoke,
        });
      }
      if (kind === 'basic' && material?.kind === 'basic') {
        return makeBasicCredential({
          audience,
          username: material.username,
          password: material.password,
          onRotate,
          onRevoke,
        });
      }
      return makeUnavailableGitCredential({
        kind,
        audience,
        onRotate,
        onRevoke,
      });
    },
    'git-remote': async (formula, context, id) => {
      const { gitId, credentialId, name, policy, revoked = false } = formula;
      let currentFormula = formula;
      const persistGitRemoteState = async ({
        policy: nextPolicy,
        revoked: nextRevoked,
      }) => {
        await withFormulaGraphLock(async () => {
          const { number: formulaNumber, node: formulaNode } = parseId(id);
          const latestFormula = formulaForId.get(id) ?? currentFormula;
          if (latestFormula.type !== 'git-remote') {
            throw makeError(
              X`GitRemote controller cannot update non-remote formula ${q(id)}`,
            );
          }
          const nextFormula = harden({
            ...latestFormula,
            policy: nextPolicy,
            revoked: nextRevoked,
          });
          await persistencePowers.writeFormula(
            formulaNumber,
            formulaNode,
            nextFormula,
          );
          formulaForId.set(id, nextFormula);
          currentFormula = nextFormula;
        });
      };
      context.thisDiesIfThatDies(gitId);
      if (credentialId !== undefined) {
        context.thisDiesIfThatDies(credentialId);
      }
      const git = await provide(gitId);
      const credential =
        credentialId === undefined ? undefined : await provide(credentialId);
      const { remote } = makeGitRemote({
        // `provide(gitId)` returns a union; `makeGitRemote` accepts a
        // bare `object` and asserts the shape internally.
        // eslint-disable-next-line object-shorthand
        git: /** @type {object} */ (git),
        // eslint-disable-next-line object-shorthand
        credential:
          credential === undefined
            ? undefined
            : /** @type {object} */ (credential),
        name,
        policy,
        revoked,
        onStateChange: persistGitRemoteState,
      });
      return remote;
    },
    lookup: ({ hub, path }, context) =>
      makeLookup(
        hub,
        /** @type {import('./types.js').NamePath} */ (path),
        context,
      ),
    worker: (formula, context, _id, formulaNumber) =>
      makeIdentifiedWorker(
        formulaNumber,
        context,
        formula.kind,
        formula.trustedShims,
        formula.label,
      ),
    'make-unconfined': (
      {
        worker: workerId,
        powers: powersId,
        specifier,
        env = {},
        cancelWithWorker,
      },
      context,
    ) =>
      makeUnconfined(
        workerId,
        powersId,
        specifier,
        env,
        context,
        cancelWithWorker,
      ),
    'make-archive': (
      {
        worker: workerId,
        powers: powersId,
        archive: archiveId,
        env = {},
        cancelWithWorker,
      },
      context,
    ) =>
      makeArchive(
        workerId,
        powersId,
        archiveId,
        env,
        context,
        cancelWithWorker,
      ),
    'make-from-tree': (
      {
        worker: workerId,
        powers: powersId,
        tree: treeId,
        env = {},
        cancelWithWorker,
      },
      context,
    ) =>
      // eslint-disable-next-line no-use-before-define
      makeFromTree(workerId, powersId, treeId, env, context, cancelWithWorker),
    host: async (formula, context, id) => {
      const {
        hostHandle: hostHandleId,
        handle: handleId,
        petStore: petStoreId,
        mailboxStore: mailboxStoreId,
        mailHub: mailHubId,
        inspector: inspectorId,
        mainWorker: hostMainWorkerId,
        nodeWorker: nodeWorkerId,
        endo: endoId,
        networks: networksId,
        planes: planesId,
        pins: pinsId,
      } = formula;

      if (mailHubId === undefined) {
        throw new Error('Host formula missing mail hub');
      }
      if (nodeWorkerId === undefined) {
        throw new Error('Host formula missing nodeWorker (Phase 6 required)');
      }
      // Look up the agent key by scanning the agent_key table for
      // an entry whose agentId has the same formula number.
      const { number: hostNumber } = parseId(id);
      const hostAgentKeys = persistencePowers.listAgentKeys();
      const hostAgentKeyRecord = hostAgentKeys.find(entry => {
        const { number: entryNumber } = parseId(entry.agentId);
        return entryNumber === hostNumber;
      });
      if (hostAgentKeyRecord === undefined) {
        throw new Error(`No agent key found for host formula ${q(hostNumber)}`);
      }
      const agentNodeNumber = /** @type {NodeNumber} */ (
        hostAgentKeyRecord.publicKey
      );

      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      const agent = await makeHost(
        id,
        handleId,
        hostHandleId,
        agentNodeNumber,
        signBytes,
        petStoreId,
        mailboxStoreId,
        mailHubId,
        inspectorId,
        hostMainWorkerId,
        nodeWorkerId,
        endoId,
        networksId,
        planesId,
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
        networks: networksDirectoryId,
        planes: planesDirectoryId,
      } = formula;

      if (mailHubId === undefined) {
        throw new Error('Guest formula missing mail hub');
      }
      // Look up the agent key by formula number.
      const { number: guestNumber } = parseId(id);
      const guestAgentKeys = persistencePowers.listAgentKeys();
      const guestAgentKeyRecord = guestAgentKeys.find(entry => {
        const { number: entryNumber } = parseId(entry.agentId);
        return entryNumber === guestNumber;
      });
      if (guestAgentKeyRecord === undefined) {
        throw new Error(
          `No agent key found for guest formula ${q(guestNumber)}`,
        );
      }
      const agentNodeNumber = /** @type {NodeNumber} */ (
        guestAgentKeyRecord.publicKey
      );

      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      const agent = await makeGuest(
        id,
        handleId,
        agentNodeNumber,
        hostAgentId,
        hostHandleId,
        petStoreId,
        mailboxStoreId,
        mailHubId,
        workerId,
        networksDirectoryId,
        planesDirectoryId,
        context,
      );
      const handle = /** @type {any} */ (agent).handle();
      agentIdForHandle.set(handle, id);
      return agent;
    },
    handle: async ({ agent: agentId }, _context, id) => {
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

      // Size of each ranged read while streaming a log file. The
      // reader yields one entry per non-empty chunk, so a larger
      // window means fewer CapTP messages for big logs.
      const logChunkBytes = 65_536;

      // How long a `follow` stream waits between filesystem polls once a
      // log has no new bytes. Short enough to feel live, long enough that
      // an idle `follow` stream does not busy-poll the disk.
      const followPollMs = 1000;

      /**
       * Enumerate the daemon's log files — the top-level `*.log` files
       * (e.g. `endo.log`) plus each worker's `worker/<id>/worker.log` —
       * paired with a stable display name and modification time, oldest
       * first. Mirrors the discovery the `endo log --all` CLI command
       * performs directly against the filesystem.
       *
       * @returns {Promise<Array<{ path: string, source: string, mtime: bigint }>>}
       */
      const listLogFiles = async () => {
        const { statePath } = persistencePowers;
        /** @type {Array<{ path: string, source: string, mtime: bigint }>} */
        const logFiles = [];
        /**
         * @param {string} logPath
         * @param {string} source
         */
        const consider = async (logPath, source) => {
          const stat = await filePowers
            .statPath(logPath)
            .catch(() => undefined);
          if (stat !== undefined && stat.kind === 'file') {
            logFiles.push(harden({ path: logPath, source, mtime: stat.mtime }));
          }
        };
        // Top-level *.log files.
        const entries = await filePowers
          .readDirectory(statePath)
          .catch(() => []);
        for (const entry of entries) {
          if (entry.endsWith('.log')) {
            await consider(filePowers.joinPath(statePath, entry), entry);
          }
        }
        // Per-worker worker.log files. The display name uses a short id
        // prefix for readability, but since `source` doubles as the
        // `name` selector, fall back to the full id whenever two workers
        // would share a prefix — otherwise selecting one would
        // ambiguously match (and concatenate) both.
        const workerDirectory = filePowers.joinPath(statePath, 'worker');
        const workerIds = await filePowers
          .readDirectory(workerDirectory)
          .catch(() => []);
        const prefixCounts = new Map();
        for (const workerId of workerIds) {
          const prefix = workerId.slice(0, 8);
          prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
        }
        for (const workerId of workerIds) {
          const prefix = workerId.slice(0, 8);
          const source =
            prefixCounts.get(prefix) === 1
              ? `worker/${prefix}`
              : `worker/${workerId}`;
          await consider(
            filePowers.joinPath(workerDirectory, workerId, 'worker.log'),
            source,
          );
        }
        logFiles.sort((a, b) => {
          if (a.mtime < b.mtime) return -1;
          if (a.mtime > b.mtime) return 1;
          // Tie-break on the display name so logs with identical mtimes
          // (created together, or on a coarse-resolution filesystem) have
          // a fully deterministic order rather than a filesystem-dependent
          // one.
          if (a.source < b.source) return -1;
          if (a.source > b.source) return 1;
          return 0;
        });
        return harden(logFiles);
      };

      /**
       * Stream the daemon's logs as a sequence of `{ source, chunk }`
       * records, where `source` is the log's display name and `chunk`
       * is a run of newly read UTF-8 text. Each file is read in bounded
       * windows so an arbitrarily large log never has to be buffered in
       * memory or marshalled in a single message. A streaming decoder
       * keeps multi-byte characters intact across window boundaries.
       *
       * When a content filter (`pattern`) is supplied, the stream
       * switches to line granularity: the windows are split into lines
       * and only matching lines are emitted (each as its own `chunk`,
       * newline included), so the consumer still reconstructs a
       * coherent — but filtered — log by concatenating chunks. A plain
       * substring search is just an unanchored pattern, so no separate
       * `includes` option is needed.
       *
       * @param {object} [options]
       * @param {string} [options.name] Restrict the stream to the single
       *   log whose display name matches exactly (e.g. `endo.log` or
       *   `worker/<id8>`). When omitted, every log is streamed.
       * @param {string} [options.pattern] Emit only lines that match this
       *   regular expression, given as a `RegExp` *source string* (a
       *   `RegExp` object is not passable, so it cannot cross CapTP). The
       *   line's terminator (`\n` or `\r\n`) is excluded when matching,
       *   so `$`-anchored patterns behave the same on LF and CRLF logs.
       * @param {boolean} [options.follow] When false (the default), the
       *   stream ends once the current extent of every selected log has
       *   been read. When true, the stream stays open after reaching the
       *   end and keeps emitting bytes as the logs grow — re-scanning on
       *   each poll so newly created logs (e.g. a freshly spawned worker)
       *   are picked up too — until the consumer closes the reader or the
       *   daemon shuts down.
       * @returns {AsyncGenerator<LogChunk, undefined, undefined>}
       */
      const readLogEntries = async function* readLogEntries(options = {}) {
        const { name, pattern, follow = false } = options;
        // Compile the caller's line predicate once. `pattern` arrives as
        // a RegExp source string and is compiled here. A pathological
        // pattern could backtrack catastrophically (ReDoS) while scanning
        // a large log, but `readLog` is only reachable through the Endo
        // bootstrap capability — a holder of which can already
        // `terminate()` the daemon outright — so this adds no meaningful
        // denial-of-service surface and is deliberately left unsanitised.
        const regexp = pattern === undefined ? undefined : new RegExp(pattern);
        const filtered = regexp !== undefined;
        /** @param {string} line */
        const matchesLine = line => regexp === undefined || regexp.test(line);

        // Per-log streaming cursor. `follow` resumes each log where the
        // previous poll left off, so the byte offset, the streaming
        // decoder (mid multi-byte character) and the trailing partial
        // line must all persist across polls.
        /** @typedef {{ path: string, source: string, offset: number, decoder: TextDecoder, pending: string }} LogCursor */
        /** @type {Map<string, LogCursor>} */
        const cursors = new Map();

        /**
         * @param {{ path: string, source: string }} logFile
         * @returns {LogCursor}
         */
        const cursorFor = ({ path: logPath, source }) => {
          let cursor = cursors.get(logPath);
          if (cursor === undefined) {
            cursor = {
              path: logPath,
              source,
              offset: 0,
              decoder: new TextDecoder(),
              pending: '',
            };
            cursors.set(logPath, cursor);
          }
          return cursor;
        };

        /**
         * Yield every byte currently readable from one log, advancing its
         * cursor and stopping at the present end of file. Partial
         * multi-byte characters, and (when filtering) the trailing partial
         * line, are retained on the cursor for the next call rather than
         * emitted prematurely.
         *
         * @param {LogCursor} cursor
         */
        const drainCursor = async function* drainCursor(cursor) {
          for (;;) {
            const bytes = await filePowers.readFileRange(
              cursor.path,
              cursor.offset,
              logChunkBytes,
            );
            if (bytes.length === 0) {
              break;
            }
            cursor.offset += bytes.length;
            const text = cursor.decoder.decode(bytes, { stream: true });
            // An empty decode means the window ended mid multi-byte
            // character; the decoder retains those bytes for the next read.
            if (text.length !== 0 && !filtered) {
              yield harden({ source: cursor.source, chunk: text });
            } else if (text.length !== 0) {
              cursor.pending += text;
              let newlineIndex = cursor.pending.indexOf('\n');
              while (newlineIndex !== -1) {
                const line = cursor.pending.slice(0, newlineIndex);
                cursor.pending = cursor.pending.slice(newlineIndex + 1);
                // Match the content without its line terminator so a
                // trailing `\r` (CRLF logs) doesn't defeat `$` anchors;
                // re-emit the line with its original terminator intact.
                const content = line.endsWith('\r') ? line.slice(0, -1) : line;
                if (matchesLine(content)) {
                  yield harden({ source: cursor.source, chunk: `${line}\n` });
                }
                newlineIndex = cursor.pending.indexOf('\n');
              }
            }
          }
        };

        /**
         * Flush the bytes the streaming decoder is holding plus the final
         * unterminated line. Only used when a log is considered complete,
         * i.e. never in `follow` mode, where more bytes may still arrive.
         *
         * @param {LogCursor} cursor
         */
        const flushCursor = async function* flushCursor(cursor) {
          const tail = cursor.decoder.decode();
          if (!filtered) {
            if (tail.length > 0) {
              yield harden({ source: cursor.source, chunk: tail });
            }
            return;
          }
          cursor.pending += tail;
          const content = cursor.pending.endsWith('\r')
            ? cursor.pending.slice(0, -1)
            : cursor.pending;
          if (content.length > 0 && matchesLine(content)) {
            yield harden({ source: cursor.source, chunk: cursor.pending });
          }
          cursor.pending = '';
        };

        /** @param {Array<{ path: string, source: string }>} logFiles */
        const select = logFiles =>
          name === undefined
            ? logFiles
            : logFiles.filter(logFile => logFile.source === name);

        if (!follow) {
          for (const logFile of select(await listLogFiles())) {
            const cursor = cursorFor(logFile);
            yield* drainCursor(cursor);
            yield* flushCursor(cursor);
          }
          return undefined;
        }

        // Follow mode: re-enumerate (to catch newly created logs), drain
        // any new bytes from each, then wait and repeat — never flushing,
        // since an unterminated tail may still be completed by later
        // writes. The poll sleep is bounded by the daemon's grace-period
        // promise so the loop and its timer cannot outlive the daemon;
        // `delay` rejects when that promise rejects, which we treat as a
        // clean end of stream. Early consumer close is handled by the
        // reader pump calling this generator's `return()` at the yield
        // point (see the `buffer: 0` note where `readLog` wraps this).
        for (;;) {
          for (const logFile of select(await listLogFiles())) {
            yield* drainCursor(cursorFor(logFile));
          }
          try {
            await delay(followPollMs, gracePeriodElapsed);
          } catch {
            break;
          }
        }
        return undefined;
      };
      const endoBootstrap = /** @type {FarRef<EndoBootstrap>} */ (
        /** @type {unknown} */ (
          makeExo(
            'Endo',
            EndoInterface,
            /** @type {any} */ ({
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
              readLog: async (options = {}) => {
                const settings = options ?? {};
                // Bulk reads stay pipelined for throughput, but a `follow`
                // stream uses no pre-buffer: the pump must park on the syn
                // chain (not inside a pulled, sleeping `next()`) so an
                // early `return()` from the consumer is observed promptly
                // and tears the follow loop down instead of hanging.
                return readerFromIterator(readLogEntries(settings), {
                  buffer: settings.follow ? 0 : 64,
                });
              },
              sign: async hexBytes => toHex(signBytes(fromHex(hexBytes))),
              reviveNetworks: async () => {
                const networksDirectory = await provide(
                  networksId,
                  'directory',
                );
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
                for (const id of pinIds) {
                  logLifecycle(
                    /** @type {FormulaIdentifier} */ (id),
                    'REVIVE_PIN',
                  );
                }
                await Promise.allSettled(
                  pinIds.map(id =>
                    provide(/** @type {FormulaIdentifier} */ (id)),
                  ),
                );
              },
              addPeerInfo: async (
                /** @type {import('./types.js').PeerInfo} */ peerInfo,
              ) => {
                const knownPeers = /** @type {KnownPeersStore} */ (
                  /** @type {unknown} */ (await provideStoreController(peersId))
                );
                const { node: nodeNumber, addresses } = peerInfo;
                assertNodeNumber(nodeNumber);
                if (knownPeers.has(nodeNumber)) {
                  const existingPeerId = knownPeers.identifyLocal(nodeNumber);
                  if (existingPeerId !== undefined) {
                    const existingFormulaId = /** @type {FormulaIdentifier} */ (
                      existingPeerId
                    );
                    const existingFormula =
                      await getFormulaForId(existingFormulaId);
                    if (
                      existingFormula.type === 'peer' &&
                      JSON.stringify(existingFormula.addresses) !==
                        JSON.stringify(addresses)
                    ) {
                      console.log(
                        `addPeerInfo: replacing stale peer for node ${nodeNumber.slice(0, 16)}... (old: ${existingFormula.addresses.length} addr, new: ${addresses.length} addr)`,
                      );
                      console.log(
                        `addPeerInfo:   old addresses=${JSON.stringify(existingFormula.addresses)} new addresses=${JSON.stringify(addresses)}`,
                      );
                      // eslint-disable-next-line no-use-before-define
                      await cancelValue(
                        existingFormulaId,
                        new Error('Peer addresses updated'),
                      );
                      await knownPeers.remove(
                        /** @type {PetName} */ (
                          /** @type {unknown} */ (nodeNumber)
                        ),
                      );
                      const { id: peerId } =
                        // eslint-disable-next-line no-use-before-define
                        await formulatePeer(networksId, nodeNumber, addresses);
                      await knownPeers.storeIdentifier(nodeNumber, peerId);
                      return;
                    }
                  }
                  return;
                }
                console.log(
                  `addPeerInfo: new peer for node ${nodeNumber.slice(0, 16)}... with ${addresses.length} address(es)`,
                );
                console.log(
                  `addPeerInfo:   addresses=${JSON.stringify(addresses)}`,
                );
                const { id: peerId } =
                  // eslint-disable-next-line no-use-before-define
                  await formulatePeer(networksId, nodeNumber, addresses);
                await knownPeers.storeIdentifier(nodeNumber, peerId);
              },
              listKnownPeers: async () => {
                const knownPeers = /** @type {KnownPeersStore} */ (
                  /** @type {unknown} */ (await provideStoreController(peersId))
                );
                const connectionStates =
                  provideRemoteControl.getConnectionStates();
                const nodeNumbers = knownPeers.list();
                /** @type {Array<PeerInfo & { connectionState: string }>} */
                const peers = [];
                for (const nodeNumber of nodeNumbers) {
                  const peerId = knownPeers.identifyLocal(
                    /** @type {NodeNumber} */ (
                      /** @type {unknown} */ (nodeNumber)
                    ),
                  );
                  if (peerId !== undefined) {
                    const formula = await getFormulaForId(
                      /** @type {FormulaIdentifier} */ (peerId),
                    );
                    if (formula.type === 'peer') {
                      const nodeId = /** @type {PeerFormula} */ (formula).node;
                      peers.push(
                        harden({
                          node: nodeId,
                          addresses: /** @type {PeerFormula} */ (formula)
                            .addresses,
                          connectionState: connectionStates[nodeId] || 'start',
                        }),
                      );
                    }
                  }
                }
                return harden(peers);
              },
              followPeerChanges: async () => {
                const knownPeers = /** @type {KnownPeersStore} */ (
                  /** @type {unknown} */ (await provideStoreController(peersId))
                );
                return knownPeers.followNameChanges();
              },
            }),
          )
        )
      );
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
            locateContent: disallowedFn,
            listContent: disallowedFn,
            storeContent: disallowedFn,
            reverseLocateContent: disallowedFn,
            internalizeContentLocator: disallowedFn,
            followLocatorNameChanges: disallowedFn,
            list: disallowedFn,
            listIdentifiers: disallowedFn,
            listLocators: disallowedFn,
            followNameChanges: disallowedFn,
            lookup: disallowedFn,
            maybeLookup: disallowedSyncFn,
            lookupById: disallowedFn,
            lookupByLocator: disallowedFn,
            reverseLookup: disallowedFn,
            storeIdentifier: disallowedFn,
            storeLocator: disallowedFn,
            remove: disallowedFn,
            move: disallowedFn,
            copy: disallowedFn,
            makeDirectory: disallowedFn,
            readText: disallowedFn,
            maybeReadText: disallowedFn,
            writeText: disallowedFn,
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
            evaluate: disallowedFn,
            define: disallowedFn,
            form: disallowedFn,
            storeBlob: disallowedFn,
            storeValue: disallowedFn,
            submit: disallowedFn,
            sendValue: disallowedFn,
            deliver: disallowedSyncFn,
            editMessage: disallowedFn,
            messageHistory: disallowedFn,
          })
        )
      );
    },
    'pet-store': async (_formula, _context, _id, formulaNumber) => {
      await null;
      return petStorePowers.makeIdentifiedPetStore(
        formulaNumber,
        'pet-store',
        assertPetName,
      );
    },
    'mailbox-store': async (_formula, _context, _id, formulaNumber) => {
      await null;
      return petStorePowers.makeIdentifiedPetStore(
        formulaNumber,
        'mailbox-store',
        assertMailboxStoreName,
      );
    },
    'mail-hub': ({ store: storeId }, context) => makeMailHub(storeId, context),
    message: (formula, context) => makeMessageHub(formula, context),
    promise: ({ store: storeId }, context) => makePromise(storeId, context),
    resolver: ({ store: storeId }, context) => makeResolver(storeId, context),
    'known-peers-store': async (_formula, _context, _id, formulaNumber) => {
      await null;
      return petStorePowers.makeIdentifiedPetStore(
        formulaNumber,
        'known-peers-store',
        assertValidNumber,
      );
    },
    'pet-inspector': ({ petStore: petStoreId }) =>
      // Behold, unavoidable forward-reference:
      // eslint-disable-next-line no-use-before-define
      makePetStoreInspector(petStoreId),
    directory: ({ petStore: petStoreId }, context) => {
      // Behold, forward-reference:
      // eslint-disable-next-line no-use-before-define
      return makeIdentifiedDirectory({
        petStoreId,
        context,
        agentNodeNumber: localNodeNumber,
        isLocalKey,
      });
    },
    peer: (
      { networks: networksId, node: nodeId, addresses: addressesId },
      context,
    ) =>
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      makePeer(networksId, nodeId, addressesId, context),
    invitation: (
      { hostAgent: hostAgentId, hostHandle: hostHandleId, guestName },
      _context, // eslint-disable-line no-underscore-dangle
      id,
    ) =>
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      makeInvitation(
        id,
        hostAgentId,
        hostHandleId,
        /** @type {import('./types.js').NameOrPath} */ (guestName),
      ),
    timer: async ({ intervalMs, label: timerLabel }, context) => {
      const interval = Number(intervalMs) || 60_000;
      let tickCount = 0;
      /** @type {Array<{ callback: object, context: string }>} */
      const subscribers = [];

      // Start the timer loop (fire-and-forget — runs until cancelled)
      const runTimer = async () => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            await delay(interval, context.cancelled);
          } catch {
            break; // Cancelled — clean exit
          }
          tickCount += 1;
          const tick = harden({
            tick: tickCount,
            label: timerLabel || 'timer',
            timestamp: new Date().toISOString(),
          });
          for (const sub of subscribers) {
            try {
              await E(sub.callback).onTick(tick);
            } catch (err) {
              console.error(
                `[timer] subscriber error:`,
                /** @type {Error} */ (err).message,
              );
            }
          }
        }
      };

      runTimer();

      return Far('Timer', {
        __getMethodNames__: () =>
          harden([
            '__getMethodNames__',
            'subscribe',
            'getLabel',
            'getInterval',
            'help',
          ]),
        subscribe: callback => {
          subscribers.push({ callback, context: '' });
        },
        getLabel: () => timerLabel || 'timer',
        getInterval: () => interval,
        help: () =>
          `Timer "${timerLabel || 'timer'}" firing every ${interval}ms. Ticks: ${tickCount}`,
      });
    },
    channel: async (formula, context, id) => {
      const {
        handle: handleId,
        creatorAgent: creatorAgentId,
        messageStore: messageStoreId,
        memberStore: memberStoreId,
        proposedName: channelProposedName,
      } = formula;
      // Behold, forward reference:
      // eslint-disable-next-line no-use-before-define
      return makeChannelInstance(
        id,
        handleId,
        creatorAgentId,
        messageStoreId,
        memberStoreId,
        channelProposedName,
        context,
      );
    },
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
      const make = /** @type {any} */ (makers)[formula.type];
      const value = await /** @type {unknown} */ (
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
    const isRemote = !isLocalKey(formulaNode);
    if (isRemote) {
      // eslint-disable-next-line no-use-before-define
      const peerId = await getPeerIdForNodeIdentifier(formulaNode);
      context.thisDiesIfThatDies(peerId);
      const peer = provide(peerId, 'peer');
      return E(peer).provide(id);
    }

    const formula = await getFormulaForId(id);
    logLifecycle(id, 'REINCARNATE');
    assertValidFormulaType(formula.type);

    return evaluateFormula(id, formulaNumber, formula, context);
  };

  /** @type {DaemonCore['formulate']} */
  /**
   * Persist a formula to disk and register it in the graph, but do NOT
   * evaluate it eagerly.  Callers can later call `provide(id)` to
   * trigger evaluation on demand.  Useful for formulas that should
   * come to life only when first used (e.g., peer connections).
   *
   * @param {FormulaNumber} formulaNumber
   * @param {Formula} formula
   * @returns {Promise<FormulaIdentifier>}
   */
  const formulateLazy = async (
    formulaNumber,
    formula,
    nodeNumber = localNodeNumber,
  ) => {
    const id = formatId({
      number: formulaNumber,
      node: nodeNumber,
    });
    await persistencePowers.writeFormula(formulaNumber, nodeNumber, formula);
    await withFormulaGraphLock(async () => {
      if (formulaForId.has(id)) return;
      formulaForId.set(id, formula);
      formulaGraph.onFormulaAdded(id, formula);
    });
    formulaChangeTopic.publisher.next(
      harden({ add: formulaNumber, node: nodeNumber }),
    );
    logLifecycle(id, 'FORMULATE_LAZY');
    return id;
  };

  /** @type {DaemonCore['formulate']} */
  const formulate = async (
    formulaNumber,
    formula,
    nodeNumber = localNodeNumber,
  ) => {
    const id = formatId({
      number: formulaNumber,
      node: nodeNumber,
    });

    // Persist to disk before the formula becomes visible in the graph.
    // This ensures that retries and reincarnation can always read the
    // formula JSON, even if evaluation fails immediately.
    await persistencePowers.writeFormula(formulaNumber, nodeNumber, formula);

    await withFormulaGraphLock(async () => {
      formulaForId.has(id) && assert.Fail`Formula already exists for id ${id}`;
      formulaForId.set(id, formula);
      formulaGraph.onFormulaAdded(id, formula);
    });
    formulaChangeTopic.publisher.next(
      harden({ add: formulaNumber, node: nodeNumber }),
    );

    logLifecycle(id, 'FORMULATE');
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

    // The controller _must_ be constructed in the synchronous prelude of this function.
    const valuePromise = evaluateFormula(id, formulaNumber, formula, context);
    resolve(valuePromise);

    return harden({
      id,
      value: controller.value,
    });
  };

  /** @type {DaemonCore['provideController']} */
  const provideController = inputId => {
    const id = inputId;
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
      /** @type {unknown} */ (await provideStoreController(knownPeersId))
    );
    // The knownPeers pet store uses node numbers as keys, not pet names.
    // This is a deliberate aberration of the pet store abstraction.
    let peerId = knownPeers.identifyLocal(nodeNumber);

    // If not found as a daemon node, check if it's a remote agent key
    // and look up the owning daemon's node.
    if (peerId === undefined) {
      const daemonNode = persistencePowers.getRemoteAgentKey(nodeNumber);
      if (daemonNode !== undefined) {
        peerId = knownPeers.identifyLocal(
          /** @type {NodeNumber} */ (daemonNode),
        );
      }
    }

    if (peerId === undefined) {
      throw new Error(`No peer found for node identifier ${q(nodeNumber)}.`);
    }
    parseId(peerId);
    return /** @type {FormulaIdentifier} */ (peerId);
  };

  /** @type {DaemonCore['cancelValue']} */
  const cancelValue = async (id, reason) => {
    // Wait for any in-flight graph operation (formulation, collection)
    // to finish before cancelling.
    await formulaGraphJobs.enqueue();
    const controller = provideController(id);
    logLifecycle(id, 'CANCEL_REQUEST', reason?.message);
    return controller.context.cancel(reason);
  };

  /** @type {DaemonCore['formulateReadableBlob']} */
  const formulateReadableBlob = async (readerRef, deferredTasks) => {
    return /** @type {FormulateResult<FarRef<EndoReadable>>} */ (
      withFormulaGraphLock(async () => {
        await null;
        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );
        const contentSha256 = await contentStore.store(
          // Use a higher string length limit to accommodate large
          // payloads like bundles. 10MB base64 ~= 7.5MB binary.
          // `iterateBytesReader` returns the iterator synchronously; the
          // store consumes it, so no `await` here.
          iterateBytesReader(readerRef, {
            stringLengthLimit: 10_000_000,
          }),
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
          content: contentSha256,
        };

        return formulate(formulaNumber, formula);
      })
    );
  };

  /** @type {DaemonCore['formulateMount']} */
  const formulateMount = async (
    mountPath,
    readOnly,
    deferredTasks,
    deniedSegments = undefined,
  ) => {
    return /** @type {FormulateResult<EndoMount>} */ (
      withFormulaGraphLock(async () => {
        await null;
        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );

        await deferredTasks.execute({
          mountId: formatId({
            number: formulaNumber,
            node: localNodeNumber,
          }),
        });

        // The `deniedSegments` field is included only when overridden, so a
        // default mount keeps its historical persisted formula shape (the
        // on-disk record stays byte-identical to the pre-deny era). Formula
        // numbers are random, not content-addressed, so this is about the
        // record's shape and backward-compatibility, not formula identity.
        /** @type {import('./types.js').MountFormula} */
        const formula = harden({
          type: 'mount',
          path: mountPath,
          readOnly,
          ...(deniedSegments !== undefined ? { deniedSegments } : {}),
        });

        return formulate(formulaNumber, formula);
      })
    );
  };

  /** @type {DaemonCore['formulateScratchMount']} */
  const formulateScratchMount = async (
    readOnly,
    deferredTasks,
    deniedSegments = undefined,
  ) => {
    return /** @type {FormulateResult<EndoMount>} */ (
      withFormulaGraphLock(async () => {
        await null;
        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );

        await deferredTasks.execute({
          scratchMountId: formatId({
            number: formulaNumber,
            node: localNodeNumber,
          }),
        });

        /** @type {import('./types.js').ScratchMountFormula} */
        const formula = harden({
          type: 'scratch-mount',
          readOnly,
          ...(deniedSegments !== undefined ? { deniedSegments } : {}),
        });

        return formulate(formulaNumber, formula);
      })
    );
  };

  /** @type {DaemonCore['formulateGit']} */
  const formulateGit = async (
    mountId,
    allowHistoryRewrite,
    identity,
    deferredTasks,
  ) => {
    return /** @type {FormulateResult<EndoGit>} */ (
      withFormulaGraphLock(async () => {
        await null;
        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );

        await deferredTasks.execute({
          gitId: formatId({
            number: formulaNumber,
            node: localNodeNumber,
          }),
        });

        /** @type {import('./types.js').GitFormula} */
        const formula = harden({
          type: 'git',
          mountId,
          ...(allowHistoryRewrite && { allowHistoryRewrite: true }),
          ...(identity && { identity }),
        });

        return formulate(formulaNumber, formula);
      })
    );
  };

  /** @type {DaemonCore['formulateShell']} */
  const formulateShell = async (mountId, policy, deferredTasks) => {
    return /** @type {FormulateResult<import('./types.js').EndoShell>} */ (
      withFormulaGraphLock(async () => {
        await null;
        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );

        await deferredTasks.execute({
          shellId: formatId({
            number: formulaNumber,
            node: localNodeNumber,
          }),
        });

        /** @type {import('./types.js').ShellFormula} */
        const formula = harden({
          type: 'shell',
          mountId,
          policy,
        });

        return formulate(formulaNumber, formula);
      })
    );
  };

  /** @type {DaemonCore['formulateHttpClient']} */
  const formulateHttpClient = async (policy, deferredTasks) => {
    return /** @type {FormulateResult<import('@endo/exo-http-client').HttpClient>} */ (
      withFormulaGraphLock(async () => {
        await null;
        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );

        await deferredTasks.execute({
          httpClientId: formatId({
            number: formulaNumber,
            node: localNodeNumber,
          }),
        });

        /** @type {import('./types.js').HttpClientFormula} */
        const formula = harden({
          type: 'http-client',
          policy,
        });

        return formulate(formulaNumber, formula);
      })
    );
  };

  /** @type {DaemonCore['formulateGitCredential']} */
  const formulateGitCredential = async (
    kind,
    audience,
    material,
    deferredTasks,
  ) => {
    /** @type {GitCredentialMaterial} */
    let storedMaterial;
    if (kind === 'bearer' && typeof material.token === 'string') {
      storedMaterial = harden({ kind, token: material.token });
    } else if (
      kind === 'basic' &&
      typeof material.username === 'string' &&
      typeof material.password === 'string'
    ) {
      storedMaterial = harden({
        kind,
        username: material.username,
        password: material.password,
      });
    } else {
      throw makeError(
        X`Git credential material does not match kind ${q(kind)}`,
      );
    }
    return /** @type {FormulateResult<unknown>} */ (
      withFormulaGraphLock(async () => {
        await null;
        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );
        const gitCredentialId = formatId({
          number: formulaNumber,
          node: localNodeNumber,
        });

        await deferredTasks.execute({ gitCredentialId });
        gitCredentialMaterialForId.set(gitCredentialId, storedMaterial);

        /** @type {import('./types.js').GitCredentialFormula} */
        const formula = harden({
          type: 'git-credential',
          kind,
          audience,
        });

        return formulate(formulaNumber, formula);
      })
    );
  };

  /** @type {DaemonCore['formulateGitRemote']} */
  const formulateGitRemote = async (
    gitId,
    credentialId,
    name,
    policy,
    deferredTasks,
  ) => {
    return /** @type {FormulateResult<import('@endo/exo-git').GitRemote>} */ (
      withFormulaGraphLock(async () => {
        await null;
        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );

        await deferredTasks.execute({
          gitRemoteId: formatId({
            number: formulaNumber,
            node: localNodeNumber,
          }),
        });

        /** @type {import('./types.js').GitRemoteFormula} */
        const formula = harden({
          type: 'git-remote',
          gitId,
          ...(credentialId === undefined ? {} : { credentialId }),
          name,
          policy,
        });

        return formulate(formulaNumber, formula);
      })
    );
  };

  /** @type {DaemonCore['checkinTree']} */
  const checkinTree = async (remoteTree, deferredTasks) => {
    return /** @type {FormulateResult<unknown>} */ (
      withFormulaGraphLock(async () => {
        await null;

        const archiveTree =
          /** @type {import('@endo/eventual-send').ERef<ArchiveTreeMethods>} */ (
            remoteTree
          );
        const methods =
          // eslint-disable-next-line no-underscore-dangle
          await E(archiveTree)
            .__getMethodNames__()
            .catch(() => /** @type {string[]} */ ([]));
        // `git archive` is not a lossless tree source: it honors a
        // committed `.gitattributes` `export-ignore` (omitting matching
        // tracked files) and flattens gitlinks / submodule commits to
        // empty directories. Take the fast archive path only when the
        // tree reports itself archive-lossless; otherwise fall back to
        // the per-entry `ls-tree`/`cat-file` walk, which mirrors the
        // committed tree exactly and fails loudly on gitlinks.
        const useArchive =
          methods.includes('archiveTar') &&
          (!methods.includes('archiveLossless') ||
            (await E(archiveTree).archiveLossless()));
        const treeSha256 = useArchive
          ? await checkinTarTree(
              await E(archiveTree).archiveTar(),
              contentStore,
            )
          : (await platformCheckinTree(remoteTree, contentStore)).sha256;

        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );

        await deferredTasks.execute({
          readableTreeId: formatId({
            number: formulaNumber,
            node: localNodeNumber,
          }),
        });

        /** @type {import('./types.js').ReadableTreeFormula} */
        const formula = {
          type: 'readable-tree',
          content: treeSha256,
        };

        return formulate(formulaNumber, formula);
      })
    );
  };

  /**
   * @param {FormulaIdentifier} hostAgentId
   * @param {FormulaIdentifier} hostHandleId
   * @param {NameOrPath} guestName
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
          await randomHex256()
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
   * @param {FormulaIdentifier} creatorAgentId
   * @param {FormulaIdentifier} handleId
   * @param {string} channelProposedName
   * @param {DeferredTasks<import('./types.js').ChannelDeferredTaskParams>} deferredTasks
   */
  const formulateChannel = async (
    creatorAgentId,
    handleId,
    channelProposedName,
    deferredTasks,
  ) => {
    return /** @type {FormulateResult<import('./types.js').EndoChannel>} */ (
      withFormulaGraphLock(async () => {
        const channelNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );
        const messageStoreNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );
        const memberStoreNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );

        // Formulate subsidiary stores
        await formulateNumberedPetStore(messageStoreNumber);
        await formulateNumberedPetStore(memberStoreNumber);

        const messageStoreId = formatId({
          number: messageStoreNumber,
          node: localNodeNumber,
        });
        const memberStoreId = formatId({
          number: memberStoreNumber,
          node: localNodeNumber,
        });
        const channelId = formatId({
          number: channelNumber,
          node: localNodeNumber,
        });

        await deferredTasks.execute({
          channelId,
        });

        /** @type {import('./types.js').ChannelFormula} */
        const formula = {
          type: 'channel',
          handle: handleId,
          creatorAgent: creatorAgentId,
          messageStore: messageStoreId,
          memberStore: memberStoreId,
          proposedName: channelProposedName,
        };

        return formulate(channelNumber, formula);
      })
    );
  };

  /**
   * @param {number} intervalMs
   * @param {string} label
   * @param {import('./types.js').DeferredTasks<{ timerId: FormulaIdentifier }>} deferredTasks
   */
  const formulateTimer = async (intervalMs, label, deferredTasks) => {
    return withFormulaGraphLock(async () => {
      const timerNumber = /** @type {FormulaNumber} */ (await randomHex256());
      const timerId = formatId({
        number: timerNumber,
        node: localNodeNumber,
      });

      await deferredTasks.execute({ timerId });

      /** @type {TimerFormula} */
      const formula = harden({
        type: /** @type {const} */ ('timer'),
        intervalMs,
        label,
      });

      return formulate(timerNumber, formula);
    });
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
   * @param {NodeNumber} [nodeNumber] - The node number to use (defaults to localNodeNumber).
   * @returns {Promise<FormulaIdentifier>}
   */
  const formulateNumberedHandle = async (
    formulaNumber,
    agentId,
    nodeNumber = localNodeNumber,
  ) => {
    /** @type {HandleFormula} */
    const formula = {
      type: 'handle',
      agent: agentId,
    };
    await persistencePowers.writeFormula(formulaNumber, nodeNumber, formula);
    const id = formatId({
      number: formulaNumber,
      node: nodeNumber,
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
   * @param {NodeNumber} [nodeNumber] - The node number to use (defaults to localNodeNumber).
   * @returns {FormulateResult<PetStore>} The formulated pet store.
   */
  const formulateNumberedPetStore = async (
    formulaNumber,
    nodeNumber = localNodeNumber,
  ) => {
    /** @type {PetStoreFormula} */
    const formula = {
      type: 'pet-store',
    };
    return /** @type {FormulateResult<PetStore>} */ (
      formulate(formulaNumber, formula, nodeNumber)
    );
  };

  /**
   * Formulates a `mailbox-store` formula and synchronously adds it to the
   * formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {FormulaNumber} formulaNumber - The formula number of the mailbox store.
   * @param {NodeNumber} [nodeNumber] - The node number to use (defaults to localNodeNumber).
   * @returns {FormulateResult<PetStore>} The formulated mailbox store.
   */
  const formulateNumberedMailboxStore = async (
    formulaNumber,
    nodeNumber = localNodeNumber,
  ) => {
    /** @type {MailboxStoreFormula} */
    const formula = {
      type: 'mailbox-store',
    };
    return /** @type {FormulateResult<PetStore>} */ (
      formulate(formulaNumber, formula, nodeNumber)
    );
  };

  /**
   * Formulates a `mail-hub` formula and synchronously adds it to the
   * formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {FormulaNumber} formulaNumber - The mail hub formula number.
   * @param {FormulaIdentifier} mailboxStoreId
   * @param {NodeNumber} [nodeNumber] - The node number to use (defaults to localNodeNumber).
   * @returns {FormulateResult<NameHub>} The formulated mail hub.
   */
  const formulateNumberedMailHub = async (
    formulaNumber,
    mailboxStoreId,
    nodeNumber = localNodeNumber,
  ) => {
    /** @type {MailHubFormula} */
    const formula = {
      type: 'mail-hub',
      store: mailboxStoreId,
    };
    return /** @type {FormulateResult<NameHub>} */ (
      formulate(formulaNumber, formula, nodeNumber)
    );
  };

  /**
   * @type {DaemonCore['formulateDirectory']}
   */
  const formulateDirectory = async (nodeNumber = localNodeNumber) => {
    return /** @type {FormulateResult<EndoDirectory>} */ (
      withFormulaGraphLock(async () => {
        const { id: petStoreId } = await formulateNumberedPetStore(
          /** @type {FormulaNumber} */ (await randomHex256()),
          nodeNumber,
        );
        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );
        /** @type {DirectoryFormula} */
        const formula = {
          type: 'directory',
          petStore: petStoreId,
        };
        const result = await formulate(formulaNumber, formula, nodeNumber);
        pinTransient(result.id);
        return result;
      })
    );
  };

  /**
   * Formulates a `directory` formula backed by an existing pet-store.
   *
   * @param {FormulaIdentifier} storeId - The existing store formula ID.
   * @returns {FormulateResult<EndoDirectory>}
   */
  const formulateDirectoryForStore = async storeId => {
    return /** @type {FormulateResult<EndoDirectory>} */ (
      withFormulaGraphLock(async () => {
        const formulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
        );
        /** @type {DirectoryFormula} */
        const formula = {
          type: 'directory',
          petStore: storeId,
        };
        const result = await formulate(formulaNumber, formula);
        pinTransient(result.id);
        return result;
      })
    );
  };

  /**
   * Formulates a `worker` formula and synchronously adds it to the formula graph.
   * The returned promise is resolved after the formula is persisted.
   *
   * @param {FormulaNumber} formulaNumber - The worker formula number.
   * @param {object} [options]
   * @param {string[]} [options.trustedShims] - Module specifiers imported before lockdown.
   * @param {string} [options.label] - Human-readable label for status reporting.
   * @param {'locked' | 'node'} [options.kind] - Worker kind (locked for XS, node for Node.js).
   * @param {NodeNumber} [options.nodeNumber] - Node number (defaults to localNodeNumber).
   * @returns {ReturnType<DaemonCore['formulateWorker']>}
   */
  const formulateNumberedWorker = (
    formulaNumber,
    {
      trustedShims,
      label = '<untitled>',
      kind,
      nodeNumber = localNodeNumber,
    } = {},
  ) => {
    /** @type {WorkerFormula} */
    const formula = {
      type: 'worker',
      label,
      ...(trustedShims && trustedShims.length > 0
        ? { trustedShims }
        : undefined),
      ...(kind ? { kind } : undefined),
    };

    return /** @type {FormulateResult<EndoWorker>} */ (
      formulate(formulaNumber, formula, nodeNumber)
    );
  };

  /**
   * @type {DaemonCore['formulateWorker']}
   */
  const formulateWorker = async (
    deferredTasks,
    trustedShims = undefined,
    label = undefined,
  ) => {
    return withFormulaGraphLock(async () => {
      const formulaNumber = /** @type {FormulaNumber} */ (await randomHex256());

      await deferredTasks.execute({
        workerId: formatId({
          number: formulaNumber,
          node: localNodeNumber,
        }),
      });

      return formulateNumberedWorker(formulaNumber, { trustedShims, label });
    });
  };

  /**
   * Generates an Ed25519 keypair, hex-encodes the keys, and formulates
   * a keypair formula.
   *
   */

  /**
   * @type {DaemonCore['formulateHostDependencies']}
   */
  const formulateHostDependencies = async specifiedIdentifiers => {
    const { specifiedWorkerId, workerLabel, ...remainingSpecifiedIdentifiers } =
      specifiedIdentifiers;

    // Pin each dependency formula to protect it from collection until the
    // parent host formula links them via formulaDeps.
    /** @type {FormulaIdentifier[]} */
    const pinned = [];
    /** @param {FormulaIdentifier} id */
    const pin = id => {
      pinTransient(id);
      pinned.push(id);
      return id;
    };

    await null;

    // Generate the agent keypair first so we know the agent's node number.
    const hostFormulaNumber = /** @type {FormulaNumber} */ (
      await randomHex256()
    );
    const keypair = await generateEd25519Keypair();
    const agentNodeNumber = /** @type {NodeNumber} */ (
      toHex(keypair.publicKey)
    );
    const hostId = formatId({
      number: hostFormulaNumber,
      node: agentNodeNumber,
    });
    persistencePowers.writeAgentKey(
      toHex(keypair.publicKey),
      toHex(keypair.privateKey),
      hostId,
    );

    const storeId = pin(
      (
        await formulateNumberedPetStore(
          /** @type {FormulaNumber} */ (await randomHex256()),
          agentNodeNumber,
        )
      ).id,
    );
    const mailboxStoreId = pin(
      (
        await formulateNumberedMailboxStore(
          /** @type {FormulaNumber} */ (await randomHex256()),
          agentNodeNumber,
        )
      ).id,
    );
    const mailHubId = pin(
      (
        await formulateNumberedMailHub(
          /** @type {FormulaNumber} */ (await randomHex256()),
          mailboxStoreId,
          agentNodeNumber,
        )
      ).id,
    );

    const handleId = pin(
      await formulateNumberedHandle(
        /** @type {FormulaNumber} */ (await randomHex256()),
        hostId,
        agentNodeNumber,
      ),
    );

    /* eslint-disable no-use-before-define */
    const inspectorId = pin(
      (
        await formulateNumberedPetInspector(
          /** @type {FormulaNumber} */ (await randomHex256()),
          storeId,
          agentNodeNumber,
        )
      ).id,
    );
    const hostMainWorkerId = pin(
      await provideWorkerId(
        specifiedWorkerId,
        undefined,
        workerLabel ?? 'host',
        agentNodeNumber,
      ),
    );
    // The @node special name is backed by a host-scoped Node.js
    // worker.  Required regardless of the daemon's defaultWorkerKind
    // so XS-default daemons still expose a Node bridge.
    const nodeWorkerId = pin(
      await provideWorkerId(
        undefined,
        undefined,
        'host-node',
        agentNodeNumber,
        'node',
      ),
    );
    // Every agent owns an initially empty `@planes` directory. A data plane is
    // opt-in: only a capability the agent places here can contribute a source
    // hint to its content locators.
    const planesDirectoryId = pin(
      (await formulateDirectory(agentNodeNumber)).id,
    );
    /* eslint-enable no-use-before-define */

    return harden({
      ...remainingSpecifiedIdentifiers,
      hostFormulaNumber,
      hostId,
      handleId,
      agentNodeNumber,
      hostHandleId: remainingSpecifiedIdentifiers.hostHandleId ?? handleId,
      storeId,
      mailboxStoreId,
      mailHubId,
      inspectorId,
      mainWorkerId: hostMainWorkerId,
      nodeWorkerId,
      planesDirectoryId,
      pinned,
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
      mainWorker: identifiers.mainWorkerId,
      nodeWorker: identifiers.nodeWorkerId,
      endo: identifiers.endoId,
      networks: identifiers.networksDirectoryId,
      planes: identifiers.planesDirectoryId,
      pins: identifiers.pinsDirectoryId,
    };

    return /** @type {FormulateResult<EndoHost>} */ (
      formulate(
        identifiers.hostFormulaNumber,
        formula,
        identifiers.agentNodeNumber,
      )
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
    workerLabel,
  ) => {
    return withFormulaGraphLock(async () => {
      const identifiers = await formulateHostDependencies({
        endoId,
        networksDirectoryId,
        pinsDirectoryId,
        specifiedWorkerId,
        hostHandleId,
        workerLabel,
      });

      await deferredTasks.execute({
        agentId: identifiers.hostId,
        handleId: identifiers.handleId,
      });

      const result = await formulateNumberedHost(identifiers);
      for (const id of identifiers.pinned) {
        unpinTransient(id);
      }
      return result;
    });
  };

  /** @type {DaemonCore['formulateGuestDependencies']} */
  const formulateGuestDependencies = async (
    hostAgentId,
    hostHandleId,
    workerLabel,
  ) => {
    // Pin each dependency formula to protect it from collection until the
    // parent guest formula links them via formulaDeps.
    /** @type {FormulaIdentifier[]} */
    const pinned = [];
    /** @param {FormulaIdentifier} id */
    const pin = id => {
      pinTransient(id);
      pinned.push(id);
      return id;
    };

    // Generate the agent keypair first so we know the agent's node number.
    const guestFormulaNumber = /** @type {FormulaNumber} */ (
      await randomHex256()
    );
    const keypair = await generateEd25519Keypair();
    const agentNodeNumber = /** @type {NodeNumber} */ (
      toHex(keypair.publicKey)
    );
    const guestId = formatId({
      number: guestFormulaNumber,
      node: agentNodeNumber,
    });
    persistencePowers.writeAgentKey(
      toHex(keypair.publicKey),
      toHex(keypair.privateKey),
      guestId,
    );

    const handleId = pin(
      await formulateNumberedHandle(
        /** @type {FormulaNumber} */ (await randomHex256()),
        guestId,
        agentNodeNumber,
      ),
    );
    const mailboxStoreId = pin(
      (
        await formulateNumberedMailboxStore(
          /** @type {FormulaNumber} */ (await randomHex256()),
          agentNodeNumber,
        )
      ).id,
    );
    const mailHubId = pin(
      (
        await formulateNumberedMailHub(
          /** @type {FormulaNumber} */ (await randomHex256()),
          mailboxStoreId,
          agentNodeNumber,
        )
      ).id,
    );

    const storeId = pin(
      (
        await formulateNumberedPetStore(
          /** @type {FormulaNumber} */ (await randomHex256()),
          agentNodeNumber,
        )
      ).id,
    );
    const workerId = pin(
      (
        await formulateNumberedWorker(
          /** @type {FormulaNumber} */ (await randomHex256()),
          { label: workerLabel ?? 'guest', nodeNumber: agentNodeNumber },
        )
      ).id,
    );
    // Each guest gets its own (initially empty) networks directory that
    // controls which connection hints appear in locators it produces.
    const networksDirectoryId = pin(
      (await formulateDirectory(agentNodeNumber)).id,
    );
    const planesDirectoryId = pin(
      (await formulateDirectory(agentNodeNumber)).id,
    );
    return harden({
      guestFormulaNumber,
      guestId,
      handleId,
      agentNodeNumber,
      hostAgentId,
      hostHandleId,
      storeId,
      mailboxStoreId,
      mailHubId,
      workerId,
      networksDirectoryId,
      planesDirectoryId,
      pinned,
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
      networks: identifiers.networksDirectoryId,
      planes: identifiers.planesDirectoryId,
    };

    return /** @type {FormulateResult<EndoGuest>} */ (
      formulate(
        identifiers.guestFormulaNumber,
        formula,
        identifiers.agentNodeNumber,
      )
    );
  };

  /** @type {DaemonCore['formulateGuest']} */
  const formulateGuest = async (
    hostAgentId,
    hostHandleId,
    deferredTasks,
    workerLabel,
  ) => {
    return withFormulaGraphLock(async () => {
      const identifiers = await formulateGuestDependencies(
        hostAgentId,
        hostHandleId,
        workerLabel,
      );

      await deferredTasks.execute({
        agentId: identifiers.guestId,
        handleId: identifiers.handleId,
      });

      const result = await formulateNumberedGuest(identifiers);
      for (const id of identifiers.pinned) {
        unpinTransient(id);
      }
      return result;
    });
  };

  /**
   * @param {FormulaIdentifier} [specifiedWorkerId]
   * @param {string[]} [trustedShims]
   * @param {string} [label]
   * @param {NodeNumber} [nodeNumber] - The node number to use (defaults to localNodeNumber).
   * @param {'locked' | 'node'} [kind]
   */
  const provideWorkerId = async (
    specifiedWorkerId,
    trustedShims = undefined,
    label = undefined,
    nodeNumber = localNodeNumber,
    kind = undefined,
  ) => {
    await null;
    if (typeof specifiedWorkerId === 'string') {
      if (kind === 'node' && defaultWorkerKind !== 'node') {
        // Default workers are XS/locked (bus daemon under Rust
        // supervisor).  Create a separate Node.js worker.  The original
        // XS worker stays alive (it may have running evals).
        const existingFormula = formulaForId.get(specifiedWorkerId);
        if (
          existingFormula &&
          existingFormula.type === 'worker' &&
          !existingFormula.kind
        ) {
          const workerFormulaNumber = /** @type {FormulaNumber} */ (
            await randomHex256()
          );
          const workerFormulation = await formulateNumberedWorker(
            workerFormulaNumber,
            { kind, trustedShims, label },
          );
          return workerFormulation.id;
        }
      }
      return specifiedWorkerId;
    }

    const workerFormulaNumber = /** @type {FormulaNumber} */ (
      await randomHex256()
    );
    const workerFormulation = await formulateNumberedWorker(
      workerFormulaNumber,
      { kind, trustedShims, label, nodeNumber },
    );
    return workerFormulation.id;
  };

  /** @type {DaemonCore['formulateMarshalValue']} */
  async function formulateMarshalValue(value, deferredTasks, pin) {
    return /** @type {FormulateResult<void>} */ (
      withFormulaGraphLock(async () => {
        const ownFormulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
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
        await randomHex256()
      );
      const promiseFormulaNumber = /** @type {FormulaNumber} */ (
        await randomHex256()
      );
      const resolverFormulaNumber = /** @type {FormulaNumber} */ (
        await randomHex256()
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
      const formulaNumber = /** @type {FormulaNumber} */ (await randomHex256());
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
    workerLabel = undefined,
  ) => {
    return /** @type {FormulateResult<unknown>} */ (
      withFormulaGraphLock(async () => {
        const ownFormulaNumber = /** @type {FormulaNumber} */ (
          await randomHex256()
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
          workerId: await provideWorkerId(
            specifiedWorkerId,
            undefined,
            workerLabel,
          ),
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
                    /** @type {FormulaNumber} */ (await randomHex256()),
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
  /**
   * @param {FormulaIdentifier} hostAgentId
   * @param {FormulaIdentifier} hostHandleId
   * @param {FormulaIdentifier} [specifiedPowersId]
   * @returns {Promise<{powersId: FormulaIdentifier, pinned: FormulaIdentifier[]}>}
   */
  const providePowersId = async (
    hostAgentId,
    hostHandleId,
    specifiedPowersId,
  ) => {
    await null;
    if (typeof specifiedPowersId === 'string') {
      return { powersId: specifiedPowersId, pinned: [] };
    }

    const guestFormulationData = await formulateGuestDependencies(
      hostAgentId,
      hostHandleId,
    );
    const guestFormulation = await formulateNumberedGuest(guestFormulationData);
    // Return pins to the caller for deferred unpinning — the guest
    // must be named (via deferred tasks) before its pins are removed.
    return {
      powersId: guestFormulation.id,
      pinned: guestFormulationData.pinned,
    };
  };

  /**
   * Helper for `formulateUnconfined` and `formulateArchive`.
   * @param {FormulaIdentifier} hostAgentId
   * @param {FormulaIdentifier} hostHandleId
   * @param {DeferredTasks<MakeCapletDeferredTaskParams>} deferredTasks
   * @param {FormulaIdentifier} [specifiedWorkerId]
   * @param {FormulaIdentifier} [specifiedPowersId]
   * @param {string[]} [trustedShims]
   * @param {string} [workerLabel]
   * @param {'locked' | 'node'} [workerKind]
   */
  const formulateCapletDependencies = async (
    hostAgentId,
    hostHandleId,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
    trustedShims = undefined,
    workerLabel = undefined,
    workerKind = undefined,
  ) => {
    const ownFormulaNumber = /** @type {FormulaNumber} */ (
      await randomHex256()
    );
    const { powersId, pinned: powersPinned } = await providePowersId(
      hostAgentId,
      hostHandleId,
      specifiedPowersId,
    );
    const workerId = await provideWorkerId(
      specifiedWorkerId,
      trustedShims,
      workerLabel,
      undefined,
      workerKind,
    );
    // When a new node worker was created because the specified worker
    // was XS-only, record the original so that cancelling the original
    // worker cascades to the caplet.  This is a runtime dependency only,
    // not persisted in the formula JSON.
    const originalWorkerId =
      specifiedWorkerId && workerId !== specifiedWorkerId
        ? specifiedWorkerId
        : undefined;
    const identifiers = harden({
      powersId,
      capletId: formatId({
        number: ownFormulaNumber,
        node: localNodeNumber,
      }),
      capletFormulaNumber: ownFormulaNumber,
      workerId,
      originalWorkerId,
    });
    // Execute deferred tasks first (stores pet names, creating
    // pet-store edges) so that the powers guest is reachable
    // before we unpin its dependencies.
    await deferredTasks.execute(identifiers);
    for (const id of powersPinned) {
      unpinTransient(id);
    }
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
    workerLabel = undefined,
  ) => {
    return withFormulaGraphLock(async () => {
      const { powersId, capletFormulaNumber, workerId, originalWorkerId } =
        await formulateCapletDependencies(
          hostAgentId,
          hostHandleId,
          deferredTasks,
          specifiedWorkerId,
          specifiedPowersId,
          trustedShims,
          workerLabel,
          'node',
        );

      /** @type {MakeUnconfinedFormula} */
      const formula = {
        type: 'make-unconfined',
        worker: workerId,
        powers: powersId,
        specifier,
        env,
        ...(originalWorkerId ? { cancelWithWorker: originalWorkerId } : {}),
      };
      return formulate(capletFormulaNumber, formula);
    });
  };

  /** @type {DaemonCore['formulateArchive']} */
  const formulateArchive = async (
    hostAgentId,
    hostHandleId,
    archiveId,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
    env = {},
    trustedShims = undefined,
    workerLabel = undefined,
  ) => {
    return withFormulaGraphLock(async () => {
      // Pass workerKind=undefined so the worker inherits the
      // daemon's defaultWorkerKind.  Both the Node worker
      // (parseArchive) and the XS worker (hostImportArchive)
      // implement makeArchive natively, so no auto-promotion is
      // needed — promoting unconditionally would spawn a Node
      // worker the Rust supervisor cannot run when no Node worker
      // binary is configured.
      const { powersId, capletFormulaNumber, workerId, originalWorkerId } =
        await formulateCapletDependencies(
          hostAgentId,
          hostHandleId,
          deferredTasks,
          specifiedWorkerId,
          specifiedPowersId,
          trustedShims,
          workerLabel,
        );

      /** @type {MakeArchiveFormula} */
      const formula = {
        type: 'make-archive',
        worker: workerId,
        powers: powersId,
        archive: archiveId,
        env,
        ...(originalWorkerId ? { cancelWithWorker: originalWorkerId } : {}),
      };
      return formulate(capletFormulaNumber, formula);
    });
  };

  /** @type {DaemonCore['formulateFromTree']} */
  const formulateFromTree = async (
    hostAgentId,
    hostHandleId,
    treeId,
    deferredTasks,
    specifiedWorkerId,
    specifiedPowersId,
    env = {},
    trustedShims = undefined,
    workerLabel = undefined,
  ) => {
    return withFormulaGraphLock(async () => {
      // Pass workerKind=undefined so the worker inherits the daemon's
      // defaultWorkerKind (Node by default, locked under the Rust
      // supervisor).  Unlike makeUnconfined, makeFromTree can run on
      // either kind: XS workers get the tree pre-packed into an
      // archive on the daemon side, then loaded via hostImportArchive.
      const { powersId, capletFormulaNumber, workerId, originalWorkerId } =
        await formulateCapletDependencies(
          hostAgentId,
          hostHandleId,
          deferredTasks,
          specifiedWorkerId,
          specifiedPowersId,
          trustedShims,
          workerLabel,
        );

      /** @type {MakeFromTreeFormula} */
      const formula = {
        type: 'make-from-tree',
        worker: workerId,
        powers: powersId,
        tree: treeId,
        env,
        ...(originalWorkerId ? { cancelWithWorker: originalWorkerId } : {}),
      };
      return formulate(capletFormulaNumber, formula);
    });
  };

  /**
   * @param {FormulaNumber} formulaNumber
   * @param {FormulaIdentifier} petStoreId
   * @param {NodeNumber} [nodeNumber] - The node number to use (defaults to localNodeNumber).
   */
  const formulateNumberedPetInspector = (
    formulaNumber,
    petStoreId,
    nodeNumber = localNodeNumber,
  ) => {
    /** @type {PetInspectorFormula} */
    const formula = {
      type: 'pet-inspector',
      petStore: petStoreId,
    };
    return /** @type {FormulateResult<EndoInspector>} */ (
      formulate(formulaNumber, formula, nodeNumber)
    );
  };

  /** @type {DaemonCore['formulatePeer']} */
  const formulatePeer = async (networksDirectoryId, nodeNumber, addresses) => {
    const formulaNumber = /** @type {FormulaNumber} */ (await randomHex256());
    // TODO: validate addresses
    // TODO: mutable state like addresses should not be stored in formula
    /** @type {PeerFormula} */
    const formula = {
      type: 'peer',
      networks: networksDirectoryId,
      node: nodeNumber,
      addresses,
    };
    // Persist the peer formula lazily — the dial should only happen
    // when some formula actually needs to reach the peer, not when the
    // peer info is registered.  This avoids crossed-hellos races where
    // both sides dial each other simultaneously upon symmetric
    // `addPeerInfo` calls.
    const id = await formulateLazy(formulaNumber, formula);
    return /** @type {FormulateResult<EndoPeer>} */ (
      /** @type {unknown} */ (
        harden({
          id,
          // Value is only populated when someone calls provide(id).
          value: /** @type {any} */ (undefined),
        })
      )
    );
  };

  /** @type {DaemonCore['formulateLoopbackNetwork']} */
  const formulateLoopbackNetwork = async () => {
    const formulaNumber = /** @type {FormulaNumber} */ (await randomHex256());
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
    const loopbackType = await getTypeForId(loopbackNetworkId);
    const loopbackLocator = externalizeId(
      loopbackNetworkId,
      loopbackType,
      localNodeNumber,
    );
    await E(value).storeLocator(
      /** @type {NamePath} */ (['loop']),
      loopbackLocator,
    );
    return { id, value };
  };

  /** @type {DaemonCore['formulateEndo']} */
  const formulateEndo = async specifiedFormulaNumber => {
    return /** @type {FormulateResult<FarRef<EndoBootstrap>>} */ (
      withFormulaGraphLock(async () => {
        const formulaNumber = /** @type {FormulaNumber} */ (
          await (specifiedFormulaNumber ?? randomHex256())
        );
        const endoId = formatId({
          number: formulaNumber,
          node: localNodeNumber,
        });

        const { id: defaultHostWorkerId } = await formulateNumberedWorker(
          /** @type {FormulaNumber} */ (await randomHex256()),
          { label: 'host' },
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
    const readyNetworks = networkIds
      .map(id => /** @type {FormulaIdentifier} */ (id))
      .filter(id => refForId.has(id))
      .map(id => /** @type {EndoNetwork} */ (refForId.get(id)));
    return readyNetworks;
  };

  /** @type {DaemonCore['getAllNetworkAddresses']} */
  const getAllNetworkAddresses = async networksDirectoryId => {
    const networksDirectory = await provide(networksDirectoryId, 'directory');
    const networkIds = await networksDirectory.listIdentifiers();
    const readyNetworks = networkIds
      .map(id => /** @type {FormulaIdentifier} */ (id))
      .filter(id => refForId.has(id))
      .map(id => /** @type {EndoNetwork} */ (refForId.get(id)));
    const addresses = (
      await Promise.all(
        readyNetworks.map(async network => {
          return E(network).addresses();
        }),
      )
    ).flat();
    return addresses;
  };

  // No plane is registered in Phase 3. The registry and this resolution path
  // are nevertheless live so a later plane can contribute fresh hints without
  // changing the agent or locator plumbing.
  const contentDataPlaneRegistry = makeContentDataPlaneRegistry();

  /** @type {DaemonCore['getAllContentSources']} */
  const getAllContentSources = async (planesDirectoryId, identity) => {
    const planesDirectory = await provide(planesDirectoryId, 'directory');
    const names = await E(planesDirectory).list();
    const entries = await Promise.all(
      names.map(async name => ({
        name,
        share: await E(planesDirectory).lookup(name),
      })),
    );
    return contentDataPlaneRegistry.getAllContentSources(entries, identity);
  };

  /**
   * @param {FormulaIdentifier} networksDirectoryId
   * @param {NodeNumber} nodeId
   * @param {string[]} addresses
   * @param {Context} context
   */
  const makePeer = async (networksDirectoryId, nodeId, addresses, context) => {
    console.log(
      `Endo daemon dialing peer node ${nodeId.slice(0, 8)} at ${JSON.stringify(addresses)}`,
    );
    const remoteControl = provideRemoteControl(nodeId);
    // The state machine may abandon our outbound dial attempt (e.g.,
    // due to crossed-hellos accept bias).  That cancellation must not
    // cancel the peer formula itself — the peer keeps working with the
    // replacement (accepted) connection.  Use a local PromiseKit for
    // the dial attempt's cancellation, distinct from context.cancel.
    const dialAttempt = () => {
      const { promise: dialCancelled, reject: cancelDial } =
        /** @type {PromiseKit<never>} */ (makePromiseKit());
      context.cancelled.catch(cancelDial);
      return remoteControl.connect(
        getRemoteGatewayViaNetwork,
        cancelDial,
        dialCancelled,
        () => {
          console.log(
            `Endo daemon peer node ${nodeId.slice(0, 8)} connection disposed`,
          );
          // Cancel the peer formula's context so the formula-lifecycle
          // machinery tears down and drops all dependent remote presences
          // via thisDiesIfThatDies.  The next use of any remote presence
          // reincarnates the peer formula and re-dials from scratch.
          // dropLiveValue alone was insufficient: it removed the peer from
          // the live-value cache but left the formula context alive, so
          // dependent remote presences were not revoked and the stale
          // currentGatewayP prevented re-dial on subsequent use.
          context.cancel(new Error('peer connection lost'));
        },
      );
    };
    /** @returns {Promise<EndoGateway>} */
    const getRemoteGatewayViaNetwork = async () => {
      // TODO race networks that support protocol for connection
      // TODO retry, exponential back-off, with full jitter
      const networks = await getAllNetworks(networksDirectoryId);
      console.log(
        `Endo daemon makePeer ${nodeId.slice(0, 8)}: evaluating ${addresses.length} address(es) across ${networks.length} network service(s)`,
      );
      // Connect on first supported address.
      let addressIndex = 0;
      for (const address of addresses) {
        addressIndex += 1;
        const { protocol } = new URL(address);
        console.log(
          `Endo daemon makePeer ${nodeId.slice(0, 8)}: address ${addressIndex}/${addresses.length} protocol=${protocol} value=${address}`,
        );
        let networkIndex = 0;
        for (const network of networks) {
          networkIndex += 1;
          // eslint-disable-next-line no-await-in-loop
          const supported = await E(network).supports(protocol);
          console.log(
            `Endo daemon makePeer ${nodeId.slice(0, 8)}: network ${networkIndex}/${networks.length} supports(${protocol}) -> ${supported}`,
          );
          if (supported) {
            const attemptStartedAt = Date.now();
            console.log(
              `Endo daemon makePeer ${nodeId.slice(0, 8)}: dialing with network ${networkIndex}/${networks.length}`,
            );
            // Create a derived context for this specific dial
            // attempt.  The network worker uses this context to
            // observe cancellation (tearing down TCP if the peer
            // dies) and to report connection loss (by cancelling
            // this context).  Connection loss must NOT cancel the
            // peer formula itself — crossed-hellos accept bias
            // routinely abandons dials while the peer stays alive.
            const { promise: attemptCancelled, reject: cancelAttempt } =
              /** @type {PromiseKit<never>} */ (makePromiseKit());
            // Swallow the rejection to avoid unhandled rejection
            // warnings; the promise is intentionally a signal.
            attemptCancelled.catch(() => {});
            // Die with the peer: if the peer context is cancelled,
            // also cancel this dial attempt.
            context.cancelled.catch(cancelAttempt);
            const attemptContext = Far('Context', {
              id: () => context.id,
              cancel: cancelAttempt,
              whenCancelled: () => attemptCancelled,
              whenDisposed: () => attemptCancelled,
              addDisposalHook: _hook => {},
            });
            try {
              // eslint-disable-next-line no-await-in-loop
              const remoteGateway = await E(network).connect(
                address,
                /** @type {any} */ (attemptContext),
              );
              console.log(
                `Endo daemon makePeer ${nodeId.slice(0, 8)}: dial succeeded in ${Date.now() - attemptStartedAt}ms`,
              );
              return remoteGateway;
            } catch (error) {
              console.log(
                `Endo daemon makePeer ${nodeId.slice(0, 8)}: dial failed in ${Date.now() - attemptStartedAt}ms: ${/** @type {Error} */ (error).message}`,
              );
              throw error;
            }
          }
        }
      }
      throw new Error('Cannot connect to peer: no supported addresses');
    };

    // If crossed-hellos accept bias abandons our dial, retry once.
    // The state machine should now be in `accepted` state, and the
    // retry will return the already-accepted gateway without dialing.
    //
    // TODO(option-a-simplification): After the dispose-callback change
    // to context.cancel (Option A), the peer formula's context is
    // cancelled on any connection loss.  That means this formula
    // instance is torn down before it could ever see a second
    // connection.  The `isAbandonError` predicate and the resilient-dial
    // retry inside `resilientDial` are therefore unreachable for any
    // post-connect abandon.  They remain for the initial-dial crossed-
    // hellos case (where the state machine rejects our outgoing dial
    // while accepting an inbound one, producing an abandon error before
    // the first successful connection).  A follow-up can simplify by
    // removing the `isAbandonError` catch in `ResilientPeerGateway.
    // provide` and collapsing `currentGatewayP` to a plain `dialAttempt`
    // call.
    const isAbandonError = err =>
      err &&
      typeof err.message === 'string' &&
      (err.message.includes('Connection abandoned') ||
        err.message.includes(
          'Cannot call write after a stream was destroyed',
        ) ||
        err.message.includes('Connection stream ended'));

    /** @returns {Promise<EndoGateway>} */
    const resilientDial = async () => {
      try {
        return await dialAttempt();
      } catch (error) {
        if (isAbandonError(error)) {
          console.log(
            `Endo daemon makePeer ${nodeId.slice(0, 8)}: retrying after abandoned dial`,
          );
          return dialAttempt();
        }
        throw error;
      }
    };

    // TODO(option-a-simplification): After the dispose-callback change,
    // the peer formula is destroyed on any connection loss, so this
    // formula instance never sees a post-connect re-dial.  The
    // `currentGatewayP` one-shot promise is still used for the initial
    // connection (including the retention-set follower below) but the
    // re-dial path in `ResilientPeerGateway.provide` is now unreachable.
    // A follow-up can drop the ResilientPeerGateway wrapper and inline
    // the single `dialAttempt()` call directly.
    const currentGatewayP = resilientDial();

    // Follow retention set changes in the background once connected.
    (async () => {
      try {
        const gateway = await currentGatewayP;
        const iter = await E(gateway).followRetentionSet(localNodeNumber);
        const peerAgentKeyRecord = persistencePowers.getAgentKey(nodeId);
        const peerAgentIdStr = peerAgentKeyRecord
          ? /** @type {FormulaIdentifier} */ (peerAgentKeyRecord.agentId)
          : undefined;

        let isFirst = true;
        for await (const rawDelta of iterateReader(/** @type {any} */ (iter))) {
          const delta =
            /** @type {import('./retention-accumulator.js').RetentionDelta} */ (
              /** @type {any} */ (rawDelta)
            );
          if (isFirst) {
            persistencePowers.replaceRetention(nodeId, delta.add);
            if (peerAgentIdStr !== undefined) {
              await withFormulaGraphLock(async () => {
                formulaGraph.replaceRetention(
                  peerAgentIdStr,
                  delta.add.map(num =>
                    formatId({
                      number: /** @type {FormulaNumber} */ (num),
                      node: localNodeNumber,
                    }),
                  ),
                );
              });
            }
            isFirst = false;
          } else {
            for (const num of delta.add) {
              persistencePowers.writeRetention(nodeId, num);
            }
            for (const num of delta.remove) {
              persistencePowers.deleteRetention(nodeId, num);
            }
            if (peerAgentIdStr !== undefined) {
              await withFormulaGraphLock(async () => {
                for (const num of delta.add) {
                  formulaGraph.addRetention(
                    peerAgentIdStr,
                    formatId({
                      number: /** @type {FormulaNumber} */ (num),
                      node: localNodeNumber,
                    }),
                  );
                }
                for (const num of delta.remove) {
                  formulaGraph.removeRetention(
                    peerAgentIdStr,
                    formatId({
                      number: /** @type {FormulaNumber} */ (num),
                      node: localNodeNumber,
                    }),
                  );
                }
              });
            }
          }
        }
      } catch (err) {
        console.log(
          `Retention sync failed for peer ${nodeId.slice(0, 8)}: ${/** @type {Error} */ (err).message}`,
        );
      }
    })();

    return makeExo(
      'ResilientPeerGateway',
      PeerGatewayInterface,
      /** @type {any} */ ({
        /** @param {string} requestedId */
        provide: async requestedId => {
          // Try with the current gateway; on failure, re-dial and try
          // once more.  This handles the case where the initial dial
          // succeeded but the connection was later abandoned.
          //
          // TODO(option-a-simplification): The isAbandonError catch
          // below is now unreachable for post-connect errors.  After
          // the dispose-callback change (Option A), any connection loss
          // cancels the peer formula's context, so this formula instance
          // is torn down before `provide` could be called after a loss.
          // The catch arm was the "retry within the existing formula
          // instance" path; it is superseded by reincarnation.  A
          // follow-up can remove the catch arm entirely.
          try {
            const gateway = await currentGatewayP;
            return await E(gateway).provide(requestedId);
          } catch (error) {
            if (!isAbandonError(error)) {
              throw error;
            }
            console.log(
              `Endo daemon peer ${nodeId.slice(0, 8)}: provide failed with ${/** @type {Error} */ (error).message}, re-dialing`,
            );
            const gateway = await resilientDial();
            return E(gateway).provide(requestedId);
          }
        },
      }),
    );
  };

  /**
   * @param {FormulaIdentifier} id
   * @param {FormulaIdentifier} hostAgentId
   * @param {FormulaIdentifier} hostHandleId
   * @param {import('./types.js').NameOrPath} guestName
   */
  const makeInvitation = async (id, hostAgentId, hostHandleId, guestName) => {
    const hostAgent = /** @type {EndoHost} */ (await provide(hostAgentId));
    // The invitation persists the name (or directory path) the redeemed
    // guest should be stored under.  The durable mail-delivery name takes
    // the full path; the pin and label use the leaf pet name.
    const guestNamePath = namePathFrom(guestName);
    const guestLeaf = guestNamePath[guestNamePath.length - 1];

    const locate = async () => {
      const { node, addresses } = await hostAgent.getPeerInfo();
      const { number: hostHandleNumber, node: hostHandleNode } =
        parseId(hostHandleId);
      const { number } = parseId(id);
      // Build path with `@`-delimited URL-encoded components: the first
      // component is the invitation's formula number, and subsequent
      // components are connection hints.
      const invitationPath = [number, ...addresses]
        .map(encodeURIComponent)
        .join('@');
      const url = new URL(`endo://${node}/${invitationPath}`);
      url.searchParams.set('type', 'invitation');
      url.searchParams.set('from', hostHandleNumber);
      // Include the handle's node if it differs from the daemon node
      // (i.e. it uses an agent key).
      if (hostHandleNode !== node) {
        url.searchParams.set('fromNode', hostHandleNode);
      }
      return url.href;
    };

    /**
     * @param {string} guestHandleLocator
     * @param {string} [_hostNameFromGuest] - Previously used by synced
     *   pet stores; now unused but retained for protocol compatibility.
     */
    const accept = async (guestHandleLocator, _hostNameFromGuest) => {
      const url = new URL(guestHandleLocator);
      // Path components are `@`-delimited and URL-encoded.  The first
      // component is the handle's formula address; the rest are
      // connection hints.
      const [guestHandleNumber, ...addresses] = url.pathname
        .replace(/^\//, '')
        .split('@')
        .map(decodeURIComponent);
      const guestDaemonNode = url.hostname;
      // The handle's node may differ from the daemon node when agent keys
      // are used as formula nodes.
      const guestHandleNode =
        url.searchParams.get('handleNode') || guestDaemonNode;

      if (!guestHandleNumber) {
        throw makeError('Handle locator must include a formula number');
      }
      assertNodeNumber(guestDaemonNode);
      assertFormulaNumber(guestHandleNumber);

      const guestHandleId = formatId({
        node: /** @type {NodeNumber} */ (guestHandleNode),
        number: guestHandleNumber,
      });

      // Register the guest's agent key so we can route to its daemon.
      if (guestHandleNode !== guestDaemonNode) {
        persistencePowers.writeRemoteAgentKey(guestHandleNode, guestDaemonNode);
      }

      /** @type {PeerInfo} */
      const peerInfo = {
        node: guestDaemonNode,
        addresses,
      };
      await hostAgent.addPeerInfo(peerInfo);

      // TODO ensure that this is sufficient to cancel the previous
      // incarnation, this invitation, such that it can no longer be redeemed,
      // and such that overwriting the invitation also revokes the invitation.
      await withFormulaGraphLock();
      const controller = provideController(id);
      await controller.context.cancel(new Error('Invitation accepted'));

      // Create a local guest with a regular pet store.
      // Pin the guest handle to protect it from premature collection.
      /** @type {DeferredTasks<AgentDeferredTaskParams>} */
      const guestTasks = makeDeferredTasks();
      guestTasks.push(async identifiers => pinTransient(identifiers.handleId));
      const { id: localGuestId } = await formulateGuest(
        hostAgentId,
        hostHandleId,
        guestTasks,
        `guest:${guestLeaf}`,
      );

      // Look up the local guest's handle from its formula so we can
      // name it.  Incarnating the handle transitively incarnates the
      // guest.
      const localGuestFormula = /** @type {GuestFormula} */ (
        await getFormulaForId(localGuestId)
      );

      // Name the guest handle inside @pins so it persists.
      await E(hostAgent).storeIdentifier(
        /** @type {NamePath} */ (['@pins', `guest-${guestLeaf}`]),
        localGuestFormula.handle,
      );
      await unpinTransient(localGuestFormula.handle);

      // Store the remote guest handle under guestName for mail delivery.
      // Use storeLocator so the directory properly internalizes the
      // remote formula identifier for peer resolution.
      const guestHandleLocatorStr = formatLocator(guestHandleId, 'remote');
      await E(hostAgent).storeLocator(guestNamePath, guestHandleLocatorStr);

      // Return the remote guest's public key for retention tracking.
      return harden({ guestPublicKey: guestDaemonNode });
    };

    return makeExo('Invitation', InvitationInterface, { accept, locate });
  };

  const makeContext = makeContextMaker({
    controllerForId,
    provideController,
    getFormulaType: id => formulaForId.get(id)?.type,
  });

  const { makeIdentifiedDirectory, makeDirectoryNode } = makeDirectoryMaker({
    provide,
    provideStoreController,
    getIdForRef,
    getTypeForId,
    getContentIdentityForId,
    formulateDirectory,
    formulateReadableBlob,
    pinTransient,
    unpinTransient,
  });

  const makeMailbox = makeMailboxMaker({
    provide,
    formulateMarshalValue,
    formulatePromise,
    formulateMessage,
    getFormulaForId,
    getTypeForId,
    isLocalKey,
    randomHex256,
    pinTransient,
    unpinTransient,
  });

  /** @param {import('@endo/pass-style').Passable} value */
  const persistValue = async value => {
    /** @type {DeferredTasks<MarshalDeferredTaskParams>} */
    const tasks = makeDeferredTasks();
    const { id } = await formulateMarshalValue(value, tasks, pinTransient);
    return id;
  };

  const makeChannelInstance = makeChannelMaker({
    provide,
    provideStoreController,
    persistValue,
    randomHex256,
  });

  const makeGuest = makeGuestMaker({
    provide,
    provideStoreController,
    formulateEval,
    formulateReadableBlob,
    formulateMarshalValue,
    getFormulaForId,
    getAllNetworkAddresses,
    getAllContentSources,
    makeMailbox,
    makeDirectoryNode,
    isLocalKey,
    pinTransient,
    unpinTransient,
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

  /**
   * Returns a snapshot of the formula dependency graph restricted to
   * formulas reachable from a given set of formula identifiers.
   *
   * @param {FormulaIdentifier[]} seedIds
   * @returns {Promise<{ nodes: Array<{ id: FormulaIdentifier, type: string }>, edges: Array<{ sourceId: FormulaIdentifier, targetId: FormulaIdentifier, label: string }> }>}
   */
  const getFormulaGraphSnapshot = async seedIds => {
    /** @type {Set<FormulaIdentifier>} */
    const visited = new Set();
    /** @type {FormulaIdentifier[]} */
    const queue = [...seedIds.filter(isLocalId)];

    while (queue.length > 0) {
      const id = /** @type {FormulaIdentifier} */ (queue.shift());
      if (!visited.has(id)) {
        visited.add(id);
        const deps = formulaGraph.formulaDeps.get(id);
        if (deps) {
          for (const dep of deps) {
            if (!visited.has(dep)) {
              queue.push(dep);
            }
          }
        }
      }
    }

    /** @type {Array<{ id: FormulaIdentifier, type: string }>} */
    const snapshotNodes = [];
    /** @type {Array<{ sourceId: FormulaIdentifier, targetId: FormulaIdentifier, label: string }>} */
    const graphEdges = [];

    for (const id of visited) {
      const formula = formulaForId.get(id);
      snapshotNodes.push({ id, type: formula ? formula.type : 'unknown' });
      if (formula) {
        for (const [label, dep] of extractLabeledDeps(formula)) {
          if (dep && visited.has(dep)) {
            graphEdges.push({ sourceId: id, targetId: dep, label });
          }
        }
      }
    }

    return harden({ nodes: snapshotNodes, edges: graphEdges });
  };

  /**
   * Build the host-shaped retention-path list for a target formula.
   *
   * Walks the labeled formula graph backward from `targetId` to a
   * GC root and rewrites pet-store edges from the generic
   * `'petName'` token into `pet:<name>` labels by resolving each
   * referencing store's reverse-name table. Other labels (field
   * names, `'retention'`, `'transient'`) pass through unchanged.
   *
   * The returned shape matches `designs/daemon-retention-paths.md`
   * § Notation: paths and segments — the leaf segment is the
   * target group, subsequent segments walk upstream toward a root,
   * and the topmost segment carries `type: 'root'` when the path
   * terminates at a GC root.
   *
   * @param {FormulaIdentifier} targetId
   * @returns {Promise<import('./graph.js').RetentionPath[]>}
   */
  const listRetentionPaths = async targetId => {
    const rawPaths = formulaGraph.listRetentionPaths(targetId);

    /**
     * Per-call cache of `(petStoreId, memberId) -> pet:<name> labels`,
     * deliberately scoped to this `listRetentionPaths` invocation:
     * pet-store contents change between calls and a process-wide
     * cache would silently serve stale labels. The cache is
     * discarded when the function returns.
     *
     * @type {Map<string, string[]>}
     */
    const labelCache = new Map();
    /** @type {Set<FormulaIdentifier>} */
    const storeIdsToResolve = new Set();
    for (const path of rawPaths) {
      for (const seg of path) {
        if (seg.referencedBy !== undefined) {
          const refFormula = formulaForId.get(seg.referencedBy);
          if (
            refFormula !== undefined &&
            (refFormula.type === 'pet-store' ||
              refFormula.type === 'mailbox-store' ||
              refFormula.type === 'known-peers-store')
          ) {
            storeIdsToResolve.add(seg.referencedBy);
          }
        }
      }
    }
    // Resolve store controllers in parallel; on multi-pet-store
    // retention paths this is a real per-call speedup over the
    // serial await loop. `provideStoreController` is cache-backed,
    // so concurrent calls do not duplicate work for the same id.
    /** @type {Map<FormulaIdentifier, import('./types.js').StoreController>} */
    const storeControllers = new Map(
      await Promise.all(
        Array.from(
          storeIdsToResolve,
          async storeId =>
            /** @type {[FormulaIdentifier, import('./types.js').StoreController]} */ ([
              storeId,
              await provideStoreController(storeId),
            ]),
        ),
      ),
    );

    /**
     * Resolve the formula type for each member of a segment's group.
     * Returns `'unknown'` for ids the daemon does not have a formula
     * record for (collected or never-formulated), matching the
     * graph-snapshot convention at the same site.
     *
     * @param {import('./graph.js').RetentionPathSegment} seg
     * @returns {string[]}
     */
    const formulaTypesFor = seg =>
      seg.groupMembers.map(memberId => {
        const formula = formulaForId.get(memberId);
        return formula ? formula.type : 'unknown';
      });

    /** @type {import('./graph.js').RetentionPath[]} */
    const shaped = [];
    for (const path of rawPaths) {
      /** @type {import('./graph.js').RetentionPath} */
      const shapedPath = [];
      for (const seg of path) {
        const controller =
          seg.referencedBy !== undefined
            ? storeControllers.get(seg.referencedBy)
            : undefined;
        const segLabels = seg.labels;
        const needsRename =
          seg.referencedBy !== undefined &&
          segLabels !== undefined &&
          segLabels.length > 0 &&
          controller !== undefined;
        const formulaTypes = formulaTypesFor(seg);
        if (!needsRename) {
          shapedPath.push(harden({ ...seg, formulaTypes }));
        } else {
          /** @type {string[]} */
          const newLabels = [];
          for (const label of /** @type {string[]} */ (segLabels)) {
            if (label === 'petName') {
              // Resolve every pet name in the upstream store that
              // points at any member of this group. The cache key
              // is per (storeId, memberId) pair so a multi-member
              // group fans out into multiple `pet:<name>` labels
              // deterministically.
              for (const memberId of seg.groupMembers) {
                const cacheKey = `${seg.referencedBy} ${memberId}`;
                let names = labelCache.get(cacheKey);
                if (names === undefined) {
                  const petNames =
                    /** @type {import('./types.js').StoreController} */ (
                      controller
                    ).reverseIdentify(memberId);
                  names = petNames.map(n => `pet:${n}`);
                  labelCache.set(cacheKey, names);
                }
                for (const n of names) {
                  newLabels.push(n);
                }
              }
            } else {
              newLabels.push(label);
            }
          }
          shapedPath.push(
            harden({
              ...seg,
              labels: newLabels,
              formulaTypes,
            }),
          );
        }
      }
      shaped.push(harden(shapedPath));
    }
    return harden(shaped);
  };

  /**
   * Subscribe to retention-path changes for a target formula.
   *
   * Returns an async generator whose first delta is a full
   * `{ snapshot }` of the paths at the time of subscription and
   * whose subsequent deltas are `{ added, removed }` diffs over
   * the path set. Updates are coalesced over a microtask window
   * so a single `provideGuest` (which incarnates a chain of
   * dependent formulas) yields one delta, not many.
   *
   * Drop the returned iterator (or `break` out of a for-await-of
   * loop on it) to release the subscription: the underlying graph
   * change subscription drains and the producer returns.
   *
   * @param {FormulaIdentifier} targetId
   * @returns {AsyncGenerator<
   *   import('./retention-path-accumulator.js').RetentionPathDelta
   * >}
   */
  // eslint-disable-next-line no-use-before-define
  const followRetentionPaths = async function* followRetentionPaths(targetId) {
    // eslint-disable-next-line no-use-before-define
    const accumulator = makeRetentionPathAccumulator({
      compute: () => listRetentionPaths(targetId),
      // Route structured failures through the lifecycle log per
      // `packages/daemon/AGENTS.md` § Diagnostic Discipline in
      // Formulas. The target's formula id correlates the line
      // with other lifecycle events for the same formula.
      onError: err => {
        logLifecycle(
          targetId,
          'RETENTION_PATH_FLUSH_FAILED',
          /** @type {Error} */ (err).message,
        );
      },
    });

    // Notify the accumulator whenever any formula in the graph
    // changes. Phase 1 uses formulaChangeTopic as the coarse
    // change signal; finer-grained edge-event topics are deferred
    // to follow-up work per the design's *Known Gaps and TODOs*.
    const subscription = formulaChangeTopic.subscribe();
    let cancelled = false;
    // Drive the iterator with a `.next().then(loop)` recursion so
    // the change body never names a value to keep undefined,
    // side-stepping the leading-underscore / no-unused-vars lint
    // conflict documented in project root `AGENTS.md` § Lint-rule
    // gotchas. The accumulator recomputes from scratch on every
    // notify(), so the yielded change is a coarse "something
    // happened" signal only and the value itself is discarded.
    const pump = () =>
      subscription.next().then(step => {
        if (step.done || cancelled) return undefined;
        accumulator.notify();
        return pump();
      });
    pump().catch(err => {
      // Route through the lifecycle log so retention-path subsystem
      // failures correlate with other lifecycle events for the same
      // formula. See `packages/daemon/AGENTS.md` § Diagnostic
      // Discipline in Formulas.
      logLifecycle(
        targetId,
        'RETENTION_PATH_PUMP_FAILED',
        /** @type {Error} */ (err).message,
      );
    });

    try {
      yield* accumulator.subscribe();
    } finally {
      cancelled = true;
      // Best-effort: closing the iterator on the next
      // formulaChangeTopic emission lets the inner loop fall out.
      try {
        await subscription.return?.(undefined);
      } catch (_e) {
        // Ignore close errors; the iterator is already terminating.
      }
    }
  };

  /**
   * Return the on-disk filesystem path for a `mount` or `scratch-mount`
   * formula.  Privileged host-paths surface the daemon does **not**
   * place on Mount's public interface — only callers that hold the
   * formula identifier (and the corresponding host privilege) can
   * recover the underlying path.
   *
   * - For `mount` formulas, the path is the one the user supplied to
   *   `provideMount`.
   * - For `scratch-mount` formulas, the path is the daemon-managed
   *   `state/mounts/<formulaNumber>` directory.
   *
   * Throws a structured error if the formula has been collected, or
   * if it is not a mount-shaped formula.
   *
   * @param {FormulaIdentifier} mountId
   * @returns {string}
   */
  const getMountHostPath = mountId => {
    // formulaForId.get returns undefined if the formula has been
    // collected since the caller resolved its identifier.  Surfacing
    // a clear error here lets the host-side caller decide whether
    // to re-stage rather than handing back a stale path that points
    // at a directory the daemon may have removed.
    const formula = formulaForId.get(mountId);
    if (formula === undefined) {
      throw makeError(X`Unknown or collected mount formula ${q(mountId)}`);
    }
    if (formula.type === 'mount') {
      return formula.path;
    }
    if (formula.type === 'scratch-mount') {
      const { number: formulaNumber } = parseId(mountId);
      return filePowers.joinPath(
        persistencePowers.statePath,
        'mounts',
        formulaNumber,
      );
    }
    throw makeError(
      X`getMountHostPath requires a mount or scratch-mount formula, got ${q(formula.type)}`,
    );
  };

  /**
   * Back-compat alias for callers that only operate on scratch mounts
   * (see `host.js` `makeUnconfinedFromTree`).  Asserts the formula is
   * specifically a `scratch-mount`, then delegates to
   * `getMountHostPath`.
   *
   * @param {FormulaIdentifier} scratchMountId
   * @returns {string}
   */
  const getScratchMountPath = scratchMountId => {
    const formula = formulaForId.get(scratchMountId);
    if (formula === undefined) {
      throw makeError(
        X`Unknown or collected scratch-mount formula ${q(scratchMountId)}`,
      );
    }
    if (formula.type !== 'scratch-mount') {
      throw makeError(
        X`getScratchMountPath requires a scratch-mount formula, got ${q(formula.type)}`,
      );
    }
    return getMountHostPath(scratchMountId);
  };

  const makeHost = makeHostMaker({
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
    formulateReadableBlob,
    checkinTree,
    formulateMount,
    formulateScratchMount,
    formulateGit,
    formulateShell,
    formulateHttpClient,
    getHttpClientControlForClient,
    formulateGitCredential,
    formulateGitRemote,
    formulateInvitation,
    formulateDirectoryForStore,
    getPeerIdForNodeIdentifier,
    getAllNetworkAddresses,
    getAllContentSources,
    getTypeForId,
    getFormulaForId,
    formulateChannel,
    formulateTimer,
    makeMailbox,
    makeDirectoryNode,
    localNodeNumber,
    isLocalKey,
    getAgentIdForHandleId,
    pinTransient,
    unpinTransient,
    getFormulaGraphSnapshot,
    listRetentionPaths,
    followRetentionPaths,
    getScratchMountPath,
    getMountHostPath,
    getIdForRef,
    writeRemoteAgentKey: persistencePowers.writeRemoteAgentKey,
    traceAggregator,
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
    const petStore = await provideStoreController(petStoreId);

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
      const id = /** @type {FormulaIdentifier | undefined} */ (
        petStore.identifyLocal(petName)
      );
      if (id === undefined) {
        throw new Error(`Unknown pet name ${petName}`);
      }
      const { number: formulaNumber } = parseId(id);
      const formula = await getFormulaForId(id);
      if (
        ![
          'eval',
          'lookup',
          'make-unconfined',
          'make-archive',
          'guest',
        ].includes(formula.type)
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
      } else if (formula.type === 'make-archive') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            archive: provide(formula.archive, 'readable-blob'),
            powers: provide(formula.powers),
            worker: provide(formula.worker, 'worker'),
          }),
        );
      } else if (formula.type === 'make-from-tree') {
        return makeInspector(
          formula.type,
          formulaNumber,
          harden({
            tree: provide(formula.tree),
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

  // eslint-disable-next-line no-undef
  if (typeof process !== 'undefined' && process.env.ENDO_FORMULA_GRAPH) {
    console.log('Formula graph after persistence seed:');
    for (const [id, formula] of formulaForId.entries()) {
      const deps = formulaGraph.formulaDeps.get(id);
      const depList = deps
        ? [...deps].map(d => d.slice(0, 12)).join(', ')
        : 'none';
      const isRoot = formulaGraph.roots.has(id);
      console.log(
        `  ${id.slice(0, 12)} ${formula.type}${isRoot ? ' [ROOT]' : ''} deps=[${depList}]`,
      );
    }
  }

  return {
    formulateEndo,
    provide,
    nodeNumber: localNodeNumber,
    capTpConnectionRegistrar,
    traceAggregator,
    inboundErrorOrigin,
  };
};

/**
 * Creates and bootstraps the Endo daemon by loading or creating formulas.
 *
 * This function provides the main entry point for creating an Endo daemon. It:
 * 1. Loads the root nonce and keypair from persistence (or generates new ones)
 * 2. Creates or recreates the daemon core with appropriate formulas
 * 3. If the daemon was newly created, formulates the Endo bootstrap formula
 * 4. Returns the endo bootstrap interface and CapTP connection registrar
 *
 * For existing daemons, the formula graph is loaded from persistence and the
 * Endo bootstrap is provided.
 * For new daemons, the bootstrap formula is formulated and returned.
 *
 * @param {DaemonicPowers} powers - The daemon powers for crypto and persistence.
 * @param {object} args
 * @param {(error: Error) => void} args.cancel - Callback for cancellation.
 * @param {number} args.gracePeriodMs - Grace period in milliseconds for shutdown.
 * @param {Promise<never>} args.gracePeriodElapsed - Promise that resolves on grace period end.
 * @param {Specials} args.specials - Special formula generators.
 * @param {boolean} [args.gcEnabled] - Enable garbage collection.
 * @param {'locked' | 'node'} [args.defaultWorkerKind] - Default kind for newly formulated workers.
 * @returns {Promise<{
 *   endoBootstrap: FarRef<EndoBootstrap>,
 *   capTpConnectionRegistrar: CapTpConnectionRegistrar,
 *   traceAggregator: ReturnType<typeof makeTraceAggregator>,
 *   marshalSaveError: (err: Error, errorId?: string) => void,
 * }>}
 *   An object containing the endo bootstrap, CapTP connection
 *   registrar, the in-process trace aggregator, and a
 *   marshalSaveError ready to install on outbound CapTP connections.
 *
 * @example
 * ```js
 * const { endoBootstrap, capTpConnectionRegistrar } =
 *   await provideEndoBootstrap(powers, {
 *     cancel: handleCancel,
 *     gracePeriodMs: 3000,
 *     gracePeriodElapsed: onCancelled,
 *     specials: myFormulas
 *   });
 * ```
 */
const provideEndoBootstrap = async (
  powers,
  {
    cancel,
    gracePeriodMs,
    gracePeriodElapsed,
    specials,
    gcEnabled,
    defaultWorkerKind,
  },
) => {
  const { persistence: persistencePowers } = powers;
  const { rootNonce: endoFormulaNumber, isNewlyCreated } =
    await persistencePowers.provideRootNonce();
  const { keypair: rootKeypair } = await persistencePowers.provideRootKeypair();
  const localNodeNumber = /** @type {NodeNumber} */ (
    toHex(rootKeypair.publicKey)
  );
  const daemonCore = await makeDaemonCore(powers, endoFormulaNumber, {
    cancel,
    gracePeriodMs,
    gracePeriodElapsed,
    specials,
    localNodeNumber,
    signBytes: rootKeypair.sign,
    gcEnabled,
    defaultWorkerKind,
  });
  const { capTpConnectionRegistrar, traceAggregator, inboundErrorOrigin } =
    daemonCore;
  const marshalSaveError = makeOutboundMarshalSaveError(
    traceAggregator,
    inboundErrorOrigin,
  );
  const isInitialized = !isNewlyCreated;
  if (isInitialized) {
    const endoId = formatId({
      number: endoFormulaNumber,
      node: daemonCore.nodeNumber,
    });
    const endoBootstrap = /** @type {FarRef<EndoBootstrap>} */ (
      await daemonCore.provide(endoId)
    );
    return {
      endoBootstrap,
      capTpConnectionRegistrar,
      traceAggregator,
      marshalSaveError,
    };
  } else {
    const { value: endoBootstrap } =
      await daemonCore.formulateEndo(endoFormulaNumber);
    return {
      endoBootstrap,
      capTpConnectionRegistrar,
      traceAggregator,
      marshalSaveError,
    };
  }
};

/**
 * Creates and initializes an Endo daemon instance.
 *
 * This is the main exported function for creating an Endo daemon:
 * 1. Sets up a grace period for graceful shutdown
 * 2. Provides the endo bootstrap with CapTP connection registration
 * 3. Revives networks and pins from the endo bootstrap
 * 4. Returns a daemon object with the endo bootstrap, cancellation callback,
 *    and CapTP connection registrar
 *
 * The daemon runs in the background and serves as the central point of
 * coordination for formulas, workers, and persistent state.
 *
 * @param {DaemonicPowers} powers - The daemon powers including crypto, persistence, and control.
 * @param {string} daemonLabel - A label for the daemon instance (used for logging).
 * @param {(error: Error) => void} cancel - Callback to call when daemon needs to cancel.
 * @param {Promise<never>} cancelled - A promise that rejects when cancelled.
 * @param {Specials} [specials] - Special formula generators
 * @param {object} [options]
 * @param {boolean} [options.gcEnabled] - Enable garbage collection of worker daemons.
 * @param {'locked' | 'node'} [options.defaultWorkerKind] - Default kind for newly formulated workers.
 *
 * @example
 * ```js
 * const { endoBootstrap, cancelGracePeriod, capTpConnectionRegistrar } =
 *   await makeDaemon(powers, 'my-daemon', handleError, cancelledPromise, {
 *     // your special formulas here
 *   });
 *
 * // Later, to cancel:
 * await cancelGracePeriod(new Error('Daemon shutdown'));
 * ```
 */
export const makeDaemon = async (
  powers,
  daemonLabel,
  cancel,
  cancelled,
  specials = {},
  options = {},
) => {
  const { gcEnabled, defaultWorkerKind } = options;
  const { promise: gracePeriodCancelled, reject: cancelGracePeriod } =
    /** @type {PromiseKit<never>} */ (makePromiseKit());

  // TODO thread through command arguments.
  const gracePeriodMs = 2000;

  /** @type {Promise<never>} */
  const gracePeriodElapsed = cancelled.catch(async error => {
    await delay(gracePeriodMs, gracePeriodCancelled);
    console.log(
      `Endo daemon grace period ${gracePeriodMs}ms elapsed for ${daemonLabel}`,
    );
    throw error;
  });

  const {
    endoBootstrap,
    capTpConnectionRegistrar,
    traceAggregator,
    marshalSaveError,
  } = await provideEndoBootstrap(powers, {
    cancel,
    gracePeriodMs,
    gracePeriodElapsed,
    specials,
    gcEnabled,
    defaultWorkerKind,
  });

  await Promise.allSettled([
    E(endoBootstrap).reviveNetworks(),
    E(endoBootstrap).revivePins(),
  ]);

  return {
    endoBootstrap,
    cancelGracePeriod,
    capTpConnectionRegistrar,
    traceAggregator,
    marshalSaveError,
  };
};
