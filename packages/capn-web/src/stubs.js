// Cap'n Web stubs.
//
// A stub is a presence (or an unresolved promise) that represents a value
// living on the peer.  Operations performed via E() are intercepted by a
// HandledPromise handler, transformed into ["push", ...] messages, and a
// fresh stub is returned synchronously for the answer.
//
// We expose two factories:
//
//   makePresenceStub(id)
//     Creates a Presence (a non-promise object) whose handler turns
//     E(presence)..., E.get(presence)..., etc. into pushes.  The presence
//     object itself supports identity checks (===).
//
//   makePromiseStub(id)
//     Creates an unresolved HandledPromise whose handler does the same.  When
//     the underlying answer arrives, the promise resolves (or rejects) to the
//     real value, and the handler is no longer consulted.

import harden from '@endo/harden';
import { HandledPromise } from '@endo/eventual-send';
import { Remotable } from '@endo/pass-style';

/**
 * The handler functions receive `returnedP` as their last argument: this is
 * the promise that E() will return to the user.  We register that promise
 * in our imports table at the answer's id so devaluator can recognise it
 * for round-trip identity (a user-held `await E(remote).foo()` promise that
 * is later passed back as an argument to another remote call must encode
 * as `["pipeline", id]`, not as a brand-new export).
 *
 * @typedef {object} StubMachinery
 * @property {(rootId: number, path: PropertyKey[], args: unknown[] | undefined, returnedP: Promise<unknown>) => Promise<unknown>} sendPipelinedPush
 * @property {(rootId: number, path: PropertyKey[], args: unknown[] | undefined) => void} sendPipelinedPushSendOnly
 */

const FUNCTION_CALL_PROP = undefined;

/**
 * Create the handler used for both presence and promise stubs.
 * @param {number} rootId
 * @param {StubMachinery} m
 */
const makeHandler = (rootId, m) =>
  harden({
    get(_p, prop, returnedP) {
      return m.sendPipelinedPush(rootId, [prop], undefined, returnedP);
    },
    getSendOnly(_p, prop) {
      m.sendPipelinedPushSendOnly(rootId, [prop], undefined);
    },
    applyMethod(_p, prop, args, returnedP) {
      const path = prop === FUNCTION_CALL_PROP ? [] : [prop];
      return m.sendPipelinedPush(rootId, path, args, returnedP);
    },
    applyMethodSendOnly(_p, prop, args) {
      const path = prop === FUNCTION_CALL_PROP ? [] : [prop];
      m.sendPipelinedPushSendOnly(rootId, path, args);
    },
    applyFunction(_p, args, returnedP) {
      return m.sendPipelinedPush(rootId, [], args, returnedP);
    },
    applyFunctionSendOnly(_p, args) {
      m.sendPipelinedPushSendOnly(rootId, [], args);
    },
  });

/**
 * @param {number} id
 * @param {StubMachinery} m
 * @returns {object} a Presence
 */
export const makePresenceStub = (id, m) => {
  const handler = makeHandler(id, m);
  let presence;
  // eslint-disable-next-line no-new
  new HandledPromise((_resolve, _reject, resolveWithPresence) => {
    presence = resolveWithPresence(handler);
  }, handler);
  // Mark the presence as a passable remotable so `passStyleOf` recognises
  // it as 'remotable' downstream.  This is what makes three-party
  // capability passing (and in general, any cross-session round-trip)
  // work automatically: a stub from session A passed to session B has
  // `passStyleOf === 'remotable'`, so session B's devaluator accepts it
  // and re-exports it; calls then forward through session B's executor
  // back to A's stub.
  return Remotable(`Alleged: capn-web stub`, undefined, presence);
};

/**
 * @param {number} id
 * @param {StubMachinery} m
 * @returns {{ promise: Promise<unknown>, resolve: (v: unknown) => void, reject: (e: unknown) => void }}
 */
export const makePromiseStub = (id, m) => {
  const handler = makeHandler(id, m);
  let resolveFn;
  let rejectFn;
  const promise = new HandledPromise((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  }, handler);
  return harden({
    promise,
    resolve: /** @type {(v: unknown) => void} */ (
      /** @type {unknown} */ (resolveFn)
    ),
    reject: /** @type {(e: unknown) => void} */ (
      /** @type {unknown} */ (rejectFn)
    ),
  });
};
