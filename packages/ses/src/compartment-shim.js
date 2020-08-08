// This module exports both Compartment and StaticModuleRecord because they
// communicate through the moduleAnalyses private side-table.
/* eslint max-classes-per-file: ["error", 2] */

import babel from '@agoric/babel-standalone';
import { makeModuleAnalyzer } from '@agoric/transform-module';
import {
  assign,
  defineProperties,
  entries,
  freeze,
  getOwnPropertyNames,
  keys,
} from './commons.js';
import { initGlobalObject } from './global-object.js';
import { performEval } from './evaluate.js';
import { load } from './module-load.js';
import { link } from './module-link.js';
import { getDeferredExports } from './module-proxy.js';
import { isValidIdentifierName } from './scope-constants.js';
import { sharedGlobalPropertyNames } from './whitelist.js';
import { getGlobalIntrinsics } from './intrinsics.js';
import { tameFunctionToString } from './tame-function-tostring.js';
import { InertCompartment, InertStaticModuleRecord } from './inert.js';

// q, for quoting strings.
const q = JSON.stringify;

const analyzeModule = makeModuleAnalyzer(babel);

// moduleAnalyses are the private data of a StaticModuleRecord.
// We use moduleAnalyses in the loader/linker to look up
// the analysis corresponding to any StaticModuleRecord constructed by an
// importHook.
const moduleAnalyses = new WeakMap();

/**
 * StaticModuleRecord captures the effort of parsing and analyzing module text
 * so a cache of StaticModuleRecords may be shared by multiple Compartments.
 */
export function StaticModuleRecord(string, url) {
  if (new.target === undefined) {
    return new StaticModuleRecord(string, url);
  }

  const analysis = analyzeModule({ string, url });

  this.imports = keys(analysis.imports).sort();

  freeze(this);
  freeze(this.imports);

  moduleAnalyses.set(this, analysis);
}

const StaticModuleRecordPrototype = {
  constructor: InertStaticModuleRecord,
  toString() {
    return '[object StaticModuleRecord]';
  },
};

defineProperties(StaticModuleRecord, {
  prototype: { value: StaticModuleRecordPrototype },
});

defineProperties(InertStaticModuleRecord, {
  prototype: { value: StaticModuleRecordPrototype },
});

// privateFields captures the private state for each compartment.
const privateFields = new WeakMap();

// moduleAliases associates every public module exports namespace with its
// corresponding compartment and specifier so they can be used to link modules
// across compartments.
// The mechanism to thread an alias is to use the compartment.module function
// to obtain the exports namespace of a foreign module and pass it into another
// compartment's moduleMap constructor option.
const moduleAliases = new WeakMap();

// Compartments do not need an importHook or resolveHook to be useful
// as a vessel for evaluating programs.
// However, any method that operates the module system will throw an exception
// if these hooks are not available.
const assertModuleHooks = compartment => {
  const { importHook, resolveHook } = privateFields.get(compartment);
  if (typeof importHook !== 'function' || typeof resolveHook !== 'function') {
    throw new TypeError(
      `Compartment must be constructed with an importHook and a resolveHook for it to be able to load modules`,
    );
  }
};

const CompartmentPrototype = {
  constructor: InertCompartment,
  get globalThis() {
    return privateFields.get(this).globalObject;
  },

  /**
   * @param {string} source is a JavaScript program grammar construction.
   * @param {{
   *   transforms: Array<Transform>,
   *   sloppyGlobalsMode: bool,
   * }} options.
   */
  evaluate(source, options = {}) {
    // Perform this check first to avoid unecessary sanitizing.
    if (typeof source !== 'string') {
      throw new TypeError('first argument of evaluate() must be a string');
    }

    // Extract options, and shallow-clone transforms.
    const { transforms = [], sloppyGlobalsMode = false } = options;
    const localTransforms = [...transforms];

    const {
      globalTransforms,
      globalObject,
      globalLexicals,
    } = privateFields.get(this);

    return performEval(source, globalObject, globalLexicals, {
      globalTransforms,
      localTransforms,
      sloppyGlobalsMode,
    });
  },

  module(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of module() must be a string');
    }

    assertModuleHooks(this);

    const { exportsProxy } = getDeferredExports(
      this,
      privateFields.get(this),
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

    return load(privateFields, this, specifier).then(() => {
      const namespace = this.importNow(specifier);
      return { namespace };
    });
  },

  async load(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of load() must be a string');
    }

    assertModuleHooks(this);

    return load(privateFields, this, specifier);
  },

  importNow(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of importNow() must be a string');
    }

    assertModuleHooks(this);

    const moduleInstance = link(
      privateFields,
      moduleAnalyses,
      moduleAliases,
      this,
      specifier,
    );
    moduleInstance.execute();
    return moduleInstance.exportsProxy;
  },

  toString() {
    return '[object Compartment]';
  },
};

