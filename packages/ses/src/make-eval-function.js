import { printHermes } from './commons.js';

/**
 * makeEvalFunction()
 * A safe version of the native eval function which relies on
 * the safety of safeEvaluate for confinement.
 *
 * @param {Function} safeEvaluate
 */
export const makeEvalFunction = safeEvaluate => {
  // We use the concise method syntax to create an eval without a
  // [[Construct]] behavior (such that the invocation "new eval()" throws
  // TypeError: eval is not a constructor"), but which still accepts a
  // 'this' binding.
  const newEval = {
    eval(source) {
      printHermes('source', typeof source, source);
      if (typeof source !== 'string') {
        // As per the runtime semantic of PerformEval [ECMAScript 18.2.1.1]:
        // If Type(source) is not String, return source.
        // TODO Recent proposals from Mike Samuel may change this non-string
        // rule. Track.
        return source;
      }
      // safeEvaluate breaks on strings e.g. eval('1+1') on Hermes, due to unsupported 'with'.
      // TODO (hermes): (legacyHermesTaming === 'unsafe') throw Error:
      // 'SES does not support strings on legacy Hermes unsupported eval(), see: https://github.com/facebook/hermes/issues/1056'
      // Disabling safeEvaluate is not enough, since returning the source string is not evaluating it.
      return safeEvaluate(source);
    },
  }.eval;

  return newEval;
};
