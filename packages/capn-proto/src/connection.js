// @ts-check
/**
 * Per-peer Cap'n Proto connection: composes the four tables, handler factory,
 * payload codec, and dispatcher. One instance is created per peer.
 */

import { Fail } from '@endo/errors';

import { makeFourTables } from './tables/four-tables.js';
import { makeExportRegistry } from './exports.js';
import { makeImportRegistry } from './imports.js';
import { makeRemoteHandler } from './handler.js';
import { makeDispatch } from './dispatch.js';
import { makeEmbargoTracker } from './embargo.js';
import { makeThreeParty } from './three-party.js';
import {
  encodeBootstrap,
  encodeCall,
  encodeReturn,
  encodeFinish,
  encodeResolve,
  encodeRelease,
  encodeDisembargo,
  encodeProvide,
  encodeAccept,
  encodeUnimplemented,
  encodeAbort,
  decodeMessage,
  encodeCapContent,
  EXCEPTION_TYPE,
} from './proto/messages.js';

/**
 * @param {object} cfg
 * @param {(framed: ArrayBuffer) => void} cfg.send
 * @param {unknown} [cfg.bootstrap]
 * @param {import('./interfaces.js').InterfaceRegistry} cfg.interfaceRegistry
 * @param {object} [cfg.network]
 * @param {Uint8Array} [cfg.recipientVatId]
 *   Vat-id bytes naming the peer this connection speaks to. Required
 *   for L3 auto-Provide on encode (passed to `Provide.recipient`).
 * @param {ReturnType<typeof import('./cap-home-registry.js').makeCapHomeRegistry>} [cfg.capHomes]
 *   The CapHome registry to read on export and write to on import. The
 *   `makeCapnp` wrapper auto-creates one if not supplied; multi-peer
 *   setups should pass the *same* registry to every peer in the same
 *   vat so cap-home lookups span the whole vat's import set.
 * @param {{ value: any }} [cfg.selfRef]
 *   Mutable holder the rpc-system wrapper fills with the public
 *   `makeCapnp` instance after construction. The connection consults
 *   it when it needs to identify itself to the CapHome registry —
 *   without it, auto-Provide can't tell whether a cap-home hit refers
 *   to "us" or "the other guy".
 */
