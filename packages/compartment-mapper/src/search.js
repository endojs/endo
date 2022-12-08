// @ts-check

/** @typedef {import('./types.js').ReadFn} ReadFn */

import { relativize } from './node-module-specifier.js';
import { relative } from './url.js';

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
 * Probes by calling readDescriptor.
 * Returns the result of readDescriptor as data whenever a value is returned.
 *
 * @template T
 * @param {string} location
 * @param {(location:string)=>Promise<T>} readDescriptor
 * @returns {Promise<{data:T, directory: string, location:string, packageDescriptorLocation: string}>}
 */
export const searchDescriptor = async (location, readDescriptor) => {
  let directory = resolveLocation('./', location);
  for (;;) {
    const packageDescriptorLocation = resolveLocation(
      'package.json',
      directory,
    );
    // eslint-disable-next-line no-await-in-loop
    const data = await readDescriptor(packageDescriptorLocation).catch(
      () => undefined,
    );
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
      throw new Error(`Cannot find package.json along path to ${q(location)}`);
    }
    directory = parentDirectory;
  }
};

/**
 * @param {ReadFn} read
 * @param {string} packageDescriptorLocation
 * @returns {Promise<string | undefined>}
 */
const readDescriptorDefault = async (
  read,
  packageDescriptorLocation,
  // eslint-disable-next-line consistent-return
) => {
  const packageDescriptorBytes = await read(packageDescriptorLocation).catch(
    () => undefined,
  );
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
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @returns {Promise<{
 *   packageLocation: string,
 *   packageDescriptorLocation: string,
 *   packageDescriptorText: string,
 *   moduleSpecifier: string,
 * }>}
 */
export const search = async (read, moduleLocation) => {
  const { data, directory, location, packageDescriptorLocation } =
    await searchDescriptor(moduleLocation, loc =>
      readDescriptorDefault(read, loc),
    );

  if (!data) {
    throw new Error(
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
