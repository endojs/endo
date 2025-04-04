/**
 * Provides functions for evaluating a module and its transitive
 * dependencies given a partially completed compartment map.
 * The compartment map needs to describe every reachable compartment, where to
 * find modules in that compartment, and how to link modules between
 * compartments, but does not need to capture a module descriptor for every
 * module in the working set of transitive dependencies from the entry module.
 *
 * These functions do not have a bias for any particular mapping, so you will
 * need to use `mapNodeModules` from `@endo/compartment-map/node-modules.js` or
 * a similar device to construct one.
 *
 * The default `parserForLanguage` mapping is empty.
 * You will need to provide the `defaultParserForLanguage` from
 * `@endo/compartment-mapper/import-parsers.js` or similar.
 *
 * @module
 */

/* eslint no-shadow: "off" */

/**
 * @import {
 *   CompartmentMapDescriptor,
 *   SyncImportLocationOptions,
 *   ImportNowHookMaker,
 *   ReadNowPowers,
 *   Application,
 *   ImportLocationOptions,
 *   ExecuteFn,
 *   ReadFn,
 *   ReadPowers,
 *   SomeObject,
 * } from './types.js'
 */

import { link } from './link.js';
import {
  exitModuleImportHookMaker,
  makeImportHookMaker,
  makeImportNowHookMaker,
} from './import-hook.js';
import { isReadNowPowers } from './powers.js';

const { assign, create, freeze, entries } = Object;

/**
 * Returns `true` if `value` is a {@link SyncImportLocationOptions}.
 *
 * The requirements here are:
 * - `moduleTransforms` _is not_ present in `value`
 * - `parserForLanguage` - if set, contains synchronous parsers only
 *
 * @param {ImportLocationOptions|SyncImportLocationOptions} value
 * @returns {value is SyncImportLocationOptions}
 */
const isSyncOptions = value => {
  if (!value || (typeof value === 'object' && !('moduleTransforms' in value))) {
    if (value.parserForLanguage) {
      for (const [_language, { synchronous }] of entries(
        value.parserForLanguage,
      )) {
        if (!synchronous) {
          return false;
        }
      }
    }
    return true;
  }
  return false;
};

/**
 * @overload
 * @param {ReadNowPowers} readPowers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {SyncImportLocationOptions} [opts]
 * @returns {Promise<Application>}
 */

/**
 * @overload
 * @param {ReadFn | ReadPowers} readPowers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ImportLocationOptions} [opts]
 * @returns {Promise<Application>}
 */

/**
 * @param {ReadFn|ReadPowers|ReadNowPowers} readPowers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ImportLocationOptions} [options]
 * @returns {Promise<Application>}
 */

export const loadFromMap = async (readPowers, compartmentMap, options = {}) => {
  const {
    searchSuffixes = undefined,
    parserForLanguage: parserForLanguageOption = {},
    Compartment: LoadCompartmentOption = Compartment,
  } = options;

  const parserForLanguage = freeze(
    assign(create(null), parserForLanguageOption),
  );

  /**
   * Object containing options and read powers that fulfills all requirements
   * for creation of a {@link ImportNowHookMaker}, thus enabling dynamic import.
   *
   * @typedef SyncBehavior
   * @property {ReadNowPowers} readPowers
   * @property {SyncImportLocationOptions} options
   * @property {'SYNC'} type
   */

  /**
   * Object containing options and read powers which is incompatible with
   * creation of an {@link ImportNowHookMaker}, thus disabling dynamic import.
   *
   * @typedef AsyncBehavior
   * @property {ReadFn|ReadPowers} readPowers
   * @property {ImportLocationOptions} options
   * @property {'ASYNC'} type
   */

  /**
   * When we must control flow based on _n_ type guards consdering _n_ discrete
   * values, grouping the values into an object, then leveraging a discriminated
   * union (the `type` property) is one way to approach the problem.
   */
  const behavior =
    isReadNowPowers(readPowers) && isSyncOptions(options)
      ? /** @type {SyncBehavior} */ ({
          readPowers,
          options: options || {},
          type: 'SYNC',
        })
      : /** @type {AsyncBehavior} */ ({
          readPowers,
          options: options || {},
          type: 'ASYNC',
        });

  const {
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;

  /** @type {ExecuteFn} */
  const execute = async (options = {}) => {
    const {
      globals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment: CompartmentOption = LoadCompartmentOption,
      __native__,
      importHook: exitModuleImportHook,
    } = options;
    const compartmentExitModuleImportHook = exitModuleImportHookMaker({
      modules,
      exitModuleImportHook,
      entryCompartmentName,
    });
    const makeImportHook = makeImportHookMaker(
      readPowers,
      entryCompartmentName,
      {
        compartmentDescriptors: compartmentMap.compartments,
        searchSuffixes,
        archiveOnly: false,
        entryCompartmentName,
        entryModuleSpecifier,
        importHook: compartmentExitModuleImportHook,
      },
    );

    /** @type {ImportNowHookMaker | undefined} */
    let makeImportNowHook;

    /** @type {Compartment} */
    let compartment;
    /** @type {Promise<void>} */
    let pendingJobsPromise;

    if (behavior.type === 'SYNC') {
      const { importNowHook: exitModuleImportNowHook, syncModuleTransforms } =
        behavior.options;
      makeImportNowHook = makeImportNowHookMaker(
        /** @type {ReadNowPowers} */ (readPowers),
        entryCompartmentName,
        {
          entryCompartmentName,
          entryModuleSpecifier,
          compartmentDescriptors: compartmentMap.compartments,
          searchSuffixes,
          importNowHook: exitModuleImportNowHook,
        },
      );
      ({ compartment, pendingJobsPromise } = link(compartmentMap, {
        makeImportHook,
        makeImportNowHook,
        parserForLanguage,
        globals,
        transforms,
        syncModuleTransforms,
        __shimTransforms__,
        Compartment: CompartmentOption,
        __native__,
      }));
    } else {
      // sync module transforms are allowed, because they are "compatible"
      // with async module transforms (not vice-versa)
      const { moduleTransforms, syncModuleTransforms } = behavior.options;
      ({ compartment, pendingJobsPromise } = link(compartmentMap, {
        makeImportHook,
        parserForLanguage,
        globals,
        transforms,
        moduleTransforms,
        syncModuleTransforms,
        __shimTransforms__,
        Compartment: CompartmentOption,
        __native__,
      }));
    }

    await pendingJobsPromise;

    return compartment.import(entryModuleSpecifier);
  };

  return { import: execute };
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ImportLocationOptions} [options]
 * @returns {Promise<SomeObject>} the object of the imported modules exported
 * names.
 */
export const importFromMap = async (
  readPowers,
  compartmentMap,
  options = {},
) => {
  const application = await loadFromMap(readPowers, compartmentMap, options);
  return application.import(options);
};
