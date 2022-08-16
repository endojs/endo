// @ts-check
import { trackTurns } from './track-turns.js';

/// <reference path="index.d.ts" />

const { details: X, quote: q } = assert;

/** @type {ProxyHandler<any>} */
const baseFreezableProxyHandler = {
  set(_target, _prop, _value) {
    return false;
  },
  isExtensible(_target) {
    return false;
  },
  setPrototypeOf(_target, _value) {
    return false;
  },
  deleteProperty(_target, _prop) {
    return false;
  },
};

/**
 * A Proxy handler for E(x).
 *
 * @param {*} x Any value passed to E(x)
 * @param {import('./index').HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler} the Proxy handler
 */
function EProxyHandler(x, HandledPromise) {
  return harden({
    ...baseFreezableProxyHandler,
    get(_target, p, receiver) {
      return harden(
        {
          [p](...args) {
            if (this !== receiver) {
              return HandledPromise.reject(
                assert.error(
                  X`Unexpected receiver for "${p}" method of E(${q(x)})`,
                ),
              );
            }

            return HandledPromise.applyMethod(x, p, args);
          },
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
        }[p],
      );
    },
    apply(_target, _thisArg, argArray = []) {
      return HandledPromise.applyFunction(x, argArray);
    },
    has(_target, _p) {
      // We just pretend everything exists.
      return true;
    },
  });
}

/**
 * A Proxy handler for E.sendOnly(x)
 * It is a variant on the E(x) Proxy handler.
 *
 * @param {*} x Any value passed to E.sendOnly(x)
 * @param {import('./index').HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler} the Proxy handler
 */
function EsendOnlyProxyHandler(x, HandledPromise) {
  return harden({
    ...baseFreezableProxyHandler,
    get(_target, p, receiver) {
      return harden(
        {
          [p](...args) {
            assert(this === receiver);
            HandledPromise.applyMethodSendOnly(x, p, args);
          },
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
        }[p],
      );
    },
    apply(_target, _thisArg, argsArray = []) {
      HandledPromise.applyFunctionSendOnly(x, argsArray);
      return undefined;
    },
    has(_target, _p) {
      // We just pretend that everything exists.
      return true;
    },
  });
}

/**
 * @param {import('./index').HandledPromiseConstructor} HandledPromise
 * @returns {import('./index').EProxy}
 */
export default function makeE(HandledPromise) {
  function E(x) {
    const handler = EProxyHandler(x, HandledPromise);
    return harden(new Proxy(() => {}, handler));
  }

  const makeEGetterProxy = x =>
    new Proxy(Object.create(null), {
      ...baseFreezableProxyHandler,
      has(_target, _prop) {
        return true;
      },
      get(_target, prop) {
        return HandledPromise.get(x, prop);
      },
    });

  E.get = makeEGetterProxy;
  E.resolve = HandledPromise.resolve;
  E.sendOnly = x => {
    const handler = EsendOnlyProxyHandler(x, HandledPromise);
    return harden(new Proxy(() => {}, handler));
  };

  E.when = (x, onfulfilled, onrejected) => {
    const [onsuccess, onfailure] = trackTurns([onfulfilled, onrejected]);
    return HandledPromise.resolve(x).then(onsuccess, onfailure);
  };

  return harden(E);
}
