// @ts-check
/* eslint no-shadow: 0 */

/** @import {ArchiveOptions, ParserForLanguage} from './types.js' */
/** @import {ArchiveWriter} from './types.js' */
/** @import {CompartmentDescriptor} from './types.js' */
/** @import {CompartmentMapDescriptor} from './types.js' */
/** @import {ModuleDescriptor} from './types.js' */
/** @import {ParserImplementation} from './types.js' */
/** @import {ReadFn} from './types.js' */
/** @import {CaptureSourceLocationHook} from './types.js' */
/** @import {ReadPowers} from './types.js' */
/** @import {HashPowers} from './types.js' */
/** @import {Sources} from './types.js' */
/** @import {WriteFn} from './types.js' */

import { writeZip } from '@endo/zip';
import { resolve } from './node-module-specifier.js';
import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { link } from './link.js';
import {
  exitModuleImportHookMaker,
  makeImportHookMaker,
} from './import-hook.js';
import parserJson from './parse-json.js';
import parserText from './parse-text.js';
import parserBytes from './parse-bytes.js';
import parserArchiveCjs from './parse-archive-cjs.js';
import parserArchiveMjs from './parse-archive-mjs.js';
import { parseLocatedJson } from './json.js';
import { unpackReadPowers } from './powers.js';
import {
  assertCompartmentMap,
  stringCompare,
  pathCompare,
} from './compartment-map.js';
import { detectAttenuators } from './policy.js';

const textEncoder = new TextEncoder();

const { freeze } = Object;

/** @satisfies {Readonly<ParserForLanguage>} */
const parserForLanguage = freeze(
  /** @type {const} */ ({
    mjs: parserArchiveMjs,
    'pre-mjs-json': parserArchiveMjs,
    cjs: parserArchiveCjs,
    'pre-cjs-json': parserArchiveCjs,
    json: parserJson,
    text: parserText,
    bytes: parserBytes,
  }),
);

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

const { keys, entries, fromEntries } = Object;

/**
 * We attempt to produce compartment maps that are consistent regardless of
 * whether the packages were originally laid out on disk for development or
 * production, and other trivia like the fully qualified path of a specific
 * installation.
 *
 * Naming compartments for the self-ascribed name and version of each Node.js
 * package is insufficient because they are not guaranteed to be unique.
 * Dependencies do not necessarilly come from the npm registry and may be
 * for example derived from fully qualified URL's or Github org and project
 * names.
 * Package managers are also not required to fully deduplicate the hard
 * copy of each package even when they are identical resources.
 * Duplication is undesirable, but we elect to defer that problem to solutions
 * in the package managers, as the alternative would be to consistently hash
 * the original sources of the packages themselves, which may not even be
 * available much less pristine for us.
 *
 * So, instead, we use the lexically least path of dependency names, delimited
 * by hashes.
 * The compartment maps generated by the ./node-modules.js tooling pre-compute
 * these traces for our use here.
 * We sort the compartments lexically on their self-ascribed name and version,
 * and use the lexically least dependency name path as a tie-breaker.
 * The dependency path is logical and orthogonal to the package manager's
 * actual installation location, so should be orthogonal to the vagaries of the
 * package manager's deduplication algorithm.
 *
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @returns {Record<string, string>} map from old to new compartment names.
 */
const renameCompartments = compartments => {
  /** @type {Record<string, string>} */
  const compartmentRenames = Object.create(null);
  let index = 0;
  let prev = '';

  // The sort below combines two comparators to avoid depending on sort
  // stability, which became standard as recently as 2019.
  // If that date seems quaint, please accept my regards from the distant past.
  // We are very proud of you.
  const compartmentsByPath = Object.entries(compartments)
    .map(([name, compartment]) => ({
      name,
      path: compartment.path,
      label: compartment.label,
    }))
    .sort((a, b) => {
      if (a.label === b.label) {
        assert(a.path !== undefined && b.path !== undefined);
        return pathCompare(a.path, b.path);
      }
      return stringCompare(a.label, b.label);
    });

  for (const { name, label } of compartmentsByPath) {
    if (label === prev) {
      compartmentRenames[name] = `${label}-n${index}`;
      index += 1;
    } else {
      compartmentRenames[name] = label;
      prev = label;
      index = 1;
    }
  }
  return compartmentRenames;
};

/**
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @param {Sources} sources
 * @param {Record<string, string>} compartmentRenames
 */
const translateCompartmentMap = (compartments, sources, compartmentRenames) => {
  const result = Object.create(null);
  for (const compartmentName of keys(compartmentRenames)) {
    const compartment = compartments[compartmentName];
    const { name, label, retained, policy } = compartment;
    if (retained) {
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
              compartment: compartmentRenames[module.compartment],
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

      result[compartmentRenames[compartmentName]] = {
        name,
        label,
        location: compartmentRenames[compartmentName],
        modules,
        policy,
        // `scopes`, `types`, and `parsers` are not necessary since every
        // loadable module is captured in `modules`.
      };
    }
  }

  return result;
};

/**
 * @param {Sources} sources
 * @param {Record<string, string>} compartmentRenames
 * @returns {Sources}
 */
const renameSources = (sources, compartmentRenames) => {
  return fromEntries(
    entries(sources).map(([name, compartmentSources]) => [
      compartmentRenames[name],
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
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {Sources} sources
 * @returns {{archiveCompartmentMap: CompartmentMapDescriptor, archiveSources: Sources}}
 */
export const makeArchiveCompartmentMap = (compartmentMap, sources) => {
  const {
    compartments,
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;

  const compartmentRenames = renameCompartments(compartments);
  const archiveCompartments = translateCompartmentMap(
    compartments,
    sources,
    compartmentRenames,
  );
  const archiveEntryCompartmentName = compartmentRenames[entryCompartmentName];
  const archiveSources = renameSources(sources, compartmentRenames);

  const archiveCompartmentMap = {
    tags: [],
    entry: {
      compartment: archiveEntryCompartmentName,
      module: entryModuleSpecifier,
    },
    compartments: archiveCompartments,
  };

  // Cross-check:
  // We assert that we have constructed a valid compartment map, not because it
  // might not be, but to ensure that the assertCompartmentMap function can
  // accept all valid compartment maps.
  assertCompartmentMap(archiveCompartmentMap);

  return { archiveCompartmentMap, archiveSources };
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
    tags = new Set(),
    captureSourceLocation = undefined,
    searchSuffixes = undefined,
    commonDependencies = undefined,
    importHook: exitModuleImportHook = undefined,
    policy = undefined,
    sourceMapHook = undefined,
  } = options || {};
  const { read, computeSha512 } = unpackReadPowers(powers);
  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(read, moduleLocation);

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
    { dev, commonDependencies, policy },
  );

  const {
    compartments,
    entry: { module: entryModuleSpecifier, compartment: entryCompartmentName },
  } = compartmentMap;

  /** @type {Sources} */
  const sources = Object.create(null);

  const consolidatedExitModuleImportHook = exitModuleImportHookMaker({
    modules: exitModules,
    exitModuleImportHook,
  });

  const makeImportHook = makeImportHookMaker(read, packageLocation, {
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
