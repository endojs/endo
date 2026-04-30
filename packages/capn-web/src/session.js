// Cap'n Web session.
//
// Wires together a transport, the imports/exports tables, the devaluator and
// evaluator, the stub factories, and the message dispatch loop.

/* eslint-disable no-use-before-define -- session uses mutually-recursive
   nested function declarations (all hoisted; the no-use-before-define rule
   doesn't recognize that for nested functions) */

import harden from '@endo/harden';

import { makeTables } from './tables.js';
import { makeDevaluator } from './devaluate.js';
import { makeEvaluator } from './evaluate.js';
import { makePresenceStub, makePromiseStub } from './stubs.js';
import { walkPathAndCall } from './walk-path.js';
import { recordRemap, replayRemap } from './remap.js';

const noop = () => {};

/**
 * @param {import('./types.js').RpcTransport} transport
 * @param {object} [opts]
 * @param {unknown} [opts.localMain]   The local "main" interface, accessible
 *   by the peer as ["pipeline", 0, ...] / ["import", 0].  May be undefined.
 * @param {boolean} [opts.gcImports]   Use weak refs + FinalizationRegistry
 *   to drop imported stubs automatically when no longer reachable.  Default
 *   true.
 * @param {(reason?: unknown) => void} [opts.onAbort]  Optional callback when
 *   the session aborts.
 */
