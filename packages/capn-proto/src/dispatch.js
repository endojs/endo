// @ts-check
/**
 * Inbound message dispatch.
 *
 * Each handler is called by the connection when a framed Cap'n Proto message
 * has been decoded from the wire.
 */

import { HandledPromise } from '@endo/eventual-send';
import { Fail } from '@endo/errors';
import { EXCEPTION_TYPE } from './proto/messages.js';
import { normalizeCodecResult } from './payload-codec.js';

/**
 * @param {object} ctx The connection context built by makeConnection.
 */
export const makeDispatch = ctx => {
  const {
    tables,
    exportRegistry,
    importRegistry,
    interfaceRegistry,
    payloadCodec,
    sendFramed,
    encodeReturn,
    encodeFinish,
    encodeUnimplemented,
    encodeDisembargo,
    embargoTracker,
    threeParty,
    onAbort,
    bootstrap,
  } = ctx;

  // ---- Bootstrap ----
  const handleBootstrap = ({ questionId }) => {
    if (!bootstrap.value) {
      const exc = {
        type: EXCEPTION_TYPE.failed,
        reason: 'no bootstrap object',
      };
      sendFramed(
        encodeReturn({
          answerId: questionId,
          result: { kind: 'exception', exception: exc },
        }),
      );
      return;
    }
    // Route through `payloadCodec.exportCap` (instead of hard-coding
    // `senderHosted`) so a Promise-valued bootstrap, or one that is
    // itself an import from another peer, gets the right descriptor:
    // senderPromise / receiverHosted / thirdPartyHosted as applicable.
    // The payloadCodec's exportCap shares the auto-Provide branch with
    // the regular Call/Return encode path.
    const desc = payloadCodec.exportCap(bootstrap.value);
    const payload = {
      contentBytes: payloadCodec.encodeRoot('@cap:0'),
      capTable: [desc],
    };
    tables.answers.set(questionId, {
      resultP: Promise.resolve(bootstrap.value),
      returnSent: true,
      finishReceived: false,
      pipelineExportsByPath: new Map(),
    });
    sendFramed(
      encodeReturn({
        answerId: questionId,
        result: { kind: 'results', payload },
      }),
    );
  };

  // ---- Call ----
  const handleCall = msg => {
    const { questionId, target, interfaceId, methodId, params } = msg;
    let targetP;
    if (target?.kind === 'importedCap') {
      // The peer is calling a cap that we exported earlier.
      const entry = tables.exports.get(target.id);
      if (!entry) {
        sendFramed(
          encodeReturn({
            answerId: questionId,
            result: {
              kind: 'exception',
              exception: {
                type: EXCEPTION_TYPE.failed,
                reason: `no export ${target.id}`,
              },
            },
          }),
        );
        return;
      }
      targetP = Promise.resolve(entry.value);
    } else if (target?.kind === 'promisedAnswer') {
      const ans = tables.answers.get(target.questionId);
      if (!ans) {
        sendFramed(
          encodeReturn({
            answerId: questionId,
            result: {
              kind: 'exception',
              exception: {
                type: EXCEPTION_TYPE.failed,
                reason: `no answer ${target.questionId}`,
              },
            },
          }),
        );
        return;
      }
      // Walk transform path — defer to the resultP. For our payload codec a
      // pointer ordinal corresponds to a property access; without a static
      // schema we map it back to the JS index in the result struct.
      targetP = ans.resultP.then(result => {
        let v = result;
        for (const op of target.transform || []) {
          if (op.op === 'getPointerField') {
            if (v === null || v === undefined || typeof v !== 'object') {
              throw Fail`cannot pipeline through non-object result for getPointerField`;
            }
            // For our schema-less Payload encoding, we treat the result as a
            // record where pointer field N is the Nth own enumerable
            // property's value. Application code should structure result
            // objects accordingly.
            const keys = Object.keys(v);
            v = v[keys[op.fieldOrdinal]];
          }
        }
        return v;
      });
    } else {
      sendFramed(
        encodeReturn({
          answerId: questionId,
          result: {
            kind: 'exception',
            exception: { type: EXCEPTION_TYPE.failed, reason: 'bad target' },
          },
        }),
      );
      return;
    }

    const methodName = interfaceRegistry.methodName(interfaceId, methodId);
    if (methodName === undefined) {
      sendFramed(
        encodeReturn({
          answerId: questionId,
          result: {
            kind: 'exception',
            exception: {
              type: EXCEPTION_TYPE.unimplemented,
              reason: `unknown method ${interfaceId}.${methodId}`,
            },
          },
        }),
      );
      return;
    }

    const reqCodec = interfaceRegistry.methodCodec(
      interfaceId,
      methodId,
      'request',
    );
    let argList;
    try {
      const args = reqCodec
        ? reqCodec.decode(params.contentBytes, params.capTable, {
            exportCap: payloadCodec.exportCap,
            importCap: payloadCodec.importCap,
          })
        : payloadCodec.decode(params);
      argList = Array.isArray(args) ? args : [];
    } catch (err) {
      // payload decoding failed — surface as an exception Return so the
      // peer's question rejects rather than blocking forever.
      sendFramed(
        encodeReturn({
          answerId: questionId,
          result: {
            kind: 'exception',
            exception: {
              type: EXCEPTION_TYPE.failed,
              reason: `payload decode failed: ${
                /** @type {any} */ (err)?.message || err
              }`,
            },
          },
        }),
      );
      return;
    }

    const resultP = targetP.then(t =>
      HandledPromise.applyMethod(t, methodName, argList),
    );
    tables.answers.set(questionId, {
      resultP,
      returnSent: false,
      finishReceived: false,
      pipelineExportsByPath: new Map(),
    });

    const respCodec = interfaceRegistry.methodCodec(
      interfaceId,
      methodId,
      'response',
    );
    resultP.then(
      value => {
        const ans = tables.answers.get(questionId);
        if (!ans || ans.returnSent) return;
        ans.returnSent = true;
        const payload = respCodec
          ? normalizeCodecResult(
              respCodec.encode(value, {
                exportCap: payloadCodec.exportCap,
                importCap: payloadCodec.importCap,
              }),
            )
          : payloadCodec.encode(value);
        sendFramed(
          encodeReturn({
            answerId: questionId,
            result: { kind: 'results', payload },
          }),
        );
      },
      err => {
        const ans = tables.answers.get(questionId);
        if (!ans || ans.returnSent) return;
        ans.returnSent = true;
        const exc = {
          type: EXCEPTION_TYPE.failed,
          reason: String(err?.message || err),
        };
        sendFramed(
          encodeReturn({
            answerId: questionId,
            result: { kind: 'exception', exception: exc },
          }),
        );
      },
    );
  };

  // ---- Return ----
  const handleReturn = msg => {
    const { answerId, result } = msg;
    const q = tables.questions.get(answerId);
    if (!q) {
      // We've already finished this question.
      return;
    }
    q.settled = true;
    if (result.kind === 'results') {
      const respCodec =
        q.interfaceId !== undefined
          ? interfaceRegistry.methodCodec(q.interfaceId, q.methodId, 'response')
          : undefined;
      const value = respCodec
        ? respCodec.decode(
            result.payload.contentBytes,
            result.payload.capTable,
            {
              exportCap: payloadCodec.exportCap,
              importCap: payloadCodec.importCap,
            },
          )
        : payloadCodec.decode(result.payload);
      q.resolve(value);
    } else if (result.kind === 'exception') {
      q.reject(Error(result.exception.reason || 'remote exception'));
    } else if (result.kind === 'canceled') {
      q.reject(Error('canceled'));
    } else {
      q.reject(Error(`unhandled return kind ${result.kind}`));
    }
    // After receiving Return, send Finish to release any pipelined answer
    // resources on the peer side. Once Finish is sent, the QuestionEntry's
    // bookkeeping is no longer needed locally either; drop it and recycle
    // the questionId so the allocator can reuse it.
    if (!q.finishSent) {
      q.finishSent = true;
      sendFramed(
        encodeFinish({ questionId: answerId, releaseResultCaps: false }),
      );
    }
    tables.questions.delete(answerId);
    tables.questionIds.release(answerId);
  };

  // ---- Finish ----
  const handleFinish = msg => {
    const { questionId } = msg;
    const ans = tables.answers.get(questionId);
    if (!ans) return;
    ans.finishReceived = true;
    tables.answers.delete(questionId);
  };

  // ---- Resolve ----
  const handleResolve = msg => {
    const { promiseId, payload } = msg;
    const entry = tables.importEntries.get(promiseId);
    if (!entry || !entry.isPromise) return;
    if (payload.kind === 'cap') {
      const desc = payload.cap;
      let resolvedTo;
      let resolveError;
      if (desc.kind === 'senderHosted' || desc.kind === 'senderPromise') {
        resolvedTo = importRegistry.importCap(
          desc.id,
          desc.kind === 'senderPromise',
        );
      } else if (desc.kind === 'receiverHosted') {
        const ent = tables.exports.get(desc.id);
        if (ent) {
          resolvedTo = ent.value;
        } else {
          // Peer claims the promise resolved to one of our exports, but
          // we've already released that export. Reject the promise rather
          // than silently resolving to undefined.
          resolveError = Error(`resolve referenced unknown export ${desc.id}`);
        }
      } else if (desc.kind === 'thirdPartyHosted') {
        try {
          // L3 embargo: if A made any pipelined calls against this
          // promise before the Resolve arrived, request that C defer
          // its Accept Return until our matching Disembargo{accept}
          // makes it through B → C. The flag was tagged in
          // connection.js#sendCall.
          const embargo = entry.hadPipelinedCalls === true;
          resolvedTo = threeParty.acceptThirdParty({
            ...desc,
            embargo,
            // Surface the original promise id so acceptThirdParty can
            // address the Disembargo it sends back over this connection.
            originalPromiseId: promiseId,
          });
        } catch (e) {
          resolveError = e;
        }
      } else {
        resolveError = Error(`resolve with unknown cap kind ${desc.kind}`);
      }
      if (resolveError) {
        if (entry.rejectSettler) entry.rejectSettler(resolveError);
        return;
      }
      entry.resolvedTo = resolvedTo;
      // Tribble rule: messages addressed to promiseId stay routed via the
      // original import (which forwards). We DO NOT redirect handlers; we
      // simply settle the user-facing presence for direct E()'s on it.
      if (entry.resolveSettler) entry.resolveSettler(resolvedTo);
    } else if (payload.kind === 'exception') {
      if (entry.rejectSettler)
        entry.rejectSettler(
          Error(payload.exception.reason || 'remote rejection'),
        );
    }
  };

  // ---- Release ----
  const handleRelease = msg => {
    exportRegistry.releaseExport(msg.id, msg.referenceCount);
  };

  // ---- Disembargo ----
  const handleDisembargo = msg => {
    const { target, context } = msg;
    if (context.kind === 'senderLoopback') {
      // Peer wants us to bounce this back as a receiverLoopback. We just
      // queue it after any in-flight work for the targeted cap. For our
      // single-threaded JS, we send the echo on the next microtask which is
      // sufficient to preserve E-order with already-queued Calls.
      Promise.resolve().then(() => {
        sendFramed(
          encodeDisembargo({
            target,
            context: { kind: 'receiverLoopback', id: context.id },
          }),
        );
      });
    } else if (context.kind === 'receiverLoopback') {
      embargoTracker.echo(context.id);
    } else if (context.kind === 'accept') {
      threeParty.handleDisembargoAccept(target);
    } else if (context.kind === 'provide') {
      threeParty.handleDisembargoProvide(context.questionId);
    }
  };

  // ---- Provide / Accept ----
  const handleProvide = msg => threeParty.handleProvide(msg);
  const handleAccept = msg => threeParty.handleAccept(msg);

  // ---- Abort / Unimplemented ----
  const handleAbort = msg => onAbort(Error(msg.exception.reason || 'aborted'));
  const handleUnimplemented = _msg => {};

  return {
    bootstrap: handleBootstrap,
    call: handleCall,
    return: handleReturn,
    finish: handleFinish,
    resolve: handleResolve,
    release: handleRelease,
    disembargo: handleDisembargo,
    provide: handleProvide,
    accept: handleAccept,
    abort: handleAbort,
    unimplemented: handleUnimplemented,
    unimplementedTag: msg => {
      // Send an Unimplemented echo. We don't have the original framed bytes
      // here, so we send an empty echo. (Compatible peers tolerate this.)
      sendFramed(encodeUnimplemented({ originalBytes: new Uint8Array(0) }));
    },
  };
};
