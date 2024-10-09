/**
 * @module Provides functions for evaluating the modules in an archive (a zip
 * file with a `compartment-map.json` and a file for each module it contains.)
 *
 * These functions do not have a bias for any particular mapping, so you will
 * need to use `mapNodeModules` from `@endo/compartment-map/node-modules.js` or
 * a similar device to construct one.
 *
 * The default `parserForLanguage` mapping is empty.
 * You will need to provide the `defaultParserForLanguage` from
 * `@endo/compartment-mapper/import-parsers.js` or
 * `@endo/compartment-mapper/archive-parsers.js`.
 */

/* eslint no-shadow: "off" */

/**
 * @import {
 *   ImportHook,
 *   StaticModuleType,
 * } from 'ses';
 * @import {
 *   Application,
 *   CompartmentDescriptor,
 *   ComputeSourceLocationHook,
 *   ComputeSourceMapLocationHook,
 *   ExecuteFn,
 *   ExitModuleImportHook,
 *   HashFn,
 *   ImportHookMaker,
 *   LoadArchiveOptions,
 *   ParseArchiveOptions,
 *   ParserForLanguage,
 *   ReadFn,
 *   ReadPowers,
 *   SomeObject,
 * } from './types.js'
 */

import { ZipReader } from '@endo/zip';
import { link } from './link.js';
import { parseLocatedJson } from './json.js';
import { unpackReadPowers } from './powers.js';
import { join } from './node-module-specifier.js';
import { assertCompartmentMap } from './compartment-map.js';
import { exitModuleImportHookMaker } from './import-hook.js';
import { attenuateModuleHook, enforceModulePolicy } from './policy.js';

const { Fail, quote: q } = assert;

const textDecoder = new TextDecoder();

const { assign, create, freeze } = Object;

/**
 * @param {string} errorMessage - error to throw on execute
 * @returns {StaticModuleType}
 */
const postponeErrorToExecute = errorMessage => {
  // Return a place-holder that'd throw an error if executed
  // This allows cjs parser to more eagerly find calls to require
  // - if parser identified a require call that's a local function, execute will never be called
  // - if actual required module is missing, the error will happen anyway - at execution time

  const record = freeze({
    imports: [],
    exports: [],
    execute: () => {
      throw Error(errorMessage);
    },
  });

  return record;
};

/**
 * @param {(path: string) => Uint8Array} get
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @param {string} archiveLocation
 * @param {ParserForLanguage} parserForLanguage
 * @param {HashFn} [computeSha512]
 * @param {ComputeSourceLocationHook} [computeSourceLocation]
 * @param {ExitModuleImportHook} [exitModuleImportHook]
 * @param {ComputeSourceMapLocationHook} [computeSourceMapLocation]
 * @returns {ImportHookMaker}
 */
