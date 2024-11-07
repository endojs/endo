/**
 * @module Provides the behavior for `node-modules.js` to find modules and
 * packages according to the Node.js `node_modules` convention.
 */

/**
 * @import {
 *   ReadFn,
 *   ReadPowers,
 *   MaybeReadPowers,
 * } from './types.js'
 */

import { relativize } from './node-module-specifier.js';
import { relative } from './url.js';
import { unpackReadPowers } from './powers.js';

// q, as in quote, for enquoting strings in error messages.
const q = JSON.stringify;

const decoder = new TextDecoder();

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

/**
 * Searches for the first ancestor directory of given location that contains a
 * package.json.
 * Probes by calling maybeReadDescriptor.
 * Returns the result of maybeReadDescriptor as data whenever a value is returned.
 *
 * @template T
 * @param {string} location
 * @param {(location:string)=>Promise<T|undefined>} maybeReadDescriptor
 * @returns {Promise<{data:T, directory: string, location:string, packageDescriptorLocation: string}>}
 */
export const searchDescriptor = async (location, maybeReadDescriptor) => {
  await null;
  let directory = resolveLocation('./', location);
  for (;;) {
    const packageDescriptorLocation = resolveLocation(
      'package.json',
      directory,
    );
    // eslint-disable-next-line no-await-in-loop
    const data = await maybeReadDescriptor(packageDescriptorLocation);
    if (data !== undefined) {
      return {
        data,
        directory,
        location,
        packageDescriptorLocation,
      };
    }
    const parentDirectory = resolveLocation('../', directory);
    if (parentDirectory === directory) {
      throw Error(`Cannot find package.json along path to ${q(location)}`);
    }
    directory = parentDirectory;
  }
};

/**
 * @param {ReadFn | ReadPowers | MaybeReadPowers} readPowers
 * @param {string} packageDescriptorLocation
 * @returns {Promise<string | undefined>}
 */
const maybeReadDescriptorDefault = async (
  readPowers,
  packageDescriptorLocation,
  // eslint-disable-next-line consistent-return
) => {
  const { maybeRead } = unpackReadPowers(readPowers);
  const packageDescriptorBytes = await maybeRead(packageDescriptorLocation);
  if (packageDescriptorBytes !== undefined) {
    const packageDescriptorText = decoder.decode(packageDescriptorBytes);
    return packageDescriptorText;
  }
};

/**
 * Searches for the first ancestor directory of a module file that contains a
 * package.json.
 * Probes by attempting to read the file, not stat.
 * To avoid duplicate work later, returns the text of the package.json for
 * inevitable later use.
 *
 * @param {ReadFn | ReadPowers | MaybeReadPowers} readPowers
 * @param {string} moduleLocation
 * @returns {Promise<{
 *   packageLocation: string,
 *   packageDescriptorLocation: string,
 *   packageDescriptorText: string,
 *   moduleSpecifier: string,
 * }>}
 */
export const search = async (readPowers, moduleLocation) => {
  const { data, directory, location, packageDescriptorLocation } =
    await searchDescriptor(moduleLocation, loc =>
      maybeReadDescriptorDefault(readPowers, loc),
    );

  if (!data) {
    throw Error(
      `Cannot find package.json along path to module ${q(moduleLocation)}`,
    );
  }

  return {
    packageLocation: directory,
    packageDescriptorText: data,
    packageDescriptorLocation,
    moduleSpecifier: relativize(relative(directory, location)),
  };
};
