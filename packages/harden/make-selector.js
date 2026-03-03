/* This module provides the mechanism used by both the "unsafe" and "shallow"
 * (default) implementations of "@endo/harden" for racing to install an
 * implementation of harden at globalThis.harden and
 * Object[Symbol.for('harden')].
 */

/* global globalThis */

/** @import { Harden } from './make-hardener.js' */

const symbolForHarden = Symbol.for('harden');

/**
 * @template T
 * @param {() => Harden<T>} makeHardener
 */
export const makeHardenerSelector = makeHardener => {
  const selectHarden = () => {
    // @ts-expect-error Type 'unique symbol' cannot be used as an index type.
    const { [symbolForHarden]: objectHarden } = Object;
    if (objectHarden) {
      if (typeof objectHarden !== 'function') {
        throw new Error('@endo/harden expected callable Object[@harden]');
      }
      return objectHarden;
    }

    // @ts-ignore globalThis.harden is a HardenedJS convention
    const { harden: globalHarden } = globalThis;
    if (globalHarden) {
      if (typeof globalHarden !== 'function') {
        throw new Error('@endo/harden expected callable globalThis.harden');
      }
      return globalHarden;
    }

    const harden = makeHardener();
    // We should not reach this point if a harden implementation already exists here.
    // The non-configurability of this property will prevent any HardenedJS's
    // lockdown from succeeding.
    // Versions that predate the introduction of Object[@harden] will be unable
    // to remove the unknown intrinsic.
    // Versions that permit Object[@harden] fail explicitly.
    Object.defineProperty(Object, symbolForHarden, {
      value: harden,
      configurable: false,
      writable: false,
    });

    return harden;
  };

  let selectedHarden;

  /**
   * @template T
   * @param {T} object
   * @returns {T}
   */
  const harden = object => {
    if (!selectedHarden) {
      selectedHarden = selectHarden();
    }
    return selectedHarden(object);
  };
  Object.freeze(harden);

  return harden;
};
