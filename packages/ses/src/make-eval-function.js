import { TypeError } from './commons.js';

/**
 * makeEvalFunction()
 * A safe version of the native eval function which relies on
 * the safety of safeEvaluate for confinement.
 * Throws a TypeError under noEval.
 *
 * @param {Function} evaluator
 * @param legacyHermesTaming
 */
export const makeEvalFunction = (evaluator, legacyHermesTaming) => {
  // We use the concise method syntax to create an eval without a
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
      try {
        evaluator(source);
      } catch (e) {
        if (
          e.name === 'SyntaxError' &&
          e.message.includes('invalid statement encountered')
        ) {
          throw TypeError(
            `Legacy Hermes unsupported eval() with strings arguments cannot be tamed safe under legacyHermesTaming ${legacyHermesTaming}
  See: https://github.com/facebook/hermes/issues/1056
  See: https://github.com/endojs/endo/discussions/1944
Did you mean evalTaming: 'unsafeEval'?`,
          );
        }
      }
      return evaluator(source);
    },
  }.eval;

  return newEval;
};
