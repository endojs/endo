import { create, defineProperties, freeze, objectPrototype } from './commons';
import { createSafeEval } from './safeEval';
import { createSafeEvaluatorFactory } from './safeEvaluator';
import { createSafeFunction } from './safeFunction';

/**
 * createRealmRec()
 * The realmRec is the shim implementation of the realm record
 * (ECMAScript 8.2.1) which holds the intrinsics, the global object,
 * the global environment, etc.
 */
export function createRealmRec(unsafeRec, extraDescriptors = {}, options = {}) {
  const { sharedGlobalDescs } = unsafeRec;

  const safeGlobal = create(objectPrototype, sharedGlobalDescs);
  const safeEvaluatorFactory = createSafeEvaluatorFactory(
    unsafeRec,
    safeGlobal,
    options
  );

  // Create the safe evaluator for eval and function, which does not
  // take endowments or options (at the moment).
  // todo: support additional endowments at the realm level.
  const safeEvaluator = safeEvaluatorFactory();
  const safeEval = createSafeEval(unsafeRec, safeEvaluator);
  const safeFunction = createSafeFunction(unsafeRec, safeEvaluator);

  defineProperties(safeGlobal, {
    eval: {
      value: safeEval,
      writable: true,
      configurable: true
    },
    Function: {
      value: safeFunction,
      writable: true,
      configurable: true
    }
  });

  defineProperties(safeGlobal, extraDescriptors);

  return freeze({
    safeGlobal,
    safeEval,
    safeFunction,
    safeEvaluatorFactory,
    options
  });
}
