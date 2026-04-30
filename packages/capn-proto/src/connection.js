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
} from './proto/messages.js';
import { encodePayload, decodePayload } from './payload-codec.js';

const utf8Encoder = new TextEncoder();

/**
 * @param {object} cfg
 * @param {(framed: ArrayBuffer) => void} cfg.send
 * @param {unknown} [cfg.bootstrap]
 * @param {import('./interfaces.js').InterfaceRegistry} cfg.interfaceRegistry
 * @param {object} [cfg.network]
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
   * payload. Defined before payloadCodec so the closure below can reference
   * it without a use-before-define hazard.
   *
   * @param {unknown} value
   */
  const describeForResolve = value => {
    if (value === null || value === undefined) return { kind: 'none' };
    if (isPromise(value)) {
      const { id } = exportRegistry.exportValue(value);
      return { kind: 'senderPromise', id };
    }
    // Could be a remote presence we already imported (loopback case).
    const { id } = exportRegistry.exportValue(value);
    return { kind: 'senderHosted', id };
  };

  // The ImportRegistry is defined later (its handler factory needs sendCall
  // which itself uses payloadCodec). We forward-declare a holder so the
  // codec closure can dereference it safely at call time.
  /** @type {ReturnType<typeof makeImportRegistry> | undefined} */
  let importRegistry;

  // ---- Cap encode/decode helpers ----
  // Extracted so both the JSON-payload codec AND user-supplied schema-typed
  // method codecs can share the same exportCap/importCap behaviour.

  const isCap = v => {
    // A value is a capability if it is one of our imported presences,
    // or if it is a non-Object-prototype object (e.g. an Exo, Far'd
    // object, or HandledPromise/Presence).
    if (v == null) return false;
    const t = typeof v;
    if (t !== 'object' && t !== 'function') return false;
    if (importRegistry && importRegistry.importIdOf(v) !== undefined) {
      return true;
    }
    if (typeof (/** @type {any} */ (v).then) === 'function') return true;
    const proto = Object.getPrototypeOf(v);
    return proto !== Object.prototype && proto !== Array.prototype;
  };

  const exportCap = v => {
    // Pass-back: if this is a presence we imported from the peer, send
    // back as receiverHosted so the peer recognizes its own export.
    const importId = importRegistry && importRegistry.importIdOf(v);
    if (importId !== undefined) {
      return { kind: 'receiverHosted', id: importId };
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
                  type: 0,
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
    return undefined;
  };

  // ---- Payload codec ----
  const payloadCodec = {
    encode: value => encodePayload(value, { isCap, exportCap }),
    encodeRoot: marker => utf8Encoder.encode(JSON.stringify(marker)),
    decode: payload => decodePayload(payload, { importCap }),
    /** Exposed so dispatch.js / send-side code can hand a ctx to user
     *  schema-typed method codecs without rebuilding these closures. */
    exportCap,
    importCap,
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

    // If a request codec is registered for (interfaceId, methodId), use it
    // to encode the args as a typed Cap'n Proto struct in Payload.contentBytes.
    // The codec's `encode(args, ctx)` may either:
    //   - return raw bytes (Uint8Array | ArrayBuffer) — cap-free schemas
    //   - return `{ contentBytes, capTable }` — cap-aware schemas that
    //     populated the cap table via `ctx.exportCap(value)`.
    // Falls back to the JSON-over-bytes payloadCodec when no schema codec
    // is registered.
    const reqCodec = interfaceRegistry.methodCodec(
      interfaceId,
      methodId,
      'request',
    );
    let params;
    if (reqCodec) {
      const encoded = reqCodec.encode(args, { exportCap, importCap });
      if (encoded && typeof encoded === 'object' && 'contentBytes' in encoded) {
        params = encoded;
      } else {
        const u8 =
          encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
        params = { contentBytes: u8, capTable: [] };
      }
    } else {
      params = payloadCodec.encode(args);
    }
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
  const threeParty = makeThreeParty({
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
    sendFramed,
    sendRelease,
    importRegistry,
    tables,
    questionIds: tables.questionIds,
    exportRegistry,
    payloadCodec,
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
    payloadCodec,
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
          exception: { type: 0, reason },
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
    sendFramed(encodeAbort({ exception: { type: 0, reason } }));
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
    setBootstrap: v => {
      bootstrap.value = v;
    },
    setOnAbort: cb => {
      onAbort = cb;
    },
  };
};
