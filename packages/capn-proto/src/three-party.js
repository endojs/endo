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
    encodeAccept,
    encodeDisembargo,
    sendFramed,
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
   * a Resolve or capTable. Returns a Presence that resolves to the cap on C.
   *
   * @param {{ thirdPartyCapId: Uint8Array, vineId: number }} desc
   */
  const acceptThirdParty = desc => {
    const hostConnection = network.connectToThirdParty(desc.thirdPartyCapId);
    const acceptQuestionId = hostConnection.allocQuestion();
    return new Promise((resolve, reject) => {
      const cleanup = () => acceptQuestions.delete(acceptQuestionId);
      acceptQuestions.set(acceptQuestionId, {
        resolve: v => {
          cleanup();
          resolve(v);
        },
        reject: e => {
          cleanup();
          reject(e);
        },
        vineId: desc.vineId,
      });
      hostConnection.sendFramed(
        encodeAccept({
          questionId: acceptQuestionId,
          provision: network.provisionIdForHandoff(desc.thirdPartyCapId),
          embargo: false,
        }),
      );
    });
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
