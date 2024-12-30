const OriginalObject = Object;
const OriginalReflect = Reflect;
const OriginalProxy = Proxy;
const { freeze, defineProperty, hasOwn } = OriginalObject;
const { apply, construct, ownKeys } = OriginalReflect;

const noTrappingSet = new WeakSet();

const proxyHandlerMap = new WeakMap();

const isPrimitive = specimen => OriginalObject(specimen) !== specimen;

/**
 * Corresponds to the internal function shared by `Object.isNoTrapping` and
 * `Reflect.isNoTrapping`.
 *
 * @param {any} specimen
 * @param {boolean} shouldThrow
 * @returns {boolean}
 */
const isNoTrappingInternal = (specimen, shouldThrow) => {
  if (noTrappingSet.has(specimen)) {
    return true;
  }
  if (!proxyHandlerMap.has(specimen)) {
    return false;
  }
  const [target, handler] = proxyHandlerMap.get(specimen);
  if (isNoTrappingInternal(target, shouldThrow)) {
    noTrappingSet.add(specimen);
    return true;
  }
  const trap = handler.isNoTrapping;
  if (trap === undefined) {
    return false;
  }
  const result = apply(trap, handler, [target]);
  const ofTarget = isNoTrappingInternal(target, shouldThrow);
  if (result !== ofTarget) {
    if (shouldThrow) {
      throw TypeError(
        `'isNoTrapping' proxy trap does not reflect 'isNoTrapping' of proxy target (which is '${ofTarget}')`,
      );
    }
    return false;
  }
  if (result) {
    noTrappingSet.add(specimen);
  }
  return result;
};

/**
 *  Corresponds to the internal function shared by `Object.suppressTrapping` and
 * `Reflect.suppressTrapping`.
 *
 * @param {any} specimen
 * @param {boolean} shouldThrow
 * @returns {boolean}
 */
const suppressTrappingInternal = (specimen, shouldThrow) => {
  if (noTrappingSet.has(specimen)) {
    return true;
  }
  freeze(specimen);
  if (!proxyHandlerMap.has(specimen)) {
    noTrappingSet.add(specimen);
    return true;
  }
  const [target, handler] = proxyHandlerMap.get(specimen);
  if (isNoTrappingInternal(target, shouldThrow)) {
    noTrappingSet.add(specimen);
    return true;
  }
  const trap = handler.suppressTrapping;
  if (trap === undefined) {
    const result = suppressTrappingInternal(target, shouldThrow);
    if (result) {
      noTrappingSet.add(specimen);
    }
    return result;
  }
  const result = apply(trap, handler, [target]);
  const ofTarget = isNoTrappingInternal(target, shouldThrow);
  if (result !== ofTarget) {
    if (shouldThrow) {
      throw TypeError(
        `'suppressTrapping' proxy trap does not reflect 'isNoTrapping' of proxy target (which is '${ofTarget}')`,
      );
    }
    return false;
  }
  if (result) {
    noTrappingSet.add(specimen);
  }
  return result;
};

export const extraReflectMethods = freeze({
  isNoTrapping(target) {
    if (isPrimitive(target)) {
      throw TypeError('Reflect.isNoTrapping called on non-object');
    }
    return isNoTrappingInternal(target, false);
  },
  suppressTrapping(target) {
    if (isPrimitive(target)) {
      throw TypeError('Reflect.suppressTrapping called on non-object');
    }
    return suppressTrappingInternal(target, false);
  },
});

export const extraObjectMethods = freeze({
  isNoTrapping(target) {
    if (isPrimitive(target)) {
      return true;
    }
    return isNoTrappingInternal(target, true);
  },
  suppressTrapping(target) {
    if (isPrimitive(target)) {
      return target;
    }
    if (suppressTrappingInternal(target, true)) {
      return target;
    }
    throw TypeError('preventExtensions trap returned falsy');
  },
});

const addExtras = (base, ...extrasArgs) => {
  for (const extras of extrasArgs) {
    for (const key of ownKeys(extras)) {
      if (base[key] !== extras[key]) {
        defineProperty(base, key, {
          value: extras[key],
          writable: true,
          enumerable: false,
          configurable: true,
        });
      }
    }
  }
};

/** In the shim, `ReflectPlus` replaces the global `Reflect`. */
const ReflectPlus = {};
addExtras(ReflectPlus, OriginalReflect, extraReflectMethods);
export { ReflectPlus };

/**
 * In the shim, `ObjectPlus` replaces the global `Object`.
 *
 * @type {ObjectConstructor}
 */
