// @ts-check
import {
  FinalizationRegistry,
  Map,
  mapGet,
  mapDelete,
  WeakMap,
  mapSet,
  finalizationRegistryRegister,
  weakmapSet,
  weakmapGet,
  mapEntries,
  mapHas,
} from '../commons.js';

/**
 * Create rejection-tracking machinery compatible with Node.js and browsers.
 *
 * Note that modern browsers *prevent* access to the 'unhandledrejection' and
 * 'rejectionhandled' events needed:
 * - in cross-origin mode, like when served from file://
 * - in the browser console (interactively typed-in code)
 * - in the debugger
 *
 * Then, they just look like: `Uncaught (in promise) Error: ...` and don't
 * implement the machinery.
 *
 * The solution is to serve your web page from an http:// or https:// web server
 * and execute actual code.
 *
 * @param {(reason: unknown) => void} reportReason report the reason for an
 * unhandled rejection.
 */
export const makeRejectionHandlers = reportReason => {
  if (FinalizationRegistry === undefined) {
    return undefined;
  }

  /** @typedef {number} ReasonId */
  let lastReasonId = 0;

  /** @type {Map<ReasonId, unknown>} */
  const idToReason = new Map();

  /** @type {(() => void) | undefined} */
  let cancelChecking;

  const removeReasonId = reasonId => {
    mapDelete(idToReason, reasonId);
    if (cancelChecking && idToReason.size === 0) {
      // No more unhandled rejections to check, just cancel the check.
      cancelChecking();
      cancelChecking = undefined;
    }
  };

  /** @type {WeakMap<Promise, ReasonId>} */
  const promiseToReasonId = new WeakMap();

  /**
   * Clean up and report the reason for a GCed unhandled rejection.
   *
   * @param {ReasonId} heldReasonId
   */
  const finalizeDroppedPromise = heldReasonId => {
    if (mapHas(idToReason, heldReasonId)) {
      const reason = mapGet(idToReason, heldReasonId);
      removeReasonId(heldReasonId);
      reportReason(reason);
    }
  };

  /** @type {FinalizationRegistry<ReasonId>} */
  const promiseToReason = new FinalizationRegistry(finalizeDroppedPromise);

  /**
   * Track a rejected promise and its corresponding reason if there is no
   * rejection handler synchronously attached.
   *
   * @param {unknown} reason
   * @param {Promise} pr
   */
  const unhandledRejectionHandler = (reason, pr) => {
    lastReasonId += 1;
    const reasonId = lastReasonId;

    // Update bookkeeping.
    mapSet(idToReason, reasonId, reason);
    weakmapSet(promiseToReasonId, pr, reasonId);
    finalizationRegistryRegister(promiseToReason, pr, reasonId, pr);
  };

  /**
   * Deal with the addition of a handler to a previously rejected promise.
   *
   * Just remove it from our list.  Let the FinalizationRegistry or
   * processTermination report any GCed unhandled rejected promises.
   *
   * @param {Promise} pr
   */
  const rejectionHandledHandler = pr => {
    const reasonId = weakmapGet(promiseToReasonId, pr);
    removeReasonId(reasonId);
  };

  /**
   * Report all the unhandled rejections, now that we are abruptly terminating
   * the agent cluster.
   */
  const processTerminationHandler = () => {
    for (const [reasonId, reason] of mapEntries(idToReason)) {
      removeReasonId(reasonId);
      reportReason(reason);
    }
  };

  return {
    rejectionHandledHandler,
    unhandledRejectionHandler,
    processTerminationHandler,
  };
};
