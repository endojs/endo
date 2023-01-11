// @ts-check
/* eslint no-shadow: 0 */

/** @typedef {import('ses').ResolveHook} ResolveHook */
/** @typedef {import('ses').PrecompiledStaticModuleInterface} PrecompiledStaticModuleInterface */
/** @typedef {import('./types.js').ParserImplementation} ParserImplementation */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
/** @typedef {import('./types.js').CompartmentSources} CompartmentSources */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').ModuleTransforms} ModuleTransforms */
/** @typedef {import('./types.js').Sources} Sources */
/** @typedef {import('./types.js').WriteFn} WriteFn */
/** @typedef {import('./types.js').ArchiveOptions} ArchiveOptions */

import fs from 'fs';
import { resolve } from './node-module-specifier.js';
import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { link } from './link.js';
import { makeImportHookMaker } from './import-hook.js';
import parserJson from './parse-json.js';
import parserText from './parse-text.js';
import parserBytes from './parse-bytes.js';
import parserArchiveCjs from './parse-archive-cjs.js';
import parserArchiveMjs from './parse-archive-mjs.js';
import { parseLocatedJson } from './json.js';

import mjsSupport from './bundle-mjs.js';
import cjsSupport from './bundle-cjs.js';

const textEncoder = new TextEncoder();

/** @type {Record<string, ParserImplementation>} */
const parserForLanguage = {
  mjs: parserArchiveMjs,
  'pre-mjs-json': parserArchiveMjs,
  cjs: parserArchiveCjs,
  'pre-cjs-json': parserArchiveCjs,
  json: parserJson,
  text: parserText,
  bytes: parserBytes,
};

/**
 * @param {Record<string, CompartmentDescriptor>} compartmentDescriptors
 * @param {Record<string, CompartmentSources>} compartmentSources
 * @param {Record<string, ResolveHook>} compartmentResolvers
 * @param {string} entryCompartmentName
 * @param {string} entryModuleSpecifier
 */
const sortedModules = (
  compartmentDescriptors,
  compartmentSources,
  compartmentResolvers,
  entryCompartmentName,
  entryModuleSpecifier,
) => {
  const modules = [];
  const seen = new Set();

  /**
   * @param {string} compartmentName
   * @param {string} moduleSpecifier
   */
  const recur = (compartmentName, moduleSpecifier) => {
    const key = `${compartmentName}#${moduleSpecifier}`;
    if (seen.has(key)) {
      return key;
    }
    seen.add(key);

    const resolve = compartmentResolvers[compartmentName];
    const source = compartmentSources[compartmentName][moduleSpecifier];
    if (source !== undefined) {
      const { record, parser, deferredError } = source;
      if (deferredError) {
        throw new Error(
          `Cannot bundle: encountered deferredError ${deferredError}`,
        );
      }
      if (record) {
        const { imports = [], reexports = [] } =
          /** @type {PrecompiledStaticModuleInterface} */ (record);
        const resolvedImports = Object.create(null);
        for (const importSpecifier of [...imports, ...reexports]) {
          const resolvedSpecifier = resolve(importSpecifier, moduleSpecifier);
          resolvedImports[importSpecifier] = recur(
            compartmentName,
            resolvedSpecifier,
          );
        }

        modules.push({
          key,
          compartmentName,
          moduleSpecifier,
          parser,
          record,
          resolvedImports,
        });

        return key;
      }
    } else {
      const descriptor =
        compartmentDescriptors[compartmentName].modules[moduleSpecifier];
      if (descriptor) {
        const {
          compartment: aliasCompartmentName,
          module: aliasModuleSpecifier,
        } = descriptor;
        if (
          aliasCompartmentName !== undefined &&
          aliasModuleSpecifier !== undefined
        ) {
          return recur(aliasCompartmentName, aliasModuleSpecifier);
        }
      }
    }

    throw new Error(
      `Cannot bundle: cannot follow module import ${moduleSpecifier} in compartment ${compartmentName}`,
    );
  };

  recur(entryCompartmentName, entryModuleSpecifier);

  return modules;
};

