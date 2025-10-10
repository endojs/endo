/* This module provides the mechanism used by both the "unsafe" and "shallow"
 * (default) implementations of "@endo/harden" for racing to install an
 * implementation of harden at globalThis.harden and
 * Object[Symbol.for('harden')].
 */

/* global globalThis */

/** @import { Harden } from './types.js' */

const symbolForHarden = Symbol.for('harden');

/**
 * @param {() => Harden} makeHardener
 */
export const makeHardenerSelector = makeHardener => {

  const selectHarden = () => {
    // Favoring globalThis.harden over Object[@harden] allows the creator or
    // content of a Compartment to elect to use a different harden than the one
    // chosen for the realm, albeit the one chosen by lockdown.
    // Compartments are not generally multi-tenant, so the mutability of
    // globalThis.harden is not a concern.
    // However, compartments may be safely multi-tenant only if they freeze
    // globalThis.
    // So, this gives us the greatest flexibility without compromising integrity.
    // Ignoring the following error because it appears in prepack but not lint.
    // @ts-ignore-error Property 'harden' does not exist on type 'typeof globalThis'.
    const { harden: globalHarden } = globalThis;
    if (globalHarden) {
      if (typeof globalHarden !== 'function') {
        throw new Error('@endo/harden expected callable globalThis.harden');
      }
      return globalHarden;
    }

    // @ts-expect-error Type 'unique symbol' cannot be used as an index type.
    const { [symbolForHarden]: objectHarden } = Object;
    if (objectHarden) {
      if (typeof objectHarden !== 'function') {
        throw new Error('@endo/harden expected callable Object[@harden]');
      }
      return objectHarden;
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

  /**
   * True if this is the fake harden implementation (lockdown not called).
   * Undefined if using the real harden from lockdown.
   * @type {boolean | undefined}
   */
  Object.defineProperty(harden, 'isFake', {
    get() {
      if (!selectedHarden) {
        selectedHarden = selectHarden();
      }
      return selectedHarden.isFake;
    },
  });

  /**
   * True if this is the shallow harden implementation (lockdown not called).
   * Undefined if using the real harden from lockdown.
   * @type {boolean | undefined}
   */
  Object.defineProperty(harden, 'isShallow', {
    get() {
      if (!selectedHarden) {
        selectedHarden = selectHarden();
      }
      return selectedHarden.isShallow;
    },
  });

  /**
   * Error that would be thrown if lockdown were called after using fake harden.
   * Only present when isFake is true.
   * @type {Error | undefined}
   */
  Object.defineProperty(harden, 'lockdownError', {
    get() {
      if (!selectedHarden) {
        selectedHarden = selectHarden();
      }
      return selectedHarden.lockdownError;
    },
  });

  Object.freeze(harden);

  /** @param {object} object */
  const isFrozenIfSafe = object => {
    if (!selectedHarden) {
      selectedHarden = selectHarden();
    }
    return selectedHarden.isFake || Object.isFrozen(object);
  };
  Object.freeze(isFrozenIfSafe);

  return { harden, isFrozenIfSafe };
};
