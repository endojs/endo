/* As the interface of the Compartment Mapper evolved, it became necessary to
 * expand some function signatures that accepted a single power to one that
 * accepted a powers object.
 * This module provides functions for safely unpacking I/O capabilities and
 * maintaining backward-compatibility with older accepted usage patterns.
 */

// @ts-check

/** @import {CanonicalFn} from './types.js' */
/** @import {SyncReadPowers} from './types.js' */
/** @import {ReadFn} from './types.js' */
/** @import {ReadPowers} from './types.js' */
/** @import {MaybeReadPowers} from './types.js' */
/** @import {MaybeReadFn} from './types.js' */

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
    ({ read, maybeRead, canonical } = /** @type {MaybeReadPowers} */ (powers));
  }

  if (canonical === undefined) {
    canonical = canonicalShim;
  }

  if (maybeRead === undefined) {
    /** @param {string} path */
    maybeRead = path =>
      /** @type {ReadFn} */ (read)(path).catch(_error => undefined);
  }

  return {
    ...powers,
    read,
    maybeRead,
    canonical,
  };
};

/**
 * Returns `true` if `value` is a {@link SyncReadPowers}, which requires:
 *
 * 1. `readSync` is a function
 * 2. `fileURLToPath` is a function
 *
 * @param {ReadPowers|ReadFn} value
 * @returns {value is SyncReadPowers}
 */
export const isSyncReadPowers = value =>
  typeof value === 'object' &&
  'readSync' in value &&
  typeof value.readSync === 'function' &&
  'fileURLToPath' in value &&
  typeof value.fileURLToPath === 'function';