const makeArchiveImportHookMaker = (
  get,
  compartments,
  archiveLocation,
  parserForLanguage,
  computeSha512 = undefined,
  computeSourceLocation = undefined,
  exitModuleImportHook = undefined,
  computeSourceMapLocation = undefined,
) => {
  // per-assembly:
  /** @type {ImportHookMaker} */
  const makeImportHook = ({
    packageLocation,
    packageName,
    attenuators,
    // note `compartments` are not passed to makeImportHook because
    // the reference was passed to makeArchiveImportHookMaker.
  }) => {
    // per-compartment:
    const compartmentDescriptor = compartments[packageLocation];
    const { modules } = compartmentDescriptor;
    /** @type {ImportHook} */
    const importHook = async moduleSpecifier => {
      await null;
      // per-module:
      const module = modules[moduleSpecifier];
      if (module === undefined) {
        if (exitModuleImportHook) {
          // At this point in archive importing, if a module is not found and
          // exitModuleImportHook exists, the only possibility is that the
          // module is a "builtin" module and the policy needs to be enforced.
          enforceModulePolicy(moduleSpecifier, compartmentDescriptor, {
            exit: true,
            errorHint: `Blocked in loading. ${q(
              moduleSpecifier,
            )} was not in the archive and an attempt was made to load it as a builtin`,
          });
          const record = await exitModuleImportHook(
            moduleSpecifier,
            packageLocation,
          );
          if (record) {
            // note it's not being marked as exit in sources
            // it could get marked and the second pass, when the archive is being executed, would have the data
            // to enforce which exits can be dynamically imported
            return {
              record: await attenuateModuleHook(
                moduleSpecifier,
                record,
                compartmentDescriptor.policy,
                attenuators,
              ),
              specifier: moduleSpecifier,
            };
          } else {
            // if exitModuleImportHook is allowed, the mechanism to defer
            // errors in archive creation is never used. We don't want to
            // throw until the module execution is attempted. This is because
            // the cjs parser eagerly looks for require calls, and if it finds
            // one, it will try to import the module even if the require is
            // never reached.
            return postponeErrorToExecute(
              `Cannot find external module ${q(moduleSpecifier)} in package ${q(
                packageLocation,
              )} in archive ${q(archiveLocation)}`,
            );
          }
        }
        throw Error(
          `Cannot find module ${q(moduleSpecifier)} in package ${q(
            packageLocation,
          )} in archive ${q(archiveLocation)}`,
        );
      }
      if (module.deferredError !== undefined) {
        return postponeErrorToExecute(module.deferredError);
      }
      if (module.parser === undefined) {
        throw Error(
          `Cannot parse module ${q(moduleSpecifier)} in package ${q(
            packageLocation,
          )} in archive ${q(archiveLocation)}`,
        );
      }
      const parser = parserForLanguage[module.parser];
      if (parser === undefined) {
        throw Error(
          `Cannot parse ${q(module.parser)} module ${q(
            moduleSpecifier,
          )} in package ${q(packageLocation)} in archive ${q(archiveLocation)}`,
        );
      }
      const { parse } = parser;
      const moduleLocation = `${packageLocation}/${module.location}`;
      const moduleBytes = get(moduleLocation);

      if (computeSha512 !== undefined && module.sha512 !== undefined) {
        const sha512 = computeSha512(moduleBytes);
        if (sha512 !== module.sha512) {
          throw Error(
            `Module ${q(module.location)} of package ${q(
              packageLocation,
            )} in archive ${q(
              archiveLocation,
            )} failed a SHA-512 integrity check`,
          );
        }
      }

      let sourceLocation = `file:///${moduleLocation}`;
      if (packageName !== undefined) {
        const base = packageName.split('/').slice(-1).join('/');
        sourceLocation = `.../${join(base, moduleSpecifier)}`;
      }
      if (computeSourceLocation !== undefined) {
        sourceLocation =
          computeSourceLocation(packageLocation, moduleSpecifier) ||
          sourceLocation;
      }

      let sourceMapUrl;
      if (
        computeSourceMapLocation !== undefined &&
        module.sha512 !== undefined
      ) {
        sourceMapUrl = computeSourceMapLocation({
          compartment: packageLocation,
          module: moduleSpecifier,
          location: sourceLocation,
          sha512: module.sha512,
        });
      }

      // eslint-disable-next-line no-await-in-loop
      const { record } = await parse(
        moduleBytes,
        moduleSpecifier,
        sourceLocation,
        packageLocation,
        {
          sourceMapUrl,
          compartmentDescriptor,
        },
      );
      return { record, specifier: moduleSpecifier };
    };
    return importHook;
  };
  return makeImportHook;
};

/**
 * @param {Uint8Array} archiveBytes
 * @param {string} [archiveLocation]
 * @param {ParseArchiveOptions} [options]
 * @returns {Promise<Application>}
 */
