// Portions adapted from V8 - Copyright 2016 the V8 project authors.
// https://github.com/v8/v8/blob/master/src/builtins/builtins-function.cc

import {
  WeakSet,
  apply,
  immutableObject,
  proxyRevocable,
  weaksetAdd,
} from './commons.js';
import { getScopeConstants } from './scope-constants.js';
import { createScopeHandler } from './scope-handler.js';
import { applyTransforms, mandatoryTransforms } from './transforms.js';
import { makeEvaluateFactory } from './make-evaluate-factory.js';
import { assert } from './error/assert.js';

const { details: d } = assert;

/**
 * makeSafeEvaluator()
 * Build the low-level operation used by all evaluators:
 * eval(), Function(), Compartment.prototype.evaluate().
 *
 * @param {Object} options
 * @param {Object} options.globalObject
 * @param {Object} [options.globalLexicals]
 * @param {Array<Transform>} [options.globalTransforms]
 * @param {bool} [options.sloppyGlobalsMode]
 * @param {WeakSet} [options.knownScopeProxies]
 */
export const makeSafeEvaluator = ({
  globalObject,
  globalLexicals = {},
  globalTransforms = [],
  sloppyGlobalsMode = false,
  knownScopeProxies = new WeakSet(),
} = {}) => {
  const { scopeHandler, scopeController } = createScopeHandler(
    globalObject,
    globalLexicals,
    {
      sloppyGlobalsMode,
    },
  );
  const { proxy: scopeProxy, revoke: revokeScopeProxy } = proxyRevocable(
    immutableObject,
    scopeHandler,
  );
  weaksetAdd(knownScopeProxies, scopeProxy);

  // Defer creating the actual evaluator to first use.
  // Creating a compartment should be possible in no-eval environments
  // It also allows more global constants to be captured by the optimizer
  let evaluate;
  const makeEvaluate = () => {
    if (!evaluate) {
      const constants = getScopeConstants(globalObject, globalLexicals);
      const evaluateFactory = makeEvaluateFactory(constants);
      evaluate = apply(evaluateFactory, scopeProxy, []);
    }
  };

  /**
   * @param {string} source
   * @param {Object} [options]
   * @param {Array<Transform>} [options.localTransforms]
   */
  const safeEvaluate = (source, { localTransforms = [] } = {}) => {
    makeEvaluate();

    // Execute the mandatory transforms last to ensure that any rewritten code
    // meets those mandatory requirements.
    source = applyTransforms(source, [
      ...localTransforms,
      ...globalTransforms,
      mandatoryTransforms,
    ]);

    scopeController.allowNextEvalToBeUnsafe = true;
    let err;
    try {
      // Ensure that "this" resolves to the safe global.
      return apply(evaluate, globalObject, [source]);
    } catch (e) {
      // stash the child-code error in hopes of debugging the internal failure
      err = e;
      throw e;
    } finally {
      const unsafeEvalWasStillExposed = scopeController.allowNextEvalToBeUnsafe;
      scopeController.allowNextEvalToBeUnsafe = false;
      if (unsafeEvalWasStillExposed) {
        // Barring a defect in the SES shim, the scope proxy should allow the
        // powerful, unsafe  `eval` to be used by `evaluate` exactly once, as the
        // very first name that it attempts to access from the lexical scope.
        // A defect in the SES shim could throw an exception after we set
        // `scopeController.allowNextEvalToBeUnsafe` and before `evaluate`
        // calls `eval` internally.
        // If we get here, SES is very broken.
        // This condition is one where this vat is now hopelessly confused, and
        // the vat as a whole should be aborted.
        // No further code should run.
        // All immediately reachable state should be abandoned.
        // However, that is not yet possible, so we at least prevent further
        // variable resolution via the scopeHandler, and throw an error with
        // diagnostic info including the thrown error if any from evaluating the
        // source code.
        revokeScopeProxy();
        // TODO A GOOD PLACE TO PANIC(), i.e., kill the vat incarnation.
        // See https://github.com/Agoric/SES-shim/issues/490
        // eslint-disable-next-line @endo/no-polymorphic-call
        assert.fail(d`handler did not reset allowNextEvalToBeUnsafe ${err}`);
      }
    }
  };

  return { safeEvaluate };
};