const implementationPerParser = {
  'pre-mjs-json': mjsSupport,
  'pre-cjs-json': cjsSupport,
};

function getRuntime(parser) {
  return implementationPerParser[parser]
    ? implementationPerParser[parser].runtime
    : `/*unknown parser:${parser}*/`;
}

function getBundlerKitForModule(module) {
  const parser = module.parser;
  if (!implementationPerParser[parser]) {
    const warning = `/*unknown parser:${parser}*/`;
    // each item is a function to avoid creating more in-memory copies of the source text etc.
    return {
      getFunctor: () => `(()=>{${warning}})`,
      getCells: `{${warning}}`,
      getFunctorCall: warning,
    };
  }
  const getBundlerKit = implementationPerParser[parser].getBundlerKit;
  return getBundlerKit(module);
}

/**
 * @typedef {Object} BundleKit
 * @property {any[]} modules
 * @property {Set<any>} parsersInUse
 */

/**
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @param {Object} [options]
 * @param {ModuleTransforms} [options.moduleTransforms]
 * @param {boolean} [options.dev]
 * @param {Set<string>} [options.tags]
 * @param {Array<string>} [options.searchSuffixes]
 * @param {Object} [options.commonDependencies]
 * @returns {Promise<BundleKit>}
 */
export const prepareToBundle = async (read, moduleLocation, options) => {
  const {
    moduleTransforms,
    dev,
    tags: tagsOption,
    searchSuffixes,
    commonDependencies,
  } = options || {};
  const tags = new Set(tagsOption);

  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(read, moduleLocation);

  const packageDescriptor = parseLocatedJson(
    packageDescriptorText,
    packageDescriptorLocation,
  );
  const compartmentMap = await compartmentMapForNodeModules(
    read,
    packageLocation,
    tags,
    packageDescriptor,
    moduleSpecifier,
    { dev, commonDependencies },
  );

  const {
    compartments,
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;
  /** @type {Sources} */
  const sources = Object.create(null);

  const makeImportHook = makeImportHookMaker(
    read,
    packageLocation,
    sources,
    compartments,
    undefined,
    undefined,
    searchSuffixes,
  );

  // Induce importHook to record all the necessary modules to import the given module specifier.
  const { compartment, resolvers } = link(compartmentMap, {
    resolve,
    makeImportHook,
    moduleTransforms,
    parserForLanguage,
  });
  await compartment.load(entryModuleSpecifier);

  const modules = sortedModules(
    compartmentMap.compartments,
    sources,
    resolvers,
    entryCompartmentName,
    entryModuleSpecifier,
  );

  // Create an index of modules so we can resolve import specifiers to the
  // index of the corresponding functor.
  const modulesByKey = Object.create(null);
  for (let index = 0; index < modules.length; index += 1) {
    const module = modules[index];
    module.index = index;
    modulesByKey[module.key] = module;
  }
  const parsersInUse = new Set();
  for (const module of modules) {
    module.indexedImports = Object.fromEntries(
      Object.entries(module.resolvedImports).map(([importSpecifier, key]) => [
        importSpecifier,
        modulesByKey[key].index,
      ]),
    );
    parsersInUse.add(module.parser);
    module.bundlerKit = getBundlerKitForModule(module);
  }

  return { modules, parsersInUse };
};

function wrapFunctorInPrecompiledModule (functorSrc, moduleIndex) {
  const wrappedSrc = (
`(function(){
  with (this.scopeTerminator) {
  with (this.globalThis) {
    return function() {
      'use strict';
      return (
${functorSrc}
      );
    };
  }
  }
}).call(getEvalKitForModule(${moduleIndex}))()`)
  return wrappedSrc
}

/**
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @param {Object} [options]
 * @param {ModuleTransforms} [options.moduleTransforms]
 * @param {boolean} [options.dev]
 * @param {Set<string>} [options.tags]
 * @param {Array<string>} [options.searchSuffixes]
 * @param {Object} [options.commonDependencies]
 * @returns {Promise<string>}
 */
export const makeSecureBundle = async (read, moduleLocation, options) => {
  const { modules, parsersInUse } = await prepareToBundle(
    read,
    moduleLocation,
    options,
  );

  function getCompartmentByName (name) {
    let compartment = compartments[name];
    if (compartment === undefined) {
      compartment = new Compartment();
      compartments[name] = compartment;
    }
    return compartment;
  }

  function getEvalKitForModule (moduleIndex) {
    const compartmentName = compartmentsForModule[moduleIndex]
    const compartment = getCompartmentByName(compartmentName)
    const evalKit = getEvalKitForCompartment(compartment)
    return evalKit
  }

  const sesShimLocation = new URL(
    '../../ses/dist/lockdown.umd.js',
    import.meta.url,
  );
  const sesShim = fs.readFileSync(sesShimLocation, 'utf8')

  const bundle = `\
;(function(){
${sesShim}
})()
lockdown();

;(() => {
  const strictScopeTerminator = makeStrictScopeHandler();
  const compartments = { __proto__: null }

  const compartmentsForModule = [
    ${''.concat(modules.map(m => JSON.stringify(m.compartmentName)).join(','))}\
  ]

  const functors = [
${''.concat(modules.map((m, index) => wrapFunctorInPrecompiledModule(m.bundlerKit.getFunctor(), index)).join(','))}\
]; // functors end

  const cell = (name, value = undefined) => {
    const observers = [];
    return Object.freeze({
      get: Object.freeze(() => {
        return value;
      }),
      set: Object.freeze((newValue) => {
        value = newValue;
        for (const observe of observers) {
          observe(value);
        }
      }),
      observe: Object.freeze((observe) => {
        observers.push(observe);
        observe(value);
      }),
      enumerable: true,
    });
  };

  const cells = [
${''.concat(...modules.map(m => m.bundlerKit.getCells()))}\
  ];

${''.concat(...modules.map(m => m.bundlerKit.getReexportsWiring()))}\

  const namespaces = cells.map(cells => Object.freeze(Object.create(null, cells)));

  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }

${''.concat(...Array.from(parsersInUse).map(parser => getRuntime(parser)))}

${''.concat(...modules.map(m => m.bundlerKit.getFunctorCall()))}\

  ${getCompartmentByName}
  ${getEvalKitForModule}
  ${getEvalKitForCompartment}
  ${makeStrictScopeHandler}

  return cells[cells.length - 1]['*'].get();
})();
`;

  return bundle;
};

/**
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @param {Object} [options]
 * @param {ModuleTransforms} [options.moduleTransforms]
 * @param {boolean} [options.dev]
 * @param {Set<string>} [options.tags]
 * @param {Array<string>} [options.searchSuffixes]
 * @param {Object} [options.commonDependencies]
 * @returns {Promise<string>}
 */
export const makeBundle = async (read, moduleLocation, options) => {
  const { modules, parsersInUse } = await prepareToBundle(
    read,
    moduleLocation,
    options,
  );

  const bundle = `\
'use strict';
(() => {
  const functors = [
${''.concat(modules.map(m => m.bundlerKit.getFunctor()).join(','))}\
]; // functors end

  const cell = (name, value = undefined) => {
    const observers = [];
    return Object.freeze({
      get: Object.freeze(() => {
        return value;
      }),
      set: Object.freeze((newValue) => {
        value = newValue;
        for (const observe of observers) {
          observe(value);
        }
      }),
      observe: Object.freeze((observe) => {
        observers.push(observe);
        observe(value);
      }),
      enumerable: true,
    });
  };

  const cells = [
${''.concat(...modules.map(m => m.bundlerKit.getCells()))}\
  ];

${''.concat(...modules.map(m => m.bundlerKit.getReexportsWiring()))}\

  const namespaces = cells.map(cells => Object.freeze(Object.create(null, cells)));

  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }

${''.concat(...Array.from(parsersInUse).map(parser => getRuntime(parser)))}

${''.concat(...modules.map(m => m.bundlerKit.getFunctorCall()))}\

  return cells[cells.length - 1]['*'].get();
})();
`;

  return bundle;
};

/**
 * @param {WriteFn} write
 * @param {ReadFn} read
 * @param {string} bundleLocation
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 */
export const writeBundle = async (
  write,
  read,
  bundleLocation,
  moduleLocation,
  options,
) => {
  const bundleString = await makeBundle(read, moduleLocation, options);
  const bundleBytes = textEncoder.encode(bundleString);
  await write(bundleLocation, bundleBytes);
};


function makeStrictScopeHandler () {
  const { freeze, create, getOwnPropertyDescriptors } = Object;
  const immutableObject = freeze(create(null));

  // import { assert } from './error/assert.js';
  const assert = {
    fail: (msg) => {
      throw new Error(msg);
    }
  }

  // const { details: d, quote: q } = assert;
  const d = (strings, args) => strings.join() + args.join();
  const q = (arg) => arg

  /**
   * alwaysThrowHandler
   * This is an object that throws if any property is called. It's used as
   * a proxy handler which throws on any trap called.
   * It's made from a proxy with a get trap that throws. It's safe to
   * create one and share it between all Proxy handlers.
   */
  const alwaysThrowHandler = new Proxy(
    immutableObject,
    freeze({
      get(_shadow, prop) {
        // eslint-disable-next-line @endo/no-polymorphic-call
        assert.fail(
          d`Please report unexpected scope handler trap: ${q(String(prop))}`,
        );
      },
    }),
  );

  /*
  * scopeProxyHandlerProperties
  * scopeTerminatorHandler manages a strictScopeTerminator Proxy which serves as
  * the final scope boundary that will always return "undefined" in order
  * to prevent access to "start compartment globals".
  */
  const scopeProxyHandlerProperties = {
    get(_shadow, _prop) {
      return undefined;
    },

    set(_shadow, prop, _value) {
      // We should only hit this if the has() hook returned true matches the v8
      // ReferenceError message "Uncaught ReferenceError: xyz is not defined"
      throw new ReferenceError(`${String(prop)} is not defined`);
    },

    has(_shadow, prop) {
      // we must at least return true for all properties on the realm globalThis
      return prop in globalThis;
    },

    // note: this is likely a bug of safari
    // https://bugs.webkit.org/show_bug.cgi?id=195534
    getPrototypeOf() {
      return null;
    },

    // Chip has seen this happen single stepping under the Chrome/v8 debugger.
    // TODO record how to reliably reproduce, and to test if this fix helps.
    // TODO report as bug to v8 or Chrome, and record issue link here.
    getOwnPropertyDescriptor(_target, prop) {
      // Coerce with `String` in case prop is a symbol.
      const quotedProp = q(String(prop));
      // eslint-disable-next-line @endo/no-polymorphic-call
      console.warn(
        `getOwnPropertyDescriptor trap on scopeTerminatorHandler for ${quotedProp}`,
        new TypeError().stack,
      );
      return undefined;
    },
  };

  // The scope handler's prototype is a proxy that throws if any trap other
  // than get/set/has are run (like getOwnPropertyDescriptors, apply,
  // getPrototypeOf).
  const strictScopeTerminatorHandler = freeze(
    create(
      alwaysThrowHandler,
      getOwnPropertyDescriptors(scopeProxyHandlerProperties),
    ),
  );

  const strictScopeTerminator = new Proxy(
    immutableObject,
    strictScopeTerminatorHandler,
  );

  return { strictScopeTerminator }
}

function getEvalKitForCompartment (compartment) {
  const scopeTerminator = strictScopeTerminator;
  const { globalThis } = compartment;
  return { globalThis, scopeTerminator };
}
