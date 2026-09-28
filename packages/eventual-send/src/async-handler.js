// @ts-check

import harden from '@endo/harden';

/**
 * @typedef {Required<import('./async-reflect.js').EventualOptions>} HandlerOptions
 */

/**
 * @param {() => unknown} operation
 * @param {HandlerOptions} options
 * @returns {Promise<{ result: Promise<unknown> }>}
 */
const queue = (operation, options) => {
  const operationResult = Promise.resolve().then(operation);
  const result = harden(
    options.harden === 'all'
      ? operationResult.then(
          value => harden(value),
          reason => {
            harden(reason);
            throw reason;
          },
        )
      : operationResult,
  );
  return harden(Promise.resolve(harden({ result })));
};

export const localAsyncHandler = harden({
  /**
   * @param {unknown} target
   * @param {PropertyKey} key
   * @param {unknown} receiver
   * @param {HandlerOptions} options
   */
  get(target, key, receiver, options) {
    return queue(
      () => Reflect.get(/** @type {object} */ (target), key, receiver),
      options,
    );
  },

  /**
   * @param {unknown} target
   * @param {PropertyKey} key
   * @param {HandlerOptions} options
   */
  has(target, key, options) {
    return queue(
      () => Reflect.has(/** @type {object} */ (target), key),
      options,
    );
  },

  /**
   * @param {unknown} target
   * @param {HandlerOptions} options
   */
  ownKeys(target, options) {
    return queue(
      () => Reflect.ownKeys(/** @type {object} */ (target)),
      options,
    );
  },

  /**
   * @param {unknown} target
   * @param {unknown} thisArg
   * @param {readonly unknown[]} args
   * @param {HandlerOptions} options
   */
  apply(target, thisArg, args, options) {
    return queue(
      () =>
        Reflect.apply(
          /** @type {(...args: unknown[]) => unknown} */ (target),
          thisArg,
          /** @type {unknown[]} */ (args),
        ),
      options,
    );
  },

  /**
   * @param {unknown} target
   * @param {unknown} thisArg
   * @param {PropertyKey} key
   * @param {readonly unknown[]} args
   * @param {HandlerOptions} options
   */
  invoke(target, thisArg, key, args, options) {
    return queue(() => {
      const method = Reflect.get(/** @type {object} */ (target), key);
      return Reflect.apply(
        /** @type {(...args: unknown[]) => unknown} */ (method),
        thisArg,
        /** @type {unknown[]} */ (args),
      );
    }, options);
  },

  /**
   * @param {unknown} target
   * @param {readonly unknown[]} args
   * @param {unknown} newTarget
   * @param {HandlerOptions} options
   */
  construct(target, args, newTarget, options) {
    return queue(
      () =>
        Reflect.construct(
          /** @type {new (...args: unknown[]) => object} */ (target),
          /** @type {unknown[]} */ (args),
          /** @type {new (...args: unknown[]) => object} */ (newTarget),
        ),
      options,
    );
  },

  /**
   * @param {unknown} target
   * @param {PropertyKey} key
   * @param {unknown} value
   * @param {unknown} receiver
   * @param {HandlerOptions} options
   */
  set(target, key, value, receiver, options) {
    return queue(
      () => Reflect.set(/** @type {object} */ (target), key, value, receiver),
      options,
    );
  },

  /**
   * @param {unknown} target
   * @param {PropertyKey} key
   * @param {HandlerOptions} options
   */
  deleteProperty(target, key, options) {
    return queue(
      () => Reflect.deleteProperty(/** @type {object} */ (target), key),
      options,
    );
  },

  /**
   * @param {unknown} target
   * @param {(value: any) => unknown} continuation
   * @param {HandlerOptions} options
   */
  optional(target, continuation, options) {
    return queue(
      () => (target == null ? undefined : continuation(target)),
      options,
    );
  },
});

/** @typedef {typeof localAsyncHandler} AsyncHandler */
