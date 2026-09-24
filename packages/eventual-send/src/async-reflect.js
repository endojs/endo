// @ts-check

import harden from '@endo/harden';
import { localPromiseHandler } from './promise-handler.js';

/** @import { PromiseHandler, HandlerOptions } from './promise-handler.js' */

/**
 * @typedef {object} EventualOptions
 * @property {Promise<unknown>} [result]
 * @property {Record<string, any>} senderContext
 * @property {'send' | 'sendOnly'} [sendMode]
 * @property {'none' | 'all'} [harden]
 */

/** @type {WeakMap<Promise<unknown>, Promise<{ result: Promise<unknown> }>>} */
const queuedOperations = new WeakMap();
/** @type {WeakMap<Promise<unknown>, Promise<unknown>>} */
const completedOperations = new WeakMap();

/**
 * Obtain the queue stage of a result returned by this ponyfill.
 * @param {Promise<unknown>} result
 */
export const whenQueued = result => queuedOperations.get(result) ?? result;

/**
 * Obtain the completed value needed to continue a pipelined send-only chain.
 * @param {Promise<unknown>} result
 */
export const whenCompleted = result =>
  completedOperations.get(result) ?? result;

/**
 * @param {Pick<PromiseConstructor, 'resolve'>} [PromiseCtor]
 * @param {PromiseHandler} [handler]
 */
