/**
 * @module
 * This module provides {@link captureFromMap}, which only "captures" the
 * compartment map descriptors and sources from a partially completed
 * compartment map--_without_ creating an archive. The resulting compartment map
 * represents a well-formed dependency graph, laden with useful metadata. This,
 * for example, could be used for automatic policy generation.
 *
 * The resulting data structure ({@link CaptureResult}) contains a
 * mapping of filepaths to compartment map names.
 *
 * These functions do not have a bias for any particular mapping, so you will
 * need to use `mapNodeModules` from `@endo/compartment-map/node-modules.js` or
 * a similar device to construct one. The default `parserForLanguage` mapping is
 * empty. You will need to provide the `defaultParserForLanguage` from
 * `@endo/compartment-mapper/import-parsers.js` or
 * `@endo/compartment-mapper/archive-parsers.js`.
 *
 * If you use `@endo/compartment-mapper/archive-parsers.js`, the archive will
 * contain pre-compiled ESM and CJS modules wrapped in a JSON envelope, suitable
 * for use with the SES shim in any environment including a web page, without a
 * client-side dependency on Babel.
 *
 * If you use `@endo/compartment-mapper/import-parsers.js`, the archive will
 * contain original sources, so to import the archive with
 * `src/import-archive-lite.js`, you will need to provide the archive parsers
 * and entrain a runtime dependency on Babel.
 */

/* eslint no-shadow: 0 */

/**
 * @import {
 *   CaptureLiteOptions,
 *   CaptureResult,
 *   CompartmentMapDescriptor,
 *   ReadFn,
 *   ReadPowers,
 *   Sources,
 * } from './types.js'
 */

import {
  exitModuleImportHookMaker,
  makeImportHookMaker,
} from './import-hook.js';
import { link } from './link.js';
import { resolve } from './node-module-specifier.js';
import { detectAttenuators } from './policy.js';
import { unpackReadPowers } from './powers.js';
import { digestCompartmentMap } from './digest.js';

const { freeze, assign, create } = Object;

const defaultCompartment = Compartment;

/**
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {Sources} sources
 * @returns {CaptureResult}
 */
const captureCompartmentMap = (compartmentMap, sources) => {
  const {
    compartmentMap: captureCompartmentMap,
    sources: captureSources,
    newToOldCompartmentNames,
    compartmentRenames,
    oldToNewCompartmentNames,
  } = digestCompartmentMap(compartmentMap, sources);
  return {
    captureCompartmentMap,
    captureSources,
    compartmentRenames,
    newToOldCompartmentNames,
    oldToNewCompartmentNames,
  };
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {CaptureLiteOptions} [options]
 * @returns {Promise<CaptureResult>}
 */
export const captureFromMap = async (powers, compartmentMap, options = {}) => {
  const {
    moduleTransforms,
    syncModuleTransforms,
    modules: exitModules = {},
    searchSuffixes = undefined,
    importHook: exitModuleImportHook = undefined,
    policy = undefined,
    sourceMapHook = undefined,
    parserForLanguage: parserForLanguageOption = {},
    Compartment = defaultCompartment,
  } = options;

  const parserForLanguage = freeze(
    assign(create(null), parserForLanguageOption),
  );

  const { read, computeSha512 } = unpackReadPowers(powers);

  const {
    compartments,
    entry: { module: entryModuleSpecifier, compartment: entryCompartmentName },
  } = compartmentMap;

  /** @type {Sources} */
  const sources = Object.create(null);

  const consolidatedExitModuleImportHook = exitModuleImportHookMaker({
    modules: exitModules,
    exitModuleImportHook,
    entryCompartmentName,
  });

  const makeImportHook = makeImportHookMaker(read, entryCompartmentName, {
    sources,
    compartmentDescriptors: compartments,
    archiveOnly: true,
    computeSha512,
    searchSuffixes,
    entryCompartmentName,
    entryModuleSpecifier,
    exitModuleImportHook: consolidatedExitModuleImportHook,
    sourceMapHook,
  });
  // Induce importHook to record all the necessary modules to import the given module specifier.
  const { compartment, attenuatorsCompartment } = link(compartmentMap, {
    resolve,
    makeImportHook,
    moduleTransforms,
    syncModuleTransforms,
    parserForLanguage,
    archiveOnly: true,
    Compartment,
  });
  await compartment.load(entryModuleSpecifier);
  if (policy) {
    // retain all attenuators.
    await Promise.all(
      detectAttenuators(policy).map(attenuatorSpecifier =>
        attenuatorsCompartment.load(attenuatorSpecifier),
      ),
    );
  }

  return captureCompartmentMap(compartmentMap, sources);
};
