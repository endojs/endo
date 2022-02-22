import { defineProperty, objectHasOwnProperty, entries } from './commons.js';
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
 * @param {Object} param1.newGlobalPropertyNames
 * @param {Function} param1.makeCompartmentConstructor
 * @param {(Object) => void} param1.markVirtualizedNativeFunction
 */
export const setGlobalObjectMutableProperties = (
  globalObject,
  {
    intrinsics,
    newGlobalPropertyNames,
    makeCompartmentConstructor,
    markVirtualizedNativeFunction,
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

/**
 * setGlobalObjectEvaluators()
 * Set the eval and the Function evaluator on the global object with given evalTaming policy.
 *
 * @param {Object} globalObject
 * @param {Function} evaluator
 * @param {(Object) => void} markVirtualizedNativeFunction
 */
export const setGlobalObjectEvaluators = (
  globalObject,
  evaluator,
  markVirtualizedNativeFunction,
) => {
  {
    const f = makeEvalFunction(evaluator);
    markVirtualizedNativeFunction(f);
    defineProperty(globalObject, 'eval', {
      value: f,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
  {
    const f = makeFunctionConstructor(evaluator);
    markVirtualizedNativeFunction(f);
    defineProperty(globalObject, 'Function', {
      value: f,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
};
