/* global SES */
// eslint-disable-next-line spaced-comment
/// <reference path="index.d.ts" />

const harden = (typeof SES !== 'undefined' && SES.harden) || Object.freeze;

const readOnlyProxy = {
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
    ...readOnlyProxy,
    get(_target, p, _receiver) {
      if (`${p}` !== p) {
        return undefined;
      }
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

export default function makeE(HandledPromise) {
  function E(x) {
    const handler = EProxyHandler(x, HandledPromise);
    return harden(new Proxy(() => {}, handler));
  }

  const makeEGetterProxy = x =>
    new Proxy(Object.create(null), {
      ...readOnlyProxy,
      has(_target, _prop) {
        return true;
      },
      get(_target, prop) {
        return HandledPromise.get(x, prop);
      },
    });

  E.G = o => makeEGetterProxy(o);
  E.resolve = value => HandledPromise.resolve(value);

  return harden(E);
}