defineProperties(InertCompartment, {
  prototype: { value: CompartmentPrototype },
});

export const makeCompartmentConstructor = (intrinsics, nativeBrander) => {
  /**
   * Compartment()
   * Each Compartment constructor is a global. A host that wants to execute
   * code in a context bound to a new global creates a new compartment.
   */
  function Compartment(endowments = {}, modules = {}, options = {}) {
    // Extract options, and shallow-clone transforms.
    const {
      transforms = [],
      globalLexicals = {},
      resolveHook,
      importHook,
    } = options;
    const globalTransforms = [...transforms];

    const globalObject = {};
    initGlobalObject(globalObject, intrinsics, sharedGlobalPropertyNames, {
      globalTransforms,
      nativeBrander,
      makeCompartmentConstructor,
    });

    assign(globalObject, endowments);

    // Map<FullSpecifier, ModuleCompartmentRecord>
    const moduleRecords = new Map();
    // Map<FullSpecifier, ModuleInstance>
    const instances = new Map();
    // Map<FullSpecifier, Alias{Compartment, FullSpecifier}>
    const aliases = new Map();
    // Map<FullSpecifier, {ExportsProxy, ProxiedExports, activate()}>
    const deferredExports = new Map();

    for (const [specifier, module] of entries(modules)) {
      if (typeof module === 'string') {
        throw new TypeError(
          `Cannot map module ${q(specifier)} to ${q(
            module,
          )} in parent compartment`,
        );
      } else {
        const alias = moduleAliases.get(module);
        if (alias != null) {
          // Modules from other components.
          aliases.set(specifier, alias);
        } else {
          // TODO create and link a synthetic module instance from the given
          // namespace object.
          throw ReferenceError(
            `Cannot map module ${q(
              specifier,
            )} because it has no known compartment in this realm`,
          );
        }
      }
    }

    const invalidNames = getOwnPropertyNames(globalLexicals).filter(
      name => !isValidIdentifierName(name),
    );
    if (invalidNames.length) {
      throw new Error(
        `Cannot create compartment with invalid names for global lexicals: ${invalidNames.join(
          ', ',
        )}; these names would not be lexically mentionable`,
      );
    }

    privateFields.set(this, {
      resolveHook,
      importHook,
      aliases,
      moduleRecords,
      deferredExports,
      instances,
      globalTransforms,
      globalObject,
      // The caller continues to own the globalLexicals object they passed to
      // the compartment constructor, but the compartment only respects the
      // original values and they are constants in the scope of evaluated
      // programs and executed modules.
      // This shallow copy captures only the values of enumerable own
      // properties, erasing accessors.
      // The snapshot is frozen to ensure that the properties are immutable
      // when transferred-by-property-descriptor onto local scope objects.
      globalLexicals: freeze({ ...globalLexicals }),
    });
  }

  defineProperties(Compartment, {
    prototype: { value: CompartmentPrototype },
  });

  return Compartment;
};

// TODO wasteful to do it twice, once before lockdown and again during
// lockdown. The second is doubly indirect. We should at least flatten that.
const nativeBrander = tameFunctionToString();

export const Compartment = makeCompartmentConstructor(
  getGlobalIntrinsics(globalThis),
  nativeBrander,
);
