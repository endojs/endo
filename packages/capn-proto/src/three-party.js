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
 */

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
  /** Accept questions we've issued: questionId → settler. */
  const acceptQuestions = new Map();
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
   * Initiate a three-party handoff.
   * Caller is the introducer (B), passing along a cap that is hosted in C.
   *
   * @param {{ targetCapDescriptor: any, recipientId: Uint8Array, hostConnection: any }} params
   * @returns {{ thirdPartyCapId: Uint8Array, vineId: number, provideQuestionId: number }}
   */
  const initiateProvide = ({
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
        recipient: recipientId,
      }),
    );
    // Allocate a vine export id (vine is held by B for fallback).
    const vineId = ctx.exportRegistry.exportValue({
      __vine: true,
      provideQuestionId,
    }).id;
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
    const thirdPartyCapId = network.thirdPartyCapIdForHost(hostConnection);
    return { thirdPartyCapId, vineId, provideQuestionId };
  };

  /**
   * As recipient (A), accept a thirdPartyHosted CapDescriptor that arrived in
   * a Resolve or capTable from the introducer (B).
   *
   *   1. Resolve `desc.thirdPartyCapId` to an A↔C peer connection via the
   *      configured `VatNetwork.connectToThirdParty`. The peer is itself a
   *      `makeCapnp`-shaped object so it tracks its own questions/answers.
   *   2. Compute the provision id with `network.provisionIdForHandoff` and
   *      call `peer.sendAccept(provision)` on the A↔C peer; this returns a
   *      promise that settles when C sends its Return for the Accept.
   *   3. Once that promise settles (success or failure), Release the vine
   *      back on the original B↔A connection — A no longer needs B as a
   *      forwarder once the direct A↔C path is established (or has failed
   *      and the user is about to discover the rejection).
   *
   * Returns a Promise that mirrors the Accept's resolution. On success it
   * resolves to the actual capability the host returned. On failure (no such
   * provision, host unreachable, etc.) it rejects with an Error; callers
   * receiving a `thirdPartyHosted` cap in a Resolve will surface that as the
   * rejection of the user-facing Presence.
   *
   * @param {{ thirdPartyCapId: Uint8Array, vineId: number }} desc
   */
  let nextAcceptKey = 0;
  const acceptThirdParty = desc => {
    const peer = network.connectToThirdParty(desc.thirdPartyCapId);
    if (!peer || typeof peer.sendAccept !== 'function') {
      throw Error(
        'connectToThirdParty must return a peer with a sendAccept method',
      );
    }
    const provision = network.provisionIdForHandoff(desc.thirdPartyCapId);
    const answerP = peer.sendAccept(provision);
    // Track the in-flight Accept so stats() reflects it; clean up in then().
    nextAcceptKey += 1;
    const acceptKey = nextAcceptKey;
    acceptQuestions.set(acceptKey, { vineId: desc.vineId });
    const releaseVine = () => {
      acceptQuestions.delete(acceptKey);
      // The vine import lives on this connection (the original B↔A). After
      // the direct path settles, A no longer needs the vine — Release it.
      // sendRelease is best-effort; if the connection is already aborted
      // the peer is gone anyway, so swallow any throw.
      try {
        sendRelease(desc.vineId, 1);
      } catch (_e) {
        // ignore
      }
    };
    answerP.then(releaseVine, releaseVine);
    return answerP;
  };

  /**
   * Release the bookkeeping for a Provide question — typically called when
   * the recipient (A) finishes its A↔C Accept, signalling that the original
   * vine on B is no longer required.
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
   * @param {{ questionId: number, target: any, recipient: Uint8Array }} msg
   */
  const handleProvide = msg => {
    const { questionId, target, recipient } = msg;
    // Stash the provide so a future Accept from A can claim it.
    network.acceptIncomingProvide(questionId, target, recipient);
  };

  /**
   * Handle an inbound Accept from A (we are C).
   *
   * @param {{ questionId: number, provision: Uint8Array }} msg
   */
  const handleAccept = msg => {
    const { questionId, provision } = msg;
    const provided = network.consumeProvision(provision);
    if (!provided) {
      sendFramed(
        ctx.encodeReturn({
          answerId: questionId,
          result: {
            kind: 'exception',
            exception: { type: 2, reason: 'unknown provision' },
          },
        }),
      );
      return;
    }
    // Echo back a Return with the targeted cap as a senderHosted descriptor.
    const value = tables.exports.get(provided.target.id)?.value;
    if (value === undefined) {
      sendFramed(
        ctx.encodeReturn({
          answerId: questionId,
          result: {
            kind: 'exception',
            exception: { type: 2, reason: 'no such cap' },
          },
        }),
      );
      return;
    }
    const { id } = ctx.exportRegistry.exportValue(value);
    sendFramed(
      ctx.encodeReturn({
        answerId: questionId,
        result: {
          kind: 'results',
          payload: {
            contentBytes: ctx.payloadCodec.encodeRoot('@cap:0'),
            capTable: [{ kind: 'senderHosted', id }],
          },
        },
      }),
    );
  };

  /**
   * The recipient (A) has bounced a Disembargo{accept} back at us. We are
   * acting as B (introducer) and must forward Disembargo{provide=Q} to the
   * host (C), where Q is the Provide question id we previously used to
   * introduce this target. The peer (C) then drains its in-flight queue and
   * unblocks A's Accept.
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

  const handleDisembargoProvide = _provideQid => {
    // We are C: drain queued pipelined calls then send back accept. In our
    // implementation queued calls are flushed via microtask discipline, so
    // we can ack immediately.
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
      acceptQuestions: acceptQuestions.size,
    }),
  };
};
