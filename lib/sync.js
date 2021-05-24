// Lifted mostly from `@agoric/eventual-send/src/E.js`.

import './types';

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
 * A Proxy handler for Sync(x)
 *
 * @param {*} x Any value passed to Sync(x)
 * @param {GetOrApplySync} getOrApplySync
 * @returns {ProxyHandler}
 */
function SyncProxyHandler(x, getOrApplySync) {
  return harden({
    ...readOnlyProxyHandler,
    get(_target, p, _receiver) {
      return (...args) => getOrApplySync(x, p, args);
    },
    apply(_target, _thisArg, argArray = []) {
      return getOrApplySync(x, null, argArray);
    },
    has(_target, _p) {
      // We just pretend everything exists.
      return true;
    },
  });
}

/**
 * @param {GetOrApplySync} getOrApplySync
 * @returns {Sync}
 */
export function makeSync(getOrApplySync) {
  function Sync(x) {
    const handler = SyncProxyHandler(x, getOrApplySync);
    return harden(new Proxy(() => {}, handler));
  }

  const makeSyncGetterProxy = x =>
    new Proxy(Object.create(null), {
      ...readOnlyProxyHandler,
      has(_target, prop) {
        return getOrApplySync(x, prop) !== undefined;
      },
      get(_target, prop) {
        return getOrApplySync(x, prop);
      },
    });
  Sync.get = makeSyncGetterProxy;

  return harden(Sync);
}