export const makePromiseReflect = (
  PromiseCtor = Promise,
  handler = localPromiseHandler,
) => {
  /** @param {unknown} target */
  const later = target => PromiseCtor.resolve().then(() => target);

  /**
   * @template T
   * @param {T} value
   * @param {HandlerOptions} options
   * @returns {T}
   */
  const hardenIfAll = (value, options) =>
    options.harden === 'all' ? harden(value) : value;

  /**
   * @param {unknown[]} args
   * @param {HandlerOptions} options
   */
  const sanitizeArgs = (args, options) =>
    hardenIfAll(
      Object.freeze([...(options.harden === 'all' ? harden(args) : args)]),
      options,
    );

  /**
   * @param {unknown} target
   * @param {EventualOptions | undefined} eventualOptions
   * @param {(resolved: unknown, options: HandlerOptions) => Promise<{ result: Promise<unknown> }>} operation
   * @returns {Promise<unknown>}
   */
  const dispatch = (target, eventualOptions, operation) => {
    /** @type {HandlerOptions} */
    let handlerOptions;
    /** @type {Promise<unknown>} */
    let resultP;
    /** @type {Promise<unknown>} */
    let completionP;
    let sendOnly = false;
    let hardenAll = false;
    const queuedP = PromiseCtor.resolve()
      .then(() => {
        if (eventualOptions?.result !== undefined) {
          throw TypeError('eventualOptions.result must be empty');
        }
        sendOnly = eventualOptions?.sendMode === 'sendOnly';
        hardenAll = eventualOptions?.harden === 'all';
        if (hardenAll) {
          harden(eventualOptions);
        }
        if (sendOnly) {
          completionP.catch(() => undefined);
        }
        const senderContext = harden(
          Object.fromEntries(
            Object.entries(eventualOptions?.senderContext ?? {}),
          ),
        );
        handlerOptions = harden({
          result: resultP,
          senderContext,
          sendMode: eventualOptions?.sendMode ?? 'send',
          harden: eventualOptions?.harden ?? 'none',
        });
        return hardenIfAll(target, handlerOptions);
      })
      .then(resolved =>
        operation(hardenIfAll(resolved, handlerOptions), handlerOptions),
      )
      .then(envelope => {
        const result =
          hardenAll
            ? envelope.result.then(
                value => harden(value),
                reason => {
                  harden(reason);
                  throw reason;
                },
              )
            : envelope.result;
        return harden({ result: harden(result) });
      })
      .catch(reason => {
        if (hardenAll) {
          harden(reason);
        }
        throw reason;
      });
    completionP = queuedP.then(({ result }) => result);
    resultP = harden(
      queuedP.then(
        () => (sendOnly ? undefined : completionP),
        () => completionP,
      ),
    );
    queuedOperations.set(resultP, queuedP);
    completedOperations.set(resultP, completionP);
    return resultP;
  };

  /**
   * @param {unknown} target
   * @param {PropertyKey} propertyKey
   * @param {unknown} [receiver]
   * @param {EventualOptions} [eventualOptions]
   * @returns {Promise<unknown>}
   */
  function get(target, propertyKey, receiver, eventualOptions) {
    const hasReceiver = arguments.length >= 3;
    return dispatch(target, eventualOptions, (resolved, options) =>
      handler.get(
        resolved,
        propertyKey,
        hardenIfAll(hasReceiver ? receiver : resolved, options),
        options,
      ),
    );
  }

  /**
   * @param {unknown} target
   * @param {PropertyKey} propertyKey
   * @param {EventualOptions} [eventualOptions]
   * @returns {Promise<boolean>}
   */
  const has = (target, propertyKey, eventualOptions) =>
    /** @type {Promise<boolean>} */ (
      dispatch(target, eventualOptions, (resolved, options) =>
        handler.has(resolved, propertyKey, options),
      )
    );

  /**
   * @param {unknown} target
   * @param {EventualOptions} [eventualOptions]
   * @returns {Promise<PropertyKey[]>}
   */
  const ownKeys = (target, eventualOptions) =>
    /** @type {Promise<PropertyKey[]>} */ (
      dispatch(target, eventualOptions, (resolved, options) =>
        handler.ownKeys(resolved, options),
      )
    );

  /**
   * @param {unknown} target
   * @param {unknown} thisArg
   * @param {unknown[]} args
   * @param {EventualOptions} [eventualOptions]
   * @returns {Promise<unknown>}
   */
  const apply = (target, thisArg, args, eventualOptions) =>
    dispatch(target, eventualOptions, (resolved, options) =>
      handler.apply(
        resolved,
        hardenIfAll(thisArg, options),
        sanitizeArgs(args, options),
        options,
      ),
    );

  /**
   * @param {unknown} target
   * @param {unknown} thisArg
   * @param {PropertyKey} propertyKey
   * @param {unknown[]} args
   * @param {EventualOptions} [eventualOptions]
   * @returns {Promise<unknown>}
   */
  const invoke = (target, thisArg, propertyKey, args, eventualOptions) =>
    dispatch(target, eventualOptions, (resolved, options) =>
      handler.invoke(
        resolved,
        hardenIfAll(thisArg, options),
        propertyKey,
        sanitizeArgs(args, options),
        options,
      ),
    );

  /**
   * @param {unknown} target
   * @param {unknown[]} args
   * @param {unknown} [newTarget]
   * @param {EventualOptions} [eventualOptions]
   * @returns {Promise<object>}
   */
  function construct(target, args, newTarget, eventualOptions) {
    const hasNewTarget = arguments.length >= 3;
    return /** @type {Promise<object>} */ (
      dispatch(target, eventualOptions, async (resolved, options) => {
        const chosenNewTarget = hasNewTarget ? newTarget : resolved;
        const resolvedNewTarget = await later(chosenNewTarget);
        return handler.construct(
          resolved,
          sanitizeArgs(args, options),
          hasNewTarget && resolvedNewTarget !== resolved
            ? harden(resolvedNewTarget)
            : hardenIfAll(resolvedNewTarget, options),
          options,
        );
      })
    );
  }

  /**
   * @param {unknown} target
   * @param {PropertyKey} propertyKey
   * @param {unknown} value
   * @param {unknown} [receiver]
   * @param {EventualOptions} [eventualOptions]
   * @returns {Promise<boolean>}
   */
  function set(target, propertyKey, value, receiver, eventualOptions) {
    const hasReceiver = arguments.length >= 4;
    return /** @type {Promise<boolean>} */ (
      dispatch(target, eventualOptions, (resolved, options) =>
        handler.set(
          resolved,
          propertyKey,
          harden(value),
          hardenIfAll(hasReceiver ? receiver : resolved, options),
          options,
        ),
      )
    );
  }

  /**
   * @param {unknown} target
   * @param {PropertyKey} propertyKey
   * @param {EventualOptions} [eventualOptions]
   * @returns {Promise<boolean>}
   */
  const deleteProperty = (target, propertyKey, eventualOptions) =>
    /** @type {Promise<boolean>} */ (
      dispatch(target, eventualOptions, (resolved, options) =>
        handler.deleteProperty(resolved, propertyKey, options),
      )
    );

  /**
   * @template V
   * @template R
   * @param {V} value
   * @param {(nonNullish: Exclude<Awaited<V>, null | undefined>) => R} continuation
   * @param {EventualOptions} [eventualOptions]
   * @returns {Promise<Awaited<R> | undefined>}
   */
  const optional = (value, continuation, eventualOptions) =>
    /** @type {Promise<Awaited<R> | undefined>} */ (
      dispatch(value, eventualOptions, (resolved, options) =>
        handler.optional(resolved, harden(continuation), options),
      )
    );

  return harden({
    get,
    has,
    ownKeys,
    apply,
    invoke,
    construct,
    set,
    deleteProperty,
    optional,
  });
};

harden(makePromiseReflect);
