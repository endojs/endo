// @ts-check
/* eslint no-shadow: 0 */

/** @typedef {import('ses').ResolveHook} ResolveHook */
/** @typedef {import('ses').PrecompiledStaticModuleInterface} PrecompiledStaticModuleInterface */
/** @typedef {import('./types.js').ParserImplementation} ParserImplementation */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
/** @typedef {import('./types.js').CompartmentMapDescriptor} CompartmentMapDescriptor */
/** @typedef {import('./types.js').CompartmentSources} CompartmentSources */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').ModuleTransforms} ModuleTransforms */
/** @typedef {import('./types.js').Sources} Sources */
/** @typedef {import('./types.js').WriteFn} WriteFn */
/** @typedef {import('./types.js').ArchiveOptions} ArchiveOptions */

import fs from 'fs';
import url from 'url';
import { ZipReader } from '@endo/zip';
import { transforms } from 'ses/tools.js';
import { resolve } from './node-module-specifier.js';
import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { link } from './link.js';
import { makeImportHookMaker } from './import-hook.js';
import parserJson from './parse-json.js';
import parserText from './parse-text.js';
import parserBytes from './parse-bytes.js';
import { makeArchiveCompartmentMap, locationsForSources } from './archive.js';
import parserArchiveCjs from './parse-archive-cjs.js';
import parserArchiveMjs from './parse-archive-mjs.js';
import { parseLocatedJson } from './json.js';
import { assertCompartmentMap } from './compartment-map.js';
import { unpackReadPowers } from './powers.js';
import { makeReadPowers } from './node-powers.js';

import mjsSupport from './bundle-mjs.js';
import cjsSupport from './bundle-cjs.js';

// quote strings
const q = JSON.stringify;

