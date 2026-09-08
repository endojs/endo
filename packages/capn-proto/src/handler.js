// @ts-check
/**
 * HandledPromise handler factory for remote targets.
 *
 * The handler intercepts E(presence).method(args) and produces an outgoing
 * Cap'n Proto Call message. The handler signature follows the eventual-send
 * convention: methods receive a final `returnedP` argument. We use it to
 * register the returned promise in our QuestionTable so that further calls
 * on it can be pipelined to the question we just sent.
 */

import { HandledPromise } from '@endo/eventual-send';
import { Fail } from '@endo/errors';

/**
 * @typedef {{
 *   kind: 'importedCap', id: number
 * } | {
 *   kind: 'promisedAnswer', questionId: number, transform: Array<{op: string, fieldOrdinal?: number}>
 * }} CallTarget
 */

/**
 * @param {object} api
 * @param {(target: CallTarget, interfaceId: bigint, methodId: number, args: unknown[]) => {
 *   questionId: number,
 *   answerPromise: Promise<unknown>,
 *   pipelineHandler: object,
 * }} api.sendCall
 * @param {(target: CallTarget, interfaceId: bigint, methodId: number, args: unknown[]) => void} api.sendCallOnly
 * @param {(prop: PropertyKey) => { interfaceId: bigint, methodId: number }} api.resolveMethod
 * @param {() => CallTarget} api.target
 * @param {(returnedP: Promise<unknown>, questionId: number) => void} api.registerReturnedPromise
 * @returns {import('@endo/eventual-send').EHandler<{}>}
 */
export const makeRemoteHandler = ({
  sendCall,
  sendCallOnly,
  resolveMethod,
  target,
  registerReturnedPromise,
}) => {
  const applyFunctionRejection = () => {
    try {
      throw Fail`Cap'n Proto has no plain function-call semantics; use E(target).method(args) on a method registered via an InterfaceRegistry`;
    } catch (e) {
      return e;
    }
  };

  return {
    get(_target, prop, _returnedP) {
      // `get` is unusual for Cap'n Proto: methods are addressed by
      // (interfaceId, methodId) ordinals, not name, so we cannot resolve a
      // bare property access. Users should call methods via
      // `E(p).methodName()` against a registered interface.
      const name = String(prop);
      return Promise.reject(
        Error(
          `property access E(p).${name} is unsupported; ` +
            `Cap'n Proto methods are addressed by ordinal — call ${name}() ` +
            `against a method registered in the InterfaceRegistry`,
        ),
      );
    },

    applyMethod(_target, prop, args, returnedP) {
      if (prop === undefined || prop === null) {
        return Promise.reject(
          Error('applyMethod requires a method name; got undefined / null'),
        );
      }
      let resolved;
      try {
        resolved = resolveMethod(prop);
      } catch (e) {
        return Promise.reject(e);
      }
      const t = target();
      const { questionId, answerPromise, pipelineHandler } = sendCall(
        t,
        resolved.interfaceId,
        resolved.methodId,
        args,
      );
      if (returnedP) {
        registerReturnedPromise(returnedP, questionId);
      }
      // Build a HandledPromise carrying our pipeline handler. The framework's
      // `returnedP` is shortened onto whatever we return here, so this
      // becomes the user-visible result and downstream E(p).foo() runs
      // through `pipelineHandler` with the question's transform path as
      // its base. The settler is captured so we can settle it from
      // `answerPromise`'s eventual value or rejection.
      let resolveSettler;
      let rejectSettler;
      const pipelineP = new HandledPromise(
        (resolveExec, rejectExec, _resolveWithPresence) => {
          resolveSettler = resolveExec;
          rejectSettler = rejectExec;
        },
        pipelineHandler,
      );
      // pipelineP itself may end up rejected, but the framework's
      // `returnedP` (which the user awaits) carries the rejection too,
      // so we attach a no-op catch here strictly to silence unhandled-
      // rejection diagnostics on this intermediate promise.
      pipelineP.catch(() => {});
      answerPromise.then(
        value => resolveSettler(value),
        err => rejectSettler(err),
      );
      return pipelineP;
    },

    applyFunction(_target, _args, _returnedP) {
      // Cap'n Proto has no plain "function call" semantics; all calls are on
      // an interface method. Fail loudly so users register an interface.
      return Promise.reject(applyFunctionRejection());
    },

    applyMethodSendOnly(_target, prop, args) {
      if (prop === undefined || prop === null) return;
      // sendOnly has no returned promise to reject through, so a thrown
      // resolveMethod (e.g. unknown method/interface) would otherwise
      // escape as an uncaught exception out of the eventual-send dispatch
      // loop. Catch + log to stay symmetric with applyMethod's
      // promise-rejection path: the call is dropped, the rest of the
      // session keeps running.
      let resolved;
      try {
        resolved = resolveMethod(prop);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          `Cap'n Proto sendOnly: dropping E.sendOnly(p).${String(prop)} — ${
            /** @type {any} */ (e)?.message || e
          }`,
        );
        return;
      }
      const t = target();
      sendCallOnly(t, resolved.interfaceId, resolved.methodId, args);
    },

    applyFunctionSendOnly(_target, _args) {
      // Cap'n Proto has no plain "function call" semantics; intentionally a
      // no-op here. Underscored parameter names mark them unused.
    },
  };
};
