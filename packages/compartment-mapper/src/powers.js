// @ts-check

/** @import {CanonicalFn, ReadFn, ReadPowers, MaybeReadPowers, MaybeReadFn} from './types.js' */

/** @type {CanonicalFn} */
const canonicalShim = async path => path;

/**
 * @param {ReadFn | ReadPowers | MaybeReadPowers} powers
 * @returns {MaybeReadPowers}
 */
export const unpackReadPowers = powers => {
  /** @type {ReadFn | undefined} */
  let read;
  /** @type {MaybeReadFn | undefined} */
  let maybeRead;
  /** @type {CanonicalFn | undefined} */
  let canonical;

  if (typeof powers === 'function') {
    read = powers;
  } else {
    ({ read, maybeRead, canonical } =
      /** @type {MaybeReadPowers} */ (powers));
  }

  if (canonical === undefined) {
    canonical = canonicalShim;
  }

  if (maybeRead === undefined) {
    /** @param {string} path */
    maybeRead = path =>
      /** @type {ReadFn} */ (read)(path).catch(
        _error => undefined,
      );
  }

  return {
    ...powers,
    read,
    maybeRead,
    canonical,
  };
};
