/* global globalThis window */
// eslint-disable-next-line spaced-comment
/// <reference path="index.d.ts" />
// Shim globalThis when we don't have it.
if (typeof globalThis === 'undefined') {
  const myGlobal = typeof window === 'undefined' ? global : window;
  myGlobal.globalThis = myGlobal;
}

const harden = (globalThis.SES && globalThis.SES.harden) || Object.freeze;

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
    return harden(new Proxy({}, handler));
  }

  const makeEGetterProxy = (x, wrap = o => o) =>
    new Proxy(Object.create(null), {
      ...readOnlyProxy,
      has(_target, _prop) {
        return true;
      },
      get(_target, prop) {
        return wrap(HandledPromise.get(x, prop));
      },
    });

  const makeEDeleterProxy = (x, wrap = o => o) =>
    new Proxy(Object.create(null), {
      ...readOnlyProxy,
      has(_target, _prop) {
        return true;
      },
      get(_target, prop) {
        return wrap(HandledPromise.delete(x, prop));
      },
    });

  const makeEHasProxy = (x, wrap = o => o) =>
    new Proxy(Object.create(null), {
      ...readOnlyProxy,
      has(_target, _prop) {
        return true;
      },
      get(_target, prop) {
        return wrap(HandledPromise.has(x, prop));
      },
    });

  const makeESetterProxy = (x, wrap = o => o) =>
    new Proxy(Object.create(null), {
      ...readOnlyProxy,
      has(_target, _prop) {
        return true;
      },
      get(_target, prop) {
        return harden(value => wrap(HandledPromise.set(x, prop, value)));
      },
    });

  const makeEMethodProxy = (x, wrap = o => o) =>
    new Proxy((..._args) => {}, {
      ...readOnlyProxy,
      has(_target, _prop) {
        return true;
      },
      get(_target, prop) {
        return harden((...args) =>
          wrap(HandledPromise.applyMethod(x, prop, args)),
        );
      },
      apply(_target, _thisArg, args = []) {
        return wrap(HandledPromise.applyFunction(x, args));
      },
    });

  E.G = o => makeEGetterProxy(o);
  E.H = o => makeEHasProxy(o);
  E.D = o => makeEDeleterProxy(o);
  E.S = o => makeESetterProxy(o);
  E.M = o => makeEMethodProxy(o);

  const EChain = x =>
    harden({
      get G() {
        // Return getter.
        return makeEGetterProxy(x, EChain);
      },
      get D() {
        // Return deleter.
        return makeEDeleterProxy(x, EChain);
      },
      get H() {
        // Return has.
        return makeEHasProxy(x, EChain);
      },
      get S() {
        // Return setter.
        return makeESetterProxy(x, EChain);
      },
      get M() {
        // Return method-caller.
        return makeEMethodProxy(x, EChain);
      },
      get P() {
        // Return as promise.
        return Promise.resolve(x);
      },
    });

  E.C = EChain;
  return harden(E);
}
