// @ts-check

/**
 * Determine if the argument is a Promise.
 *
 * @param {unknown} maybePromise The value to examine
 * @returns {maybePromise is Promise} Whether it is a promise
 */
export function isPromise(maybePromise) {
  return Promise.resolve(maybePromise) === maybePromise;
}
harden(isPromise);