// @ts-expect-error TS does not know the rest of the type is added below
const ObjectPlus = function Object(...args) {
  if (new.target) {
    return construct(OriginalObject, args, new.target);
  } else {
    return apply(OriginalObject, this, args);
  }
};
// @ts-expect-error We actually can assign to its `.prototype`.
ObjectPlus.prototype = OriginalObject.prototype;
addExtras(ObjectPlus, OriginalObject, extraObjectMethods);
export { ObjectPlus };

const metaHandler = freeze({
  get(_, trapName, handlerPlus) {
    /**
     * The `trapPlus` method is an enhanced version of
     * `originalHandler[trapName]`. If the handlerPlus has no own `trapName`
     * property, then the `get` of the metaHandler is called, which returns
     * the `trapPlus`, which is then called as the trap of the returned
     * proxyPlus. When so called, it installs an own `handlerPlus[trapName]`
     * which is either `undefined` or this same `trapPlus`, to avoid further
     * need to meta-handle that `handlerPlus[trapName]`.
     *
     * @param {any} target
     * @param {any[]} rest
     */
    const trapPlus = freeze((target, ...rest) => {
      if (isNoTrappingInternal(target, true)) {
        defineProperty(handlerPlus, trapName, {
          value: undefined,
          writable: false,
          enumerable: true,
          configurable: false,
        });
      } else {
        if (!hasOwn(handlerPlus, trapName)) {
          defineProperty(handlerPlus, trapName, {
            value: trapPlus,
            writable: false,
            enumerable: true,
            configurable: true,
          });
        }
        const { originalHandler } = handlerPlus;
        const trap = originalHandler[trapName];
        if (trap !== undefined) {
          // Note that whether `trap === undefined` can change dynamically,
          // so we do not install an own `handlerPlus[trapName] === undefined`
          // for that case. We still install or preserve an own
          // `handlerPlus[trapName] === trapPlus` until the target is
          // seen to be non-trapping.
          return apply(trap, originalHandler, [target, ...rest]);
        }
      }
      return ReflectPlus[trapName](target, ...rest);
    });
    return trapPlus;
  },
});

/**
 * A handlerPlus starts as a fresh empty object that inherits from a proxy
 * whose handler is the shared generic metaHandler.
 * Thus, the metaHandler's `get` method is called only when the
 * `handlerPlus` does not have a property overriding that `trapName`.
 * In that case, the metaHandler's `get` is called with its `receiver`
 * being the `handlerPlus`.
 *
 * @param {ProxyHandler<any>} originalHandler
 * @returns {ProxyHandler<any> & {
 *   isNoTrapping: (target: any) => boolean,
 *   suppressTrapping: (target: any) => boolean,
 *   originalHandler: ProxyHandler<any>
 * }}
 */
const makeHandlerPlus = originalHandler => ({
  // @ts-expect-error TS does not know what this __proto__ is doing
  __proto__: new OriginalProxy({}, metaHandler),
  // relies on there never being a trap named `originalHandler`.
  originalHandler,
});

/**
 * In the shim, `ProxyPlus` replaces the global `Proxy`.
 *
 * @type {ProxyConstructor}
 */
// @ts-expect-error We reject non-new calls in the body
const ProxyPlus = function Proxy(target, handler) {
  // @ts-expect-error Yes, we mean to compare these.
  if (new.target !== ProxyPlus) {
    if (new.target === undefined) {
      throw TypeError('Proxy constructor requires "new"');
    }
    throw TypeError('Safe Proxy shim does not support subclassing');
  }
  const handlerPlus = makeHandlerPlus(handler);
  const proxy = new OriginalProxy(target, handlerPlus);
  proxyHandlerMap.set(proxy, [target, handler]);
  return proxy;
};
// The `OriginalProxy` is both constructible (i.e., responsive to `new`) and
// lacks a `prototype` property. The closest we can come to this is to set
// `ProxyPlus.prototype` to `undefined`
ProxyPlus.prototype = undefined;
ProxyPlus.revocable = (target, handler) => {
  const handlerPlus = makeHandlerPlus(handler);
  const { proxy, revoke } = OriginalProxy.revocable(target, handlerPlus);
  proxyHandlerMap.set(proxy, [target, handler]);
  return {
    proxy,
    revoke() {
      if (isNoTrappingInternal(target, true)) {
        throw TypeError('Cannot revoke non-trapping proxy');
      }
      revoke();
    },
  };
};

export { ProxyPlus };