const { evadeImportExpressionTest } = transforms;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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
        throw Error(
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

    throw Error(
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
 * @typedef {object} BundleKit
 * @property {any[]} modules
 * @property {Set<any>} parsersInUse
 */

/**
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @param {object} [options]
 * @param {ModuleTransforms} [options.moduleTransforms]
 * @param {boolean} [options.dev]
 * @param {Set<string>} [options.tags]
 * @param {Array<string>} [options.searchSuffixes]
 * @param {object} [options.commonDependencies]
 * @param {object} [options.linkOptions]
 * @returns {Promise<{compartmentMap: CompartmentMapDescriptor, sources: Sources, resolvers: Record<string,ResolveHook> }>}
 */
export const prepareToBundle = async (read, moduleLocation, options) => {
  const {
    moduleTransforms,
    dev,
    tags: tagsOption,
    searchSuffixes,
    commonDependencies,
    linkOptions = {},
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
    entry: { module: entryModuleSpecifier },
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
    ...linkOptions,
  });
  await compartment.load(entryModuleSpecifier);

  return { compartmentMap, sources, resolvers };
};

/**
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @param {object} [options]
 * @param {ModuleTransforms} [options.moduleTransforms]
 * @param {boolean} [options.dev]
 * @param {Set<string>} [options.tags]
 * @param {Array<string>} [options.searchSuffixes]
 * @param {object} [options.commonDependencies]
 * @returns {Promise<string>}
 */
export const makeBundle = async (read, moduleLocation, options) => {
  const { compartmentMap, sources, resolvers } = await prepareToBundle(
    read,
    moduleLocation,
    options,
  );

  const {
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;

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

  const bundle = `\
'use strict';
(() => {
  const functors = [
${modules.map(m => m.bundlerKit.getFunctor()).join(',')}\
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

function wrapFunctorInPrecompiledModule(functorSrc, compartmentName) {
  const wrappedSrc = `() => (function(){
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
}).call(getEvalKitForCompartment(${q(compartmentName)}))()`;
  return wrappedSrc;
}

// This function is serialized and references variables from its destination scope.

function renderFunctorTable(functorTable) {
  const entries = Object.entries(functorTable);
  const lines = entries.map(
    ([key, value]) => `${q(key)}: ${value}`,
  );
  return `{\n${lines.map(line => `  ${line}`).join(',\n')}\n};`;
}

/**
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {Sources} sources
 * @returns {Promise<string>}
 */
export const makeSecureBundleFromAppContainer = async (
  compartmentMap,
  sources,
) => {
  const moduleFunctors = {};
  const moduleRegistry = {};

  for (const {
    path,
    module: { bytes },
    compartment,
  } of locationsForSources(sources)) {
    const textModule = textDecoder.decode(bytes);
    const moduleData = JSON.parse(textModule);
    const { __syncModuleProgram__, source, ...otherModuleData } = moduleData;
    // record module data
    moduleRegistry[path] = otherModuleData;
    // record functor
    if (__syncModuleProgram__) {
      // esm
      moduleFunctors[path] = wrapFunctorInPrecompiledModule(
        __syncModuleProgram__,
        compartment,
      );
    } else {
      // cjs
      moduleFunctors[path] = wrapFunctorInPrecompiledModule(
        source,
        compartment,
      );
    }
    // other module types?
  }

  const bundleRuntimeLocation = new URL(
    './bundle-runtime.js',
    import.meta.url,
  ).toString();
  // these read powers must refer to the disk as we are bundling the runtime from
  // this package's sources. The user-provided read powers used elsewhere refer
  // to the user's application source code.
  const { read } = makeReadPowers({ fs, url });
  const runtimeBundle = evadeImportExpressionTest(
    await makeBundle(read, bundleRuntimeLocation),
  ).replace(`'use strict';\n(() => `, `'use strict';\nreturn (() => `);

  const bundle = `\
// START BUNDLE RUNTIME ================================
const { loadApplication } = (function(){
${runtimeBundle}
})();
// END BUNDLE RUNTIME ================================

// START MODULE REGISTRY ================================
const compartmentMap = ${JSON.stringify(compartmentMap, null, 2)};
const moduleRegistry = ${JSON.stringify(moduleRegistry, null, 2)}

const loadModuleFunctors = (getEvalKitForCompartment) => {
  return ${renderFunctorTable(moduleFunctors)}
}

// END MODULE REGISTRY ==================================

const { execute } = loadApplication(
  compartmentMap,
  moduleRegistry,
  loadModuleFunctors,
  'App',
)

execute()
`;

  return bundle;
};

/**
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @param {object} [options]
 * @param {ModuleTransforms} [options.moduleTransforms]
 * @param {boolean} [options.dev]
 * @param {Set<string>} [options.tags]
 * @param {Array<string>} [options.searchSuffixes]
 * @param {object} [options.commonDependencies]
 * @returns {Promise<string>}
 */
export const makeSecureBundle = async (read, moduleLocation, options) => {
  const { compartmentMap, sources } = await prepareToBundle(
    read,
    moduleLocation,
    {
      linkOptions: { archiveOnly: true },
      ...options,
    },
  );

  const { archiveCompartmentMap, archiveSources } = makeArchiveCompartmentMap(
    compartmentMap,
    sources,
  );

  return makeSecureBundleFromAppContainer(
    archiveCompartmentMap,
    archiveSources,
  );
};

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

/**
 * @param {import('./types.js').ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {object} [options]
 * @returns {Promise<string>}
 */
export const makeSecureBundleFromArchive = async (
  readPowers,
  archiveLocation,
  options = {},
) => {
  const { expectedSha512 = undefined } = options;

  const { read, computeSha512 } = unpackReadPowers(readPowers);
  const archiveBytes = await read(archiveLocation);
  const archive = new ZipReader(archiveBytes, { name: archiveLocation });
  const get = path => archive.read(path);

  const compartmentMapBytes = get('compartment-map.json');

  let sha512;
  if (computeSha512 !== undefined) {
    sha512 = computeSha512(compartmentMapBytes);
  }
  if (expectedSha512 !== undefined) {
    if (sha512 === undefined) {
      throw new Error(
        `Cannot verify expectedSha512 without also providing computeSha512, for archive ${archiveLocation}`,
      );
    }
    if (sha512 !== expectedSha512) {
      throw new Error(
        `Archive compartment map failed a SHA-512 integrity check, expected ${expectedSha512}, got ${sha512}, for archive ${archiveLocation}`,
      );
    }
  }
  const compartmentMapText = textDecoder.decode(compartmentMapBytes);
  const compartmentMap = parseLocatedJson(
    compartmentMapText,
    'compartment-map.json',
  );
  assertCompartmentMap(compartmentMap, archiveLocation);

  // build sources object from archive
  /** @type {Sources} */
  const sources = {};
  for (const [compartmentName, { modules }] of Object.entries(
    compartmentMap.compartments,
  )) {
    const compartmentLocation = resolveLocation(
      `${compartmentName}/`,
      'file:///',
    );
    let compartmentSources = sources[compartmentName];
    if (compartmentSources === undefined) {
      compartmentSources = {};
      sources[compartmentName] = compartmentSources;
    }
    for (const { location } of Object.values(modules)) {
      // ignore alias records
      if (location === undefined) {
        // eslint-disable-next-line no-continue
        continue;
      }
      const moduleLocation = resolveLocation(location, compartmentLocation);
      const path = new URL(moduleLocation).pathname.slice(1); // skip initial "/"
      const bytes = get(path);
      compartmentSources[location] = { bytes, location };
    }
  }

  return makeSecureBundleFromAppContainer(compartmentMap, sources);
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
