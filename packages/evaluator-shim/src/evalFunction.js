import { assert } from './assertions';
import { defineProperties, getConstructorOf } from './commons';
import { performEval } from './evaluate';

/**
 * createEvalFunction()
 * A safe version of the native eval function which relies on
 * the safety of performEvaluate for confinement.
 */
export const createEvalFunction = (realmRec, globalObject, options = {}) => {
  // We use the the concise method syntax to create an eval without a
  // [[Construct]] behavior (such that the invocation "new eval()" throws
  // TypeError: eval is not a constructor"), but which still accepts a
  // 'this' binding.
  const newEval = {
    eval(x) {
      if (typeof x !== 'string') {
        // As per the runtime semantic of PerformEval [ECMAScript 18.2.1.1]:
        // If Type(x) is not String, return x.
        return x;
      }
      return performEval(realmRec, x, globalObject, {}, options);
    },
  }.eval;

  defineProperties(newEval, {
    toString: {
      value: () => `function eval() { [native code] }`,
      writable: false,
      enumerable: false,
      configurable: true,
    },
  });

  assert(
    getConstructorOf(newEval) !== Function,
    'eval constructor is Function',
  );
  assert(
    getConstructorOf(newEval) !== realmRec.intrinsics.Function,
    'eval contructions is %Function%',
  );

  return newEval;
};
