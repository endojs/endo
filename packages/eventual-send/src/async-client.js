// @ts-check

import harden from '@endo/harden';
import {
  makePromiseReflect,
  whenCompleted,
  whenQueued,
} from './promise-reflect.js';

const { defineProperties } = Object;

const skipped = harden({});

const isSkipped = value => value === skipped;

/**
 * @param {NodeState} state
 * @param {SendMode} [sendMode]
 */
const reflectOptions = (state, sendMode = state.sendMode) => ({
  ...state.eventualOptions,
  senderContext: state.eventualOptions?.senderContext ?? {},
  sendMode,
});

/**
 * @param {Promise<unknown>} result
 * @param {SendMode} sendMode
 */
const continuedResult = (result, sendMode) => {
  if (sendMode === 'sendOnly') {
    // The queue-stage failure is also observed through whenQueued(result).
    result.catch(() => undefined);
    return whenCompleted(result);
  }
  return result;
};

/** @type {WeakMap<NodeState, Promise<unknown>>} */
const materialized = new WeakMap();
/** @type {WeakMap<NodeState, () => Promise<unknown>>} */
const queued = new WeakMap();

/**
 * @typedef {'send' | 'sendOnly'} SendMode
 * @typedef {'shallow' | 'deep' | 'none'} Recursion
 *
 * @typedef {object} NodeState
 * @property {Promise<unknown>} [targetP]
 * @property {SendMode} sendMode
 * @property {boolean} optional
 * @property {Recursion} recursion
 * @property {Promise<unknown>} [methodTargetP]
 * @property {PropertyKey} [methodKey]
 * @property {boolean} [methodOptional]
 * @property {unknown} [expectedThis]
 * @property {import('./promise-reflect.js').EventualOptions} [eventualOptions]
 */

/** @param {unknown} value */
const lookupTarget = value => (value == null ? value : Object(value));

/**
 * @param {NodeState} state
 * @param {ReturnType<typeof makePromiseReflect>} promiseReflect
 * @returns {Promise<unknown>}
 */
const materializeP = (state, promiseReflect) => {
  if (state.targetP !== undefined) {
    return state.targetP;
  }
  const cached = materialized.get(state);
  if (cached !== undefined) {
    return cached;
  }
  if (state.methodTargetP === undefined || state.methodKey === undefined) {
    throw TypeError('Invalid promise client node state');
  }
  const { methodKey } = state;
  const operationP = state.methodTargetP.then(resolution => {
    if (isSkipped(resolution)) {
      return { result: Promise.resolve(skipped), queue: Promise.resolve() };
    }
    if (state.methodOptional === true && resolution == null) {
      return { result: Promise.resolve(skipped), queue: Promise.resolve() };
    }
    const target = lookupTarget(resolution);
    const publicResult = promiseReflect.get(
      target,
      methodKey,
      target,
      reflectOptions(state),
    );
    return {
      result: continuedResult(publicResult, state.sendMode),
      queue: whenQueued(publicResult),
    };
  });
  const result = operationP.then(operation => operation.result);
  materialized.set(state, result);
  queued.set(state, () => operationP.then(operation => operation.queue));
  return result;
};

/**
 * @param {NodeState} state
 * @param {Pick<PromiseConstructor, 'resolve'>} PromiseCtor
 * @param {ReturnType<typeof makePromiseReflect>} promiseReflect
 * @returns {Promise<unknown>}
 */
const resultP = (state, PromiseCtor, promiseReflect) => {
  const targetP = materializeP(state, promiseReflect);
  if (state.sendMode === 'sendOnly') {
    targetP.catch(() => undefined);
    return (queued.get(state)?.() ?? PromiseCtor.resolve()).then(
      () => undefined,
    );
  }
  return targetP.then(value =>
    isSkipped(value) ? undefined : harden(value),
  );
};

/**
 * @param {(...args: any[]) => unknown} then
 * @param {() => any} getSend
 * @param {() => any} getSendOnly
 * @param {() => any} getOptional
 * @returns {any}
 */
const hardenThen = (then, getSend, getSendOnly, getOptional) => {
  defineProperties(then, {
    Send: {
      get: getSend,
    },
    SendOnly: {
      get: getSendOnly,
    },
    Optional: {
      get: getOptional,
    },
  });
  return harden(then);
};

/**
 * @param {Pick<PromiseConstructor, 'resolve' | 'reject'>} [PromiseCtor]
 * @param {ReturnType<typeof makePromiseReflect>} [promiseReflect]
 * @returns {any}
 */
