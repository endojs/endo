// @ts-check

/**
 * ISSUE: harden compat? https://github.com/Agoric/SES-shim/issues/104
 *
 * @param {T} x
 * @template T
 * @returns {T}
 */
export function harden(x) {
  return Object.freeze(x);
}

// @ts-ignore
globalThis.harden = harden(harden);
