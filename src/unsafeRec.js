import { freeze } from './commons';
import { getSharedGlobalDescs } from './stdlib';

// note: in a node module, the top-level 'this' is not the global object
// (it's *something* but we aren't sure what), however an indirect eval of
// 'this' will be the correct global object.
const unsafeGlobalEvalSrc = `(0, eval)("'use strict'; this")`;

// Get the unsafeGlobal from the current realm, where the
// Evaluator shim is being parsed and executed.
export function getUnsafeGlobal() {
  return (0, eval)(unsafeGlobalEvalSrc);
}

/**
 * createUnsafeRec()
 * The unsafeRec is the shim implementation of the realm record
 * (ECMAScript 8.2.1) which holds the intrinsics, the global object,
 * the global environment, etc. The unsafeRec we stores the intrinsics
 * as descriptors for performance considerations. We also keep the
 * evaluators separate for easy access.
 */
export function createUnsafeRec() {
  const unsafeGlobal = getUnsafeGlobal();
  const { eval: unsafeEval, Function: unsafeFunction } = unsafeGlobal;
  const sharedGlobalDescs = getSharedGlobalDescs(unsafeGlobal);

  return freeze({
    unsafeGlobal,
    unsafeEval,
    unsafeFunction,
    sharedGlobalDescs
  });
}
