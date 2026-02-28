import harden from '@endo/harden';

const {
  isFrozen,
  freeze,
  // @ts-expect-error TS doesn't yet know about these proposed extensions
  isNonTrapping: optIsNonTrapping = undefined,
  // @ts-expect-error TS doesn't yet know about these proposed extensions
  suppressTrapping: optSuppressTrapping = undefined,
} = Object;

/**
 * If the shim is enabled, this is `isNonTrapping`. Otherwise it is `isFrozen`.
 */
export const isFrozenOrIsNonTrapping = optIsNonTrapping || isFrozen;

/**
 * If the shim is enabled, this is `suppressTrapping`. Otherwise it is `harden`.
 */
export const hardenOrSuppressTrapping = optSuppressTrapping || harden;

/**
 * If the shim is enabled, this is `suppressTrapping`. Otherwise it is `freeze`.
 */
export const freezeOrSuppressTrapping = optSuppressTrapping || freeze;
