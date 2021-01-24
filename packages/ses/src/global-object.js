// @ts-check

import { defineProperty, objectHasOwnProperty, entries } from './commons.js';
import { makeEvalFunction } from './make-eval-function.js';
import { makeFunctionConstructor } from './make-function-constructor.js';
import { constantProperties, universalPropertyNames } from './whitelist.js';

/**
 * TODO Why isn't this file getting it from './transforms.js' even if I add
 * an `import './transforms.js';` ?
 *
 * @typedef {(src: string) => string} Transform
 *
 * A source-string to source-string translator
 */

/**
 * initGlobalObject()
 * Create new global object using a process similar to ECMA specifications
 * (portions of SetRealmGlobalObject and SetDefaultGlobalBindings).
 * `newGlobalPropertyNames` should be either `initialGlobalPropertyNames` or
 * `sharedGlobalPropertyNames`.
 *
 * @param {Object} globalObject
 * @param {Object} intrinsics
 * @param {Object} newGlobalPropertyNames
 * @param {Function} makeCompartmentConstructor
 * @param {Object} compartmentPrototype
 * @param {Object} [options]
 * @param {Transform[]} [options.globalTransforms]
 * @param {(Object) => void} [options.nativeBrander]
 */
export function initGlobalObject(
  globalObject,
  intrinsics,
  newGlobalPropertyNames,
  makeCompartmentConstructor,
  compartmentPrototype,
  { globalTransforms, nativeBrander },
) {
  for (const [name, constant] of entries(constantProperties)) {
    defineProperty(globalObject, name, {
      value: constant,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }

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
    eval: makeEvalFunction(globalObject, {
      globalTransforms,
    }),
    Function: makeFunctionConstructor(globalObject, {
      globalTransforms,
    }),
  };

  perCompartmentGlobals.Compartment = makeCompartmentConstructor(
    makeCompartmentConstructor,
    intrinsics,
    nativeBrander,
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
    if (typeof nativeBrander === 'function' && typeof value === 'function') {
      nativeBrander(value);
    }
  }
}
