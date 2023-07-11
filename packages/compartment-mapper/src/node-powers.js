// @ts-check

/** @typedef {import('./types.js').ReadPowers} ReadPowers */
/** @typedef {import('./types.js').HashFn} HashFn */
/** @typedef {import('./types.js').WritePowers} WritePowers */

import { createRequire } from 'module';

/**
 * @param {string} location
 */
const fakeFileURLToPath = location => {
  const url = new URL(location);
  if (url.protocol !== 'file:') {
    throw Error(`Cannot convert URL to file path: ${location}`);
  }
  return url.pathname;
};

/**
 * @param {string} path
 */
const fakePathToFileURL = path => {
  return new URL(path, 'file://').toString();
};

/**
 * The implementation of `makeReadPowers` and the deprecated
 * `makeNodeReadPowers` handles the case when the `url` power is not provided,
 * but `makeReadPowers` presents a type that requires `url`.
 *
 * @param {object} args
 * @param {typeof import('fs')} args.fs
 * @param {typeof import('url')} [args.url]
 * @param {typeof import('crypto')} [args.crypto]
 */
const makeReadPowersSloppy = ({ fs, url = undefined, crypto = undefined }) => {
  const fileURLToPath =
    url === undefined ? fakeFileURLToPath : url.fileURLToPath;
  const pathToFileURL =
    url === undefined ? fakePathToFileURL : url.pathToFileURL;

  /**
   * @param {string} location
   */
  const read = async location => {
    try {
      const path = fileURLToPath(location);
      return await fs.promises.readFile(path);
    } catch (error) {
      if (error instanceof Error) {
        throw Error(error.message);
      }
      throw Error('unknown catch value');
    }
  };

  const requireResolve = (from, specifier, options) =>
    createRequire(from).resolve(specifier, options);

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
          fileURLToPath(location).replace(/\/$/, ''),
        );
        return `${pathToFileURL(realPath)}/`;
      } else {
        const realPath = await fs.promises.realpath(fileURLToPath(location));
        return pathToFileURL(realPath).toString();
      }
    } catch {
      return location;
    }
  };

  /** @type {HashFn=} */
  const computeSha512 = crypto
    ? bytes => {
        const hash = crypto.createHash('sha512');
        hash.update(bytes);
        return hash.digest().toString('hex');
      }
    : undefined;

  return {
    read,
    fileURLToPath,
    pathToFileURL,
    canonical,
    computeSha512,
    requireResolve,
  };
};

/**
 * The implementation of `makeWritePowers` and the deprecated
 * `makeNodeWritePowers` handles the case when the `url` power is not provided,
 * but `makeWritePowers` presents a type that requires `url`.
 *
 * @param {object} args
 * @param {typeof import('fs')} args.fs
 * @param {typeof import('url')} [args.url]
 */
const makeWritePowersSloppy = ({ fs, url = undefined }) => {
  const fileURLToPath =
    url === undefined ? fakeFileURLToPath : url.fileURLToPath;

  /**
   * @param {string} location
   * @param {Uint8Array} data
   */
  const write = async (location, data) => {
    try {
      return await fs.promises.writeFile(fileURLToPath(location), data);
    } catch (error) {
      if (error instanceof Error) {
        throw Error(error.message);
      }
      throw Error('unknown catch value');
    }
  };

  return { write };
};

/**
 * @param {object} args
 * @param {typeof import('fs')} args.fs
 * @param {typeof import('url')} args.url
 * @param {typeof import('crypto')} [args.crypto]
 */
export const makeReadPowers = makeReadPowersSloppy;

/**
 * @param {object} args
 * @param {typeof import('fs')} args.fs
 * @param {typeof import('url')} args.url
 */
export const makeWritePowers = makeWritePowersSloppy;

/**
 * @deprecated in favor of makeReadPowers.
 * It transpires that positional arguments needed to become an arguments bag to
 * reasonably expand to multiple optional dependencies.
 *
 * @param {typeof import('fs')} fs
 * @param {typeof import('crypto')} [crypto]
 * @returns {ReadPowers}
 */
export const makeNodeReadPowers = (fs, crypto = undefined) => {
  return makeReadPowersSloppy({ fs, crypto });
};

/**
 * @deprecated in favor of makeWritePowers.
 * It transpires that positional arguments needed to become an arguments bag to
 * reasonably expand to multiple optional dependencies.
 *
 * @param {typeof import('fs')} fs
 * @returns {WritePowers}
 */
export const makeNodeWritePowers = fs => {
  return makeWritePowersSloppy({ fs });
};
