// @ts-check
/* eslint-disable no-underscore-dangle */
/// <reference types="ses">

import {
  Map,
  ReferenceError,
  TypeError,
  WeakMap,
  WeakSet,
  arrayFilter,
  arrayJoin,
  assign,
  defineProperties,
  entries,
  freeze,
  getOwnPropertyNames,
  promiseThen,
  weakmapGet,
  weakmapSet,
  weaksetHas,
} from './commons.js';
import {
  setGlobalObjectConstantProperties,
  setGlobalObjectMutableProperties,
  setGlobalObjectEvaluators,
} from './global-object.js';
import { isValidIdentifierName } from './scope-constants.js';
import { sharedGlobalPropertyNames } from './whitelist.js';
import { load } from './module-load.js';
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

/**
 * @typedef {(source: string) => string} Transform
 */

// Compartments do not need an importHook or resolveHook to be useful
// as a vessel for evaluating programs.
// However, any method that operates the module system will throw an exception
// if these hooks are not available.
const assertModuleHooks = compartment => {
  const { importHook, resolveHook } = weakmapGet(privateFields, compartment);
  if (typeof importHook !== 'function' || typeof resolveHook !== 'function') {
    throw new TypeError(
      'Compartment must be constructed with an importHook and a resolveHook for it to be able to load modules',
    );
  }
};

export const InertCompartment = function Compartment(
  _endowments = {},
  _modules = {},
  _options = {},
) {
  throw new TypeError(
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
   * @param {Object} [options]
   * @param {Array<Transform>} [options.transforms]
   * @param {boolean} [options.sloppyGlobalsMode]
   * @param {Object} [options.__moduleShimLexicals__]
   * @param {boolean} [options.__evadeHtmlCommentTest__]
   * @param {boolean} [options.__evadeImportExpressionTest__]
   * @param {boolean} [options.__rejectSomeDirectEvalExpressions__]
   */
  evaluate(source, options = {}) {
    const compartmentFields = weakmapGet(privateFields, this);
    return compartmentEvaluate(compartmentFields, source, options);
  },

  toString() {
    return '[object Compartment]';
  },

  /* eslint-disable-next-line no-underscore-dangle */
  __isKnownScopeProxy__(value) {
    const { knownScopeProxies } = weakmapGet(privateFields, this);
    return weaksetHas(knownScopeProxies, value);
  },

  module(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of module() must be a string');
    }

    assertModuleHooks(this);

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
      throw new TypeError('first argument of import() must be a string');
    }

    assertModuleHooks(this);

    return promiseThen(
      load(privateFields, moduleAliases, this, specifier),
      () => {
        // The namespace box is a contentious design and likely to be a breaking
        // change in an appropriately numbered future version.
        const namespace = compartmentImportNow(this, specifier);
        return { namespace };
      },
    );
  },

  async load(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of load() must be a string');
    }

    assertModuleHooks(this);

    return load(privateFields, moduleAliases, this, specifier);
  },

  importNow(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of importNow() must be a string');
    }

    assertModuleHooks(this);

    return compartmentImportNow(this, specifier);
  },
};

defineProperties(InertCompartment, {
  prototype: { value: CompartmentPrototype },
});

/**
 * @callback MakeCompartmentConstructor
 * @param {MakeCompartmentConstructor} targetMakeCompartmentConstructor
 * @param {Record<string, any>} intrinsics
 * @param {(object: Object) => void} markVirtualizedNativeFunction
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
      throw new TypeError(
        "Class constructor Compartment cannot be invoked without 'new'",
      );
    }

    // Extract options, and shallow-clone transforms.
    const {
      name = '<unknown>',
      transforms = [],
      __shimTransforms__ = [],
      globalLexicals: globalLexicalsOption = {},
      resolveHook,
      importHook,
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
    for (const [specifier, aliasNamespace] of entries(moduleMap || {})) {
      if (typeof aliasNamespace === 'string') {
        // TODO implement parent module record retrieval.
        throw new TypeError(
          `Cannot map module ${q(specifier)} to ${q(
            aliasNamespace,
          )} in parent compartment`,
        );
      } else if (weakmapGet(moduleAliases, aliasNamespace) === undefined) {
        // TODO create and link a synthetic module instance from the given
        // namespace object.
        throw ReferenceError(
          `Cannot map module ${q(
            specifier,
          )} because it has no known compartment in this realm`,
        );
      }
    }

    const invalidNames = arrayFilter(
      getOwnPropertyNames(globalLexicalsOption),
      identifier => !isValidIdentifierName(identifier),
    );
    if (invalidNames.length) {
      throw new TypeError(
        `Cannot create compartment with invalid names for global lexicals: ${arrayJoin(
          invalidNames,
          ', ',
        )}; these names would not be lexically mentionable`,
      );
    }
    // The caller continues to own the globalLexicals object they passed to
    // the compartment constructor, but the compartment only respects the
    // original values and they are constants in the scope of evaluated
    // programs and executed modules.
    // This shallow copy captures only the values of enumerable own
    // properties, erasing accessors.
    // The snapshot is frozen to ensure that the properties are immutable
    // when transferred-by-property-descriptor onto local scope objects.
    const globalLexicals = freeze({ ...globalLexicalsOption });

    const globalObject = {};

    // We must initialize all constant properties first because
    // `makeSafeEvaluator` may use them to create optimized bindings
    // in the evaluator.
    // TODO: consider merging into a single initialization if internal
    // evaluator is no longer eagerly created
    setGlobalObjectConstantProperties(globalObject);

    const knownScopeProxies = new WeakSet();
    const { safeEvaluate } = makeSafeEvaluator({
      globalObject,
      globalLexicals,
      globalTransforms,
      sloppyGlobalsMode: false,
      knownScopeProxies,
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
      knownScopeProxies,
      globalLexicals,
      safeEvaluate,
      resolveHook,
      importHook,
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
