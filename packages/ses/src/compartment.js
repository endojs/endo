// @ts-check
/* eslint-disable no-underscore-dangle */
/// <reference types="ses">

import {
  Map,
  ReferenceError,
  TypeError,
  WeakMap,
  assign,
  defineProperties,
  entries,
  isObject,
  promiseThen,
  toStringTagSymbol,
  weakmapGet,
  weakmapSet,
} from './commons.js';
import {
  setGlobalObjectSymbolUnscopables,
  setGlobalObjectConstantProperties,
  setGlobalObjectMutableProperties,
  setGlobalObjectEvaluators,
} from './global-object.js';
import { sharedGlobalPropertyNames } from './permits.js';
import { load, loadNow } from './module-load.js';
import { link } from './module-link.js';
import { getDeferredExports } from './module-proxy.js';
import { assert } from './error/assert.js';
import { compartmentEvaluate } from './compartment-evaluate.js';
import { makeSafeEvaluator } from './make-safe-evaluator.js';

const { quote: q } = assert;

// moduleAliases associates every public module exports namespace with its
// corresponding compartment and specifier so they can be used to link modules
// across compartments.
// The mechanism to thread an alias is to use the compartment.module function
// to obtain the exports namespace of a foreign module and pass it into another
// compartment's moduleMap constructor option.
const moduleAliases = new WeakMap();

// privateFields captures the private state for each compartment.
const privateFields = new WeakMap();

export const InertCompartment = function Compartment(
  _endowments = {},
  _modules = {},
  _options = {},
) {
  throw TypeError(
    'Compartment.prototype.constructor is not a valid constructor.',
  );
};

/**
 * @param {Compartment} compartment
 * @param {string} specifier
 */
const compartmentImportNow = (compartment, specifier) => {
  const { execute, exportsProxy } = link(
    privateFields,
    moduleAliases,
    compartment,
    specifier,
  );
  execute();
  return exportsProxy;
};

export const CompartmentPrototype = {
  constructor: InertCompartment,

  get globalThis() {
    return weakmapGet(privateFields, this).globalObject;
  },

  get name() {
    return weakmapGet(privateFields, this).name;
  },

  /**
   * @param {string} source is a JavaScript program grammar construction.
   * @param {object} [options]
   * @param {Array<import('./lockdown-shim').Transform>} [options.transforms]
   * @param {boolean} [options.sloppyGlobalsMode]
   * @param {object} [options.__moduleShimLexicals__]
   * @param {boolean} [options.__evadeHtmlCommentTest__]
   * @param {boolean} [options.__evadeImportExpressionTest__]
   * @param {boolean} [options.__rejectSomeDirectEvalExpressions__]
   */
  evaluate(source, options = {}) {
    const compartmentFields = weakmapGet(privateFields, this);
    return compartmentEvaluate(compartmentFields, source, options);
  },

  module(specifier) {
    if (typeof specifier !== 'string') {
      throw TypeError('first argument of module() must be a string');
    }

    const { exportsProxy } = getDeferredExports(
      this,
      weakmapGet(privateFields, this),
      moduleAliases,
      specifier,
    );

    return exportsProxy;
  },

  async import(specifier) {
    if (typeof specifier !== 'string') {
      throw TypeError('first argument of import() must be a string');
    }

    return promiseThen(
      load(privateFields, moduleAliases, this, specifier),
      () => {
        // The namespace box is a contentious design and likely to be a breaking
        // change in an appropriately numbered future version.
        const namespace = compartmentImportNow(
          /** @type {Compartment} */ (this),
          specifier,
        );
        return { namespace };
      },
    );
  },

  async load(specifier) {
    if (typeof specifier !== 'string') {
      throw TypeError('first argument of load() must be a string');
    }

    return load(privateFields, moduleAliases, this, specifier);
  },

  importNow(specifier) {
    if (typeof specifier !== 'string') {
      throw TypeError('first argument of importNow() must be a string');
    }

    loadNow(privateFields, moduleAliases, this, specifier);
    return compartmentImportNow(/** @type {Compartment} */ (this), specifier);
  },
};

// This causes `String(new Compartment())` to evaluate to `[object Compartment]`.
// The descriptor follows the conventions of other globals with @@toStringTag
// properties, e.g. Math.
defineProperties(CompartmentPrototype, {
  [toStringTagSymbol]: {
    value: 'Compartment',
    writable: false,
    enumerable: false,
    configurable: true,
  },
});

