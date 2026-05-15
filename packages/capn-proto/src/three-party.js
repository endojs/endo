// @ts-check
/**
 * Three-party handoff (Cap'n Proto Level 3).
 *
 * Glossary:
 *   Vat A (recipient): the vat that will end up with a direct connection to C
 *   Vat B (introducer): originally holds the cap and forwards
 *   Vat C (host): hosts the actual capability
 *
 * Flow when B wants to redirect A from the B↔A path to a direct A↔C path:
 *   1. B → C: Provide { questionId, target, recipient = RecipientId(A) }
 *   2. B → A: Resolve { promiseId, cap = thirdPartyHosted { thirdPartyCapId(C), vineId } }
 *   3. A → C (over a fresh A↔C connection from VatNetwork): Accept { questionId, provision, embargo? }
 *   4. C → A: Return carrying the actual capability
 *   5. A → B: Release on the vine
 *
 * Embargo extension: if A had pipelined calls in flight, A sets `embargo = true`
 * on Accept and additionally sends Disembargo{accept} to B; B forwards
 * Disembargo{provide=&lt;provideQid&gt;} to C; C drains its queue then unblocks A.
 *
 * Vine fallback: A always imports the vine in addition to attempting the
 * direct path. If the direct A↔C handshake fails (host unreachable, unknown
 * provision, etc.) the user-facing Presence resolves to the vine import,
 * whose method calls route back through B as a forwarder.
 */

import { EXCEPTION_TYPE } from './proto/messages.js';

/**
 * @param {object} ctx
 */
