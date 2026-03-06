/// <reference types="ses"/>

/**
 * @import { Cancelled } from './types.js'
 */

/**
 * @callback SetTimeout
 * @param {() => void} callback
 * @param {number} ms
 * @returns {unknown}
 */

/**
 * Creates a delay function using the provided setTimeout implementation.
 *
 * @param {SetTimeout} setTimeout - The setTimeout function to use
 * @returns {(ms: number, parentCancelled: Cancelled) => Promise<undefined>}
 */
export const makeDelay = setTimeout => {
  /**
   * Returns a promise that fulfills with undefined after ms milliseconds,
   * or rejects if parentCancelled is triggered, whichever comes first.
   *
   * @param {number} ms - Milliseconds to delay
   * @param {Cancelled} parentCancelled - Parent cancellation token
   * @returns {Promise<undefined>}
   */
  const delay = (ms, parentCancelled) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(undefined), ms);

      parentCancelled.then(
        () => {
          reject(assert.error('parentCancelled must not fulfill'));
        },
        reason => {
          reject(reason);
        },
      );
    });
  };

  return harden(delay);
};
harden(makeDelay);
