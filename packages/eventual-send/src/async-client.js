// @ts-check

import harden from '@endo/harden';
import {
  makeAsyncReflect,
  whenCompleted,
  whenQueued,
} from './async-reflect.js';

const { defineProperties } = Object;

const skipped = harden({});

const isSkipped = value => value === skipped;

/**
 * @param {Metadata} metadata
 * @param {SendMode} sendMode
 */
const reflectOptions = (metadata, sendMode) => ({
  ...metadata,
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
 * @typedef {import('./async-reflect.js').Metadata} Metadata
 *
 * @typedef {object} NodeState
 * @property {Promise<unknown>} [targetP]
 * @property {Promise<Metadata>} metadataP
 * @property {SendMode} sendMode
 * @property {boolean} optional
 * @property {Recursion} recursion
 * @property {Promise<unknown>} [methodTargetP]
 * @property {PropertyKey} [methodKey]
 * @property {boolean} [methodOptional]
 * @property {unknown} [expectedThis]
 */

/** @param {unknown} value */
const lookupTarget = value => (value == null ? value : Object(value));

/**
 * @param {NodeState} state
 * @param {ReturnType<typeof makeAsyncReflect>} asyncReflect
 * @returns {Promise<unknown>}
 */
const materializeP = (state, asyncReflect) => {
  if (state.targetP !== undefined) {
    return state.targetP;
  }
  const cached = materialized.get(state);
  if (cached !== undefined) {
    return cached;
  }
  if (state.methodTargetP === undefined || state.methodKey === undefined) {
    throw TypeError('Invalid async client node state');
  }
  const { methodKey } = state;
  const operationP = state.methodTargetP.then(resolution =>
    state.metadataP.then(metadata => {
      if (isSkipped(resolution)) {
        return { result: Promise.resolve(skipped), queue: Promise.resolve() };
      }
      if (state.methodOptional === true && resolution == null) {
        return { result: Promise.resolve(skipped), queue: Promise.resolve() };
      }
      const target = lookupTarget(resolution);
      const publicResult = asyncReflect.get(
        target,
        methodKey,
        target,
        reflectOptions(metadata, state.sendMode),
      );
      return {
        result: continuedResult(publicResult, state.sendMode),
        queue: whenQueued(publicResult),
      };
    }),
  );
  const result = operationP.then(operation => operation.result);
  materialized.set(state, result);
  queued.set(state, () => operationP.then(operation => operation.queue));
  return result;
};

/**
 * @param {NodeState} state
 * @param {ReturnType<typeof makeAsyncReflect>} asyncReflect
 * @returns {Promise<unknown>}
 */
const resultP = (state, asyncReflect) => {
  const targetP = materializeP(state, asyncReflect);
  if (state.sendMode === 'sendOnly') {
    targetP.catch(() => undefined);
    return state.metadataP
      .then(() => queued.get(state)?.() ?? state.metadataP)
      .then(() => undefined);
  }
  return targetP.then(value => (isSkipped(value) ? undefined : harden(value)));
};

/**
 * @param {(...args: any[]) => unknown} then
 * @param {() => any} getSend
 * @param {() => any} getSendOnly
 * @param {() => any} getOptional
 * @param {() => (updateOptions: (oldOptions: Metadata) => Metadata) => any} getMeta
 * @returns {any}
 */
const hardenThen = (then, getSend, getSendOnly, getOptional, getMeta) => {
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
    Meta: {
      get: getMeta,
    },
  });
  return harden(then);
};

/**
 * @param {Pick<PromiseConstructor, 'resolve' | 'reject'>} [PromiseCtor]
 * @param {ReturnType<typeof makeAsyncReflect>} [asyncReflect]
 * @returns {any}
 */