export const makeCapnWebSession = (transport, opts = {}) => {
  const { localMain, gcImports = true, onAbort = noop } = opts;

  let aborted = false;
  /** @type {unknown} */
  let abortReason;

  // ------- table + counters -------

  const tables = makeTables({
    gcImports,
    sendRelease: (id, refcount) => {
      if (aborted) return;
      sendMessage(['release', id, refcount]);
    },
  });

  // Bootstrap: id 0 is the local main on our side; the peer reaches it via
  // ["import", 0] / ["pipeline", 0, ...].
  if (localMain !== undefined) {
    tables.installExportAtId(0, localMain, false);
  } else {
    tables.installExportAtId(0, harden({}), false);
  }

  let nextOutgoingPushId = 1;
  let nextIncomingPushId = 1;

  // ------- pending resolutions -------

  /**
   * For each push we issued (outgoing), the resolver pair to fulfil when
   * a resolve/reject arrives, plus the cached result for an early-arriving
   * resolution.
   * @type {Map<number, { resolve: (v: unknown) => void, reject: (e: unknown) => void }>}
   */
  const pendingPushAnswers = new Map();

  /**
   * For each export promise we've sent (negative id, isPromise=true),
   * track that we still need to send a resolve/reject.  When the local
   * promise settles we send the message and remove the entry.
   * @type {Set<number>}
   */
  const pendingExportPromises = new Set();

  // ------- devaluate / evaluate -------

  const devaluator = makeDevaluator({
    importIdOf: v => tables.importIdOf(v),
    exportValue: (value, isPromise) => {
      const id = tables.exportValue(value, isPromise);
      if (isPromise) {
        attachExportedPromise(id, /** @type {Promise<unknown>} */ (value));
      }
      return id;
    },
  });

  const stubMachinery = harden({
    sendPipelinedPush: (rootId, path, args, returnedP) => {
      return doPipelinedPush(rootId, path, args, returnedP);
    },
    sendPipelinedPushSendOnly: (rootId, path, args) => {
      doPipelinedPushSendOnly(rootId, path, args);
    },
  });

  const evaluator = makeEvaluator({
    getOrMakePresence: id => getOrMakePresence(id),
    getOrMakePromise: id => getOrMakePromise(id),
    getExportValue: id => {
      const entry = tables.getExport(id);
      if (!entry) {
        throw new Error(`unknown export id ${id}`);
      }
      return entry.value;
    },
  });

  /**
   * @param {number} id
   * @returns {object}
   */
  function getOrMakePresence(id) {
    const existing = tables.getImport(id);
    if (existing) {
      tables.reintroduceImport(id);
      return existing;
    }
    const presence = makePresenceStub(id, stubMachinery);
    tables.installImport(id, presence, false);
    return presence;
  }

  /**
   * @param {number} id
   * @returns {Promise<unknown>}
   */
  function getOrMakePromise(id) {
    const existing = tables.getImport(id);
    if (existing) {
      tables.reintroduceImport(id);
      return /** @type {Promise<unknown>} */ (existing);
    }
    const { promise, resolve, reject } = makePromiseStub(id, stubMachinery);
    tables.installImport(id, /** @type {object} */ (promise), true);
    pendingPushAnswers.set(id, { resolve, reject });
    return promise;
  }

  /**
   * Hook a local promise that we just exported.  When it settles, send the
   * peer a resolve or reject.  If devaluation of the settled value (or
   * rejection reason) fails we send a generic Error to the peer — failing
   * to settle would leave the import dangling forever.
   *
   * @param {number} id
   * @param {Promise<unknown>} p
   */
  function attachExportedPromise(id, p) {
    if (pendingExportPromises.has(id)) return;
    pendingExportPromises.add(id);
    const safeSend = (tag, val) => {
      if (aborted) return;
      pendingExportPromises.delete(id);
      let expr;
      try {
        expr = devaluator.devaluate(val);
      } catch (devalErr) {
        // Couldn't serialize; surface a generic error to the peer.
        const reason =
          devalErr instanceof Error ? devalErr.message : String(devalErr);
        try {
          expr = devaluator.devaluate(
            new Error(`failed to serialize ${tag} value: ${reason}`),
          );
        } catch (_e) {
          expr = ['error', 'Error', 'failed to serialize answer'];
        }
        sendMessage(['reject', id, expr]);
        return;
      }
      sendMessage([tag, id, expr]);
    };
    Promise.resolve(p).then(
      v => safeSend('resolve', v),
      e => safeSend('reject', e),
    );
  }

  // ------- send/receive -------

  /**
   * @param {unknown[]} message
   */
  function sendMessage(message) {
    if (aborted) return;
    let serialized;
    try {
      serialized = JSON.stringify(message);
    } catch (e) {
      abort(e);
      return;
    }
    // transport.send may throw synchronously (e.g. closed MessagePort);
    // catch sync throws here so they don't escape into user code.
    let sendResult;
    try {
      sendResult = transport.send(serialized);
    } catch (e) {
      abort(e);
      return;
    }
    Promise.resolve(sendResult).catch(e => abort(e));
  }

  // ------- outgoing pushes -------

  /**
   * @param {number} rootId
   * @param {readonly PropertyKey[]} path
   * @param {readonly unknown[] | undefined} args
   * @param {Promise<unknown>} [returnedP]  HandledPromise's externally-
   *   returned promise.  When supplied (always, in normal handler dispatch)
   *   we register it in the imports table at the answer's id so devaluator
   *   can recognise it for round-trip identity.
   */
  function doPipelinedPush(rootId, path, args, returnedP) {
    if (aborted)
      return Promise.reject(abortReason || new Error('session aborted'));
    const qid = nextOutgoingPushId;
    nextOutgoingPushId += 1;
    const expr = buildPipelineExpression(rootId, path, args);
    sendMessage(['push', expr]);
    sendMessage(['pull', qid]);
    const { promise, resolve, reject } = makePromiseStub(qid, stubMachinery);
    tables.installImport(qid, /** @type {object} */ (promise), true);
    if (returnedP && returnedP !== promise) {
      // Register HandledPromise's externally-returned promise at the same
      // id so the devaluator recognises a user-held E(remote).foo() promise
      // when it's later passed back as an argument.
      tables.aliasImport(qid, /** @type {object} */ (returnedP));
    }
    pendingPushAnswers.set(qid, { resolve, reject });
    return promise;
  }

  /**
   * Send-only push: emits a regular spec-compliant `["push", expr]` and
   * skips the matching `pull` so the peer is never asked to deliver the
   * answer.  This wastes one export slot on the receiver until they
   * release it (or we abort), but keeps us strictly within the documented
   * Cap'n Web protocol.  We previously used `["stream", expr]` here, which
   * is how cloudflare/capnweb spells fire-and-forget — but that tag isn't
   * part of the "core six" message types the spec lists, so emitting it
   * to a strict peer would risk an `unknown message tag` abort.
   *
   * @param {number} rootId
   * @param {readonly PropertyKey[]} path
   * @param {readonly unknown[] | undefined} args
   */
  function doPipelinedPushSendOnly(rootId, path, args) {
    if (aborted) return;
    const expr = buildPipelineExpression(rootId, path, args);
    // Spec-compliant fire-and-forget: a push without a pull.  We still
    // need to advance our outgoing-push id so the peer's exports table
    // stays in sync, and we eagerly emit a release for that id so the
    // peer can drop the unused answer (otherwise long-lived sessions
    // would accumulate one orphan export per send-only call).
    const qid = nextOutgoingPushId;
    nextOutgoingPushId += 1;
    sendMessage(['push', expr]);
    sendMessage(['release', qid, 1]);
  }

  /**
   * @param {number} rootId
   * @param {readonly PropertyKey[]} path
   * @param {readonly unknown[] | undefined} args
   */
  function buildPipelineExpression(rootId, path, args) {
    const pathStr = path.map(p => {
      if (typeof p === 'string') return p;
      if (typeof p === 'number') return p;
      throw new TypeError('symbol property keys are not supported on the wire');
    });
    if (args === undefined) {
      return ['pipeline', rootId, pathStr];
    }
    const argsExpr = args.map(a => devaluator.devaluate(a));
    return ['pipeline', rootId, pathStr, argsExpr];
  }

  // ------- incoming dispatch -------

  /**
   * Dispatch one incoming message.  Synchronously decodes and starts the
   * appropriate handler, but does NOT await any handler that may block
   * (push, pull) — those run as detached async tasks so the receive loop
   * stays responsive to concurrent traffic.
   *
   * @param {string} raw
   */
  function handleMessage(raw) {
    if (aborted) return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch (e) {
      abort(e);
      return;
    }
    if (!Array.isArray(message) || typeof message[0] !== 'string') {
      abort(new TypeError('malformed message'));
      return;
    }
    const [tag, ...rest] = message;
    const assertArity = expected => {
      if (rest.length !== expected) {
        throw new TypeError(
          `malformed ${tag} message: expected ${expected} args, got ${rest.length}`,
        );
      }
    };
    const assertNumber = index => {
      if (typeof rest[index] !== 'number') {
        throw new TypeError(
          `malformed ${tag} message: arg ${index} must be a number`,
        );
      }
    };
    try {
      switch (tag) {
        case 'push':
          assertArity(1);
          handlePush(rest[0], false).catch(e => abort(e));
          break;
        case 'stream':
          assertArity(1);
          handlePush(rest[0], true).catch(e => abort(e));
          break;
        case 'pull':
          assertArity(1);
          assertNumber(0);
          handlePull(rest[0]).catch(e => abort(e));
          break;
        case 'resolve':
          assertArity(2);
          assertNumber(0);
          handleResolve(rest[0], rest[1], false);
          break;
        case 'reject':
          assertArity(2);
          assertNumber(0);
          handleResolve(rest[0], rest[1], true);
          break;
        case 'release':
          assertArity(2);
          assertNumber(0);
          assertNumber(1);
          handleRelease(rest[0], rest[1]);
          break;
        case 'abort':
          assertArity(1);
          handleAbort(rest[0]);
          break;
        default:
          throw new TypeError(`unknown message tag: ${tag}`);
      }
    } catch (e) {
      abort(e);
    }
  }

  /**
   * @param {unknown} expr
   * @param {boolean} isStream  If true, no answer should be sent and the
   *   answer id is auto-released.
   */
  async function handlePush(expr, isStream) {
    const qid = nextIncomingPushId;
    nextIncomingPushId += 1;

    /** @type {Promise<unknown>} */
    const answer = (async () => executePushExpression(expr))();
    // Suppress unhandled-rejection warnings if the peer never pulls — the
    // export sits in our table waiting for either pull or release.  A
    // no-op observer is enough; handlePull's own await will still see the
    // rejection if a pull arrives.
    answer.catch(noop);
    tables.installExportAtId(qid, answer, true);

    if (isStream) {
      // Auto-pull, auto-release.
      try {
        const v = await answer;
        if (!aborted) {
          sendMessage(['resolve', qid, devaluator.devaluate(v)]);
        }
      } catch (e) {
        if (!aborted) {
          sendMessage(['reject', qid, devaluator.devaluate(e)]);
        }
      }
      // Receiver should auto-release on its side; we drop locally.
      tables.releaseExport(qid, 1);
    }
    // Otherwise wait for an explicit ["pull", qid].
  }

  /**
   * @param {unknown} expr
   * @returns {Promise<unknown>}
   */
  async function executePushExpression(expr) {
    if (Array.isArray(expr) && expr[0] === 'remap') {
      // ["remap", subjectId, propertyPath, captures, instructions]
      // — capnweb wire format.  The mapper subject is `subjectId` (one
      // of our exports); the captures and instructions follow.
      if (expr.length !== 5) {
        throw new TypeError(`invalid remap expression: arity ${expr.length}`);
      }
      const [, id, path, capturesExpr, instructions] = expr;
      if (
        typeof id !== 'number' ||
        (path !== undefined && path !== null && !Array.isArray(path)) ||
        !Array.isArray(capturesExpr) ||
        !Array.isArray(instructions)
      ) {
        throw new TypeError('invalid remap expression');
      }
      const targetExpr =
        Array.isArray(path) && path.length > 0
          ? ['pipeline', id, path]
          : ['pipeline', id];
      const target = await Promise.resolve(executePushExpression(targetExpr));
      const captures = capturesExpr.map(c => evaluator.evaluate(c));
      // capnweb's apply-map iterates an array input element-by-element;
      // for a non-array target we apply once.  We follow the same shape.
      if (Array.isArray(target)) {
        return Promise.all(
          target.map(elem => replayRemap({ instructions, captures }, elem)),
        );
      }
      return replayRemap({ instructions, captures }, target);
    }
    if (
      Array.isArray(expr) &&
      (expr[0] === 'pipeline' || expr[0] === 'import')
    ) {
      const id = expr[1];
      const path = expr[2];
      const args = expr[3];
      if (
        typeof id !== 'number' ||
        (path !== undefined && !Array.isArray(path)) ||
        (args !== undefined && !Array.isArray(args))
      ) {
        throw new TypeError(`invalid ${expr[0]} expression`);
      }
      const root = lookupReferenceForExecution(id);
      if (path === undefined && args === undefined) return root;
      const evaluatedArgs =
        args === undefined ? undefined : args.map(a => evaluator.evaluate(a));
      return walkPathAndCall(root, path || [], evaluatedArgs);
    }
    return evaluator.evaluate(expr);
  }

  // ------- public helpers -------

  /**
   * Issue a `["remap", ...]` push that runs `mapper` on the peer side.
   * Wire form is `["remap", subjectId, propertyPath, captures,
   * instructions]` (capnweb-compatible).  The peer evaluates
   * `subjectId.propertyPath`; if the result is an array, the mapper is
   * applied per-element (capnweb's apply-map semantics).
   *
   * The first argument can be:
   *   - An imported presence/promise stub.  Used as the subject directly.
   *   - A `{ stub, path, args? }` descriptor that says "apply the mapper
   *     to the result of `stub.path[0].path[1]…(args?)`".  This avoids
   *     the timing of HandledPromise's async dispatch when the user
   *     wants to map over a property/method result of a known stub.
   *
   * @param {object | { stub: object, path?: readonly (string|number)[], args?: readonly unknown[] }} target
   * @param {(input: unknown) => unknown} mapper
   * @returns {Promise<unknown>}
   */
  async function callRemap(target, mapper) {
    /** @type {object} */
    let baseStub;
    /** @type {readonly (string | number)[]} */
    let propertyPath = [];
    /** @type {readonly unknown[] | undefined} */
    let pathArgs;
    if (
      target &&
      typeof target === 'object' &&
      'stub' in target &&
      /** @type {any} */ (target).stub
    ) {
      baseStub = /** @type {any} */ (target).stub;
      propertyPath = /** @type {any} */ (target).path || [];
      pathArgs = /** @type {any} */ (target).args;
    } else {
      baseStub = /** @type {any} */ (target);
    }
    let id = tables.importIdOf(baseStub);
    // Allow any pending E()-driven HandledPromise dispatch to fire so
    // its alias has been registered.  HandledPromise dispatches in a
    // future turn; mix microtasks + macrotasks for robustness.
    /* eslint-disable no-await-in-loop -- short retry loop */
    for (let i = 0; id === undefined && i < 20; i += 1) {
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));
      id = tables.importIdOf(baseStub);
    }
    if (id === undefined) {
      throw new Error('callRemap: argument is not a remote stub');
    }
    const recording = recordRemap(mapper);
    const wireCaptures = recording.captures.map(c => devaluator.devaluate(c));
    // Build the "subject expression" that the remap targets.  If the
    // user supplied path/args, embed them in the subject's pipeline so
    // the peer first invokes that, then maps the result.  Capnweb's
    // remap form has a single propertyPath but no inline args, so for
    // the args case we synthesise an intermediate push.
    let remapExpr;
    if (pathArgs !== undefined) {
      // Issue an intermediate push for `id.path(args)`, then use that
      // result as the remap's subject (path=[]).
      const argsExpr = pathArgs.map(a => devaluator.devaluate(a));
      const intermediateExpr = ['pipeline', id, propertyPath.slice(), argsExpr];
      const intermediateQid = nextOutgoingPushId;
      nextOutgoingPushId += 1;
      sendMessage(['push', intermediateExpr]);
      const {
        promise: ip,
        resolve: ir,
        reject: irej,
      } = makePromiseStub(intermediateQid, stubMachinery);
      // The intermediate promise is internal — the caller never awaits
      // it directly.  Attach a no-op catch so an abort-time rejection
      // doesn't surface as an unhandled rejection.
      ip.catch(noop);
      tables.installImport(intermediateQid, /** @type {object} */ (ip), true);
      pendingPushAnswers.set(intermediateQid, { resolve: ir, reject: irej });
      remapExpr = [
        'remap',
        intermediateQid,
        [],
        wireCaptures,
        recording.instructions,
      ];
    } else {
      remapExpr = [
        'remap',
        id,
        propertyPath.slice(),
        wireCaptures,
        recording.instructions,
      ];
    }
    if (aborted) {
      return Promise.reject(abortReason || new Error('session aborted'));
    }
    const qid = nextOutgoingPushId;
    nextOutgoingPushId += 1;
    sendMessage(['push', remapExpr]);
    sendMessage(['pull', qid]);
    const { promise, resolve, reject } = makePromiseStub(qid, stubMachinery);
    tables.installImport(qid, /** @type {object} */ (promise), true);
    pendingPushAnswers.set(qid, { resolve, reject });
    return promise;
  }

  /**
   * Look up an id for execution: a top-level ["pipeline", id, ...] in a
   * push always refers to the sender's imports = our exports, regardless of
   * sign.  (The sign just records which side allocated the id.)
   * @param {number} id
   */
  function lookupReferenceForExecution(id) {
    const entry = tables.getExport(id);
    if (!entry) throw new Error(`unknown export id ${id}`);
    return entry.value;
  }

  /**
   * @param {number} id
   */
  async function handlePull(id) {
    const entry = tables.getExport(id);
    if (!entry) {
      // The peer is asking about an id we don't have; could happen if we
      // released it concurrently.  Reply with a generic error.
      sendMessage([
        'reject',
        id,
        devaluator.devaluate(new Error(`unknown export ${id}`)),
      ]);
      return;
    }
    try {
      const v = await Promise.resolve(entry.value);
      if (aborted) return;
      sendMessage(['resolve', id, devaluator.devaluate(v)]);
    } catch (e) {
      if (aborted) return;
      sendMessage(['reject', id, devaluator.devaluate(e)]);
    }
  }

  /**
   * @param {number} id
   * @param {unknown} expr
   * @param {boolean} isReject
   */
  function handleResolve(id, expr, isReject) {
    const pending = pendingPushAnswers.get(id);
    if (!pending) return;
    pendingPushAnswers.delete(id);
    let value;
    try {
      value = evaluator.evaluate(expr);
    } catch (e) {
      pending.reject(e);
      return;
    }
    if (isReject) pending.reject(value);
    else pending.resolve(value);
  }

  /**
   * @param {number} id
   * @param {number} refcount
   */
  function handleRelease(id, refcount) {
    tables.releaseExport(id, refcount);
  }

  /**
   * @param {unknown} expr
   */
  function handleAbort(expr) {
    let reason;
    try {
      reason = evaluator.evaluate(expr);
    } catch (_e) {
      reason = new Error('peer aborted with unparseable reason');
    }
    // Peer-initiated abort: do all the same cleanup as a local abort,
    // except don't echo an abort message back at the peer.
    teardown(reason, false);
  }

  /**
   * @param {unknown} reason
   */
  function rejectAllPending(reason) {
    for (const { reject } of pendingPushAnswers.values()) {
      try {
        reject(reason);
      } catch (_e) {
        /* ignore */
      }
    }
    pendingPushAnswers.clear();
  }

  // ------- abort / teardown -------

  /**
   * Common teardown: marks the session aborted, releases all tables,
   * rejects outstanding pushes, closes the underlying transport, and
   * notifies the user-provided onAbort callback.
   *
   * @param {unknown} reason
   * @param {boolean} sendAbortMessage  If true, attempt to notify the
   *   peer with `["abort", reason]` before closing the transport.
   */
  function teardown(reason, sendAbortMessage) {
    if (aborted) return;
    aborted = true;
    abortReason = reason;
    if (sendAbortMessage) {
      try {
        const expr = devaluator.devaluate(reason);
        const raw = JSON.stringify(['abort', expr]);
        Promise.resolve(transport.send(raw)).catch(noop);
      } catch (_e) {
        /* ignore */
      }
    }
    if (transport.abort) {
      try {
        transport.abort(reason);
      } catch (_e) {
        /* ignore */
      }
    }
    rejectAllPending(reason);
    tables.clear();
    try {
      onAbort(reason);
    } catch (_e) {
      /* ignore */
    }
  }

  /**
   * Locally initiated abort.  Notifies the peer via `["abort", reason]`,
   * then performs the standard teardown.
   *
   * @param {unknown} [reason]
   */
  function abort(reason) {
    teardown(reason || new Error('session aborted'), true);
  }

  // ------- public api -------

  /**
   * @returns {object} the peer's main interface as a presence stub.
   */
  const getRemoteMain = () => getOrMakePresence(0);

  /**
   * Resolves once we have no further outbound traffic to produce: no
   * outstanding outgoing pushes waiting for answers, no exported promises
   * still settling, and no incoming pushes still being computed.  Useful
   * for batch transports that need to know when to flush a response.
   *
   * Polls on the macrotask queue (setTimeout 0) so each iteration gives
   * the session loop and microtasks a chance to advance.
   */
  /* global setTimeout */
  async function drain() {
    /* eslint-disable no-await-in-loop -- explicit polling loop */
    // We finish two consecutive idle ticks in a row to allow last-mile
    // microtasks to settle.
    let idleCount = 0;
    while (!aborted) {
      const inFlight =
        pendingPushAnswers.size > 0 || pendingExportPromises.size > 0;
      if (!inFlight) {
        idleCount += 1;
        if (idleCount >= 2) return;
      } else {
        idleCount = 0;
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // ------- start the receive loop -------

  (async () => {
    /* eslint-disable no-await-in-loop -- sequential receive loop */
    while (!aborted) {
      let raw;
      try {
        raw = await transport.receive();
      } catch (e) {
        abort(e);
        return;
      }
      if (raw === null || raw === undefined) {
        // Treat null receive as end-of-stream.
        abort(new Error('transport closed'));
        return;
      }
      handleMessage(raw);
    }
  })().catch(e => abort(e));

  return harden({
    getRemoteMain,
    callRemap,
    abort,
    drain,
    getStats: () => tables.getStats(),
    isAborted: () => aborted,
  });
};
