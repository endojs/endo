/* Provides functions to create an archive (zip file with a
 * compartment-map.json) from a partially completed compartment map (it must
 * mention all packages/compartments as well as inter-compartment references
 * but does not contain an entry for every module reachable from its entry
 * module) and the means to read them from the containing file system.
 *
 * These functions do not have a bias for any particular mapping, so you will
 * need to use `mapNodeModules` from `@endo/compartment-map/node-modules.js` or
 * a similar device to construct one.
 *
 * The default `parserForLanguage` mapping is empty.
 * You will need to provide the `defaultParserForLanguage` from
 * `@endo/compartment-mapper/import-parsers.js` or
 * `@endo/compartment-mapper/archive-parsers.js`.
 *
 * If you use `@endo/compartment-mapper/archive-parsers.js`, the archive
 * will contain pre-compiled ESM and CJS modules wrapped in a JSON
 * envelope, suitable for use with the SES shim in any environment
 * including a web page, without a client-side dependency on Babel.
 *
 * If you use `@endo/compartment-mapper/import-parsers.js`, the archive
 * will contain original sources, so to import the archive with
 * `src/import-archive-lite.js`, you will need to provide the archive parsers
 * and entrain a runtime dependency on Babel.
 *
 * In fruition of https://github.com/endojs/endo/issues/400, we will be able to
 * use original source archives on XS and Node.js, but not on the web until the
 * web platform makes further progress on virtual module loaers.
 */

/* eslint no-shadow: 0 */

/**
 * @import {
 *   ArchiveLiteOptions,
 *   ArchiveResult,
 *   ArchiveWriter,
 *   CaptureSourceLocationHook,
 *   CompartmentMapDescriptor,
 *   HashPowers,
 *   ReadFn,
 *   ReadPowers,
 *   Sources,
 *   WriteFn,
 * } from './types.js'
 */

import { writeZip } from '@endo/zip';
import { resolve } from './node-module-specifier.js';
import { link } from './link.js';
import {
  exitModuleImportHookMaker,
  makeImportHookMaker,
} from './import-hook.js';
import { unpackReadPowers } from './powers.js';
import { detectAttenuators } from './policy.js';
import { digestCompartmentMap } from './digest.js';

const textEncoder = new TextEncoder();

const { assign, create, freeze } = Object;

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

const { keys } = Object;

/**
 * @param {ArchiveWriter} archive
 * @param {Sources} sources
 */
const addSourcesToArchive = async (archive, sources) => {
  await null;
  for (const compartment of keys(sources).sort()) {
    const modules = sources[compartment];
    const compartmentLocation = resolveLocation(`${compartment}/`, 'file:///');
    for (const specifier of keys(modules).sort()) {
      const { bytes, location } = modules[specifier];
      if (location !== undefined) {
        const moduleLocation = resolveLocation(location, compartmentLocation);
        const path = new URL(moduleLocation).pathname.slice(1); // elide initial "/"
        if (bytes !== undefined) {
          // eslint-disable-next-line no-await-in-loop
          await archive.write(path, bytes);
        }
      }
    }
  }
};

/**
 * @param {Sources} sources
 * @param {CaptureSourceLocationHook} captureSourceLocation
 */
const captureSourceLocations = async (sources, captureSourceLocation) => {
  for (const compartmentName of keys(sources).sort()) {
    const modules = sources[compartmentName];
    for (const moduleSpecifier of keys(modules).sort()) {
      const { sourceLocation } = modules[moduleSpecifier];
      if (sourceLocation !== undefined) {
        captureSourceLocation(compartmentName, moduleSpecifier, sourceLocation);
      }
    }
  }
};

/**
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {Sources} sources
 * @returns {ArchiveResult}
 */
export const makeArchiveCompartmentMap = (compartmentMap, sources) => {
  const {
    compartmentMap: archiveCompartmentMap,
    sources: archiveSources,
    oldToNewCompartmentNames,
    newToOldCompartmentNames,
    compartmentRenames,
  } = digestCompartmentMap(compartmentMap, sources);
  return {
    archiveCompartmentMap,
    archiveSources,
    oldToNewCompartmentNames,
    newToOldCompartmentNames,
    compartmentRenames,
  };
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ArchiveLiteOptions} [options]
 * @returns {Promise<{sources: Sources, compartmentMapBytes: Uint8Array, sha512?: string}>}
 */
const digestFromMap = async (powers, compartmentMap, options = {}) => {
  const {
    moduleTransforms,
    modules: exitModules = {},
    captureSourceLocation = undefined,
    searchSuffixes = undefined,
    importHook: exitModuleImportHook = undefined,
    policy = undefined,
    sourceMapHook = undefined,
    parserForLanguage: parserForLanguageOption = {},
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
    parserForLanguage,
    archiveOnly: true,
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

  const { archiveCompartmentMap, archiveSources } = makeArchiveCompartmentMap(
    compartmentMap,
    sources,
  );

  const archiveCompartmentMapText = JSON.stringify(
    archiveCompartmentMap,
    null,
    2,
  );
  const archiveCompartmentMapBytes = textEncoder.encode(
    archiveCompartmentMapText,
  );

  if (captureSourceLocation !== undefined) {
    captureSourceLocations(archiveSources, captureSourceLocation);
  }

  let archiveSha512;
  if (computeSha512 !== undefined) {
    archiveSha512 = computeSha512(archiveCompartmentMapBytes);
  }

  return {
    compartmentMapBytes: archiveCompartmentMapBytes,
    sources: archiveSources,
    sha512: archiveSha512,
  };
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ArchiveLiteOptions} [options]
 * @returns {Promise<{bytes: Uint8Array, sha512?: string}>}
 */
export const makeAndHashArchiveFromMap = async (
  powers,
  compartmentMap,
  options,
) => {
  const { compartmentMapBytes, sources, sha512 } = await digestFromMap(
    powers,
    compartmentMap,
    options,
  );

  const archive = writeZip();
  await archive.write('compartment-map.json', compartmentMapBytes);
  await addSourcesToArchive(archive, sources);
  const bytes = await archive.snapshot();

  return { bytes, sha512 };
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ArchiveLiteOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export const makeArchiveFromMap = async (powers, compartmentMap, options) => {
  const { bytes } = await makeAndHashArchiveFromMap(
    powers,
    compartmentMap,
    options,
  );
  return bytes;
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ArchiveLiteOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export const mapFromMap = async (powers, compartmentMap, options) => {
  const { compartmentMapBytes } = await digestFromMap(
    powers,
    compartmentMap,
    options,
  );
  return compartmentMapBytes;
};

/**
 * @param {HashPowers} powers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ArchiveLiteOptions} [options]
 * @returns {Promise<string>}
 */
export const hashFromMap = async (powers, compartmentMap, options) => {
  const { compartmentMapBytes } = await digestFromMap(
    powers,
    compartmentMap,
    options,
  );
  const { computeSha512 } = powers;
  return computeSha512(compartmentMapBytes);
};

/**
 * @param {WriteFn} write
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ArchiveLiteOptions} [options]
 */
export const writeArchiveFromMap = async (
  write,
  readPowers,
  archiveLocation,
  compartmentMap,
  options,
) => {
  const archiveBytes = await makeArchiveFromMap(
    readPowers,
    compartmentMap,
    options,
  );
  await write(archiveLocation, archiveBytes);
};
