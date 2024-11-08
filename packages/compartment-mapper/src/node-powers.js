/**
 * @module Provides adapters for Compartment Mapper I/O to the corresponding
 * Node.js implementations of those behaviors.
 *
 * The Compartment Mapper generalizes its I/O interface to allow for a wide
 * variety of I/O providers, but especially for reading and writing from
 * virtualized file systems like zip files.
 */

/**
 * @import {
 *   CryptoInterface,
 *   FsInterface,
 *   PathInterface,
 *   UrlInterface,
 * } from './types/node-powers.js'
 * @import {
 *   CanonicalFn,
 *   FileURLToPathFn,
 *   HashFn,
 *   IsAbsoluteFn,
 *   MaybeReadFn,
 *   MaybeReadNowFn,
 *   MaybeReadPowers,
 *   PathToFileURLFn,
 *   ReadFn,
 *   ReadNowPowers,
 *   ReadPowers,
 *   RequireResolveFn,
 *   WritePowers,
 * } from './types/powers.js'
 */

import { createRequire } from 'module';

/**
 * @type {FileURLToPathFn}
 */
const fakeFileURLToPath = location => {
  const url = new URL(location);
  if (url.protocol !== 'file:') {
    throw Error(`Cannot convert URL to file path: ${location}`);
  }
  return url.pathname;
};

/**
 * @type {PathToFileURLFn} path
 */
const fakePathToFileURL = path => {
  return new URL(path, 'file://');
};

/**
 * @type {IsAbsoluteFn}
 */
const fakeIsAbsolute = () => false;

/**
 * The implementation of `makeReadPowers` and the deprecated
 * `makeNodeReadPowers` handles the case when the `url` power is not provided,
 * but `makeReadPowers` presents a type that requires `url`.
 *
 * @param {object} args
 * @param {FsInterface} args.fs
 * @param {UrlInterface} [args.url]
 * @param {CryptoInterface} [args.crypto]
 * @param {PathInterface} [args.path]
 * @returns {MaybeReadPowers}
 */
const makeReadPowersSloppy = ({
  fs,
  url = undefined,
  crypto = undefined,
  path = undefined,
}) => {
  const fileURLToPath =
    url === undefined ? fakeFileURLToPath : url.fileURLToPath;
  const pathToFileURL =
    url === undefined ? fakePathToFileURL : url.pathToFileURL;
  const isAbsolute = path === undefined ? fakeIsAbsolute : path.isAbsolute;

  let readMutex = Promise.resolve(undefined);

  /**
   * @type {ReadFn}
   */
  const read = async location => {
    const promise = readMutex;
    let release = Function.prototype;
    readMutex = new Promise(resolve => {
      release = resolve;
    });
    await promise;

    const filepath = fileURLToPath(location);
    try {
      // We await here to ensure that we release the mutex only after
      // completing the read.
      return await fs.promises.readFile(filepath);
    } finally {
      release(undefined);
    }
  };

  /**
   * @type {MaybeReadFn}
   */
  const maybeRead = location =>
    read(location).catch(error => {
      if (
        error.message.startsWith('ENOENT: ') ||
        error.message.startsWith('EISDIR: ')
      ) {
        return undefined;
      }
      throw error;
    });

  /** @type {RequireResolveFn} */
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
   * @type {CanonicalFn}
   */
  const canonical = async location => {
    await null;
    try {
      if (location.endsWith('/')) {
        const realPath = await fs.promises.realpath(
          fileURLToPath(location).replace(/\/$/, ''),
        );
        return `${pathToFileURL(realPath).href}/`;
      } else {
        const realPath = await fs.promises.realpath(fileURLToPath(location));
        return pathToFileURL(realPath).href;
      }
    } catch {
      return location;
    }
  };

  /** @type {HashFn | undefined} */
  const computeSha512 = crypto
    ? bytes => {
        const hash = crypto.createHash('sha512');
        hash.update(bytes);
        return hash.digest().toString('hex');
      }
    : undefined;

  return {
    read,
    maybeRead,
    fileURLToPath,
    pathToFileURL,
    canonical,
    computeSha512,
    requireResolve,
    isAbsolute,
  };
};

/**
 * Creates {@link ReadPowers} for dynamic module support
 *
 * @param {object} args
 * @param {FsInterface} args.fs
 * @param {UrlInterface} [args.url]
 * @param {CryptoInterface} [args.crypto]
 * @param {PathInterface} [args.path]
 * @returns {MaybeReadPowers & ReadNowPowers}
 */
export const makeReadNowPowers = ({
  fs,
  url = undefined,
  crypto = undefined,
  path = undefined,
}) => {
  const powers = makeReadPowersSloppy({ fs, url, crypto, path });
  const fileURLToPath = powers.fileURLToPath || fakeFileURLToPath;
  const isAbsolute = powers.isAbsolute || fakeIsAbsolute;

  /**
   * @type {MaybeReadNowFn}
   */
  const maybeReadNow = location => {
    const filePath = fileURLToPath(location);
    try {
      return fs.readFileSync(filePath);
    } catch (error) {
      if (
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'EISDIR')
      ) {
        return undefined;
      }
      throw error;
    }
  };

  return {
    ...powers,
    maybeReadNow,
    fileURLToPath,
    isAbsolute,
  };
};

/**
 * The implementation of `makeWritePowers` and the deprecated
 * `makeNodeWritePowers` handles the case when the `url` power is not provided,
 * but `makeWritePowers` presents a type that requires `url`.
 *
 * @param {object} args
 * @param {FsInterface} args.fs
 * @param {UrlInterface} [args.url]
 */
const makeWritePowersSloppy = ({ fs, url = undefined }) => {
  const fileURLToPath =
    url === undefined ? fakeFileURLToPath : url.fileURLToPath;

  /**
   * @param {string} location
   * @param {Uint8Array} data
   */
  const write = async (location, data) => {
    await null;
    try {
      return await fs.promises.writeFile(fileURLToPath(location), data);
    } catch (error) {
      throw Error(error.message);
    }
  };

  return { write };
};

/**
 * @param {object} args
 * @param {FsInterface} args.fs
 * @param {UrlInterface} args.url
 * @param {CryptoInterface} [args.crypto]
 */
export const makeReadPowers = makeReadPowersSloppy;

/**
 * @param {object} args
 * @param {FsInterface} args.fs
 * @param {UrlInterface} args.url
 */
export const makeWritePowers = makeWritePowersSloppy;

/**
 * Deprecated in favor of {@link makeReadPowers}.
 * It transpires that positional arguments needed to become an arguments bag to
 * reasonably expand to multiple optional dependencies.
 *
 * @param {FsInterface} fs
 * @param {CryptoInterface} [crypto]
 * @returns {ReadPowers}
 * @deprecated
 */
export const makeNodeReadPowers = (fs, crypto = undefined) => {
  return makeReadPowersSloppy({ fs, crypto });
};

/**
 * Deprecated in favor of {@link makeWritePowers}.
 * It transpires that positional arguments needed to become an arguments bag to
 * reasonably expand to multiple optional dependencies.
 *
 * @param {FsInterface} fs
 * @returns {WritePowers}
 * @deprecated
 */
export const makeNodeWritePowers = fs => {
  return makeWritePowersSloppy({ fs });
};
