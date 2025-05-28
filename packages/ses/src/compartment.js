/**
 * Provides the mechanism to create a Compartment constructor that
 * can provide either shim-specific or native XS features depending on
 * the __native__ constructor option.
 * This is necessary because a native Compartment can handle native ModuleSource
 * but cannot handle shim-specific pre-compiled ModuleSources like the JSON
 * representation of a module that Compartment Mapper can put in bundles.
 * Pre-compiling ModuleSource during bundling helps avoid paying the cost
 * of importing Babel and transforming ESM syntax to a form that can be
 * confined by the shim, which is prohibitively expensive for a web runtime
 * and for XS _without this adapter_.
 *
 * Since any invocation of the Compartment constructor may occur standing
 * on a native-flavor or shim-flavor compartment, we create parallel compartment
 * constructor trees for compartments created with the Compartment constructor
 * of a specific compartment.
 *
 * A compartment's importHook, importNowHook, moduleMapHook, and the modules
 * map itself may provide module descriptors that address another compartment,
 * using a compartment instance as a token indicating the compartment the
 * module should be loaded or initialized in.
 * Consequently, the compartment instance must be a suitable token for the
 * underlying native-flavor or shim-flavor compartment.
 * We are not in a position to fidddle with the native compartments behavior,
 * so adapted compartments use the identity of the native compartment.
 * We replace all of the methods of the native compartment prototype with
 * thunks that choose behavior based on whether the compartment was
 * constructed with the __native__ option.
 * The SES shim associates a compartment with its private fields using a weak
 * map exported by ../src/compartment.js and held closely by ses by the
 * enforcement of explicit exports in package.json, since Node.js 12.11.0.
 *
 * Evaluating ./compartment.js does not have global side-effects.
 * We defer modification of the global environment until the evaluation
 * of ./compartment-shim.js.
 *
 * @module
 */

// @ts-check
/* eslint-disable no-underscore-dangle */

