// @ts-check

const { defineProperties, freeze } = Object;

const skipped = freeze({});

const isSkipped = value => value === skipped;

/**
 * @typedef {'send' | 'sendOnly'} SendMode
 * @typedef {'shallow' | 'deep' | 'none'} Recursion
 *
 * @typedef {object} NodeState
 * @property {Promise<unknown>} targetP
 * @property {SendMode} sendMode
 * @property {boolean} optional
 * @property {Recursion} recursion
 * @property {Promise<unknown>} [methodTargetP]
 * @property {PropertyKey} [methodKey]
 * @property {boolean} [methodOptional]
 * @property {unknown} [expectedThis]
 */

/**
 * @param {unknown} target
 * @returns {Promise<unknown>}
 */
const later = target => Promise.resolve().then(() => target);

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
const resultP = state => {
  return state.targetP.then(value => (isSkipped(value) ? undefined : value));
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
 * @returns {PromiseLike<unknown>['then'] & {
 *   Once: any,
 *   Send: any,
 *   SendOnly: any,
 *   Optional: any,
 * }}
 */
const makeThen = state => {
  const then = (onFulfilled, onRejected) =>
    resultP(state).then(onFulfilled, onRejected);
  const controlledState = { ...state, expectedThis: undefined };

  defineProperties(then, {
    Once: {
      get() {
        return makeNode(
          controlledState,
          'shallow',
          state.sendMode,
          state.optional,
        );
      },
    },
    Send: {
      get() {
        return makeNode(controlledState, 'deep', state.sendMode, state.optional);
      },
    },
    SendOnly: {
      get() {
        return makeNode(controlledState, 'deep', 'sendOnly', state.optional);
      },
    },
    Optional: {
      get() {
        // Optional changes only the next operation and preserves the send mode.
        return makeNode(controlledState, 'deep', state.sendMode, true);
      },
    },
  });
  return /** @type {any} */ (freeze(then));
};

makeNode = (state, recursion, sendMode, optional) => {
  const proxyTarget = function eProxyTarget() {};

  /** @type {ProxyHandler<(...args: unknown[]) => unknown>} */
  const handler = freeze({
    apply(_target, thisArg, argArray = []) {
      if (state.expectedThis !== undefined && thisArg !== state.expectedThis) {
        return makeNode(
          {
            ...state,
            targetP: Promise.reject(TypeError(`Unexpected thisArg`)),
            methodTargetP: undefined,
            methodKey: undefined,
            expectedThis: undefined,
          },
          recursion === 'deep' ? 'deep' : 'none',
          sendMode,
          optional,
        );
      }

      const args = [...argArray];
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
              return applyMethod(
                /** @type {object} */ (resolution),
                state.methodKey,
                args,
                optionalCall,
              );
            })
          : state.targetP.then(resolution => {
              if (isSkipped(resolution)) {
                return skipped;
              }
              if (optional && resolution == null) {
                return skipped;
              }
              return applyFunction(resolution, args);
            });
      const targetP =
        sendMode === 'sendOnly'
          ? (operationP.catch(() => {}), Promise.resolve(undefined))
          : operationP;

      return makeNode(
        { targetP, sendMode, optional: false, recursion },
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
            targetP: Promise.reject(TypeError('Cannot pipeline further')),
            sendMode,
            optional,
            recursion: 'none',
          },
          'none',
          sendMode,
          optional,
        );
      }

      const operationP = state.targetP.then(resolution => {
        if (isSkipped(resolution)) {
          return skipped;
        }
        if (optional && resolution == null) {
          return skipped;
        }
        return /** @type {Record<PropertyKey, unknown>} */ (resolution)[
          propertyKey
        ];
      });
      operationP.catch(() => {});
      const targetP =
        sendMode === 'sendOnly'
          ? (operationP.catch(() => {}), Promise.resolve(undefined))
          : operationP;

      return makeNode(
        {
          targetP,
          sendMode,
          optional: false,
          recursion: recursion === 'shallow' ? 'none' : recursion,
          methodTargetP: state.targetP,
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

  const proxy = new Proxy(proxyTarget, handler);
  return proxy;
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

/**
 * @returns {any}
 */
export const makePromiseClient = () => {
  const client = makeEntry('shallow', 'send', false);
  defineProperties(client, {
    Once: { value: client },
    Send: { value: makeEntry('deep', 'send', false) },
    SendOnly: { value: makeEntry('deep', 'sendOnly', false) },
    Optional: { value: makeEntry('deep', 'send', true) },
  });
  return freeze(client);
};
