// @ts-check

/// <reference types="ses"/>

/**
 * @template T
 * @callback PromiseExecutor The promise executor
 * @param {(value: import('./types.js').ERef<T>) => void} resolve
 * @param {(reason: any) => void} reject
 */

/**
 * makeReleasingExecutorKit() builds resolve/reject functions which drop references
 * to the resolve/reject functions gathered from an executor to be used with a
 * promise constructor.
 *
 * @template T
 * @returns {Pick<import('./types.js').PromiseKit<T>, 'resolve' | 'reject'> & { executor: PromiseExecutor<T>}}
 */
export const makeReleasingExecutorKit = () => {
  /** @type {null | undefined | ((value: import('./types.js').ERef<T>) => void)} */
  let internalResolve;
  /** @type {null | undefined | ((reason: unknown) => void)} */
  let internalReject;

  /** @param {import('./types.js').ERef<T>} value */
  const resolve = value => {
    if (internalResolve) {
      internalResolve(value);
      internalResolve = null;
      internalReject = null;
    } else {
      assert(internalResolve === null);
    }
  };

  /** @param {unknown} reason */
  const reject = reason => {
    if (internalReject) {
      internalReject(reason);
      internalResolve = null;
      internalReject = null;
    } else {
      assert(internalReject === null);
    }
  };

  const executor = (res, rej) => {
    assert(internalResolve === undefined && internalReject === undefined);
    internalResolve = res;
    internalReject = rej;
  };

  return harden({ resolve, reject, executor });
};
harden(makeReleasingExecutorKit);
