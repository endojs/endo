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
