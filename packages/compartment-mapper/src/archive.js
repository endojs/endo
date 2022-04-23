// @ts-check
/* eslint no-shadow: 0 */

/** @typedef {import('./types.js').ArchiveOptions} ArchiveOptions */
/** @typedef {import('./types.js').ArchiveWriter} ArchiveWriter */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
/** @typedef {import('./types.js').ModuleDescriptor} ModuleDescriptor */
/** @typedef {import('./types.js').ParserImplementation} ParserImplementation */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').CaptureSourceLocationHook} CaptureSourceLocationHook */
/** @typedef {import('./types.js').ReadPowers} ReadPowers */
/** @typedef {import('./types.js').HashPowers} HashPowers */
/** @typedef {import('./types.js').Sources} Sources */
/** @typedef {import('./types.js').WriteFn} WriteFn */

import { writeZip } from '@endo/zip';
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
import { unpackReadPowers } from './powers.js';
import { assertCompartmentMap } from './compartment-map.js';

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
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

const { keys, entries, fromEntries } = Object;

/**
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @returns {Record<string, string>} map from old to new compartment names.
 */
const renameCompartments = compartments => {
  /** @type {Record<string, string>} */
  const renames = Object.create(null);
  let n = 0;
  for (const [name, compartment] of entries(compartments)) {
    const { label } = compartment;
    renames[name] = `${label}-n${n}`;
    n += 1;
  }
  return renames;
};

/**
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @param {Sources} sources
 * @param {Record<string, string>} renames
 */
const translateCompartmentMap = (compartments, sources, renames) => {
  const result = Object.create(null);
  for (const compartmentName of keys(compartments).sort()) {
    const compartment = compartments[compartmentName];
    const { name, label } = compartment;

    // rename module compartments
    /** @type {Record<string, ModuleDescriptor>} */
    const modules = Object.create(null);
    const compartmentModules = compartment.modules;
    if (compartment.modules) {
      for (const name of keys(compartmentModules).sort()) {
        const module = compartmentModules[name];
        if (module.compartment !== undefined) {
          modules[name] = {
            ...module,
            compartment: renames[module.compartment],
          };
        } else {
          modules[name] = module;
        }
      }
    }

    // integrate sources into modules
    const compartmentSources = sources[compartmentName];
    if (compartmentSources) {
      for (const name of keys(compartmentSources).sort()) {
        const source = compartmentSources[name];
        const { location, parser, exit, sha512, deferredError } = source;
        if (location !== undefined) {
          modules[name] = {
            location,
            parser,
            sha512,
          };
        } else if (exit !== undefined) {
          modules[name] = {
            exit,
          };
        } else if (deferredError !== undefined) {
          modules[name] = {
            deferredError,
          };
        }
      }
    }

    result[renames[compartmentName]] = {
      name,
      label,
      location: renames[compartmentName],
      modules,
      // `scopes`, `types`, and `parsers` are not necessary since every
      // loadable module is captured in `modules`.
    };
  }

  return result;
};

/**
 * @param {Sources} sources
 * @param {Record<string, string>} renames
 * @returns {Sources}
 */
const renameSources = (sources, renames) => {
  return fromEntries(
    entries(sources).map(([name, compartmentSources]) => [
      renames[name],
      compartmentSources,
    ]),
  );
};

/**
 * @param {ArchiveWriter} archive
 * @param {Sources} sources
 */
const addSourcesToArchive = async (archive, sources) => {
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
 * @param {ReadFn | ReadPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<{sources: Sources, compartmentMapBytes: Uint8Array, sha512?: string}>}
 */
const digestLocation = async (powers, moduleLocation, options) => {
  const {
    moduleTransforms,
    modules: exitModules = {},
    dev = false,
    captureSourceLocation = undefined,
  } = options || {};
  const { read, computeSha512 } = unpackReadPowers(powers);
  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(read, moduleLocation);

  /** @type {Set<string>} */
  const tags = new Set();
  tags.add('endo');
  tags.add('import');
  tags.add('default');

  const packageDescriptor = parseLocatedJson(
    packageDescriptorText,
    packageDescriptorLocation,
  );
  const compartmentMap = await compartmentMapForNodeModules(
    powers,
    packageLocation,
    tags,
    packageDescriptor,
    moduleSpecifier,
    { dev },
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
    exitModules,
    computeSha512,
  );

  // Induce importHook to record all the necessary modules to import the given module specifier.
  const { compartment } = link(compartmentMap, {
    resolve,
    modules: exitModules,
    makeImportHook,
    moduleTransforms,
    parserForLanguage,
    archiveOnly: true,
  });
  await compartment.load(entryModuleSpecifier);

  const renames = renameCompartments(compartments);
  const archiveCompartments = translateCompartmentMap(
    compartments,
    sources,
    renames,
  );
  const archiveEntryCompartmentName = renames[entryCompartmentName];
  const archiveSources = renameSources(sources, renames);

  const archiveCompartmentMap = {
    entry: {
      compartment: archiveEntryCompartmentName,
      module: moduleSpecifier,
    },
    compartments: archiveCompartments,
  };

  // Cross-check:
  // We assert that we have constructed a valid compartment map, not because it
  // might not be, but to ensure that the assertCompartmentMap function can
  // accept all valid compartment maps.
  assertCompartmentMap(archiveCompartmentMap);

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
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<{bytes: Uint8Array, sha512?: string}>}
 */
export const makeAndHashArchive = async (powers, moduleLocation, options) => {
  const { compartmentMapBytes, sources, sha512 } = await digestLocation(
    powers,
    moduleLocation,
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
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export const makeArchive = async (powers, moduleLocation, options) => {
  const { bytes } = await makeAndHashArchive(powers, moduleLocation, options);
  return bytes;
};

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export const mapLocation = async (powers, moduleLocation, options) => {
  const { compartmentMapBytes } = await digestLocation(
    powers,
    moduleLocation,
    options,
  );
  return compartmentMapBytes;
};

/**
 * @param {HashPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<string>}
 */
export const hashLocation = async (powers, moduleLocation, options) => {
  const { compartmentMapBytes } = await digestLocation(
    powers,
    moduleLocation,
    options,
  );
  const { computeSha512 } = powers;
  return computeSha512(compartmentMapBytes);
};

/**
 * @param {WriteFn} write
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 */
export const writeArchive = async (
  write,
  readPowers,
  archiveLocation,
  moduleLocation,
  options,
) => {
  const archiveBytes = await makeArchive(readPowers, moduleLocation, options);
  await write(archiveLocation, archiveBytes);
};
