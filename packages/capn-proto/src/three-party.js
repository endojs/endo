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
 * Embargo extension (rpc.capnp 2.0-dev): if A had pipelined calls in flight,
 * A picks a fresh embargoId byte string, sets it on `Accept.embargo` and
 * additionally sends `Disembargo{accept, embargoId}` to B targeting the
 * original promise import. B forwards the same Disembargo on B↔C with
 * `target = promisedAnswer{provideQid}`. C drains its queue then matches the
 * embargoId against its pending Accept Return and unblocks A.
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
   * `Disembargo { context: accept{embargoId} }` (forwarded by B with
   * `target = promisedAnswer{provideQid}`) to drain any pipelined work
   * that was in flight on the target before A's Accept arrived. Keyed by
   * the Provide's questionId; each entry also remembers the embargoId
   * the matching Accept declared, so the Disembargo's id is verified.
   *
   * @type {Map<number, { sendReturn: () => void, embargoId: Uint8Array }>}
   */
  const pendingEmbargoReturns = new Map();

  /**
   * A-side (we are A) embargo id allocator. We don't need cryptographic
   * unguessability here — the spec only requires uniqueness among
   * embargoes outstanding on a given provision, which is trivially
   * satisfied by a per-vat counter. Real VatNetworks supporting
   * forwarding may want to widen this.
   */
  let embargoCounter = 0;
  const allocEmbargoId = () => {
    embargoCounter += 1;
    const n = embargoCounter;
    return new Uint8Array([
      0xe0,
      Math.floor(n / 65536) % 256,
      Math.floor(n / 256) % 256,
      n % 256,
    ]);
  };

  const equalBytes = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

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
    let embargoId;
    if (
      useEmbargo &&
      typeof desc.originalPromiseId === 'number' &&
      typeof encodeDisembargo === 'function'
    ) {
      embargoId = allocEmbargoId();
      // Tell B to forward a Disembargo{accept, embargoId} to C in front
      // of any pipelined work A previously addressed at
      // `desc.originalPromiseId`. B's `handleDisembargoAccept` rewrites
      // target → promisedAnswer{provideQid} and forwards on B↔C; C
      // matches the embargoId against its pending Accept Return.
      sendFramed(
        encodeDisembargo({
          target: { kind: 'importedCap', id: desc.originalPromiseId },
          context: { kind: 'accept', embargoId },
        }),
      );
    }
    const directP = peer.sendAccept(encodeProvision, embargoId);
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
   *   embargoId?: Uint8Array,
   * }} msg
   */
  const handleAccept = msg => {
    const { questionId, provisionSlot, embargoId } = msg;
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
    if (
      embargoId &&
      embargoId.length > 0 &&
      typeof provided.questionId === 'number'
    ) {
      // A asked us to delay until the in-flight pipelined queue drains.
      // Park the Return keyed by the Provide questionId — B forwards the
      // Disembargo with `target = promisedAnswer{Q}` so C resolves it via
      // that question id. The embargoId is remembered for verification.
      pendingEmbargoReturns.set(provided.questionId, {
        sendReturn,
        embargoId,
      });
      return;
    }
    sendReturn();
  };

  /**
   * Find the host-bound forwarding address for an A→B
   * `Disembargo{accept}`. We act as B (introducer): translate A's view of
   * the promise (importedCap on B↔A) into C's view (the Provide question
   * Q we previously sent on B↔C, expressed as `promisedAnswer{Q}`).
   * Returns null if `target` doesn't correspond to one of our outstanding
   * Provides — caller should drop the Disembargo.
   *
   * @param {{ kind: 'importedCap', id: number } | { kind: 'promisedAnswer', questionId: number }} target
   */
  const provideQidForTarget = target => {
    if (target && target.kind === 'importedCap') {
      const q = provideQuestionByTargetId.get(target.id);
      if (q !== undefined) return q;
    }
    return null;
  };

  /**
   * The recipient (A) has bounced a `Disembargo{accept, embargoId}` back
   * at us. We are acting as B (introducer); forward it on the B↔C
   * connection with `target = promisedAnswer{Q}` so C can match the
   * embargoId to its parked Accept Return.
   *
   * In rpc.capnp 2.0-dev the disembargo carries the embargoId byte
   * string in `context.accept`; the previous `provide` arm (which encoded
   * Q as a UInt32 in the discriminator) was removed.
   *
   * @param {{ kind: 'importedCap', id: number } | { kind: 'promisedAnswer', questionId: number }} target
   * @param {Uint8Array} embargoId
   */
  const handleDisembargoAccept = (target, embargoId) => {
    const provideQid = provideQidForTarget(target);
    if (provideQid === null) return;
    sendFramed(
      encodeDisembargo({
        target: { kind: 'promisedAnswer', questionId: provideQid },
        context: { kind: 'accept', embargoId },
      }),
    );
  };

  /**
   * We are C: B has forwarded A's `Disembargo{accept, embargoId}` to us
   * with `target = promisedAnswer{Q}`. Match Q to a parked Accept,
   * verify the embargoId, then unblock the Return after one microtask so
   * any pipelined Calls scheduled before the disembargo arrived are
   * delivered first.
   *
   * @param {number} provideQid
   * @param {Uint8Array} embargoId
   */
  const handleDisembargoOnHost = (provideQid, embargoId) => {
    const entry = pendingEmbargoReturns.get(provideQid);
    if (!entry) return;
    if (!equalBytes(entry.embargoId, embargoId)) return;
    pendingEmbargoReturns.delete(provideQid);
    Promise.resolve().then(entry.sendReturn);
  };

  return {
    initiateProvide,
    acceptThirdParty,
    finishProvide,
    handleProvide,
    handleAccept,
    handleDisembargoAccept,
    handleDisembargoOnHost,
    stats: () => ({
      vines: vines.size,
      provideQuestions: provideQuestions.size,
      pendingEmbargoReturns: pendingEmbargoReturns.size,
    }),
  };
};
