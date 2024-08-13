/* Provides adapters for Compartment Mapper I/O to the corresponding Node.js
 * implementations of those behaviors.
 *
 * The Compartment Mapper generalizes its I/O interface to allow for a wide
 * variety of I/O providers, but especially for reading and writing from
 * virtualized file systems like zip files.
 */

// @ts-check

/** @import {CanonicalFn} from './types.js' */
/** @import {CryptoAPI} from './types.js' */
/** @import {FileURLToPathFn} from './types.js' */
/** @import {FsAPI} from './types.js' */
/** @import {HashFn} from './types.js' */
/** @import {IsAbsoluteFn} from './types.js' */
/** @import {MaybeReadFn} from './types.js' */
/** @import {MaybeReadPowers} from './types.js' */
/** @import {PathAPI} from './types.js' */
/** @import {PathToFileURLFn} from './types.js' */
/** @import {ReadFn} from './types.js' */
/** @import {ReadPowers} from './types.js' */
/** @import {RequireResolveFn} from './types.js' */
/** @import {SyncReadPowers} from './types.js' */
/** @import {UrlAPI} from './types.js' */
/** @import {WritePowers} from './types.js' */
/** @import {MaybeReadSyncFn} from './types.js' */

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
  return new URL(path, 'file://').toString();
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
 * @param {FsAPI} args.fs
 * @param {UrlAPI} [args.url]
 * @param {CryptoAPI} [args.crypto]
 * @param {PathAPI} [args.path]
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
        return `${pathToFileURL(realPath)}/`;
      } else {
        const realPath = await fs.promises.realpath(fileURLToPath(location));
        return pathToFileURL(realPath).toString();
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
 * @param {FsAPI} args.fs
 * @param {UrlAPI} [args.url]
 * @param {CryptoAPI} [args.crypto]
 * @param {PathAPI} [args.path]
 * @returns {MaybeReadPowers & SyncReadPowers}
 */
export const makeSyncReadPowers = ({
  fs,
  url = undefined,
  crypto = undefined,
  path = undefined,
}) => {
  const powers = makeReadPowersSloppy({ fs, url, crypto, path });
  const fileURLToPath = powers.fileURLToPath || fakeFileURLToPath;
  const isAbsolute = powers.isAbsolute || fakeIsAbsolute;

  /**
   * @type {MaybeReadSyncFn}
   */
  const maybeReadSync = location => {
    const filepath = fileURLToPath(location);
    try {
      return fs.readFileSync(filepath);
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
    maybeReadSync,
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
 * @param {FsAPI} args.fs
 * @param {UrlAPI} [args.url]
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
 * @param {FsAPI} args.fs
 * @param {UrlAPI} args.url
 * @param {CryptoAPI} [args.crypto]
 */
export const makeReadPowers = makeReadPowersSloppy;

/**
 * @param {object} args
 * @param {FsAPI} args.fs
 * @param {UrlAPI} args.url
 */
export const makeWritePowers = makeWritePowersSloppy;

/**
 * @deprecated in favor of makeReadPowers.
 * It transpires that positional arguments needed to become an arguments bag to
 * reasonably expand to multiple optional dependencies.
 *
 * @param {FsAPI} fs
 * @param {CryptoAPI} [crypto]
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
 * @param {FsAPI} fs
 * @returns {WritePowers}
 */
export const makeNodeWritePowers = fs => {
  return makeWritePowersSloppy({ fs });
};