export const parseArchive = async (
  archiveBytes,
  archiveLocation = '<unknown>',
  options = {},
) => {
  await null;
  const {
    computeSha512 = undefined,
    expectedSha512 = undefined,
    computeSourceLocation = undefined,
    computeSourceMapLocation = undefined,
    Compartment: CompartmentParseOption = Compartment,
    modules = undefined,
    importHook: exitModuleImportHook = undefined,
    parserForLanguage: parserForLanguageOption = {},
    __native__ = false,
  } = options;

  const parserForLanguage = freeze(
    assign(create(null), parserForLanguageOption),
  );

  const archive = new ZipReader(archiveBytes, { name: archiveLocation });

  // Track all modules that get loaded, all files that are used.
  const unseen = new Set(archive.files.keys());
  unseen.size >= 2 ||
    Fail`Archive failed sanity check: should contain at least a compartment map file and one module file in ${q(
      archiveLocation,
    )}`;

  /**
   * @param {string} path
   */
  const get = path => {
    unseen.delete(path);
    return archive.read(path);
  };

  const compartmentMapBytes = get('compartment-map.json');

  let sha512;
  if (computeSha512 !== undefined) {
    sha512 = computeSha512(compartmentMapBytes);
  }
  if (expectedSha512 !== undefined) {
    if (sha512 === undefined) {
      throw Error(
        `Cannot verify expectedSha512 without also providing computeSha512, for archive ${archiveLocation}`,
      );
    }
    if (sha512 !== expectedSha512) {
      throw Error(
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

  const {
    compartments,
    entry: { module: entryModuleSpecifier, compartment: entryCompartmentName },
  } = compartmentMap;

  const compartmentExitModuleImportHook = exitModuleImportHookMaker({
    modules,
    exitModuleImportHook,
    entryCompartmentName,
  });

  // Archive integrity checks: ensure every module is pre-loaded so its hash
  // gets checked, and ensure that every file in the archive is used, and
  // therefore checked.
  if (computeSha512 !== undefined) {
    const makeImportHook = makeArchiveImportHookMaker(
      get,
      compartments,
      archiveLocation,
      parserForLanguage,
      computeSha512,
      computeSourceLocation,
      compartmentExitModuleImportHook,
      computeSourceMapLocation,
    );
    // A weakness of the current Compartment design is that the `modules` map
    // must be given a module namespace object that passes a brand check.
    // We don't have module instances for the preload phase, so we supply fake
    // namespaces.
    const { compartment, pendingJobsPromise } = link(compartmentMap, {
      makeImportHook,
      parserForLanguage,
      modules: Object.fromEntries(
        Object.keys(modules || {}).map(specifier => {
          return [specifier, { namespace: {} }];
        }),
      ),
      Compartment: CompartmentParseOption,
      __native__,
    });

    await pendingJobsPromise;

    await compartment.load(entryModuleSpecifier);
    unseen.size === 0 ||
      Fail`Archive contains extraneous files: ${q([...unseen])} in ${q(
        archiveLocation,
      )}`;
  }

  /** @type {ExecuteFn} */
  const execute = async options => {
    const {
      globals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment: CompartmentOption = CompartmentParseOption,
      __native__,
      importHook: exitModuleImportHook,
    } = options || {};

    const compartmentExitModuleImportHook = exitModuleImportHookMaker({
      modules,
      exitModuleImportHook,
      entryCompartmentName,
    });
    const makeImportHook = makeArchiveImportHookMaker(
      get,
      compartments,
      archiveLocation,
      parserForLanguage,
      computeSha512,
      computeSourceLocation,
      compartmentExitModuleImportHook,
      computeSourceMapLocation,
    );
    const { compartment, pendingJobsPromise } = link(compartmentMap, {
      makeImportHook,
      parserForLanguage,
      globals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment: CompartmentOption,
      __native__,
    });

    await pendingJobsPromise;

    // eslint-disable-next-line dot-notation
    return compartment['import'](entryModuleSpecifier);
  };

  return { import: execute, sha512 };
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {LoadArchiveOptions} [options]
 * @returns {Promise<Application>}
 */
export const loadArchive = async (
  readPowers,
  archiveLocation,
  options = {},
) => {
  const { read, computeSha512 } = unpackReadPowers(readPowers);
  const {
    expectedSha512,
    computeSourceLocation,
    modules,
    computeSourceMapLocation,
    parserForLanguage,
  } = options;
  const archiveBytes = await read(archiveLocation);
  return parseArchive(archiveBytes, archiveLocation, {
    computeSha512,
    expectedSha512,
    computeSourceLocation,
    modules,
    computeSourceMapLocation,
    parserForLanguage,
  });
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {LoadArchiveOptions} options
 * @returns {Promise<SomeObject>}
 */
export const importArchive = async (readPowers, archiveLocation, options) => {
  const archive = await loadArchive(readPowers, archiveLocation, options);
  return archive.import(options);
};
