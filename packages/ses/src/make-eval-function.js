/**
 * makeEvalFunction()
 * A safe version of the native eval function which relies on
 * the safety of safeEvaluate for confinement.
 *
 * @param {Function} safeEvaluate
 */
export const makeEvalFunction = safeEvaluate => {
  // We use the the concise method syntax to create an eval without a
  // [[Construct]] behavior (such that the invocation "new eval()" throws
  // TypeError: eval is not a constructor"), but which still accepts a
  // 'this' binding.
  const newEval = {
    eval(source) {
      if (typeof source !== 'string') {
        // As per the runtime semantic of PerformEval [ECMAScript 18.2.1.1]:
        // If Type(source) is not String, return source.
        // TODO Recent proposals from Mike Samuel may change this non-string
        // rule. Track.
        return source;
      }
      return safeEvaluate(source);
    },
  }.eval;

  return newEval;
};
