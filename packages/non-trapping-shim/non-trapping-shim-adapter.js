const {
  isFrozen,
  freeze,
  // @ts-expect-error TS doesn't yet know about these proposed extensions
  isNonTrapping: optIsNonTrapping = undefined,
  // @ts-expect-error TS doesn't yet know about these proposed extensions
  suppressTrapping: optSuppressTrapping = undefined,
  // @ts-expect-error TS doesn't yet know about this harden rendezvous
  [Symbol.for('harden')]: optHarden = undefined,
} = Object;

/**
 * If the shim is enabled, this is `isNonTrapping`. Otherwise it is `isFrozen`.
 */
export const isFrozenOrIsNonTrapping = optIsNonTrapping || isFrozen;

/**
 * If the shim is enabled, this is `suppressTrapping`. Otherwise it is `harden`
 * if available, or `undefined` otherwise.
 */
export const hardenOrSuppressTrapping = optSuppressTrapping || optHarden;

/**
 * If the shim is enabled, this is `suppressTrapping`. Otherwise it is `freeze`.
 */
export const freezeOrSuppressTrapping = optSuppressTrapping || freeze;
