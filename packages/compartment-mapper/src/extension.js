/** @module Extracts the extension from a URL pathname. */

// @ts-check

/**
 * `parseExtension` returns the file extension for the given URL, or an empty
 * string if the path has no extension.
 * Exported for tests.
 *
 * @param {string} location
 * @returns {string}
 */
export const parseExtension = location => {
  const lastSlash = location.lastIndexOf('/');
  if (lastSlash < 0) {
    return '';
  }
  const base = location.slice(lastSlash + 1);
  const lastDot = base.lastIndexOf('.');
  if (lastDot < 0) {
    return '';
  }
  return base.slice(lastDot + 1);
};