export const makeAsyncClient = (
  PromiseCtor = Promise,
  asyncReflect = makeAsyncReflect(PromiseCtor),
) => {
  /**
   * @param {unknown} target
   * @returns {Promise<unknown>}
   */
  const later = target => PromiseCtor.resolve().then(() => target);

  /**
   * @param {Partial<Metadata> | undefined} options
   * @param {boolean} complete
   * @returns {Metadata}
   */
  const normalizeMetadata = (options, complete) => {
    if (complete && options?.senderContext === undefined) {
      throw TypeError('Meta updater must return senderContext');
    }
    if (complete && options?.harden === undefined) {
      throw TypeError('Meta updater must return harden');
    }
    const hardenMode = options?.harden ?? 'none';
    if (hardenMode !== 'none' && hardenMode !== 'all') {
      throw TypeError("metadata.harden must be 'none' or 'all'");
    }
    const senderContext = harden(
      Object.fromEntries(Object.entries(options?.senderContext ?? {})),
    );
    return harden({ senderContext, harden: hardenMode });
  };

  /**
   * @param {import('./async-reflect.js').EventualOptions | undefined} options
   * @returns {Metadata}
   */
  const initialMetadata = options => {
    if (options?.result !== undefined) {
      throw TypeError('eventualOptions.result must be empty');
    }
    return normalizeMetadata(options, false);
  };

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
      resultP(state, asyncReflect).then(onFulfilled, onRejected);
    const controlledState = { ...state, expectedThis: then };

    return hardenThen(
      then,
      () => makeNode(controlledState, 'deep', state.sendMode, state.optional),
      () => makeNode(controlledState, 'deep', 'sendOnly', state.optional),
      () => {
        // Optional changes only the next operation and preserves the send mode.
        return makeNode(controlledState, 'deep', state.sendMode, true);
      },
      () =>
        harden(updateOptions => {
          const targetP = materializeP(state, asyncReflect);
          const predecessorQueue = queued.get(state);
          const metadataP = state.metadataP.then(oldOptions => {
            const updated = Reflect.apply(
              harden(updateOptions),
              undefined,
              harden([oldOptions]),
            );
            return normalizeMetadata(updated, true);
          });
          /** @type {NodeState} */
          const metaState = {
            ...controlledState,
            targetP: metadataP.then(() => targetP),
            metadataP,
            methodTargetP: undefined,
            methodKey: undefined,
            methodOptional: undefined,
            expectedThis: undefined,
          };
          if (predecessorQueue !== undefined) {
            queued.set(metaState, predecessorQueue);
          }
          return makeNode(
            metaState,
            'deep',
            state.sendMode,
            state.optional,
          );
        }),
    );
  };

  makeNode = (state, recursion, sendMode, optional) => {
    const proxyTarget = function asyncClientTarget() {};

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
            },
            recursion === 'deep' ? 'deep' : 'none',
            sendMode,
            optional,
          );
        }

        const args = harden([...argArray]);
        const optionalCall = optional || state.methodOptional === true;
        const operationRecordP = state.metadataP.then(metadata =>
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
                  const publicResult = asyncReflect.optional(
                    target,
                    present =>
                      asyncReflect
                        .get(
                          present,
                          state.methodKey,
                          present,
                          reflectOptions(metadata, 'send'),
                        )
                        .then(method =>
                          method == null
                            ? skipped
                            : asyncReflect.apply(
                                method,
                                resolution,
                                args,
                                reflectOptions(metadata, 'send'),
                              ),
                        ),
                    reflectOptions(metadata, sendMode),
                  );
                  return {
                    result: continuedResult(publicResult, sendMode),
                    queue: whenQueued(publicResult),
                  };
                }
                const publicResult = asyncReflect.invoke(
                  target,
                  resolution,
                  state.methodKey,
                  args,
                  reflectOptions(metadata, sendMode),
                );
                return {
                  result: continuedResult(publicResult, sendMode),
                  queue: whenQueued(publicResult),
                };
              })
            : materializeP(state, asyncReflect).then(resolution => {
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
                const publicResult = asyncReflect.apply(
                  resolution,
                  undefined,
                  args,
                  reflectOptions(metadata, sendMode),
                );
                return {
                  result: continuedResult(publicResult, sendMode),
                  queue: whenQueued(publicResult),
                };
              }),
        );
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
          metadataP: state.metadataP,
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
          return 'AsyncClientNode';
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
              metadataP: state.metadataP,
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
            methodTargetP: materializeP(state, asyncReflect),
            methodKey: propertyKey,
            methodOptional: optional,
            expectedThis: receiver,
            metadataP: state.metadataP,
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
   * @returns {(target: unknown, eventualOptions?: import('./async-reflect.js').EventualOptions) => any}
   */
  const makeEntry = (recursion, sendMode, optional) =>
    function asyncClientEntry(target, eventualOptions) {
      const metadataP = PromiseCtor.resolve().then(() =>
        initialMetadata(eventualOptions),
      );
      return makeNode(
        {
          targetP: metadataP.then(() => later(target)),
          metadataP,
          sendMode,
          optional,
          recursion,
        },
        recursion,
        sendMode,
        optional,
      );
    };

  const client = makeEntry('shallow', 'send', false);
  defineProperties(client, {
    Send: { value: makeEntry('deep', 'send', false) },
    SendOnly: { value: makeEntry('deep', 'sendOnly', false) },
    Optional: { value: makeEntry('deep', 'send', true) },
  });
  return harden(client);
};

harden(makeAsyncClient);
