// @ts-check

import './types.js';

/**
 * @param {typeof import('fs')} fs
 * @returns {ReadPowers}
 */
export const makeNodeReadPowers = fs => {
  /**
   * @param {string} location
   */
  const read = async location =>
    fs.promises.readFile(new URL(location).pathname);

  /**
   * There are two special things about the canonical function the compartment
   * mapper needs. It needs to use URL’s instead of posix paths to avoid
   * bundling up a bunch of cruft when we port this around. It needs to use
   * promises. URL’s can and must logically distinguish a directory from a
   * file, by the final slash, whereas paths must never have a final slash
   * because that implies a blank file name within the enclosing directory. The
   * canonical function must also return the logical path instead of the real
   * path if there is no real path. This is merely a convenience for the
   * compartment mapper because it will fail to read the package.json in the
   * non-existent directory on the next step after canonicalizing the package
   * location.
   *
   * @param {string} location
   */
  const canonical = async location => {
    try {
      if (location.endsWith('/')) {
        const realPath = await fs.promises.realpath(
          new URL(location).pathname.replace(/\/$/, ''),
        );
        return new URL(`${realPath}/`, location).toString();
      } else {
        const realPath = await fs.promises.realpath(new URL(location).pathname);
        return new URL(realPath, location).toString();
      }
    } catch {
      return location;
    }
  };

  return { read, canonical };
};

/**
 * @param {typeof import('fs')} fs
 * @returns {WritePowers}
 */
export const makeNodeWritePowers = fs => {
  /**
   * @param {string} location
   * @param {Uint8Array} data
   */
  const write = async (location, data) =>
    fs.promises.writeFile(new URL(location).pathname, data);

  return { write };
};
