/**
 *
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
 *
 * @module
 */

/* eslint no-shadow: 0 */
/* global globalThis */

/**
 * @import {
 *   CaptureLiteOptions,
 *   CaptureResult,
 *   CompartmentMapDescriptor,
 *   PreloadOption,
 *   LogFn,
 *   LogOptions,
 *   PolicyOption,
 *   ReadFn,
 *   ReadPowers,
 *   Sources,
 * } from './types.js'
 */

import { digestCompartmentMap } from './digest.js';
import {
  exitModuleImportHookMaker,
  makeImportHookMaker,
} from './import-hook.js';
import { link } from './link.js';
import { resolve } from './node-module-specifier.js';
import { ATTENUATORS_COMPARTMENT } from './policy-format.js';
import { detectAttenuators } from './policy.js';
import { unpackReadPowers } from './powers.js';

const { freeze, assign, create, keys } = Object;
const { stringify: q } = JSON;

const DefaultCompartment = /** @type {typeof Compartment} */ (
  // @ts-expect-error globalThis.Compartment is definitely on globalThis.
  globalThis.Compartment
);

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
 * @type {LogFn}
 */
const noop = () => {};

/**
 * The name of the module to preload if no entry is provided in a {@link PreloadOption} array
 */
const DEFAULT_PRELOAD_ENTRY = '.';

/**
 * Factory for a function that loads compartments.
 *
 * @param {CompartmentMapDescriptor} compartmentMap Compartment map
 * @param {Sources} sources Sources
 * @param {LogOptions & PolicyOption & PreloadOption} [options]
 * @returns {(linkedCompartments: Record<string, Compartment>, entryCompartment: Compartment, attenuatorsCompartment: Compartment) => Promise<void>}
 */
const makePreloader = (
  compartmentMap,
  sources,
  { log = noop, policy, _preload: preload = [] } = {},
) => {
  const {
    entry: { module: entryModuleSpecifier },
  } = compartmentMap;

  /**
   * Given {@link CompartmentDescriptor CompartmentDescriptors}, loads any which
   * a) are present in the {@link preload forceLoad array}, and b) have not
   * yet been loaded.
   *
   * Will not load the "attenuators" `Compartment`, nor will it load any
   * `Compartment` having a non-empty value in `sources` (since it is presumed
   * it has already been loaded).
   *
   * @param {Record<string, Compartment>} compartments
   * @returns {Promise<void>} Resolves when all appropriate compartments are
   * loaded.
   */
  const preloader = async compartments => {
    /** @type {[compartmentName: string, compartment: Compartment, moduleSpecifier: string][]} */
    const compartmentsToLoad = [];
    for (const preloadValue of preload) {
      /** @type {string} */
      let compartmentName;
      /** @type {string} */
      let entry;
      if (typeof preloadValue === 'string') {
        compartmentName = preloadValue;
        entry = DEFAULT_PRELOAD_ENTRY;
      } else {
        compartmentName = preloadValue.compartment;
        entry = preloadValue.entry;
      }

      // skip; should already be loaded
      if (
        compartmentName === ATTENUATORS_COMPARTMENT ||
        compartmentName === compartmentMap.entry.compartment
      ) {
        // skip
      } else {
        const compartmentDescriptor =
          compartmentMap.compartments[compartmentName];

        if (!compartmentDescriptor) {
          throw new ReferenceError(
            `Failed attempting to force-load unknown compartment ${q(compartmentName)}`,
          );
        }

        const compartmentSources = sources[compartmentName];

        if (keys(compartmentSources).length) {
          log(
            `Refusing to force-load Compartment ${q(compartmentName)}; already loaded`,
          );
        } else {
          const compartment = compartments[compartmentName];
          if (!compartment) {
            throw new ReferenceError(
              `No compartment found for ${q(compartmentName)}`,
            );
          }

          compartmentsToLoad.push([compartmentName, compartment, entry]);
        }
      }
    }

    const { length: compartmentsToLoadCount } = compartmentsToLoad;

    /**
     * This index increments in the order in which compartments finish
     * loading—_not_ the order in which they began loading.
     */
    let loadedCompartmentIndex = 0;
    await Promise.all(
      compartmentsToLoad.map(
        async ([compartmentName, compartment, moduleSpecifier]) => {
          await compartment.load(moduleSpecifier);
          loadedCompartmentIndex += 1;
          log(
            `Force-loaded Compartment: ${q(compartmentName)} (${loadedCompartmentIndex}/${compartmentsToLoadCount})`,
          );
        },
      ),
    );
  };

  /**
   * Loads, in order:
   *
   * 1. The entry compartment
   * 2. The attenuators compartment (_if and only if_ `policy` was provided)
   * 3. All modules scheduled for preloading
   *
   * @param {Record<string, Compartment>} linkedCompartments
   * @param {Compartment} entryCompartment
   * @param {Compartment} attenuatorsCompartment
   * @returns {Promise<void>} Resolves when all compartments are loaded.
   */
  const loadCompartments = async (
    linkedCompartments,
    entryCompartment,
    attenuatorsCompartment,
  ) => {
    await entryCompartment.load(entryModuleSpecifier);

    if (policy) {
      // retain all attenuators.
      await Promise.all(
        detectAttenuators(policy).map(attenuatorSpecifier =>
          attenuatorsCompartment.load(attenuatorSpecifier),
        ),
      );
    }

    await preloader(linkedCompartments);
  };

  return loadCompartments;
};

/**
 * "Captures" the compartment map descriptors and sources from a partially
 * completed compartment map—_without_ creating an archive.
 *
 * The resulting compartment map represents a well-formed dependency graph,
 * laden with useful metadata. This, for example, could be used for automatic
 * policy generation.
 *
 * @param {ReadFn | ReadPowers} readPowers Powers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {CaptureLiteOptions} [options]
 * @returns {Promise<CaptureResult>}
 */
export const captureFromMap = async (
  readPowers,
  compartmentMap,
  options = {},
) => {
  const {
    moduleTransforms,
    syncModuleTransforms,
    modules: exitModules = {},
    searchSuffixes = undefined,
    importHook: exitModuleImportHook = undefined,
    policy = undefined,
    sourceMapHook = undefined,
    parserForLanguage: parserForLanguageOption = {},
    Compartment: CompartmentOption = DefaultCompartment,
    log = noop,
    _preload: preload = [],
  } = options;
  const parserForLanguage = freeze(
    assign(create(null), parserForLanguageOption),
  );

  const { read, computeSha512 } = unpackReadPowers(readPowers);

  const {
    compartments,
    entry: { module: entryModuleSpecifier, compartment: entryCompartmentName },
  } = compartmentMap;

  /** @type {Sources} */
  const sources = Object.create(null);

  const loadCompartments = makePreloader(compartmentMap, sources, {
    log,
    policy,
    _preload: preload,
  });

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
    importHook: consolidatedExitModuleImportHook,
    sourceMapHook,
  });

  // Induce importHook to record all the necessary modules to import the given module specifier.
  const {
    compartment: entryCompartment,
    compartments: linkedCompartments,
    attenuatorsCompartment,
  } = link(compartmentMap, {
    resolve,
    makeImportHook,
    moduleTransforms,
    syncModuleTransforms,
    parserForLanguage,
    archiveOnly: true,
    Compartment: CompartmentOption,
  });

  await loadCompartments(
    linkedCompartments,
    entryCompartment,
    attenuatorsCompartment,
  );

  return captureCompartmentMap(compartmentMap, sources);
};
