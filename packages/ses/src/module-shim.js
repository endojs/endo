/* eslint no-underscore-dangle: ["off"] */

import babel from '@agoric/babel-standalone';
import { makeModuleAnalyzer } from '@agoric/transform-module';
import {
  defineProperties,
  entries,
  freeze,
  getOwnPropertyDescriptors,
  keys,
} from './commons.js';
import { load } from './module-load.js';
import { link } from './module-link.js';
import { getDeferredExports } from './module-proxy.js';
import { InertCompartment, InertStaticModuleRecord } from './inert.js';
import {
  CompartmentPrototype,
  makeCompartmentConstructor,
} from './compartment-shim.js';

// q, for quoting strings.
const q = JSON.stringify;

const analyzeModule = makeModuleAnalyzer(babel);

// eslint-disable-next-line no-shadow
export const __PrecompiledStaticModuleRecord__ = function StaticModuleRecord(
  analysis,
) {
  if (new.target === undefined) {
    return new __PrecompiledStaticModuleRecord__(analysis);
  }

  const {
    imports,
    functorSource,
    fixedExportMap,
    liveExportMap,
    exportAlls,
  } = analysis;

  // `keys` below is Object.keys which shows only the names of string-named
  // enumerable own properties.
  // By contrast, Reflect.ownKeys also shows the names of symbol-named
  // enumerable own properties.
  // `sort` defaults to a comparator that stringifies the array elements in a
  // manner which fails on symbol-named properties.
  // Distinct symbols can have the same stringification.
  //
  // The other subtle reason this is correct is that analysis.imports should
  // only have identifier-named own properties.
  this.imports = freeze(keys(imports).sort());
  this.__functorSource__ = functorSource;
  // We do not evidently need the values of this record, only the keys.
  // this.__imports__ = freeze(imports);
  this.__fixedExportMap__ = freeze(fixedExportMap);
  this.__liveExportMap__ = freeze(liveExportMap);
  this.__exportAlls__ = freeze(exportAlls);

  freeze(this);
};

/*
 * StaticModuleRecord captures the effort of parsing and analyzing module text
 * so a cache of StaticModuleRecords may be shared by multiple Compartments.
 */
export function StaticModuleRecord(string, url) {
  const analysis = analyzeModule({ string, url });
  return new __PrecompiledStaticModuleRecord__(analysis);
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

defineProperties(__PrecompiledStaticModuleRecord__, {
  prototype: { value: StaticModuleRecordPrototype },
});

defineProperties(InertStaticModuleRecord, {
  prototype: { value: StaticModuleRecordPrototype },
});

// moduleAliases associates every public module exports namespace with its
// corresponding compartment and specifier so they can be used to link modules
// across compartments.
// The mechanism to thread an alias is to use the compartment.module function
// to obtain the exports namespace of a foreign module and pass it into another
// compartment's moduleMap constructor option.
const moduleAliases = new WeakMap();

// privateFields captures the private state for each compartment.
const privateFields = new WeakMap();

// Compartments do not need an importHook or resolveHook to be useful
// as a vessel for evaluating programs.
// However, any method that operates the module system will throw an exception
// if these hooks are not available.
const assertModuleHooks = compartment => {
  const { importHook, resolveHook } = privateFields.get(compartment);
  if (typeof importHook !== 'function' || typeof resolveHook !== 'function') {
    throw new TypeError(
      'Compartment must be constructed with an importHook and a resolveHook for it to be able to load modules',
    );
  }
};

const ModularCompartmentPrototypeExtension = {
  constructor: InertCompartment,

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

    return load(privateFields, moduleAliases, this, specifier).then(() => {
      const namespace = this.importNow(specifier);
      return { namespace };
    });
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

    const moduleInstance = link(privateFields, moduleAliases, this, specifier);
    moduleInstance.execute();
    return moduleInstance.exportsProxy;
  },
};

defineProperties(
  CompartmentPrototype,
  getOwnPropertyDescriptors(ModularCompartmentPrototypeExtension),
);

export { CompartmentPrototype };

export const makeModularCompartmentConstructor = (
  targetMakeCompartmentConstructor,
  intrinsics,
  nativeBrander,
) => {
  // `makeModularCompartmentConstructor` extends `makeCompartmentConstructor`.
  // The trick is that the underlying compartment constructor needs to use the
  // extended modular compartment constructor to create child compartments.
  const SuperCompartment = makeCompartmentConstructor(
    targetMakeCompartmentConstructor,
    intrinsics,
    nativeBrander,
  );

  const ModularCompartment = function Compartment(
    endowments = {},
    moduleMap = {},
    options = {},
  ) {
    if (new.target === undefined) {
      throw new TypeError(
        "Class constructor Compartment cannot be invoked without 'new'",
      );
    }

    const self = Reflect.construct(
      SuperCompartment,
      [endowments, moduleMap, options],
      new.target,
    );

    const {
      resolveHook,
      importHook,
      moduleMapHook,
      __shimTransforms__,
    } = options;

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
    for (const [specifier, aliasNamespace] of entries(moduleMap)) {
      if (typeof aliasNamespace === 'string') {
        // TODO implement parent module record retrieval.
        throw new TypeError(
          `Cannot map module ${q(specifier)} to ${q(
            aliasNamespace,
          )} in parent compartment`,
        );
      } else if (moduleAliases.get(aliasNamespace) === undefined) {
        // TODO create and link a synthetic module instance from the given
        // namespace object.
        throw ReferenceError(
          `Cannot map module ${q(
            specifier,
          )} because it has no known compartment in this realm`,
        );
      }
    }

    privateFields.set(self, {
      resolveHook,
      importHook,
      moduleMap,
      moduleMapHook,
      moduleRecords,
      __shimTransforms__,
      deferredExports,
      instances,
    });

    return self;
  };

  ModularCompartment.prototype = CompartmentPrototype;

  return ModularCompartment;
};
