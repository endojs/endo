import { defineProperties, getConstructorOf } from './commons';
import { assert } from './utilities';

export function createSafeEval(unsafeRec, safeEvaluator) {
  const { unsafeFunction } = unsafeRec;

  // We use the the concise method syntax to create an eval without a
  // [[Construct]] behavior (such that the invocation "new eval()" throws
  // TypeError: eval is not a constructor"), but which still accepts a
  // 'this' binding.
  const safeEval = {
    eval(x) {
      if (typeof x !== 'string') {
        // As per the runtime semantic of PerformEval [ECMAScript 18.2.1.1]:
        // If Type(x) is not String, return x.
        return x;
      }
      return safeEvaluator(x);
    }
  }.eval;

  defineProperties(safeEval, {
    toString: {
      // We break up the following literal string so that an
      // apparent direct eval syntax does not appear in this
      // file. Thus, we avoid rejection by the overly eager
      // rejectDangerousSources.
      value: () => `function ${'eval'}() { [shim code] }`,
      writable: false,
      enumerable: false,
      configurable: true
    }
  });

  assert(getConstructorOf(safeEval) !== Function, 'hide Function');
  assert(getConstructorOf(safeEval) !== unsafeFunction, 'hide unsafeFunction');

  return safeEval;
}
