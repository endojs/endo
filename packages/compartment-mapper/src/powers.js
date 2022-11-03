// @ts-check
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').CanonicalFn} CanonicalFn */
/** @typedef {import('./types.js').ReadPowers} ReadPowers */

/** @type {CanonicalFn} */
const canonicalShim = async path => path;

/**
 * @param {ReadFn | ReadPowers} powers
 * @returns {ReadPowers}
 */
export const unpackReadPowers = powers => {
  if (typeof powers === 'function') {
    return {
      read: powers,
      canonical: canonicalShim,
    };
  }
  return powers;
};
