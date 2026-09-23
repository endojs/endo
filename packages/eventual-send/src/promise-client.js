// @ts-check

import harden from '@endo/harden';

const { defineProperties } = Object;

const skipped = harden({});

const isSkipped = value => value === skipped;

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
 */

/**
 * @param {object} target
 * @param {PropertyKey} key
 * @param {unknown[]} args
 * @param {boolean} optional
 * @returns {unknown}
 */
const applyMethod = (target, key, args, optional) => {
  const method = target[key];
  if (optional && method == null) {
    return skipped;
  }
  return Reflect.apply(method, target, args);
};

/**
 * @param {unknown} target
 * @param {unknown[]} args
 * @returns {unknown}
 */
const applyFunction = (target, args) => {
  return Reflect.apply(
    /** @type {(...args: unknown[]) => unknown} */ (target),
    undefined,
    args,
  );
};

/**
 * @param {NodeState} state
 * @returns {Promise<unknown>}
 */
const materializeP = state => {
  if (state.targetP !== undefined) {
    return state.targetP;
  }
  if (state.methodTargetP === undefined || state.methodKey === undefined) {
    throw TypeError('Invalid promise client node state');
  }
  const { methodKey } = state;
  return state.methodTargetP.then(resolution => {
    if (isSkipped(resolution)) {
      return skipped;
    }
    if (state.methodOptional === true && resolution == null) {
      return skipped;
    }
    return harden(
      /** @type {Record<PropertyKey, unknown>} */ (resolution)[methodKey],
    );
  });
};

/**
 * @param {NodeState} state
 * @param {Pick<PromiseConstructor, 'resolve'>} PromiseCtor
 * @returns {Promise<unknown>}
 */
const resultP = (state, PromiseCtor) => {
  const targetP = materializeP(state);
  if (state.sendMode === 'sendOnly') {
    targetP.catch(() => undefined);
    return PromiseCtor.resolve(undefined);
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
 * @returns {any}
 */
export const makePromiseClient = (PromiseCtor = Promise) => {
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
      resultP(state, PromiseCtor).then(onFulfilled, onRejected);
    const controlledState = { ...state, expectedThis: undefined };

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
        if (state.expectedThis !== undefined && thisArg !== state.expectedThis) {
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
        const operationP =
          state.methodTargetP !== undefined && state.methodKey !== undefined
            ? state.methodTargetP.then(resolution => {
                if (isSkipped(resolution)) {
                  return skipped;
                }
                if (optionalCall && resolution == null) {
                  return skipped;
                }
                return harden(
                  applyMethod(
                    /** @type {object} */ (resolution),
                    state.methodKey,
                    args,
                    optionalCall,
                  ),
                );
              })
            : materializeP(state).then(resolution => {
                if (isSkipped(resolution)) {
                  return skipped;
                }
                if (optional && resolution == null) {
                  return skipped;
                }
                return harden(applyFunction(resolution, args));
              });
        if (sendMode === 'sendOnly') {
          operationP.catch(() => undefined);
        }

        return makeNode(
          { targetP: operationP, sendMode, optional: false, recursion },
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
            methodTargetP: materializeP(state),
            methodKey: propertyKey,
            methodOptional: optional,
            expectedThis: receiver,
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
   * @returns {(target: unknown) => any}
   */
  const makeEntry = (recursion, sendMode, optional) => target =>
    makeNode(
      {
        targetP: later(target),
        sendMode,
        optional,
        recursion,
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
