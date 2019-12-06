// Portions adapted from V8 - Copyright 2016 the V8 project authors.
// https://github.com/v8/v8/blob/master/src/builtins/builtins-function.cc

import { throwTantrum } from './assertions';
import { apply, immutableObject, proxyRevocable } from './commons';
import { getScopeConstants } from './scopeConstants';
import { createScopeHandler } from './scopeHandler';
import { applyTransforms, mandatoryTransforms } from './transforms';
import { createEvaluateFactory } from './evaluateFactory';

/**
 * createEvalFunction()
 * The low-level operation used by all evaluators:
 * eval(), Function(), Evalutator.prototype.evaluate().
 */
export function performEval(
  realmRec,
  src,
  globalObject,
  endowments = {},
  {
    localTransforms = [],
    globalTransforms = [],
    sloppyGlobalsMode = false,
  } = {},
) {
  // Execute the mandatory transforms last to ensure that any rewritten code
  // meets those mandatory requirements.
  let rewriterState = { src, endowments };
  rewriterState = applyTransforms(rewriterState, [
    ...localTransforms,
    ...globalTransforms,
    mandatoryTransforms,
  ]);

  const scopeHandler = createScopeHandler(
    realmRec,
    globalObject,
    rewriterState.endowments,
    { sloppyGlobalsMode },
  );
  const scopeProxyRevocable = proxyRevocable(immutableObject, scopeHandler);
  // Ensure that "this" resolves to the scope proxy.

  const constants = getScopeConstants(globalObject, rewriterState.endowments);
  const evaluateFactory = createEvaluateFactory(realmRec, constants);
  const evaluate = apply(evaluateFactory, scopeProxyRevocable.proxy, []);

  scopeHandler.useUnsafeEvaluator = true;
  let err;
  try {
    // Ensure that "this" resolves to the safe global.
    return apply(evaluate, globalObject, [rewriterState.src]);
  } catch (e) {
    // stash the child-code error in hopes of debugging the internal failure
    err = e;
    throw e;
  } finally {
    if (scopeHandler.useUnsafeEvaluator === true) {
      // The proxy switches off useUnsafeEvaluator immediately after
      // the first access, but if that's not the case we abort.
      throwTantrum('handler did not revoke useUnsafeEvaluator', err);
      // If we were not able to abort, at least prevent further
      // variable resolution via the scopeHandler.
      scopeProxyRevocable.revoke();
    }
  }
}
