// @ts-check
/* eslint no-shadow: 0 */

/** @typedef {import('ses').ResolveHook} ResolveHook */
/** @typedef {import('./types.js').ParserImplementation} ParserImplementation */
/** @typedef {import('./types.js').CompartmentMapDescriptor} CompartmentMapDescriptor */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').ModuleTransforms} ModuleTransforms */
/** @typedef {import('./types.js').Sources} Sources */

import { resolve } from './node-module-specifier.js';
import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { link } from './link.js';
import { makeImportHookMaker } from './import-hook.js';
import { parseLocatedJson } from './json.js';
import parserJson from './parse-json.js';
import parserText from './parse-text.js';
import parserBytes from './parse-bytes.js';
import parserArchiveCjs from './parse-archive-cjs.js';
import parserArchiveMjs from './parse-archive-mjs.js';

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
export const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

/** @type {Record<string, ParserImplementation>} */
export const parserForLanguage = {
  mjs: parserArchiveMjs,
  'pre-mjs-json': parserArchiveMjs,
  cjs: parserArchiveCjs,
  'pre-cjs-json': parserArchiveCjs,
  json: parserJson,
  text: parserText,
  bytes: parserBytes,
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
