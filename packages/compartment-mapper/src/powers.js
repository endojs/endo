/* As the interface of the Compartment Mapper evolved, it became necessary to
 * expand some function signatures that accepted a single power to one that
 * accepted a powers object.
 * This module provides functions for safely unpacking I/O capabilities and
 * maintaining backward-compatibility with older accepted usage patterns.
 */

// @ts-check

/** @import {CanonicalFn} from './types.js' */
/** @import {ReadNowPowers} from './types.js' */
/** @import {ReadNowPowersProp} from './types.js' */
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
 * Ordered array of every property in {@link ReadNowPowers} which is _required_.
 *
 * @satisfies {Readonly<{[K in ReadNowPowersProp]-?: {} extends Pick<ReadNowPowers, K> ? never : K}[ReadNowPowersProp][]>}
 */
const requiredReadNowPowersProps = freeze(
  /** @type {const} */ (['fileURLToPath', 'isAbsolute', 'maybeReadNow']),
);

/**
 * Returns `true` if `value` is a {@link ReadNowPowers}
 *
 * @param {ReadPowers|ReadFn|undefined} value
 * @returns {value is ReadNowPowers}
 */
export const isReadNowPowers = value =>
  Boolean(
    value &&
      typeof value === 'object' &&
      requiredReadNowPowersProps.every(
        prop => prop in value && typeof value[prop] === 'function',
      ),
  );

/**
 * Returns a list of the properties missing from (or invalid within) `value` that are required for
 * `value` to be a {@link ReadNowPowers}.
 *
 * Used for human-friendly error messages
 *
 * @param {ReadPowers | ReadFn} [value] The value to check for missing properties.
 * @returns {ReadNowPowersProp[]}
 */
export const findInvalidReadNowPowersProps = value => {
  if (!value || typeof value === 'function') {
    return [...requiredReadNowPowersProps];
  }
  return requiredReadNowPowersProps.filter(
    prop => !(prop in value) || typeof value[prop] !== 'function',
  );
};
