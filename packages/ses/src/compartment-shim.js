// This module exports both Compartment and StaticModuleRecord because they
// communicate through the moduleAnalyses private side-table.
/* eslint max-classes-per-file: ["error", 2] */

import * as babel from '@agoric/babel-standalone';
// We are using the above import form, and referring to its default export
// explicitly below like babel.default, because the proper construct causes a
// Rollup error.
// This form:
//   import babel from '@agoric/babel-standalone';
// And this variant:
//   import { default as babel } from '@agoric/babel-standalone';
// Both produce:
//   Error: 'default' is not exported by .../@agoric/babel-standalone/babel.js
import { makeModuleAnalyzer } from '@agoric/transform-module';
import { assign, entries } from './commons.js';
import { createGlobalObject } from './global-object.js';
import { performEval } from './evaluate.js';
import { getCurrentRealmRec } from './realm-rec.js';
import { load } from './module-load.js';
import { link } from './module-link.js';
import { getDeferredExports } from './module-proxy.js';

// q, for quoting strings.
const q = JSON.stringify;

const analyzeModule = makeModuleAnalyzer(babel.default);

// moduleAnalyses are the private data of a StaticModuleRecord.
// We use moduleAnalyses in the loader/linker to look up
// the analysis corresponding to any StaticModuleRecord constructed by an
// importHook.
const moduleAnalyses = new WeakMap();

/**
 * StaticModuleRecord captures the effort of parsing and analyzing module text
 * so a cache of StaticModuleRecords may be shared by multiple Compartments.
 */
export class StaticModuleRecord {
  constructor(string, url) {
    const analysis = analyzeModule({ string, url });

    this.imports = Object.keys(analysis.imports).sort();

    Object.freeze(this);
    Object.freeze(this.imports);

    moduleAnalyses.set(this, analysis);
  }

  // eslint-disable-next-line class-methods-use-this
  toString() {
    return '[object StaticModuleRecord]';
  }

  static toString() {
    return 'function StaticModuleRecord() { [shim code] }';
  }
}

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

/**
 * Compartment()
 * The Compartment constructor is a global. A host that wants to execute
 * code in a context bound to a new global creates a new compartment.
 */
export class Compartment {
  constructor(endowments = {}, modules = {}, options = {}) {
    // Extract options, and shallow-clone transforms.
    const { transforms = [], resolveHook, importHook } = options;
    const globalTransforms = [...transforms];

    const realmRec = getCurrentRealmRec();
    const globalObject = createGlobalObject(realmRec, {
      globalTransforms,
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
          // TODO create and link a synthetic module instance from the given namespace object.
          throw ReferenceError(
            `Cannot map module ${q(
              specifier,
            )} because it has no known compartment in this realm`,
          );
        }
      }
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
    });
  }

  get globalThis() {
    return privateFields.get(this).globalObject;
  }

  /**
   * @param {string} source is a JavaScript program grammar construction.
   * @param {{
   *   endowments: Object<name:string, endowment:any>,
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
    const {
      endowments = {},
      transforms = [],
      sloppyGlobalsMode = false,
    } = options;
    const localTransforms = [...transforms];

    const { globalTransforms, globalObject } = privateFields.get(this);
    const realmRec = getCurrentRealmRec();
    return performEval(realmRec, source, globalObject, endowments, {
      globalTransforms,
      localTransforms,
      sloppyGlobalsMode,
    });
  }

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
  }

  async import(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of import() must be a string');
    }

    assertModuleHooks(this);

    return load(privateFields, moduleAnalyses, this, specifier).then(() => {
      const namespace = this.importNow(specifier);
      return { namespace };
    });
  }

  importNow(specifier) {
    if (typeof specifier !== 'string') {
      throw new TypeError('first argument of importNow() must be a string');
    }

    assertModuleHooks(this);

    const moduleInstance = link(privateFields, moduleAliases, this, specifier);
    moduleInstance.execute();
    return moduleInstance.exportsProxy;
  }

  // eslint-disable-next-line class-methods-use-this
  toString() {
    return '[object Compartment]';
  }

  static toString() {
    return 'function Compartment() { [shim code] }';
  }
}