export const makeConnection = cfg => {
  const { send, interfaceRegistry } = cfg;
  const bootstrap = { value: cfg.bootstrap };

  let aborted = false;
  /** @type {((reason: unknown) => void) | undefined} */
  let onAbort;

  const sendFramed = framed => {
    if (aborted) return;
    send(framed);
  };

  // ---- Tables ----
  const tables = makeFourTables({
    onImportFinalized: id => {
      // Send Release for this import id.
      const entry = tables.importEntries.get(id);
      if (!entry) return;
      tables.importEntries.delete(id);
      sendFramed(encodeRelease({ id, referenceCount: 1 }));
    },
  });

  // ---- isPromise predicate ----
  const isPromise = v =>
    v != null &&
    (typeof v === 'object' || typeof v === 'function') &&
    typeof (/** @type {any} */ (v).then) === 'function';

  // ---- Export registry ----
  const exportRegistry = makeExportRegistry({
    exports: tables.exports,
    valToExportId: tables.valToExportId,
    promiseValToExportId: tables.promiseValToExportId,
    exportIds: tables.exportIds,
    isPromise,
  });

  // ---- Embargo tracker ----
  const embargoTracker = makeEmbargoTracker();

  /**
   * Describe a resolved value as a CapDescriptor used in a Resolve message
   * payload. Defined here so the importRegistry's onPromiseResolve handler
   * can reference it without a use-before-define hazard. Delegates to
   * `exportCap`
   * (defined a few lines below) so the senderPromise-resolution path
   * shares the SAME pass-back / auto-Provide / senderHosted decision tree
   * the regular Call/Return payload encoder uses. Without this delegation,
   * a senderPromise that settles to a cap-on-another-peer would emit
   * `senderHosted` (turning B into an L1 forwarder) instead of
   * `thirdPartyHosted`.
   *
   * @param {unknown} value
   */
  const describeForResolve = value => {
    if (value === null || value === undefined) return { kind: 'none' };
    // exportCap is defined a few lines below; the closure here is only
    // invoked once a senderPromise's resolver is called, by which point
    // exportCap is fully initialised.
    // eslint-disable-next-line no-use-before-define
    return exportCap(value);
  };

  // The ImportRegistry is defined later (its handler factory needs
  // sendCall, which closes over the dispatch handler). We forward-declare a
  // holder so the exportCap/importCap closures can dereference it safely at
  // call time.
  /** @type {ReturnType<typeof makeImportRegistry> | undefined} */
  let importRegistry;
  // Same forward-declare for the threeParty helper: exportCap (defined a
  // few lines below) needs `initiateProvide` for the auto-Provide path,
  // but the helper itself depends on importRegistry + exportRegistry +
  // sendRelease + the L3 message codecs — none of which are constructed
  // yet at the point where exportCap closes over it.
  /** @type {ReturnType<typeof makeThreeParty> | undefined} */
  let threeParty;

  // ---- Cap encode/decode helpers ----
  // Shared by the dispatch + threeParty paths and by every method codec
  // registered via a schema. exportCap walks pass-back / auto-Provide /
  // export-promise / export-cap; importCap inverts on the receive side.

  const exportCap = v => {
    // Pass-back: if this is a presence we imported from the peer, send
    // back as receiverHosted so the peer recognizes its own export.
    const importId = importRegistry && importRegistry.importIdOf(v);
    if (importId !== undefined) {
      return { kind: 'receiverHosted', id: importId };
    }
    // L3 auto-Provide: if `v` is a presence we imported from a DIFFERENT
    // peer (the network's CapHomeRegistry knows because every
    // ImportRegistry registers its imports there), trigger the
    // three-party handoff dance instead of becoming a forwarder. Note
    // that pass-back above already caught the same-connection case; if
    // we reach here and findCapHome returns a hit, the home is by
    // construction a different peer.
    const home = cfg.capHomes && cfg.capHomes.find(v);
    if (home && threeParty) {
      const { thirdPartyCapId, vineId } = threeParty.initiateProvide({
        target: v,
        targetCapDescriptor: { kind: 'importedCap', id: home.hostImportId },
        recipientId: cfg.recipientVatId || new Uint8Array(0),
        hostConnection: home.hostConnection,
      });
      return { kind: 'thirdPartyHosted', thirdPartyCapId, vineId };
    }
    if (isPromise(v)) {
      const { id } = exportRegistry.exportValue(v);
      // Schedule resolve on settle so the peer can collapse the promise.
      Promise.resolve(v).then(
        resolved => {
          const entry = tables.exports.get(id);
          if (!entry || entry.resolved) return;
          entry.resolved = true;
          const cap = describeForResolve(resolved);
          sendFramed(
            encodeResolve({ promiseId: id, payload: { kind: 'cap', cap } }),
          );
        },
        err => {
          const entry = tables.exports.get(id);
          if (!entry || entry.resolved) return;
          entry.resolved = true;
          sendFramed(
            encodeResolve({
              promiseId: id,
              payload: {
                kind: 'exception',
                exception: {
                  type: EXCEPTION_TYPE.failed,
                  reason: String(/** @type {any} */ (err)?.message || err),
                },
              },
            }),
          );
        },
      );
      return { kind: 'senderPromise', id };
    }
    const { id } = exportRegistry.exportValue(v);
    return { kind: 'senderHosted', id };
  };

  const importCap = desc => {
    if (!importRegistry) return undefined;
    if (desc.kind === 'senderHosted')
      return importRegistry.importCap(desc.id, false);
    if (desc.kind === 'senderPromise')
      return importRegistry.importCap(desc.id, true);
    if (desc.kind === 'receiverHosted') {
      const ent = tables.exports.get(desc.id);
      return ent?.value;
    }
    if (desc.kind === 'receiverAnswer') {
      const ans = tables.questions.get(desc.questionId);
      return ans?.returnedP;
    }
    if (desc.kind === 'thirdPartyHosted' && threeParty) {
      // L3 recipient side: open a direct connection to the host and
      // hand the caller a Promise<Presence> that resolves to the direct
      // cap on success or the vine import on failure. eventual-send's
      // E pipelines through the promise so `E(presence).foo()` Just
      // Works either way.
      return threeParty.acceptThirdParty(desc);
    }
    return undefined;
  };

  // ---- Sending Calls ----
  // Closed over by every remote handler; pulled out so both `sendCall`'s
  // pipeline handler and `makeRemoteHandlerForImport` share one definition.
  // eslint-disable-next-line prefer-const
  let sendCall;
  /** @type {(t: any, iid: bigint, mid: number, a: unknown[]) => void} */
  const sendCallOnly = (t, iid, mid, a) => {
    sendCall(t, iid, mid, a);
  };
  /** Common subset of `makeRemoteHandler` options used by every handler. */
  const baseHandlerOptions = () => ({
    sendCall,
    sendCallOnly,
    registerReturnedPromise: () => {},
  });

  sendCall = (target, interfaceId, methodId, args) => {
    const questionId = tables.questionIds.alloc();
    let resolveFn;
    let rejectFn;
    const answerPromise = new Promise((res, rej) => {
      resolveFn = res;
      rejectFn = rej;
    });
    answerPromise.catch(() => {});

    // L3 embargo bookkeeping: if the call's target is one of our
    // unresolved promise imports, mark the import as "had pipelined
    // traffic". A later Resolve-to-thirdPartyHosted on this same id
    // will read the flag in handleResolve to decide whether to set
    // `embargo: true` on the outgoing Accept.
    if (target && target.kind === 'importedCap') {
      const imp = tables.importEntries.get(target.id);
      if (imp && imp.isPromise) imp.hadPipelinedCalls = true;
    }

    // The request methodCodec turns the JS args into the AnyPointer-shaped
    // payload (`encodeContent` callback + `capTable`) that writePayload
    // consumes. Schema registration is required: without a codec, there's
    // no way to write a CF-interop struct at the AnyPointer slot.
    const reqCodec = interfaceRegistry.methodCodec(
      interfaceId,
      methodId,
      'request',
    );
    if (!reqCodec) {
      throw Fail`methodCodec required for ${interfaceId}.${methodId}; register a schema (e.g. via loadSchema(...).registerInterface) first`;
    }
    /** @type {{ encodeContent?: any, capTable?: any[] }} */
    const params = reqCodec.encode(args, { exportCap, importCap });
    const pipelineHandler = makeRemoteHandler({
      ...baseHandlerOptions(),
      resolveMethod: prop => {
        // The pipelined target is a result struct; we cannot in general know
        // its interface. We default to the same interface as the originating
        // call. Application code that pipelines through a known-typed result
        // should call E(p).foo() within an interface scope.
        const ord = interfaceRegistry.methodOrdinal(interfaceId, String(prop));
        if (ord === undefined) {
          throw Fail`pipelined method ${prop} not found in interface ${interfaceId}`;
        }
        return { interfaceId, methodId: ord };
      },
      target: () => ({ kind: 'promisedAnswer', questionId, transform: [] }),
    });

    tables.questions.set(questionId, {
      resolve: resolveFn,
      reject: rejectFn,
      returnedP: answerPromise,
      settled: false,
      finishSent: false,
      pipelineHandler,
      pipelinedCapImports: new Set(),
      // Recorded so handleReturn can pick the matching response codec
      // when a schema-typed method registered one.
      interfaceId,
      methodId,
    });

    sendFramed(
      encodeCall({
        questionId,
        target,
        interfaceId,
        methodId,
        params,
      }),
    );

    return { questionId, answerPromise, pipelineHandler };
  };

  /**
   * Scan registered interfaces for any with a method by this name. Returns
   * the first match. The InterfaceRegistry exposes iterate() which yields
   * the registered descriptors; if a method name appears in multiple
   * interfaces, callers should use a more specific dispatch path.
   *
   * @param {string} name
   */
  const findMethodAcrossInterfaces = name => {
    if (typeof interfaceRegistry.iterate === 'function') {
      for (const desc of interfaceRegistry.iterate()) {
        const m = desc.methods[name];
        if (m !== undefined) return { interfaceId: desc.id, methodId: m };
      }
    }
    return undefined;
  };

  // ---- Import handler factory ----
  const makeRemoteHandlerForImport = (id, _isPromiseImport) =>
    makeRemoteHandler({
      ...baseHandlerOptions(),
      resolveMethod: prop => {
        const found = findMethodAcrossInterfaces(String(prop));
        if (found) return found;
        throw Fail`no registered interface contains method ${String(prop)}`;
      },
      target: () => ({ kind: 'importedCap', id }),
    });

  // ---- Import registry (assigned to the forward-declared holder above). ----
  importRegistry = makeImportRegistry({
    importIdToPresence: tables.importIdToPresence,
    importEntries: tables.importEntries,
    makeRemoteHandler: (id, isP) => makeRemoteHandlerForImport(id, isP),
    onImport: (presence, id) => {
      // Record where this Presence came from so a future encode for a
      // different peer can auto-Provide it instead of becoming a
      // forwarder. With the default fresh-per-connection registry the
      // entry is harmless but unread (no other peer queries this same
      // map); with a shared registry across multi-peer setups this is
      // the only way the encoder learns about cross-peer caps.
      if (cfg.capHomes && cfg.selfRef && cfg.selfRef.value) {
        cfg.capHomes.register(presence, cfg.selfRef.value, id);
      }
    },
  });

  // ---- Send Accept (used by the recipient side of L3 handoff) ----
  /**
   * Allocate a question, send `Accept { questionId, provision, embargo }` on
   * this connection (which is the A↔C connection from the recipient's
   * perspective), and return a Promise that settles with the host's Return
   * payload — i.e. the actual capability that was handed off.
   *
   * The caller is responsible for any vine release on the original B↔A
   * connection after this promise settles.
   *
   * @param {Uint8Array} provision
   * @param {boolean} [embargo]
   */
  const sendAccept = (provision, embargo = false) => {
    const questionId = tables.questionIds.alloc();
    let resolveFn;
    let rejectFn;
    const answerPromise = new Promise((res, rej) => {
      resolveFn = res;
      rejectFn = rej;
    });
    answerPromise.catch(() => {});
    tables.questions.set(questionId, {
      resolve: resolveFn,
      reject: rejectFn,
      returnedP: answerPromise,
      settled: false,
      finishSent: false,
      pipelineHandler: undefined,
      pipelinedCapImports: new Set(),
    });
    sendFramed(encodeAccept({ questionId, provision, embargo }));
    return answerPromise;
  };

  /**
   * Explicit Release on this connection for an import id we know about but
   * never wrapped in a user-facing Presence (e.g. an L3 vine the recipient
   * holds only long enough for the direct Accept to settle).
   *
   * @param {number} id
   * @param {number} [referenceCount]
   */
  const sendRelease = (id, referenceCount = 1) => {
    sendFramed(encodeRelease({ id, referenceCount }));
  };

  // ---- Three-party (uses ctx; concrete operations require network setup) ----
  threeParty = makeThreeParty({
    network: cfg.network || {
      thirdPartyCapIdForHost: () => new Uint8Array(0),
      connectToThirdParty: () => {
        throw Fail`no VatNetwork configured`;
      },
      provisionIdForHandoff: () => new Uint8Array(0),
      acceptIncomingProvide: () => {},
      consumeProvision: () => undefined,
    },
    encodeProvide,
    encodeAccept,
    encodeDisembargo,
    encodeReturn,
    encodeCapContent,
    sendFramed,
    sendRelease,
    importRegistry,
    tables,
    questionIds: tables.questionIds,
    exportRegistry,
  });

  // ---- Bootstrap helpers ----
  const getBootstrap = () => {
    const questionId = tables.questionIds.alloc();
    let resolveFn;
    let rejectFn;
    const answerPromise = new Promise((res, rej) => {
      resolveFn = res;
      rejectFn = rej;
    });
    answerPromise.catch(() => {});
    tables.questions.set(questionId, {
      resolve: v => {
        // The bootstrap return value will be a single capability via our
        // payload codec convention.
        resolveFn(v);
      },
      reject: rejectFn,
      returnedP: answerPromise,
      settled: false,
      finishSent: false,
      pipelineHandler: undefined,
      pipelinedCapImports: new Set(),
    });
    sendFramed(encodeBootstrap({ questionId, deprecatedObjectId: null }));
    return answerPromise;
  };

  // ---- Dispatcher ----
  const dispatcher = makeDispatch({
    tables,
    exportRegistry,
    importRegistry,
    interfaceRegistry,
    exportCap,
    importCap,
    sendFramed,
    encodeReturn,
    encodeFinish,
    encodeRelease,
    encodeUnimplemented,
    encodeAbort,
    encodeDisembargo,
    embargoTracker,
    threeParty,
    onAbort: reason => {
      aborted = true;
      if (onAbort) onAbort(reason);
      // Reject all outstanding questions.
      for (const q of tables.questions.values()) {
        if (!q.settled) q.reject(reason);
      }
    },
    bootstrap,
  });

  /**
   * Receive a framed message from the wire.
   * @param {ArrayBuffer} framed
   */
  const dispatch = framed => {
    if (aborted) return;
    let msg;
    try {
      msg = decodeMessage(framed);
    } catch (e) {
      const reason = `decode failed: ${/** @type {any} */ (e)?.message || e}`;
      sendFramed(
        encodeAbort({
          exception: { type: EXCEPTION_TYPE.failed, reason },
        }),
      );
      return;
    }
    const fn = /** @type {any} */ (dispatcher)[msg.type];
    if (typeof fn === 'function') fn(msg);
  };

  /**
   * Abort the connection; sends Abort to the peer.
   * @param {string} reason
   */
  const abort = reason => {
    if (aborted) return;
    aborted = true;
    sendFramed(
      encodeAbort({ exception: { type: EXCEPTION_TYPE.failed, reason } }),
    );
    for (const q of tables.questions.values()) {
      if (!q.settled) q.reject(Error(reason));
    }
  };

  const stats = () => ({
    questions: tables.questions.size,
    answers: tables.answers.size,
    exports: tables.exports.size,
    imports: tables.importEntries.size,
    embargoes: embargoTracker.outstanding(),
    threeParty: threeParty.stats(),
  });

  return {
    dispatch,
    getBootstrap,
    abort,
    stats,
    sendAccept,
    sendRelease,
    /**
     * Surface the abort-aware framed-send so a peer's L3 `initiateProvide`
     * (called from another connection's auto-Provide path) can target
     * this connection without having to re-implement the abort check.
     */
    sendFramed,
    setBootstrap: v => {
      bootstrap.value = v;
    },
    setOnAbort: cb => {
      onAbort = cb;
    },
  };
};