defineProperties(InertCompartment, {
  prototype: { value: CompartmentPrototype },
});

/**
 * @callback MakeCompartmentConstructor
 * @param {MakeCompartmentConstructor} targetMakeCompartmentConstructor
 * @param {Record<string, any>} intrinsics
 * @param {(object: object) => void} markVirtualizedNativeFunction
 * @returns {Compartment['constructor']}
 */

/** @type {MakeCompartmentConstructor} */
export const makeCompartmentConstructor = (
  targetMakeCompartmentConstructor,
  intrinsics,
  markVirtualizedNativeFunction,
) => {
  function Compartment(endowments = {}, moduleMap = {}, options = {}) {
    if (new.target === undefined) {
      throw TypeError(
        "Class constructor Compartment cannot be invoked without 'new'",
      );
    }

    // Extract options, and shallow-clone transforms.
    const {
      name = '<unknown>',
      transforms = [],
      __shimTransforms__ = [],
      resolveHook,
      importHook,
      importNowHook,
      moduleMapHook,
      importMetaHook,
    } = options;
    const globalTransforms = [...transforms, ...__shimTransforms__];

    // Map<FullSpecifier, ModuleCompartmentRecord>
    const moduleRecords = new Map();
    // Map<FullSpecifier, ModuleInstance>
    const instances = new Map();
    // Map<FullSpecifier, {ExportsProxy, ProxiedExports, activate()}>
    const deferredExports = new Map();

    // Validate given moduleMap.
    // The module map gets translated on-demand in module-load.js and the
    // moduleMap can be invalid in ways that cannot be detected in the
    // constructor, but these checks allow us to throw early for a better
    // developer experience.
    for (const [specifier, moduleDescriptor] of entries(moduleMap || {})) {
      if (typeof moduleDescriptor === 'string') {
        // TODO implement parent module record retrieval.
        throw TypeError(
          `Cannot map module ${q(specifier)} to ${q(
            moduleDescriptor,
          )} in parent compartment`,
        );
      } else if (isObject(moduleDescriptor)) {
        if (weakmapGet(moduleAliases, moduleDescriptor) !== undefined) {
          // No further validation for module namespace objects.
          // They do bear inspection before evaluation gracefully.
        } else if (moduleDescriptor.specifier !== undefined) {
          // TODO validate specifier module descriptors
        } else if (moduleDescriptor.record !== undefined) {
          // TODO validate record module descriptors
        } else if (moduleDescriptor.__syncModuleProgram__ !== undefined) {
          // TODO validate virtual module source descriptors
        } else if (moduleDescriptor.execute !== undefined) {
          // TODO validate module source descriptors
        } else if (weakmapGet(moduleAliases, moduleDescriptor) === undefined) {
          throw ReferenceError(
            `Cannot map module ${q(
              specifier,
            )} because it has no known compartment in this realm`,
          );
        }
      } else {
        throw TypeError(
          `Value for key ${q(specifier)} in module map must be a string, module descriptor object, module source object, or virtual module namespace`,
        );
      }
    }

    const globalObject = {};

    setGlobalObjectSymbolUnscopables(globalObject);

    // We must initialize all constant properties first because
    // `makeSafeEvaluator` may use them to create optimized bindings
    // in the evaluator.
    // TODO: consider merging into a single initialization if internal
    // evaluator is no longer eagerly created
    setGlobalObjectConstantProperties(globalObject);

    const { safeEvaluate } = makeSafeEvaluator({
      globalObject,
      globalTransforms,
      sloppyGlobalsMode: false,
    });

    setGlobalObjectMutableProperties(globalObject, {
      intrinsics,
      newGlobalPropertyNames: sharedGlobalPropertyNames,
      makeCompartmentConstructor: targetMakeCompartmentConstructor,
      markVirtualizedNativeFunction,
    });

    // TODO: maybe add evalTaming to the Compartment constructor 3rd options?
    setGlobalObjectEvaluators(
      globalObject,
      safeEvaluate,
      markVirtualizedNativeFunction,
    );

    assign(globalObject, endowments);

    weakmapSet(privateFields, this, {
      name: `${name}`,
      globalTransforms,
      globalObject,
      safeEvaluate,
      resolveHook,
      importHook,
      importNowHook,
      moduleMap,
      moduleMapHook,
      importMetaHook,
      moduleRecords,
      __shimTransforms__,
      deferredExports,
      instances,
    });
  }

  Compartment.prototype = CompartmentPrototype;

  return Compartment;
};
