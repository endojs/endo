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
  let directory = resolveLocation('./', moduleLocation);
  for (;;) {
    const packageDescriptorLocation = resolveLocation(
      'package.json',
      directory,
    );
    // eslint-disable-next-line no-await-in-loop
    const packageDescriptorBytes = await read(packageDescriptorLocation).catch(
      () => undefined,
    );
    if (packageDescriptorBytes !== undefined) {
      const packageDescriptorText = decoder.decode(packageDescriptorBytes);
      return {
        packageLocation: directory,
        packageDescriptorText,
        packageDescriptorLocation,
        moduleSpecifier: relativize(relative(directory, moduleLocation)),
      };
    }
    const parentDirectory = resolveLocation('../', directory);
    if (parentDirectory === directory) {
      throw new Error(
        `Cannot find package.json along path to module ${q(moduleLocation)}`,
      );
    }
    directory = parentDirectory;
  }
};
