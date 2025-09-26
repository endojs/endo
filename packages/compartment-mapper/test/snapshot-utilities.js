/**
 * Test utilities for working with snapshots of `CompartmentMapDescriptor`s and other dat structures.
 *
 * @module
 */

import {
  isCompartmentModuleDescriptorConfiguration,
} from '../src/guards.js';
import { ATTENUATORS_COMPARTMENT } from '../src/policy-format.js';

/**
 * @import {
 *   Sources,
 *   CompartmentSources,
 *   CaptureResult,
 *   PackageCompartmentMapDescriptor,
 *   FileUrlString,
 *   EntryDescriptor,
 *   PackageCompartmentDescriptor,
 * } from '../src/types.js';
 */

const { entries, fromEntries, create } = Object;

/**
 * Strip absolute file URLs to relative test paths.  The paths will be relative
 * to the `compartment-mapper` workspace dir.
 * @param {FileUrlString} url
 * @returns {FileUrlString}
 */
export const relativizeFileUrlString = url => {
  if (!url.startsWith('file://')) {
    throw new TypeError(`Not a file URL: ${url}`);
  }
  const match = url.match(/file:\/\/.*?packages\/compartment-mapper\/(.*)/);
  return match ? `file:///${match[1]}` : url;
};

/**
 * Replaces all absolute {@link FileUrlString}s within a
 * {@link PackageCompartmentMapDescriptor} (as produced by `mapNodeModules()`) and makes relative to the `compartment-mapper` workspace dir, as if it were the filesystem root.
 *
 * For snapshotting purposes (since we cannot use absolute paths in snapshots).
 *
 * TODO: Validate resulting CompartmentMapDescriptor
 * @template {PackageCompartmentMapDescriptor} T
 * @param {T} compartmentMap
 * @returns {T}
 */
export const relativizeCompartmentMap = compartmentMap => {
  // entry.compartment
  /** @type {EntryDescriptor<FileUrlString>} */
  const relativeEntry = {
    ...compartmentMap.entry,
    compartment: relativizeFileUrlString(compartmentMap.entry.compartment),
  };

  const compartmentsEntries =
    /** @type {Array<[compartmentName: keyof PackageCompartmentMapDescriptor['compartments'], compartmentDescriptor: PackageCompartmentDescriptor]} */ (
      entries(compartmentMap.compartments)
    );

  // compartments[]
  const relativeCompartments = Object.fromEntries(
    compartmentsEntries.map(([compartmentName, compartmentDescriptor]) => {
      const newKey =
        compartmentName === ATTENUATORS_COMPARTMENT
          ? compartmentName
          : relativizeFileUrlString(compartmentName);

      // compartments[].modules[].compartment
      const modules = compartmentDescriptor.modules
        ? fromEntries(
            entries(compartmentDescriptor.modules).map(
              ([moduleName, moduleDescriptorConfiguration]) => {
                if (
                  isCompartmentModuleDescriptorConfiguration(
                    moduleDescriptorConfiguration,
                  )
                ) {
                  return [
                    moduleName,
                    {
                      ...moduleDescriptorConfiguration,
                      compartment: relativizeFileUrlString(
                        moduleDescriptorConfiguration.compartment,
                      ),
                    },
                  ];
                }
                return [moduleName, moduleDescriptorConfiguration];
              },
            ),
          )
        : compartmentDescriptor.modules;

      // compartments[].scopes[].compartment
      const scopes = compartmentDescriptor.scopes
        ? fromEntries(
            entries(compartmentDescriptor.scopes).map(
              ([scopeName, scopeDescriptor]) => [
                scopeName,
                {
                  ...scopeDescriptor,
                  compartment: relativizeFileUrlString(
                    scopeDescriptor.compartment,
                  ),
                },
              ],
            ),
          )
        : compartmentDescriptor.scopes;

      // compartments[].location
      if (compartmentDescriptor.location !== ATTENUATORS_COMPARTMENT) {
        compartmentDescriptor.location = relativizeFileUrlString(
          compartmentDescriptor.location,
        );
      }
      return [
        newKey,
        {
          ...compartmentDescriptor,
          modules,
          scopes,
        },
      ];
    }),
  );

  return {
    ...compartmentMap,
    entry: relativeEntry,
    compartments: relativeCompartments,
  };
};
