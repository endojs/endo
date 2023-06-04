// @ts-check

/** @typedef {import('./types.js').ReadPowers} ReadPowers */
/** @typedef {import('./types.js').HashFn} HashFn */
/** @typedef {import('./types.js').WritePowers} WritePowers */

import { createRequire } from 'module';

const Either = (() => {
  const Right = x => ({
    isLeft: false,
    chain: f => f(x),
    ap: other => other.map(x),
    alt: () => Right(x),
    extend: f => f(Right(x)),
    concat: other =>
      other.fold(
        () => other,
        y => Right(x.concat(y)),
      ),
    traverse: (of, f) => f(x).map(Right),
    map: f => Right(f(x)),
    fold: (_, g) => g(x),
    toString: () => `Right(${x})`,
  });

  const Left = x => ({
    isLeft: true,
    chain: _ => Left(x),
    ap: _ => Left(x),
    extend: _ => Left(x),
    alt: other => other,
    concat: _ => Left(x),
    traverse: (of, _) => of(Left(x)),
    map: _ => Left(x),
    fold: (f, _) => f(x),
    toString: () => `Left(${x})`,
  });

  const of = Right;
  const tryCatch = f => {
    try {
      return Right(f());
    } catch (e) {
      return Left(e);
    }
  };

  const fromNullable = x => (x != null ? Right(x) : Left(x));

  return { Right, Left, of, tryCatch, fromNullable };
})();
const id = x => x;
const { tryCatch } = Either;

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

const safeReadWithoutPowers = (fs, filePathFn) => location =>
  tryCatch(() => fs.promises.readFile(filePathFn(location)));

const handleFsError = (fn, path) => error =>
  error && (error.code === 'EMFILE' || error.code === 'ENFILE')
    ? fn(path)
    : new Error(error.message);

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

  const createURLOutput = path => `${pathToFileURL(path)}/`;

  const safeReadWithPowers = safeReadWithoutPowers(fs, fileURLToPath);

  /**
   * @param {string} location
   */
  const read = async location =>
    await safeReadWithPowers(location).fold(handleFsError(read, location), id);

  // const read = async location => {
  //   try {
  //     const path = fileURLToPath(location);
  //     const result = await fs.promises.readFile(path);
  //     console.log('::::::fs.promises.readFile(path);::::::', { result });
  //     return result;
  //   } catch (error) {
  //     throw Error(error.message);
  //   }
  // };
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
  const createCanonicalUrl = async location =>
    location.endsWith('/')
      ? await fileURLToPath(location).replace(/\/$/, '')
      : await fs.promises.realpath(fileURLToPath(location));

  const canonical = async location =>
    Either.of(await createCanonicalUrl(location))
      .map(createURLOutput)
      .fold(id(location), id);

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
      throw Error(error.message);
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
