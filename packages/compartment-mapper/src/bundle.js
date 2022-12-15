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
  const seen = new Set();
  const modules = {};
  const results = {};
  const resultsPointer = {};

  const keyFor = (compartmentName, moduleSpecifier) =>
    `${compartmentName}#${moduleSpecifier}`;

  /**
   * @param {string} compartmentName
   * @param {string} moduleSpecifier
   */
  const recur = (compartmentName, moduleSpecifier) => {
    const key = `${compartmentName}#${moduleSpecifier}`;

    // we're trying to break cycles here, but we also need the result and it might not be ready yet
    // i tried to use a wrapper object as a reference that could be populated later,
    // but we still try to populate resolvedImports before we have the result
    // i guess we need to do all iteration first and then record the resolvedImports results
    if (seen.has(key)) {
      return
    }
    // const result = {}
    // results.set(key, result);
    seen.add(key);

    const source = compartmentSources[compartmentName][moduleSpecifier];
    // if (['./util', './dist/backend'].includes(moduleSpecifier) && ['file:///home/xyz/Development/endo/packages/compartment-mapper/test/fixtures-0/node_modules/bundle-dep-cjs/', 'file:///home/xyz/Development/metamask-extension4/node_modules/react-devtools-core/'].includes((compartmentName))) {
    //   console.log('recur source', moduleSpecifier, !!source)
    // }
    if (source !== undefined) {
      const { record, parser, deferredError } = source;
      // if (['./util', './dist/backend'].includes(moduleSpecifier) && ['file:///home/xyz/Development/endo/packages/compartment-mapper/test/fixtures-0/node_modules/bundle-dep-cjs/', 'file:///home/xyz/Development/metamask-extension4/node_modules/react-devtools-core/'].includes((compartmentName))) {
      //   console.log('recur record', moduleSpecifier, !!record)
      // }
      if (deferredError) {
        throw new Error(
          `Cannot bundle: encountered deferredError ${deferredError}`,
        );
      }
      if (record) {
        const resolve = compartmentResolvers[compartmentName];
        const { imports = [], reexports = [] } =
          /** @type {PrecompiledStaticModuleInterface} */ (record);
        const resolvedImports = Object.create(null);
        const resolvedImportsPointers = {};
        for (const importSpecifier of [...imports, ...reexports]) {
          const resolvedSpecifier = resolve(importSpecifier, moduleSpecifier);
          // if (['./util', './dist/backend'].includes(importSpecifier) && ['file:///home/xyz/Development/endo/packages/compartment-mapper/test/fixtures-0/node_modules/bundle-dep-cjs/', 'file:///home/xyz/Development/metamask-extension4/node_modules/react-devtools-core/'].includes((compartmentName))) {
          //   console.log(
          //     `initial resolved ${importSpecifier} from ${moduleSpecifier} to ${resolvedSpecifier} in ${compartmentName}`,
          //   );
          // }
          // setup pointer
          resolvedImportsPointers[importSpecifier] = keyFor(compartmentName, resolvedSpecifier);
          recur(
            compartmentName,
            resolvedSpecifier,
          );
          // resolvedImports[importSpecifier] = resolvedResult.value
          // if (['./util', './dist/backend'].includes(importSpecifier) && ['file:///home/xyz/Development/endo/packages/compartment-mapper/test/fixtures-0/node_modules/bundle-dep-cjs/', 'file:///home/xyz/Development/metamask-extension4/node_modules/react-devtools-core/'].includes((compartmentName))) {
          //   console.log(
          //     `final resolved ${importSpecifier} from ${moduleSpecifier} to ${resolvedImports[importSpecifier]} in ${compartmentName}`,
          //   );
          // }
        }

        modules[key] = {
          key,
          compartmentName,
          moduleSpecifier,
          parser,
          record,
          resolvedImports,
          resolvedImportsPointers,
        };

        results[key] = key;
        return
      }
    } else {
      const descriptor =
        compartmentDescriptors[compartmentName].modules[moduleSpecifier];
      // if (['./util', './dist/backend'].includes(moduleSpecifier) && ['file:///home/xyz/Development/endo/packages/compartment-mapper/test/fixtures-0/node_modules/bundle-dep-cjs/', 'file:///home/xyz/Development/metamask-extension4/node_modules/react-devtools-core/'].includes((compartmentName))) {
      //   console.log('recur descriptor', moduleSpecifier, !!descriptor)
      // }
      if (descriptor) {
        const {
          compartment: aliasCompartmentName,
          module: aliasModuleSpecifier,
        } = descriptor;
        if (
          aliasCompartmentName !== undefined &&
          aliasModuleSpecifier !== undefined
        ) {
          resultsPointer[key] = keyFor(aliasCompartmentName, aliasModuleSpecifier);
          recur(aliasCompartmentName, aliasModuleSpecifier);
          return
        }
      }
    }

    throw new Error(
      `Cannot bundle: cannot follow module import ${moduleSpecifier} in compartment ${compartmentName}`,
    );
  };

  // walk graph
  recur(entryCompartmentName, entryModuleSpecifier);
  console.log('results', (Object.values(results)))
  // finalize key pointers
  // reverse didnt fix the problem
  // copy from source to dest
  // hint is that "results" before here is just {key: key},
  // so we likely dont need it at all
  // i think we can just record the redirects and if there is not one,
  // then we can just use the key
  // the current setup may require recursive redirects
  // but not sure why we would need that -- 
  Object.entries(resultsPointer).reverse().forEach(([destKey, sourceKey]) => {
    const finalKey = results[sourceKey];
    if (finalKey === undefined) {
      throw new Error(`Cannot bundle: cannot follow pointer for ${destKey} from ${sourceKey}`);
    }
    console.log('key pointers', destKey, sourceKey)
    results[destKey] = finalKey;
  });
  // finalize resolvedImports pointers
  Object.values(modules).forEach(({ key, resolvedImports, resolvedImportsPointers }) => {
    Object.entries(resolvedImportsPointers).forEach(([importSpecifier, destKey]) => {
      const finalKey = results[destKey];
      console.log('resolvedImports', key, importSpecifier, finalKey)
      resolvedImports[importSpecifier] = finalKey;
    });
  })

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
  const moduleValues = Object.values(modules);

  // Create an index of modules so we can resolve import specifiers to the
  // index of the corresponding functor.
  const modulesByKey = Object.create(null);
  let moduleIndex = 0;
  for (const module of moduleValues) {
    module.index = moduleIndex;
    modulesByKey[module.key] = module;
    moduleIndex++
  }
  const parsersInUse = new Set();
  for (const module of Object.values(modules)) {
    console.log('resolvedImports', module.resolvedImports)
    module.indexedImports = Object.fromEntries(
      // specifiers completed by candidates cant be bundled?
      Object.entries(module.resolvedImports).map(([importSpecifier, key]) => {
        if (modulesByKey[key] === undefined) {
          throw new Error(
            `Cannot bundle: cannot find module ${key} for import ${importSpecifier} in module ${module.key} (with resolvedImports ${Object.keys(module.resolvedImports)}`,
          );
        }
        return [
          importSpecifier,
          modulesByKey[key].index,
        ]
      }),
    );
    parsersInUse.add(module.parser);
    module.bundlerKit = getBundlerKitForModule(module);
  }

  const bundle = `\
'use strict';
(() => {
  const functors = [
${''.concat(...moduleValues.map(m => m.bundlerKit.getFunctor()))}\
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
${''.concat(...moduleValues.map(m => m.bundlerKit.getCells()))}\
  ];

${''.concat(...moduleValues.map(m => m.bundlerKit.getReexportsWiring()))}\

  const namespaces = cells.map(cells => Object.freeze(Object.create(null, cells)));

  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }

${''.concat(...Array.from(parsersInUse).map(parser => getRuntime(parser)))}

${''.concat(...moduleValues.map(m => m.bundlerKit.getFunctorCall()))}\

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
