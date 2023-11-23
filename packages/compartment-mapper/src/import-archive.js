// @ts-check
/* eslint no-shadow: "off" */

import { ZipReader } from '@endo/zip';
import { link } from './link.js';
import parserPreCjs from './parse-pre-cjs.js';
import parserJson from './parse-json.js';
import parserText from './parse-text.js';
import parserBytes from './parse-bytes.js';
import parserPreMjs from './parse-pre-mjs.js';
import { parseLocatedJson } from './json.js';
import { unpackReadPowers } from './powers.js';
import { join } from './node-module-specifier.js';
import { assertCompartmentMap } from './compartment-map.js';
import { exitModuleImportHookMaker } from './import-hook.js';
import { attenuateModuleHook, enforceModulePolicy } from './policy.js';

const DefaultCompartment = Compartment;

const { Fail, quote: q } = assert;

const textDecoder = new TextDecoder();

const { freeze } = Object;

/** @type {Record<string, import('./types.js').ParserImplementation>} */
const parserForLanguage = {
  'pre-cjs-json': parserPreCjs,
  'pre-mjs-json': parserPreMjs,
  json: parserJson,
  text: parserText,
  bytes: parserBytes,
};

/**
 * @param {string} errorMessage - error to throw on execute
 * @returns {import('./types.js').StaticModuleType}
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
 * @param {Record<string, import('./types.js').CompartmentDescriptor>} compartments
 * @param {string} archiveLocation
 * @param {import('./types.js').HashFn} [computeSha512]
 * @param {import('./types.js').ComputeSourceLocationHook} [computeSourceLocation]
 * @param {import('./types.js').ExitModuleImportHook} [exitModuleImportHook]
 * @param {import('./types.js').ComputeSourceMapLocationHook} [computeSourceMapLocation]
 * @returns {import('./types.js').ImportHookMaker}
 */
const makeArchiveImportHookMaker = (
  get,
  compartments,
  archiveLocation,
  computeSha512 = undefined,
  computeSourceLocation = undefined,
  exitModuleImportHook = undefined,
  computeSourceMapLocation = undefined,
) => {
  // per-assembly:
  /** @type {import('./types.js').ImportHookMaker} */
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
    /** @type {import('ses').ImportHook} */
    const importHook = async moduleSpecifier => {
      // per-module:
      const module = modules[moduleSpecifier];
      if (module === undefined) {
        if (exitModuleImportHook) {
          // At this point in archive importing, if a module is not found and
          // exitModuleImportHook exists, the only possibility is that the
          // module is a "builtin" module and the policy needs to be enforced.
          enforceModulePolicy(moduleSpecifier, compartmentDescriptor, {
            exit: true,
            errorHint: 'The module was not in the archive and an attempt was made to load it as a builtin',
          });
          const record = await exitModuleImportHook(moduleSpecifier);
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
      if (parserForLanguage[module.parser] === undefined) {
        throw Error(
          `Cannot parse ${q(module.parser)} module ${q(
            moduleSpecifier,
          )} in package ${q(packageLocation)} in archive ${q(archiveLocation)}`,
        );
      }
      const { parse } = parserForLanguage[module.parser];
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
        },
      );
      return { record, specifier: moduleSpecifier };
    };
    return importHook;
  };
  return makeImportHook;
};

const makeFeauxModuleExportsNamespace = Compartment => {
  // @ts-ignore Unclear at time of writing why Compartment type is not
  // constructible.
  const compartment = new Compartment(
    {},
    {},
    {
      resolveHook() {
        return '.';
      },
      importHook() {
        return {
          imports: [],
          execute() {},
        };
      },
    },
  );
  return compartment.module('.');
};

// Have to give it a name to capture the external meaning of Compartment
// Otherwise @param {typeof Compartment} takes the Compartment to mean
// the const variable defined within the function.
/** @typedef {typeof Compartment} CompartmentConstructor */

/**
 * @param {Uint8Array} archiveBytes
 * @param {string} [archiveLocation]
 * @param {object} [options]
 * @param {string} [options.expectedSha512]
 * @param {import('./types.js').HashFn} [options.computeSha512]
 * @param {Record<string, unknown>} [options.modules]
 * @param {import('./types.js').ExitModuleImportHook} [options.importHook]
 * @param {CompartmentConstructor} [options.Compartment]
 * @param {import('./types.js').ComputeSourceLocationHook} [options.computeSourceLocation]
 * @param {import('./types.js').ComputeSourceMapLocationHook} [options.computeSourceMapLocation]
 * @returns {Promise<import('./types.js').Application>}
 */
export const parseArchive = async (
  archiveBytes,
  archiveLocation = '<unknown>',
  options = {},
) => {
  const {
    computeSha512 = undefined,
    expectedSha512 = undefined,
    computeSourceLocation = undefined,
    computeSourceMapLocation = undefined,
    Compartment = DefaultCompartment,
    modules = undefined,
    importHook: exitModuleImportHook = undefined,
  } = options;

  const compartmentExitModuleImportHook = exitModuleImportHookMaker({
    modules,
    exitModuleImportHook,
  });

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
    entry: { module: moduleSpecifier },
  } = compartmentMap;

  // Archive integrity checks: ensure every module is pre-loaded so its hash
  // gets checked, and ensure that every file in the archive is used, and
  // therefore checked.
  if (computeSha512 !== undefined) {
    const makeImportHook = makeArchiveImportHookMaker(
      get,
      compartments,
      archiveLocation,
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
          return [specifier, makeFeauxModuleExportsNamespace(Compartment)];
        }),
      ),
      Compartment,
    });

    await pendingJobsPromise;

    await compartment.load(moduleSpecifier);
    unseen.size === 0 ||
      Fail`Archive contains extraneous files: ${q([...unseen])} in ${q(
        archiveLocation,
      )}`;
  }

  /** @type {import('./types.js').ExecuteFn} */
  const execute = async options => {
    const {
      globals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment,
      importHook: exitModuleImportHook,
    } = options || {};

    const compartmentExitModuleImportHook = exitModuleImportHookMaker({
      modules,
      exitModuleImportHook,
    });
    const makeImportHook = makeArchiveImportHookMaker(
      get,
      compartments,
      archiveLocation,
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
      Compartment,
    });

    await pendingJobsPromise;

    // eslint-disable-next-line dot-notation
    return compartment['import'](moduleSpecifier);
  };

  return { import: execute, sha512 };
};

/**
 * @param {import('./types.js').ReadFn | import('./types.js').ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {import('./types.js').LoadArchiveOptions} [options]
 * @returns {Promise<import('./types.js').Application>}
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
  } = options;
  const archiveBytes = await read(archiveLocation);
  return parseArchive(archiveBytes, archiveLocation, {
    computeSha512,
    expectedSha512,
    computeSourceLocation,
    modules,
    computeSourceMapLocation,
  });
};

/**
 * @param {import('./types.js').ReadFn | import('./types.js').ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {import('./types.js').ExecuteOptions & import('./types.js').LoadArchiveOptions} options
 * @returns {Promise<object>}
 */
export const importArchive = async (readPowers, archiveLocation, options) => {
  const archive = await loadArchive(readPowers, archiveLocation, options);
  return archive.import(options);
};
