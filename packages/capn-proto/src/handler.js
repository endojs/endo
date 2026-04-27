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
import { Fail, q } from '@endo/errors';

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
  const fail = () => {
    throw Fail`cannot resolve method without an interface id; first argument of E(target).method must be a registered interface method`;
  };

  return {
    get(_target, prop, returnedP) {
      // `get` is unusual for Cap'n Proto - we treat it as a zero-arg call to
      // a method whose ordinal is the property's ordinal in some interface.
      // Without an interface context we cannot resolve it; users should use
      // method calls with E(p).foo() instead.
      void _target;
      void returnedP;
      return Promise.reject(
        Error(`E(p).${q(prop)} get is unsupported; use E(p).${q(prop)}() instead`),
      );
    },

    applyMethod(_target, prop, args, returnedP) {
      void _target;
      if (prop === undefined || prop === null) {
        return Promise.reject(Error('applyFunction requires undefined property'));
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
      // Wire returnedP to our pipeline. Folding returnedP into a
      // HandledPromise that uses our pipelineHandler means downstream
      // E(returnedP).foo() will invoke pipelineHandler with the question's
      // transform path as its base.
      if (returnedP) {
        registerReturnedPromise(returnedP, questionId);
        // Make returnedP shorten onto a HandledPromise with our handler.
        const pipelineP = new HandledPromise(
          (_res, _rej, resolveWithPresence) => {
            resolveWithPresence(pipelineHandler);
          },
        );
        // Forward returnedP into pipelineP, then settle pipelineP with the
        // eventual answer. shortening copies the pendingHandler.
        HandledPromise.resolve(returnedP, pipelineP);
        // When the answer arrives, propagate the value to the user via
        // returnedP. answerPromise resolves to the decoded result; the
        // framework's shorten machinery then folds returnedP onto it.
        answerPromise.then(
          v => HandledPromise.resolve(returnedP, v),
          e => {
            // Forward rejection into returnedP via a settled rejected
            // promise. Attach a no-op catch so this auxiliary promise
            // doesn't trigger unhandled-rejection diagnostics; the
            // user-facing rejection still surfaces through returnedP.
            const rej = Promise.reject(e);
            rej.catch(() => {});
            HandledPromise.resolve(returnedP, rej);
          },
        );
      }
      return answerPromise;
    },

    applyFunction(_target, args, returnedP) {
      // Cap'n Proto has no plain "function call" semantics; all calls are on
      // an interface method. Fail loudly so users register an interface.
      void _target;
      void args;
      void returnedP;
      return Promise.reject(fail);
    },

    applyMethodSendOnly(_target, prop, args) {
      void _target;
      if (prop === undefined || prop === null) return;
      const resolved = resolveMethod(prop);
      const t = target();
      sendCallOnly(t, resolved.interfaceId, resolved.methodId, args);
    },

    applyFunctionSendOnly(_target, args) {
      void _target;
      void args;
    },
  };
};
