import {
  defineProperty,
  objectHasOwnProperty,
  entries,
  noEvalEvaluate,
  TypeError,
} from './commons.js';
import { makeEvalFunction } from './make-eval-function.js';
import { makeFunctionConstructor } from './make-function-constructor.js';
import { constantProperties, universalPropertyNames } from './whitelist.js';

/**
 * setGlobalObjectConstantProperties()
 * Initializes a new global object using a process similar to ECMA specifications
 * (SetDefaultGlobalBindings). This process is split between this function and
 * `setGlobalObjectMutableProperties`.
 *
 * @param {Object} globalObject
 */
export const setGlobalObjectConstantProperties = globalObject => {
  for (const [name, constant] of entries(constantProperties)) {
    defineProperty(globalObject, name, {
      value: constant,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }
};

/**
 * setGlobalObjectMutableProperties()
 * Create new global object using a process similar to ECMA specifications
 * (portions of SetRealmGlobalObject and SetDefaultGlobalBindings).
 * `newGlobalPropertyNames` should be either `initialGlobalPropertyNames` or
 * `sharedGlobalPropertyNames`.
 *
 * @param {Object} globalObject
 * @param {Object} param1
 * @param {Object} param1.intrinsics
 * @param {'safeEval' | 'noEval' | 'unsafeEval'} param1.evalTaming
 * @param {Object} param1.newGlobalPropertyNames
 * @param {Function} param1.makeCompartmentConstructor
 * @param {(string, Object?) => any} param1.safeEvaluate
 * @param {(Object) => void} param1.markVirtualizedNativeFunction
 */
export const setGlobalObjectMutableProperties = (
  globalObject,
  {
    intrinsics,
    newGlobalPropertyNames,
    makeCompartmentConstructor,
    safeEvaluate,
    markVirtualizedNativeFunction,
    evalTaming,
  },
) => {
  for (const [name, intrinsicName] of entries(universalPropertyNames)) {
    if (objectHasOwnProperty(intrinsics, intrinsicName)) {
      defineProperty(globalObject, name, {
        value: intrinsics[intrinsicName],
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
  }

  for (const [name, intrinsicName] of entries(newGlobalPropertyNames)) {
    if (objectHasOwnProperty(intrinsics, intrinsicName)) {
      defineProperty(globalObject, name, {
        value: intrinsics[intrinsicName],
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
  }

  const perCompartmentGlobals = {
    globalThis: globalObject,
  };

  if (evalTaming === 'unsafeEval') {
    // do nothing
  } else if (evalTaming === 'noEval') {
    perCompartmentGlobals.eval = makeEvalFunction(noEvalEvaluate);
    perCompartmentGlobals.Function = makeFunctionConstructor(noEvalEvaluate);
  } else if (evalTaming === 'safeEval') {
    perCompartmentGlobals.eval = makeEvalFunction(safeEvaluate);
    perCompartmentGlobals.Function = makeFunctionConstructor(safeEvaluate);
  } else {
    assert.fail(`Invalid evalTaming setting ${q(evalTaming)}`)
  }

  perCompartmentGlobals.Compartment = makeCompartmentConstructor(
    makeCompartmentConstructor,
    intrinsics,
    markVirtualizedNativeFunction,
  );

  // TODO These should still be tamed according to the whitelist before
  // being made available.
  for (const [name, value] of entries(perCompartmentGlobals)) {
    defineProperty(globalObject, name, {
      value,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    if (typeof value === 'function') {
      markVirtualizedNativeFunction(value);
    }
  }
};
