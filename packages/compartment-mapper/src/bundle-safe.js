/** @typedef {import('./types.js').CompartmentMapDescriptor} CompartmentMapDescriptor */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').ModuleTransforms} ModuleTransforms */
/** @typedef {import('./types.js').Sources} Sources */

import fs from 'fs';
import url from 'url';
import { ZipReader } from '@endo/zip';
import { transforms } from 'ses/tools.js';
import { makeArchiveCompartmentMap, locationsForSources } from './archive.js';
import { parseLocatedJson } from './json.js';
import { assertCompartmentMap } from './compartment-map.js';
import { unpackReadPowers } from './powers.js';
import { makeReadPowers } from './node-powers.js';
import { makeBundle } from './bundle-unsafe.js';
import { prepareToBundle, resolveLocation } from './bundle-util.js';

// quote strings
const q = JSON.stringify;

const { evadeImportExpressionTest, mandatoryTransforms } = transforms;

const textDecoder = new TextDecoder();

function wrapFunctorInPrecompiledModule(unsafeFunctorSrc, compartmentName) {
  // the mandatory ses transforms will reject import expressions and html comments
  const safeFunctorSrc = mandatoryTransforms(unsafeFunctorSrc);
  const wrappedSrc = `() => (function(){
  with (this.scopeTerminator) {
  with (this.globalThis) {
    return function() {
      'use strict';
      return (
${safeFunctorSrc}
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
  const lines = entries.map(([key, value]) => `${q(key)}: ${value}`);
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
    module,
    compartment: compartmentName,
  } of locationsForSources(sources)) {
    const { bytes, parser } = module;
    const textModule = textDecoder.decode(bytes);
    const moduleData = JSON.parse(textModule);
    const { __syncModuleProgram__, source, ...otherModuleData } = moduleData;
    // record module data
    moduleRegistry[path] = otherModuleData;
    // record functor
    switch (parser) {
      case 'pre-mjs-json': {
        moduleFunctors[path] = wrapFunctorInPrecompiledModule(
          __syncModuleProgram__,
          compartmentName,
        );
        // eslint-disable-next-line no-continue
        continue;
      }
      case 'pre-cjs-json': {
        moduleFunctors[path] = wrapFunctorInPrecompiledModule(
          source,
          compartmentName,
        );
        // eslint-disable-next-line no-continue
        continue;
      }
      default: {
        throw new Error(`Unknown parser ${q(parser)}`);
      }
    }
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
    for (const { location, parser } of Object.values(modules)) {
      // ignore alias records
      if (location === undefined) {
        // eslint-disable-next-line no-continue
        continue;
      }
      const moduleLocation = resolveLocation(location, compartmentLocation);
      const path = new URL(moduleLocation).pathname.slice(1); // skip initial "/"
      const bytes = get(path);
      compartmentSources[location] = { bytes, location, parser };
    }
  }

  return makeSecureBundleFromAppContainer(compartmentMap, sources);
};