import {
  Map,
  TypeError,
  WeakMap,
  arrayFlatMap,
  assign,
  defineProperties,
  identity,
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
import { assert, assertEqual, q } from './error/assert.js';
import { sharedGlobalPropertyNames } from './permits.js';
import { load, loadNow } from './module-load.js';
import { link } from './module-link.js';
import { getDeferredExports } from './module-proxy.js';
import { compartmentEvaluate } from './compartment-evaluate.js';
import { makeSafeEvaluator } from './make-safe-evaluator.js';

/**
 * @import {ImportHook, ImportMetaHook, ImportNowHook, ModuleDescriptor, ModuleExportsNamespace, ModuleMap, ModuleMapHook, ResolveHook, ModuleSource, CompartmentOptions} from '../types.js'
 * @import {Transform} from './lockdown.js'
 * @import {DeferredExports} from './module-proxy.js'
 */

/**
 * Associates every public module exports namespace with its corresponding
 * compartment and specifier so they can be used to link modules across
 * compartments. The mechanism to thread an alias is to use the
 * {@link Compartment.module} function to obtain the exports namespace of a foreign
 * module and pass it into another compartment's `moduleMap` constructor option
 * @type {WeakMap<ModuleExportsNamespace, Compartment>}
 *
 */
const moduleAliases = new WeakMap();

/**
 * Private fields for `Compartment` instances
 * @typedef {object} CompartmentFields
 * @property {string} name
 * @property {object} globalObject
 * @property {Array<Transform>} globalTransforms
 * @property {(source: string, options?: {localTransforms?: Array<Transform>}) => void} safeEvaluate
 * @property {ResolveHook} resolveHook
 * @property {ImportHook} importHook
 * @property {ImportNowHook} importNowHook
 * @property {ModuleMap} moduleMap
 * @property {ModuleMapHook} moduleMapHook
 * @property {ImportMetaHook} importMetaHook
 * @property {Map<string, ModuleSource>} moduleRecords
 * @property {Array<Transform>} __shimTransforms__
 * @property {DeferredExports} deferredExports
 * @property {Map<string, ModuleDescriptor>} instances
 * @property {Compartment} [parentCompartment]
 * @property {boolean} noNamespaceBox
 * @property {(fullSpecifier: string) => Promise<ModuleExportsNamespace>} compartmentImport
 * @property {boolean} [noAggregateLoadErrors]
 */

/**
 * Captures the private state for each {@link Compartment}
 * @type {WeakMap<Compartment, CompartmentFields>}
 */
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
 * @returns {{namespace: ModuleExportsNamespace}}
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

/** @type {Compartment & {constructor: typeof InertCompartment}} */
export const CompartmentPrototype = {
  constructor: InertCompartment,

  get globalThis() {
    return /** @type {CompartmentFields} */ (weakmapGet(privateFields, this))
      .globalObject;
  },

  get name() {
    return /** @type {CompartmentFields} */ (weakmapGet(privateFields, this))
      .name;
  },

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
    const { noNamespaceBox, noAggregateLoadErrors } =
      /** @type {CompartmentFields} */ (weakmapGet(privateFields, this));

    if (typeof specifier !== 'string') {
      throw TypeError('first argument of import() must be a string');
    }

    return promiseThen(
      load(privateFields, moduleAliases, this, specifier, {
        noAggregateErrors: noAggregateLoadErrors,
      }),
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

    const { noAggregateLoadErrors } = /** @type {CompartmentFields} */ (
      weakmapGet(privateFields, this)
    );

    return load(privateFields, moduleAliases, this, specifier, {
      noAggregateErrors: noAggregateLoadErrors,
    });
  },

  importNow(specifier) {
    if (typeof specifier !== 'string') {
      throw TypeError('first argument of importNow() must be a string');
    }
    const { noAggregateLoadErrors } = /** @type {CompartmentFields} */ (
      weakmapGet(privateFields, this)
    );

    loadNow(privateFields, moduleAliases, this, specifier, {
      noAggregateErrors: noAggregateLoadErrors,
    });
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

/**
 * "Options bag"-style `Compartment` constructor arguments.
 * @typedef {[options?: CompartmentOptions & { __options__: true }]} CompartmentOptionsArgs
 */

/**
 * Legacy `Compartment` constructor arguments.
 *
 * @deprecated
 * @typedef {[globals?: Map<string, any>, modules?: Map<string, ModuleDescriptor>, options?: CompartmentOptions]} LegacyCompartmentOptionsArgs
 */

/**
 * In order to facilitate migration from the deprecated signature of the
 * compartment constructor,
 *
 * `new Compartent(globals?, modules?, options?)`
 *
 * to the new signature:
 *
 * `new Compartment(options?)`
 *
 * ...where globals and modules are expressed in the options bag instead of
 * positional arguments, this function detects the temporary sigil __options__
 * on the first argument and coerces compartments arguments into a single
 * compartments object.
 * @param {CompartmentOptionsArgs|LegacyCompartmentOptionsArgs} args
 * @returns {CompartmentOptions}
 */
export const compartmentOptions = (...args) => {
  if (args.length === 0) {
    return {};
  }
  if (
    args.length === 1 &&
    typeof args[0] === 'object' &&
    args[0] !== null &&
    '__options__' in args[0]
  ) {
    const { __options__, ...options } = args[0];
    assert(
      __options__ === true,
      `Compartment constructor only supports true __options__ sigil, got ${__options__}`,
    );
    return options;
  } else {
    const [
      globals = /** @type {Map<string, any>} */ ({}),
      modules = /** @type {Map<string, ModuleDescriptor>} */ ({}),
      options = {},
    ] = /** @type {LegacyCompartmentOptionsArgs} */ (args);
    assertEqual(
      options.modules,
      undefined,
      `Compartment constructor must receive either a module map argument or modules option, not both`,
    );
    assertEqual(
      options.globals,
      undefined,
      `Compartment constructor must receive either globals argument or option, not both`,
    );
    return {
      ...options,
      globals,
      modules,
    };
  }
};

/** @type {MakeCompartmentConstructor} */
export const makeCompartmentConstructor = (
  targetMakeCompartmentConstructor,
  intrinsics,
  markVirtualizedNativeFunction,
  { parentCompartment = undefined, enforceNew = false } = {},
) => {
  /**
   *
   * @param {CompartmentOptionsArgs|LegacyCompartmentOptionsArgs} args
   */
  function Compartment(...args) {
    if (enforceNew && new.target === undefined) {
      throw TypeError(
        "Class constructor Compartment cannot be invoked without 'new'",
      );
    }

    // Extract options, and shallow-clone transforms.
    const {
      name = '<unknown>',
      transforms = [],
      __shimTransforms__ = [],
      globals: endowmentsOption = {},
      modules: moduleMapOption = {},
      resolveHook,
      importHook,
      importNowHook,
      moduleMapHook,
      importMetaHook,
      __noNamespaceBox__: noNamespaceBox = false,
      noAggregateLoadErrors = false,
    } = compartmentOptions(...args);
    const globalTransforms = arrayFlatMap(
      [transforms, __shimTransforms__],
      identity,
    );
    const endowments = { __proto__: null, ...endowmentsOption };
    const moduleMap = { __proto__: null, ...moduleMapOption };

    // Map<FullSpecifier, ModuleCompartmentRecord>
    const moduleRecords = new Map();
    // Map<FullSpecifier, ModuleInstance>
    const instances = new Map();
    // Map<FullSpecifier, {ExportsProxy, ProxiedExports, activate()}>
    const deferredExports = new Map();

    const globalObject = {};

    const compartment = this;

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

    /**
     * In support dynamic import in a module source loaded by this compartment,
     * like `await import(importSpecifier)`, induces this compartment to import
     * a module, returning a promise for the resulting module exports
     * namespace.
     * Unlike `compartment.import`, never creates a box object for the
     * namespace as that behavior is deprecated and inconsistent with the
     * standard behavior of dynamic import.
     * Obliges the caller to resolve import specifiers to their corresponding
     * full specifier.
     * That is, every module must have its own dynamic import function that
     * closes over the surrounding module's full module specifier and calls
     * through to this function.
     * @param {string} fullSpecifier - A full specifier is a key in the
     * compartment's module memo.
     * The method `compartment.import` accepts a full specifier, but dynamic
     * import accepts an import specifier and resolves it to a full specifier
     * relative to the calling module's full specifier.
     * @returns {Promise<ModuleExportsNamespace>}
     */
    const compartmentImport = async fullSpecifier => {
      if (typeof resolveHook !== 'function') {
        throw TypeError(
          `Compartment does not support dynamic import: no configured resolveHook for compartment ${q(name)}`,
        );
      }
      await load(privateFields, moduleAliases, compartment, fullSpecifier, {
        noAggregateErrors: noAggregateLoadErrors,
      });
      const { execute, exportsProxy } = link(
        privateFields,
        moduleAliases,
        compartment,
        fullSpecifier,
      );
      execute();
      return exportsProxy;
    };

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
      compartmentImport,
      noAggregateLoadErrors,
    });
  }

  Compartment.prototype = CompartmentPrototype;

  return Compartment;
};
