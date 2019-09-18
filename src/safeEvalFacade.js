import { cleanupSource } from './utilities';

function buildSafeEval(unsafeRec, safeEvalOperation) {
  const { callAndWrapError } = unsafeRec;

  // todo use captured.
  const { defineProperties } = Object;

  // We use the the concise method syntax to create an eval without a
  // [[Construct]] behavior (such that the invocation "new eval()" throws
  // TypeError: eval is not a constructor"), but which still accepts a
  // 'this' binding.
  const safeEval = {
    eval(src) {
      return callAndWrapError(safeEvalOperation, src);
    }
  }.eval;

  // safeEval's prototype RootRealm's value and instanceof Function
  // is true inside the realm. It doesn'y point at the primal realm
  // value, and there is no defend against leaking primal realm
  // intrinsics.

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

  return safeEval;
}
const buildSafeEvalString = cleanupSource(`'use strict'; (${buildSafeEval})`);
export function createSafeEval(unsafeRec, safeEvalOperation) {
  const { unsafeEval } = unsafeRec;
  return unsafeEval(buildSafeEvalString)(unsafeRec, safeEvalOperation);
}