export const makePromiseClient = (
  PromiseCtor = Promise,
  promiseReflect = makePromiseReflect(PromiseCtor),
) => {
  /**
   * @param {unknown} target
   * @returns {Promise<unknown>}
   */
  const later = target => PromiseCtor.resolve().then(() => target);

  /**
   * @param {NodeState} state
   * @param {Recursion} recursion
   * @param {SendMode} sendMode
   * @param {boolean} optional
   * @returns {any}
   */
  let makeNode;

  /**
   * @param {NodeState} state
   */
  const makeThen = state => {
    const then = (onFulfilled, onRejected) =>
      resultP(state, PromiseCtor, promiseReflect).then(onFulfilled, onRejected);
    const controlledState = { ...state, expectedThis: then };

    return hardenThen(
      then,
      () => makeNode(controlledState, 'deep', state.sendMode, state.optional),
      () => makeNode(controlledState, 'deep', 'sendOnly', state.optional),
      () => {
        // Optional changes only the next operation and preserves the send mode.
        return makeNode(controlledState, 'deep', state.sendMode, true);
      },
    );
  };

  makeNode = (state, recursion, sendMode, optional) => {
    const proxyTarget = function promiseClientTarget() {};

    /** @type {ProxyHandler<(...args: unknown[]) => unknown>} */
    const handler = harden({
      apply(_target, thisArg, argArray = []) {
        if (thisArg !== state.expectedThis) {
          return makeNode(
            {
              ...state,
              targetP: PromiseCtor.reject(TypeError(`Unexpected thisArg`)),
              methodTargetP: undefined,
              methodKey: undefined,
              expectedThis: undefined,
              eventualOptions: state.eventualOptions,
            },
            recursion === 'deep' ? 'deep' : 'none',
            sendMode,
            optional,
          );
        }

        const args = harden([...argArray]);
        const optionalCall = optional || state.methodOptional === true;
        const operationRecordP =
          state.methodTargetP !== undefined && state.methodKey !== undefined
            ? state.methodTargetP.then(resolution => {
                if (isSkipped(resolution)) {
                  return {
                    result: PromiseCtor.resolve(skipped),
                    queue: PromiseCtor.resolve(),
                  };
                }
                if (optionalCall && resolution == null) {
                  return {
                    result: PromiseCtor.resolve(skipped),
                    queue: PromiseCtor.resolve(),
                  };
                }
                const target = lookupTarget(resolution);
                if (optionalCall) {
                  const publicResult = promiseReflect.optional(
                    target,
                    present =>
                      promiseReflect
                        .get(
                          present,
                          state.methodKey,
                          present,
                          reflectOptions(state, 'send'),
                        )
                        .then(method =>
                          method == null
                            ? skipped
                            : promiseReflect.apply(
                                method,
                                resolution,
                                args,
                                reflectOptions(state, 'send'),
                              ),
                        ),
                    reflectOptions(state, sendMode),
                  );
                  return {
                    result: continuedResult(publicResult, sendMode),
                    queue: whenQueued(publicResult),
                  };
                }
                const publicResult = promiseReflect.invoke(
                  target,
                  resolution,
                  state.methodKey,
                  args,
                  reflectOptions(state, sendMode),
                );
                return {
                  result: continuedResult(publicResult, sendMode),
                  queue: whenQueued(publicResult),
                };
              })
            : materializeP(state, promiseReflect).then(resolution => {
                if (isSkipped(resolution)) {
                  return {
                    result: PromiseCtor.resolve(skipped),
                    queue: PromiseCtor.resolve(),
                  };
                }
                if (optional && resolution == null) {
                  return {
                    result: PromiseCtor.resolve(skipped),
                    queue: PromiseCtor.resolve(),
                  };
                }
                const publicResult = promiseReflect.apply(
                  resolution,
                  undefined,
                  args,
                  reflectOptions(state, sendMode),
                );
                return {
                  result: continuedResult(publicResult, sendMode),
                  queue: whenQueued(publicResult),
                };
              });
        const operationP = operationRecordP.then(operation => operation.result);
        if (sendMode === 'sendOnly') {
          operationP.catch(() => undefined);
        }

        /** @type {NodeState} */
        const nextState = {
          targetP: operationP,
          sendMode,
          optional: false,
          recursion,
          eventualOptions: state.eventualOptions,
        };
        queued.set(nextState, () =>
          operationRecordP.then(operation => operation.queue),
        );
        return makeNode(
          nextState,
          recursion === 'deep' ? 'deep' : 'none',
          sendMode,
          false,
        );
      },
      get(_target, propertyKey, receiver) {
        if (propertyKey === 'then') {
          return makeThen(state);
        }
        if (propertyKey === Symbol.toStringTag) {
          return 'PromiseClientNode';
        }
        if (propertyKey === Symbol.toPrimitive) {
          return undefined;
        }

        if (recursion === 'none') {
          return makeNode(
            {
              targetP: PromiseCtor.reject(
                TypeError(
                  'Cannot pipeline further; enable chaining with E.Send(x) or E(x).then.Send',
                ),
              ),
              sendMode,
              optional,
              recursion: 'none',
              expectedThis: receiver,
              eventualOptions: state.eventualOptions,
            },
            'none',
            sendMode,
            optional,
          );
        }

        return makeNode(
          {
            sendMode,
            optional: false,
            recursion: recursion === 'shallow' ? 'none' : recursion,
            methodTargetP: materializeP(state, promiseReflect),
            methodKey: propertyKey,
            methodOptional: optional,
            expectedThis: receiver,
            eventualOptions: state.eventualOptions,
          },
          recursion === 'shallow' ? 'none' : recursion,
          sendMode,
          false,
        );
      },
    });

    return new Proxy(proxyTarget, handler);
  };

  /**
   * @param {Recursion} recursion
   * @param {SendMode} sendMode
   * @param {boolean} optional
   * @returns {(target: unknown, eventualOptions?: import('./promise-reflect.js').EventualOptions) => any}
   */
  const makeEntry = (recursion, sendMode, optional) => (target, eventualOptions) =>
    makeNode(
      {
        targetP: later(target),
        sendMode,
        optional,
        recursion,
        eventualOptions,
      },
      recursion,
      sendMode,
      optional,
    );

  const client = makeEntry('shallow', 'send', false);
  defineProperties(client, {
    Send: { value: makeEntry('deep', 'send', false) },
    SendOnly: { value: makeEntry('deep', 'sendOnly', false) },
    Optional: { value: makeEntry('deep', 'send', true) },
  });
  return harden(client);
};

harden(makePromiseClient);
