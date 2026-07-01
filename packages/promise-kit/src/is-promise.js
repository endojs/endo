import harden from '@endo/harden';

/**
 * Determine if the argument is a Promise.
 *
 * @param {unknown} maybePromise The value to examine
 * @returns {maybePromise is Promise} Whether it is a promise
 */
export const isPromise = maybePromise =>
  Promise.resolve(maybePromise) === maybePromise;
harden(isPromise);
