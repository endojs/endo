import { TypeError } from './commons.js';

/**
 * makeEvalFunction()
 * A safe version of the native eval function which relies on
 * the safety of safeEvaluate for confinement, unless noEval
 * is specified (then a TypeError is thrown).
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
      if (legacyHermesTaming === 'unsafe') {
        throw TypeError(
          `Legacy Hermes unsupported eval() with strings arguments cannot be tamed safe under legacyHermesTaming ${legacyHermesTaming}
  See: https://github.com/facebook/hermes/issues/1056
  See: https://github.com/endojs/endo/issues/1561
Did you mean evalTaming: 'unsafeEval'?`,
        );
      }
      // refactoring to try/catch...
      // - error output still 'Uncaught'
      // - SES_NO_EVAL no longer encountered first
      // try {
      //   safeEvaluate(source);
      // } catch (e) {
      //   // throw Error(e); // Uncaught Error: SyntaxError: 2:5:invalid statement encountered.
      //   throw TypeError(
      //     `legacy Hermes unsupported eval() with strings arguments cannot be tamed safe under legacyHermesTaming ${legacyHermesTaming}
      // see: https://github.com/facebook/hermes/issues/1056
      // see: https://github.com/endojs/endo/issues/1561
      // did you mean evalTaming: 'unsafeEval'?`,
      //   );
      // }
      // Disabling safeEvaluate is not enough, since returning the source string is not evaluating it.
      return evaluator(source);
    },
  }.eval;

  return newEval;
};
