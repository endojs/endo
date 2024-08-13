/* As the interface of the Compartment Mapper evolved, it became necessary to
 * expand some function signatures that accepted a single power to one that
 * accepted a powers object.
 * This module provides functions for safely unpacking I/O capabilities and
 * maintaining backward-compatibility with older accepted usage patterns.
 */

// @ts-check

/** @import {CanonicalFn} from './types.js' */
/** @import {SyncReadPowers} from './types.js' */
/** @import {SyncReadPowersProp} from './types.js' */
/** @import {ReadFn} from './types.js' */
/** @import {ReadPowers} from './types.js' */
/** @import {MaybeReadPowers} from './types.js' */
/** @import {MaybeReadFn} from './types.js' */

const { freeze } = Object;

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
 * Ordered array of every property in {@link SyncReadPowers} which is _required_.
 *
 * @satisfies {Readonly<{[K in SyncReadPowersProp]-?: {} extends Pick<SyncReadPowers, K> ? never : K}[SyncReadPowersProp][]>}
 */
const requiredSyncReadPowersProps = freeze(
  /** @type {const} */ (['fileURLToPath', 'isAbsolute', 'maybeReadSync']),
);

/**
 * Returns `true` if `value` is a {@link SyncReadPowers}
 *
 * @param {ReadPowers|ReadFn} value
 * @returns {value is SyncReadPowers}
 */
export const isSyncReadPowers = value =>
  typeof value === 'object' &&
  requiredSyncReadPowersProps.every(
    prop => prop in value && typeof value[prop] === 'function',
  );

/**
 * Returns a list of the properties missing from (or invalid within) `value` that are required for
 * `value` to be a {@link SyncReadPowers}.
 *
 * Used for human-friendly error messages
 *
 * @param {ReadPowers | ReadFn} value The value to check for missing properties.
 * @returns {SyncReadPowersProp[]}
 */
export const findInvalidSyncReadPowersProps = value => {
  if (typeof value === 'function') {
    return [...requiredSyncReadPowersProps];
  }
  return requiredSyncReadPowersProps.filter(
    prop => !(prop in value) || typeof value[prop] !== 'function',
  );
};
