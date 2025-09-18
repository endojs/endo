/**
 * Test utilities for working with snapshots of `CompartmentMapDescriptor`s and other dat structures.
 *
 * @module
 */

import {
  isCompartmentModuleDescriptorConfiguration,
  isLocalModuleSource,
} from '../src/guards.js';

/**
 * @import {
 *   Sources,
 *   CompartmentSources,
 *   CaptureResult,
 *   PackageCompartmentMapDescriptor,
 * } from '../src/types.js';
 */

const { entries, fromEntries, create } = Object;

/**
 * Strip absolute file URLs to relative test paths.  The paths will be
 * relative to the `compartment-mapper` workspace dir.
 * @param {string} url
 */
export const stripPath = url => {
  if (typeof url !== 'string' || !url.startsWith('file://')) {
    return url;
  }
  const match = url.match(/file:\/\/.*?packages\/compartment-mapper\/(.*)/);
  return match ? match[1] : url;
};

/**
 * Strips absolute `file://` prefixes from locations in a
 * {@link PackageCompartmentMapDescriptor} as produced by `mapNodeModules()`.
 *
 * @template {PackageCompartmentMapDescriptor} T
 * @param {T} compartmentMap
 * @returns {T}
 */
export const stripCompartmentMap = compartmentMap => {
  // 1. entry.compartment
  const strippedEntry = {
    ...compartmentMap.entry,
    compartment: stripPath(compartmentMap.entry.compartment),
  };

  // 2. keys of compartments
  const stripedCompartments = {};
  for (const [key, value] of entries(compartmentMap.compartments)) {
    const newKey = stripPath(key);
    // 3. compartments[*].modules[*].compartment
    const modules = value.modules
      ? fromEntries(
          entries(value.modules).map(([mKey, mValue]) => {
            if (isCompartmentModuleDescriptorConfiguration(mValue)) {
              return [
                mKey,
                {
                  ...mValue,
                  compartment: stripPath(mValue.compartment),
                },
              ];
            }
            return [mKey, mValue];
          }),
        )
      : value.modules;
    // 4. compartments[*].scopes[*].compartment
    const scopes = value.scopes
      ? fromEntries(
          entries(value.scopes).map(([sKey, sValue]) => [
            sKey,
            {
              ...sValue,
              compartment: stripPath(sValue.compartment),
            },
          ]),
        )
      : value.scopes;
    // 5. compartments[*].location
    if (value.location) {
      value.location = /** @type {any} */ (stripPath(value.location));
    }
    stripedCompartments[newKey] = {
      ...value,
      modules,
      scopes,
    };
  }

  return {
    ...compartmentMap,
    entry: strippedEntry,
    compartments: stripedCompartments,
  };
};

/**
 * Returns a deep copy of {@link Sources} with absolute `file://` prefixes
 * stripped from `sourceLocation` properties.
 *
 * @see {@link stripCaptureResult}
 * @param {Sources} sources
 * @returns {Sources}
 */
export const stripSources = sources => {
  /** @type {Sources} */
  const result = create(null);
  for (const [compartmentKey, compartmentSources] of entries(sources)) {
    /** @type {CompartmentSources} */
    const compartmentCopy = create(null);
    for (const [moduleKey, moduleSource] of entries(compartmentSources)) {
      if (isLocalModuleSource(moduleSource)) {
        compartmentCopy[moduleKey] = {
          ...moduleSource,
          sourceLocation: stripPath(moduleSource.sourceLocation),
        };
      } else {
        compartmentCopy[moduleKey] = moduleSource;
      }
    }
    result[compartmentKey] = compartmentCopy;
  }
  return result;
};

/**
 * Strips absolute `file://` prefixes from locations in "renames" Records of {@link CaptureResult}.
 *
 * @see {@link stripCaptureResult}
 * @param {Record<string, string>} renames
 * @returns {Record<string, string>} Stripped renames
 */
export const stripRenames = renames => {
  /** @type {Record<string, string>} */
  const result = create(null);
  for (const [key, value] of entries(renames)) {
    result[stripPath(key)] = stripPath(value);
  }
  return result;
};

/**
 * Strips absolute `file://` prefixes from locations in a `CaptureResult`.
 * @param {CaptureResult} result
 */
export const stripCaptureResult = result => ({
  ...result,
  compartmentRenames: stripRenames(result.compartmentRenames),
  oldToNewCompartmentNames: stripRenames(result.oldToNewCompartmentNames),
  newToOldCompartmentNames: stripRenames(result.newToOldCompartmentNames),
  captureSources: stripSources(result.captureSources),
});
