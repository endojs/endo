/* global harden */

import { trackTurns } from './track-turns';

// eslint-disable-next-line spaced-comment
/// <reference path="index.d.ts" />

const readOnlyProxyHandler = {
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
 * @returns {ProxyHandler} the Proxy handler
 */
function EProxyHandler(x, HandledPromise) {
  return harden({
    ...readOnlyProxyHandler,
    get(_target, p, _receiver) {
      // Harden this Promise because it's our only opportunity to ensure
      // p1=E(x).foo() is hardened. The Handled Promise API does not (yet)
      // allow the handler to synchronously influence the promise returned
      // by the handled methods, so we must freeze it from the outside. See
      // #95 for details.
      return (...args) => harden(HandledPromise.applyMethod(x, p, args));
    },
    apply(_target, _thisArg, argArray = []) {
      return harden(HandledPromise.applyFunction(x, argArray));
    },
    has(_target, _p) {
      // We just pretend everything exists.
      return true;
    },
  });
}

/**
 * A Proxy handler for E.sendOnly(x)
 * For now it is just a variant on the E(x) Proxy handler.
 *
 * @param {*} x Any value passed to E.sendOnly(x)
 * @returns {ProxyHandler} the Proxy handler
 */
function EsendOnlyProxyHandler(x, HandledPromise) {
  return harden({
    ...readOnlyProxyHandler,
    get(_target, p, _receiver) {
      return (...args) => {
        HandledPromise.applyMethod(x, p, args);
        return undefined;
      };
    },
    apply(_target, _thisArg, argsArray = []) {
      HandledPromise.applyFunction(x, argsArray);
      return undefined;
    },
    has(_target, _p) {
      // We just pretend that every thing exists.
      return true;
    },
  });
}

export default function makeE(HandledPromise) {
  function E(x) {
    const handler = EProxyHandler(x, HandledPromise);
    return harden(new Proxy(() => {}, handler));
  }

  const makeEGetterProxy = x =>
    new Proxy(Object.create(null), {
      ...readOnlyProxyHandler,
      has(_target, _prop) {
        return true;
      },
      get(_target, prop) {
        return harden(HandledPromise.get(x, prop));
      },
    });

  E.G = makeEGetterProxy;
  E.resolve = HandledPromise.resolve;
  E.sendOnly = x => {
    const handler = EsendOnlyProxyHandler(x, HandledPromise);
    return harden(new Proxy(() => {}, handler));
  };

  E.when = (x, onfulfilled = undefined, onrejected = undefined) => {
    const [onsuccess, onfailure] = trackTurns([onfulfilled, onrejected]);
    return HandledPromise.resolve(x).then(onsuccess, onfailure);
  };

  return harden(E);
}
