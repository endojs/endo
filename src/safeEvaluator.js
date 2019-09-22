// Portions adapted from V8 - Copyright 2016 the V8 project authors.
// https://github.com/v8/v8/blob/master/src/builtins/builtins-function.cc

import { apply, arrayConcat, proxyRevocable } from './commons';
import { buildOptimizer, getOptimizableGlobals } from './optimizer';
import { createScopeHandler, immutableObject } from './scopeHandler';
import { applyTransforms, mandatoryTransforms } from './transforms';
import { throwTantrum } from './utilities';

function createScopedEvaluatorFactory(unsafeRec, constants) {
  const { unsafeFunction } = unsafeRec;

  const optimizer = buildOptimizer(constants);

  // Create a function in sloppy mode, so that we can use 'with'. It returns
  // a function in strict mode that evaluates the provided code using direct
  // eval, and thus in strict mode in the same scope. We must be very careful
  // to not create new names in this scope

  // 1: we use 'with' (around a Proxy) to catch all free variable names. The
  // first 'arguments[0]' holds the Proxy which safely wraps the safeGlobal
  // 2: 'optimizer' catches common variable names for speed
  // 3: The inner strict function is effectively passed two parameters:
  //    a) its arguments[0] is the source to be directly evaluated.
  //    b) its 'this' is the this binding seen by the code being
  //       directly evaluated.

  // everything in the 'optimizer' string is looked up in the proxy
  // (including an 'arguments[0]', which points at the Proxy). 'function' is
  // a keyword, not a variable, so it is not looked up. then 'eval' is looked
  // up in the proxy, that's the first time it is looked up after
  // useUnsafeEvaluator is turned on, so the proxy returns the real the
  // unsafeEval, which satisfies the IsDirectEvalTrap predicate, so it uses
  // the direct eval and gets the lexical scope. The second 'arguments[0]' is
  // looked up in the context of the inner function. The *contents* of
  // arguments[0], because we're using direct eval, are looked up in the
  // Proxy, by which point the useUnsafeEvaluator switch has been flipped
  // back to 'false', so any instances of 'eval' in that string will get the
  // safe evaluator.

  return unsafeFunction(`
    with (arguments[0]) {
      ${optimizer}
      return function() {
        'use strict';
        return eval(arguments[0]);
      };
    }
  `);
}

export function createSafeEvaluatorFactory(
  unsafeRec,
  safeGlobal,
  options = {}
) {
  const {
    transforms: globalTransforms = [],
    sloppyGlobalsMode = false
  } = options;

  function safeEvaluatorFactory(endowments = {}, options = {}) {
    const { transforms: localTransforms = [] } = options;

    // Execute the mandatory transforms last to ensure the any rewritten code
    // meets those requements.
    const transforms = arrayConcat(
      localTransforms,
      globalTransforms,
      mandatoryTransforms
    );

    function safeEvaluator(src) {
      let rewriterState = { src, endowments };
      rewriterState = applyTransforms(rewriterState, transforms);

      // Combine all optimizable globals.
      const globalConstants = getOptimizableGlobals(
        safeGlobal,
        rewriterState.endowments
      );
      const localConstants = getOptimizableGlobals(rewriterState.endowments);
      const constants = arrayConcat(globalConstants, localConstants);

      const scopedEvaluatorFactory = createScopedEvaluatorFactory(
        unsafeRec,
        constants
      );

      const scopeHandler = createScopeHandler(
        unsafeRec,
        safeGlobal,
        rewriterState.endowments,
        sloppyGlobalsMode
      );
      const scopeProxyRevocable = proxyRevocable(immutableObject, scopeHandler);

      const scopedEvaluator = apply(scopedEvaluatorFactory, safeGlobal, [
        scopeProxyRevocable.proxy
      ]);

      scopeHandler.useUnsafeEvaluator = true;
      let err;
      try {
        // Ensure that "this" resolves to the safe global.
        return apply(scopedEvaluator, safeGlobal, [rewriterState.src]);
      } catch (e) {
        // stash the child-code error in hopes of debugging the internal failure
        err = e;
        throw e;
      } finally {
        if (scopeHandler.useUnsafeEvaluator === true) {
          // the proxy switches this off immediately after
          // the first access, but if that's not the case we abort.
          throwTantrum('handler did not revoke useUnsafeEvaluator', err);
          // If we were not able to abort, at least prevent further
          // variable resolution on the scope.
          // A proxy revocable is a plain object with a revoke property.
          scopeProxyRevocable.revoke();
        }
      }
    }

    return safeEvaluator;
  }

  return safeEvaluatorFactory;
}
