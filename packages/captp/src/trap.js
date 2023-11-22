// Lifted mostly from `@endo/eventual-send/src/E.js`.

/**
 * Default implementation of Trap for near objects.
 *
 * @type {import('./types.js').TrapImpl}
 */
export const nearTrapImpl = harden({
  applyFunction(target, args) {
    return target(...args);
  },
  applyMethod(target, prop, args) {
    return target[prop](...args);
  },
  get(target, prop) {
    return target[prop];
  },
});

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
 * A Proxy handler for Trap(x)
 *
 * @param {any} x Any value passed to Trap(x)
 * @param {import('./types.js').TrapImpl} trapImpl
 * @returns {ProxyHandler}
 */
const TrapProxyHandler = (x, trapImpl) => {
  return harden({
    ...baseFreezableProxyHandler,
    get(_target, p, _receiver) {
      return (...args) => trapImpl.applyMethod(x, p, args);
    },
    apply(_target, _thisArg, argArray = []) {
      return trapImpl.applyFunction(x, argArray);
    },
    has(_target, _p) {
      // TODO: has property is not yet transferrable over captp.
      return true;
    },
  });
};

/**
 * @param {import('./types.js').TrapImpl} trapImpl
 * @returns {Trap}
 */
export const makeTrap = trapImpl => {
  const Trap = x => {
    const handler = TrapProxyHandler(x, trapImpl);
    return harden(new Proxy(() => {}, handler));
  };

  const makeTrapGetterProxy = x => {
    const handler = harden({
      ...baseFreezableProxyHandler,
      has(_target, _prop) {
        // TODO: has property is not yet transferrable over captp.
        return true;
      },
      get(_target, prop) {
        return trapImpl.get(x, prop);
      },
    });
    return new Proxy(Object.create(null), handler);
  };
  Trap.get = makeTrapGetterProxy;

  return harden(Trap);
};
