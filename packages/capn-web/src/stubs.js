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

/**
 * @typedef {object} StubMachinery
 * @property {(rootId: number, path: PropertyKey[], args: unknown[] | undefined) => Promise<unknown>} sendPipelinedPush
 *   Send `["push", ["pipeline", rootId, path, args?]]` and return a stub
 *   promise for the answer.
 * @property {(rootId: number, path: PropertyKey[], args: unknown[] | undefined) => void} sendPipelinedPushSendOnly
 * @property {(value: object, id: number, isPromise: boolean) => void} registerStub
 *   Record the (value, id) association so devaluator can re-export by id.
 * @property {(value: Promise<unknown>, id: number) => void} [registerPromiseStub]
 */

const FUNCTION_CALL_PROP = undefined;

/**
 * Create the handler used for both presence and promise stubs.
 * @param {number} rootId
 * @param {StubMachinery} m
 */
const makeHandler = (rootId, m) =>
  harden({
    get(_p, prop) {
      return m.sendPipelinedPush(rootId, [prop], undefined);
    },
    getSendOnly(_p, prop) {
      m.sendPipelinedPushSendOnly(rootId, [prop], undefined);
    },
    applyMethod(_p, prop, args) {
      const path = prop === FUNCTION_CALL_PROP ? [] : [prop];
      return m.sendPipelinedPush(rootId, path, args);
    },
    applyMethodSendOnly(_p, prop, args) {
      const path = prop === FUNCTION_CALL_PROP ? [] : [prop];
      m.sendPipelinedPushSendOnly(rootId, path, args);
    },
    applyFunction(_p, args) {
      return m.sendPipelinedPush(rootId, [], args);
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
  m.registerStub(/** @type {object} */ (presence), id, false);
  return /** @type {object} */ (presence);
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
  if (m.registerPromiseStub) {
    m.registerPromiseStub(promise, id);
  }
  m.registerStub(/** @type {object} */ (promise), id, true);
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