export const makeThreeParty = ctx => {
  const {
    network,
    encodeProvide,
    encodeDisembargo,
    sendFramed,
    sendRelease,
    tables,
    questionIds,
  } = ctx;

  /** Vines we hold as exports for B-side fallbacks: vineExportId → provideQuestionId. */
  const vines = new Map();
  /** Provide questions we've issued: questionId → metadata. */
  const provideQuestions = new Map();
  /**
   * Map from a target the recipient (A) has asked us to disembargo back
   * over the original B↔C path → the Provide questionId we used to
   * introduce that target. Populated when we (acting as B) initiate a
   * Provide and consulted when A bounces a Disembargo{accept} back at us.
   *
   * @type {Map<number, number>}
   */
  const provideQuestionByTargetId = new Map();
  /**
   * Host-side (we are C) deferred Accept Returns awaiting a
   * `Disembargo { context: provide(Q) }` to drain any pipelined work that
   * was in flight on the target before A's Accept arrived. Keyed by the
   * Provide's questionId — the same identifier B encodes into the
   * Disembargo it forwards from A.
   *
   * @type {Map<number, () => void>}
   */
  const pendingEmbargoReturns = new Map();

  /**
   * Initiate a three-party handoff.
   * Caller is the introducer (B), passing along a cap that is hosted in C.
   *
   * The vine export's value is the same `target` we name in the Provide,
   * so any method call A makes on the vine (the fallback path when the
   * direct A↔C handshake fails) gets forwarded by B's normal handleCall
   * machinery to the underlying cap on B↔C.
   *
   * The two AnyPointer slots — `Provide.recipient` (sent on the B↔C
   * connection) and `ThirdPartyCapDescriptor.id` (encoded into the
   * descriptor B sends to A) — are populated via VatNetwork-supplied
   * encoder callbacks. The network's `encodeRecipient` and
   * `encodeThirdPartyCapId` methods know what schema to put at the slot;
   * the proto layer just forwards the AnyPointer location.
   *
   * @param {{
   *   target: unknown,
   *   targetCapDescriptor: any,
   *   recipientId: any,
   *   hostConnection: any,
   * }} params
   * @returns {{
   *   encodeThirdPartyCapId: (msg: any, slot: { segId: number, wordOffset: number }) => void,
   *   vineId: number,
   *   provideQuestionId: number,
   * }}
   */
  const initiateProvide = ({
    target,
    targetCapDescriptor,
    recipientId,
    hostConnection,
  }) => {
    const provideQuestionId = questionIds.alloc();
    provideQuestions.set(provideQuestionId, {
      targetCapDescriptor,
      recipientId,
    });
    // Send the Provide on the host connection.
    hostConnection.sendFramed(
      encodeProvide({
        questionId: provideQuestionId,
        target: targetCapDescriptor,
        encodeRecipient: network.encodeRecipient(recipientId),
      }),
    );
    // Allocate a vine export id whose value IS the target cap, so calls A
    // makes on the vine fall through to the existing handleCall →
    // applyMethod path against `target` on the original B↔C connection.
    const vineId = ctx.exportRegistry.exportValue(target).id;
    const entry = tables.exports.get(vineId);
    if (entry) entry.vine = { vinedFor: provideQuestionId };
    vines.set(vineId, provideQuestionId);
    if (
      targetCapDescriptor &&
      targetCapDescriptor.kind === 'importedCap' &&
      typeof targetCapDescriptor.id === 'number'
    ) {
      provideQuestionByTargetId.set(targetCapDescriptor.id, provideQuestionId);
    }
    const encodeThirdPartyCapId = network.encodeThirdPartyCapId(hostConnection);
    return { encodeThirdPartyCapId, vineId, provideQuestionId };
  };

  /**
   * As recipient (A), accept a thirdPartyHosted CapDescriptor that arrived
   * in a Resolve or capTable from the introducer (B).
   *
   *   1. Always import the vine (id `desc.vineId` on this connection). The
   *      vine import is our fallback Presence — calls on it route through
   *      B as a forwarder. We hold it eagerly so we have a viable cap
   *      even if the direct dial fails before any code runs.
   *   2. Resolve `desc.idSlot` (the AnyPointer for the host's
   *      ThirdPartyCapId, decoded by the network) to an A↔C peer connection via
   *      `VatNetwork.connectToThirdParty`. If the network fails to give
   *      us one (or the network is misconfigured), return the vine.
   *   3. Send `Accept { provision, embargo }` via `peer.sendAccept`. If
   *      `desc.embargo === true` (handleResolve sets this when A had
   *      pipelined calls in flight on the just-resolved promise), also
   *      emit a `Disembargo { context: accept }` on this connection
   *      addressed at the original promise import id, so B forwards a
   *      `Disembargo { context: provide(Q) }` to C. C drains its
   *      pipelined-call queue then unblocks the deferred Accept Return,
   *      preserving E-order across the handoff. Race the Accept's
   *      promise: success → Release the vine and resolve to the direct
   *      cap; failure → keep the vine and resolve to it instead.
   *
   * Returns a Promise that always settles to a usable Presence; it
   * rejects only if neither path is viable.
   *
   * @param {{
   *   idSlot: { msg: any, segId: number, wordOffset: number },
   *   vineId: number,
   *   embargo?: boolean,
   *   originalPromiseId?: number,
   * }} desc
   */
  const acceptThirdParty = desc => {
    // Always import the vine first. importCap is idempotent per-id, so
    // even if a later Resolve arrives for the same id it returns the
    // same Presence.
    const vinePresence = ctx.importRegistry.importCap(desc.vineId, false);
    let peer;
    let encodeProvision;
    try {
      peer = network.connectToThirdParty(desc.idSlot);
      encodeProvision = network.encodeProvisionForHandoff(desc.idSlot);
    } catch (_e) {
      // VatNetwork couldn't give us a direct connection — fall back to
      // the vine and keep it alive.
      return Promise.resolve(vinePresence);
    }
    if (!peer || typeof peer.sendAccept !== 'function') {
      return Promise.resolve(vinePresence);
    }
    const useEmbargo = desc.embargo === true;
    if (
      useEmbargo &&
      typeof desc.originalPromiseId === 'number' &&
      typeof encodeDisembargo === 'function'
    ) {
      // Tell B to forward a Disembargo{provide=Q} to C in front of any
      // pipelined work A previously addressed at `desc.originalPromiseId`.
      // B's `handleDisembargoAccept` looks up the corresponding Provide
      // questionId and forwards on B↔C.
      sendFramed(
        encodeDisembargo({
          target: { kind: 'importedCap', id: desc.originalPromiseId },
          context: { kind: 'accept' },
        }),
      );
    }
    const directP = peer.sendAccept(encodeProvision, useEmbargo);
    return directP.then(
      direct => {
        // Direct succeeded; release the vine on the original B↔A path.
        // best-effort — if the connection is already aborted, the peer
        // is gone anyway.
        try {
          sendRelease(desc.vineId, 1);
        } catch (_e) {
          // ignore
        }
        return direct;
      },
      _err => {
        // Direct path failed (no provision, host unreachable, etc).
        // Keep the vine and surface it as the resolution. The user's
        // method calls will go through B as a forwarder.
        return vinePresence;
      },
    );
  };

  /**
   * Release the bookkeeping for a Provide question — typically called
   * when the recipient (A) finishes its A↔C Accept, signalling that the
   * original vine on B is no longer required.
   *
   * @param {number} provideQuestionId
   */
  const finishProvide = provideQuestionId => {
    provideQuestions.delete(provideQuestionId);
    for (const [vineId, qid] of vines) {
      if (qid === provideQuestionId) {
        vines.delete(vineId);
        break;
      }
    }
    for (const [targetId, qid] of provideQuestionByTargetId) {
      if (qid === provideQuestionId) {
        provideQuestionByTargetId.delete(targetId);
        break;
      }
    }
  };

  /**
   * Handle an inbound Provide from B (we are C).
   *
   * @param {{
   *   questionId: number,
   *   target: any,
   *   recipientSlot: { msg: any, segId: number, wordOffset: number },
   * }} msg
   */
  const handleProvide = msg => {
    const { questionId, target, recipientSlot } = msg;
    // Stash the provide so a future Accept from A can claim it. The
    // network reads the AnyPointer at recipientSlot using whatever
    // schema it agreed on for VatNetwork.RecipientId.
    network.acceptIncomingProvide(questionId, target, recipientSlot);
  };

  /**
   * Build the senderHosted Return for a successful Accept. Factored out
   * so the `embargo: true` path can defer it until the matching
   * Disembargo{provide} arrives without re-running the export-allocation
   * logic.
   *
   * @param {number} questionId
   * @param {number} exportId
   */
  const buildAcceptReturn = (questionId, exportId) =>
    ctx.encodeReturn({
      answerId: questionId,
      result: {
        kind: 'results',
        payload: {
          // Same shape as handleBootstrap: AnyPointer cap pointer at index 0,
          // CapDescriptor for the actual export at capTable[0]. CF-interop.
          encodeContent: ctx.encodeCapContent(0),
          capTable: [{ kind: 'senderHosted', id: exportId }],
        },
      },
    });

  /**
   * Handle an inbound Accept from A (we are C).
   *
   * @param {{
   *   questionId: number,
   *   provisionSlot: { msg: any, segId: number, wordOffset: number },
   *   embargo?: boolean,
   * }} msg
   */
  const handleAccept = msg => {
    const { questionId, provisionSlot, embargo } = msg;
    const provided = network.consumeProvision(provisionSlot);
    if (!provided) {
      sendFramed(
        ctx.encodeReturn({
          answerId: questionId,
          result: {
            kind: 'exception',
            exception: {
              type: EXCEPTION_TYPE.failed,
              reason: 'unknown provision',
            },
          },
        }),
      );
      return;
    }
    const value = tables.exports.get(provided.target.id)?.value;
    if (value === undefined) {
      sendFramed(
        ctx.encodeReturn({
          answerId: questionId,
          result: {
            kind: 'exception',
            exception: {
              type: EXCEPTION_TYPE.failed,
              reason: 'no such cap',
            },
          },
        }),
      );
      return;
    }
    const { id } = ctx.exportRegistry.exportValue(value);
    const sendReturn = () => sendFramed(buildAcceptReturn(questionId, id));
    if (embargo === true && typeof provided.questionId === 'number') {
      // A asked us to delay until the in-flight pipelined queue drains.
      // Park the Return; handleDisembargoProvide will fire it after the
      // matching Disembargo arrives. Indexed by the Provide's question id
      // (the same identifier B forwards in the Disembargo).
      pendingEmbargoReturns.set(provided.questionId, sendReturn);
      return;
    }
    sendReturn();
  };

  /**
   * The recipient (A) has bounced a Disembargo{accept} back at us. We are
   * acting as B (introducer) and must forward Disembargo{provide=Q} to
   * the host (C), where Q is the Provide question id we previously used
   * to introduce this target. The peer (C) then drains its in-flight
   * queue and unblocks A's Accept.
   *
   * @param {{ kind: 'importedCap', id: number } | { kind: 'promisedAnswer', questionId: number }} target
   */
  const handleDisembargoAccept = target => {
    let provideQid;
    if (target && target.kind === 'importedCap') {
      provideQid = provideQuestionByTargetId.get(target.id);
    }
    if (provideQid === undefined) {
      // Not actually one of our outstanding Provides — drop on the floor.
      // (A spec-conformant peer should not have sent us this Disembargo.)
      return;
    }
    sendFramed(
      encodeDisembargo({
        target,
        context: { kind: 'provide', questionId: provideQid },
      }),
    );
  };

  /**
   * We are C: B has forwarded A's Disembargo{accept} to us as
   * Disembargo{provide=Q}. Drain any in-flight pipelined work for Q's
   * target (microtask discipline does this for us in JS), then fire the
   * deferred Accept Return that handleAccept parked.
   *
   * @param {number} provideQid
   */
  const handleDisembargoProvide = provideQid => {
    const sendReturn = pendingEmbargoReturns.get(provideQid);
    if (!sendReturn) return;
    pendingEmbargoReturns.delete(provideQid);
    // Defer one microtask so any Calls already scheduled against the
    // target run before we send the Return. In a queue-based pipelining
    // implementation this is where you'd flush the queue.
    Promise.resolve().then(sendReturn);
  };

  return {
    initiateProvide,
    acceptThirdParty,
    finishProvide,
    handleProvide,
    handleAccept,
    handleDisembargoAccept,
    handleDisembargoProvide,
    stats: () => ({
      vines: vines.size,
      provideQuestions: provideQuestions.size,
      pendingEmbargoReturns: pendingEmbargoReturns.size,
    }),
  };
};
