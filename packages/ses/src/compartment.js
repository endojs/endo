// @ts-check
/* eslint-disable no-underscore-dangle */
/// <reference types="ses">

import {
  Map,
  TypeError,
  WeakMap,
  assign,
  defineProperties,
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
import { assert, assertEqual } from './error/assert.js';
import { sharedGlobalPropertyNames } from './permits.js';
import { load, loadNow } from './module-load.js';
import { link } from './module-link.js';
import { getDeferredExports } from './module-proxy.js';
import { compartmentEvaluate } from './compartment-evaluate.js';
import { makeSafeEvaluator } from './make-safe-evaluator.js';

/** @import {CompartmentOptions} from '../types.js' */
/** @import {ModuleDescriptor} from '../types.js' */

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
    const { noNamespaceBox } = weakmapGet(privateFields, this);

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
        if (noNamespaceBox) {
          return namespace;
        }
        // Legacy behavior: box the namespace object so that thenable modules
        // do not get coerced into a promise accidentally.
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
 * @param {object} [options]
 * @param {Compartment} [options.parentCompartment]
 * @param {boolean} [options.enforceNew]
 * @returns {Compartment['constructor']}
 */

// In order to facilitate migration from the deprecated signature
// of the compartment constructor,
//   new Compartent(globals?, modules?, options?)
// to the new signature:
//   new Compartment(options?)
// where globals and modules are expressed in the options bag instead of
// positional arguments, this function detects the temporary sigil __options__
// on the first argument and coerces compartments arguments into a single
// compartments object.
export const compartmentOptions = (...args) => {
  if (args.length === 0) {
    return {};
  }
  if (
    args.length === 1 &&
    Object(args[0]) === args[0] &&
    '__options__' in args[0]
  ) {
    const { __options__, ...options } = args[0];
    assert(
      __options__ === true,
      `Compartment constructor only supports true __options__ sigil, got ${__options__}`,
    );
    return options;
  } else {
    const [globals, modules, options = {}] = args;
    if (args.length >= 1 && Object(globals) !== globals) {
      throw new TypeError(
        'Compartment must receive an object for options or globals',
      );
    }
    if (args.length >= 2 && Object(modules) !== modules) {
      throw new TypeError('Compartment must receive an object for modules');
    }
    assertEqual(
      options.modules,
      undefined,
      `Compartment constructor must receive either a module map argument or modules option, not both`,
      TypeError,
    );
    assertEqual(
      options.globals,
      undefined,
      `Compartment constructor must receive either globals argument or option, not both`,
      TypeError,
    );
    return {
      ...options,
      globals: globals || {},
      modules: modules || {},
    };
  }
};

/**
 * @callback LegacyCompartmentOptionsFn
 * @param {Record<string, any>} globals
 * @param {Record<string, ModuleDescriptor>} modules
 * @param {CompartmentOptions} options
 * @returns {CompartmentOptions}
 */

/**
 * @callback FutureCompartmentOptionsFn
 * @param {CompartmentOptions & {[Symbol.for('future')]: true}} options
 * @param {never} noSecondArgument
 * @param {never} noThirdArgument
 * @returns {CompartmentOptions}
 */

/** @type {MakeCompartmentConstructor} */
export const makeCompartmentConstructor = (
  targetMakeCompartmentConstructor,
  intrinsics,
  markVirtualizedNativeFunction,
  { parentCompartment = undefined, enforceNew = false } = {},
) => {
  function Compartment(...args) {
    if (enforceNew && new.target === undefined) {
      throw TypeError(
        "Class constructor Compartment cannot be invoked without 'new'",
      );
    }

    // Extract options, and shallow-clone transforms.
    const options = compartmentOptions(...args);

    if ('globals' in options && Object(options.globals) !== options.globals) {
      throw new TypeError('Compartment globals must be an object if specified');
    }
    if ('modules' in options && Object(options.modules) !== options.modules) {
      throw new TypeError('Compartment modules must be an object if specified');
    }
    if ('resolveHook' in options && typeof options.resolveHook !== 'function') {
      throw new TypeError(
        'Compartment resolveHook must be a function if specified',
      );
    }
    if ('importHook' in options && typeof options.importHook !== 'function') {
      throw new TypeError(
        'Compartment importHook must be a function if specified',
      );
    }
    if (
      'importNowHook' in options &&
      typeof options.importNowHook !== 'function'
    ) {
      throw new TypeError(
        'Compartment importNowHook must be a function if specified',
      );
    }
    if ('loadHook' in options && typeof options.loadHook !== 'function') {
      throw new TypeError(
        'Compartment loadHook must be a function if specified',
      );
    }
    if ('loadNowHook' in options && typeof options.loadNowHook !== 'function') {
      throw new TypeError(
        'Compartment loadNowHook must be a function if specified',
      );
    }
    if (
      'moduleMapHook' in options &&
      typeof options.moduleMapHook !== 'function'
    ) {
      throw new TypeError(
        'Compartment moduleMapHook must be a function if specified',
      );
    }

    const {
      name = '<unknown>',
      transforms = [],
      __shimTransforms__ = [],
      globals: endowmentsOption,
      modules: moduleMapOption,
      resolveHook,
      loadHook,
      loadNowHook,
      importHook = loadHook,
      importNowHook = loadNowHook,
      moduleMapHook,
      importMetaHook,
      __noNamespaceBox__: noNamespaceBox = false,
    } = options;

    const globalTransforms = [...transforms, ...__shimTransforms__];
    const endowments = { __proto__: null, ...endowmentsOption };
    const moduleMap = { __proto__: null, ...moduleMapOption };

    // Map<FullSpecifier, ModuleCompartmentRecord>
    const moduleRecords = new Map();
    // Map<FullSpecifier, ModuleInstance>
    const instances = new Map();
    // Map<FullSpecifier, {ExportsProxy, ProxiedExports, activate()}>
    const deferredExports = new Map();

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
      parentCompartment: this,
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
      parentCompartment,
      noNamespaceBox,
    });
  }

  Compartment.prototype = CompartmentPrototype;

  return Compartment;
};
