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
import jsonSupport from './bundle-json.js';

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
  const recur = (compartmentName, moduleSpecifier, d = 0) => {
    const key = `${compartmentName}#${moduleSpecifier}`;
    // process._rawDebug('>>', '  '.repeat(d), moduleSpecifier, seen.has(key) ? ' seen' : '')
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
            d + 1
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
          return recur(aliasCompartmentName, aliasModuleSpecifier, d + 1);
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
  json: jsonSupport,
};

function getRuntime(parser) {
  return implementationPerParser[parser]
    ? implementationPerParser[parser].runtime
    : `/*unknown parser:${parser}*/`;
}

function getBundlerKitForModule(module, opts) {
  const parser = module.parser;
  if (!implementationPerParser[parser]) {
    throw Error(`unknown parser:${parser}`);
  }
  const getBundlerKit = implementationPerParser[parser].getBundlerKit;
  return getBundlerKit(module, opts);
}

// vvv runtime to inline in the bundle vvv
/* eslint-disable no-undef */
function cell(name, value = undefined) {
  const observers = [];
  return Object.freeze({
    get: Object.freeze(() => {
      return value;
    }),
    set: Object.freeze(newValue => {
      value = newValue;
      for (const observe of observers) {
        observe(value);
      }
    }),
    observe: Object.freeze(observe => {
      observers.push(observe);
      observe(value);
    }),
    enumerable: true,
  });
}
function makeCells(orderedCells, reexports) {
  const cells = orderedCells.map(cs =>
    cs.reduce((kv, c) => {
      kv[c] = cell(c);
      return kv;
    }, {}),
  );
  for (const [to, from] of reexports) {
    Object.defineProperties(
      cells[to],
      Object.getOwnPropertyDescriptors(cells[from]),
    );
  }
  return cells;
}
/* eslint-enable no-undef */
const runtime = `\
${cell}
${makeCells}`;

// ^^^ runtime to inline in the bundle ^^^

/**
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @param {Object} [options]
 * @param {ModuleTransforms} [options.moduleTransforms]
 * @param {boolean} [options.dev]
 * @param {Set<string>} [options.tags]
 * @param {Array<string>} [options.searchSuffixes]
 * @param {Object} [options.commonDependencies]
 * @param {boolean} [options.__removeSourceURL]
 * @returns {Promise<string>}
 */
export const makeBundle = async (read, moduleLocation, options) => {
  const {
    moduleTransforms,
    dev,
    tags: tagsOption,
    searchSuffixes,
    commonDependencies,
    __removeSourceURL,
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
    module.bundlerKit = getBundlerKitForModule(module, { __removeSourceURL });
  }

  const bundle = `\
'use strict';
(() => {
  const functors = [
${''.concat(...modules.map(m => m.bundlerKit.getFunctor()))}\
]; // functors end

//runtime
  ${''.concat(
    runtime,
    ...Array.from(parsersInUse).map(parser => getRuntime(parser)),
  )}
// runtime end
  const cells = makeCells(
${JSON.stringify([...modules.map(m => m.bundlerKit.getCells())], null, 2)},
/* export * from */
${JSON.stringify(modules.flatMap(m => m.bundlerKit.reexportedCells || []))}
);

${''.concat(...modules.map(m => m.bundlerKit.getReexportsWiring()))}\

  const namespaces = cells.map(cells => Object.freeze(Object.create(null, cells)));

  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }

${''.concat(...modules.map(m => m.bundlerKit.getFunctorCall()))}\

  return cells[cells.length - 1]['*'].get();
})();
`.replaceAll('\r\n', '\n');

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
