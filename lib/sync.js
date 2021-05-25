// Lifted mostly from `@agoric/eventual-send/src/E.js`.

import './types';

/**
 * Default implementation of GetApplySync.
 *
 * @type {GetApplySync}
 */
export const nearGetApplySync = harden(
  (target, prop, methodArgs = undefined) => {
    if (Array.isArray(methodArgs)) {
      if (prop === null) {
        // Function application.
        return target(...methodArgs);
      }
      // Method application.
      return target[prop](...methodArgs);
    }
    // Property get.
    return target[prop];
  },
);

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
 * @param {GetApplySync} getApplySync
 * @returns {ProxyHandler}
 */
function SyncProxyHandler(x, getApplySync) {
  return harden({
    ...readOnlyProxyHandler,
    get(_target, p, _receiver) {
      return (...args) => getApplySync(x, p, args);
    },
    apply(_target, _thisArg, argArray = []) {
      return getApplySync(x, null, argArray);
    },
    has(_target, _p) {
      // We just pretend everything exists.
      return true;
    },
  });
}

/**
 * @param {GetApplySync} getApplySync
 * @returns {Sync}
 */
export function makeSync(getApplySync) {
  function Sync(x) {
    const handler = SyncProxyHandler(x, getApplySync);
    return harden(new Proxy(() => {}, handler));
  }

  const makeSyncGetterProxy = x =>
    new Proxy(Object.create(null), {
      ...readOnlyProxyHandler,
      has(_target, prop) {
        return getApplySync(x, prop) !== undefined;
      },
      get(_target, prop) {
        return getApplySync(x, prop);
      },
    });
  Sync.get = makeSyncGetterProxy;

  return harden(Sync);
}
