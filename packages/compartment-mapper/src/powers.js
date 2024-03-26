// @ts-check

/** @type {import('./types.js').CanonicalFn} */
const canonicalShim = async path => path;

/**
 * @param {import('./types.js').ReadFn | import('./types.js').ReadPowers | import('./types.js').MaybeReadPowers} powers
 * @returns {import('./types.js').MaybeReadPowers}
 */
export const unpackReadPowers = powers => {
  /** @type {import('./types.js').ReadFn | undefined} */
  let read;
  /** @type {import('./types.js').MaybeReadFn | undefined} */
  let maybeRead;
  /** @type {import('./types.js').CanonicalFn | undefined} */
  let canonical;

  if (typeof powers === 'function') {
    read = powers;
  } else {
    ({ read, maybeRead, canonical } =
      /** @type {import('./types.js').MaybeReadPowers} */ (powers));
  }

  if (canonical === undefined) {
    canonical = canonicalShim;
  }

  if (maybeRead === undefined) {
    /** @param {string} path */
    maybeRead = path =>
      /** @type {import('./types.js').ReadFn} */ (read)(path).catch(
        _error => undefined,
      );
  }

  return {
    ...powers,
    read,
    maybeRead,
    canonical,
  };
};
