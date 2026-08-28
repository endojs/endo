// The exports of this ponyfill should only be used internally to this package
// for separate unit testing, and for building the shim. The eval-twin
// problems https://github.com/endojs/endo/issues/1583 with using a ponyfill
// of this package are fatal, and so only the shim should be used externally.

const OriginalObject = Object;
const OriginalReflect = Reflect;
const OriginalProxy = Proxy;
const { freeze, defineProperty, hasOwn } = OriginalObject;
const { apply, construct, ownKeys } = OriginalReflect;

const nonTrappingSet = new WeakSet();

const proxyHandlerMap = new WeakMap();

/**
 * Based on the `isPrimitive` exported by `@endo/pass-style`
 *
 * @param {unknown} val
 */
const isPrimitive = val =>
  // Safer would be `Object(val) !== val` but is too expensive on XS.
  // So instead we use this adhoc set of type tests. But this is not safe in
  // the face of possible evolution of the language. Beware!
  !val || (typeof val !== 'object' && typeof val !== 'function');

/**
 * Corresponds to the internal function shared by `Object.isNonTrapping` and
 * `Reflect.isNonTrapping`.
 *
 * @param {any} specimen
 * @returns {boolean}
 */
const isNonTrappingInternal = specimen => {
  if (nonTrappingSet.has(specimen)) {
    return true;
  }
  if (!proxyHandlerMap.has(specimen)) {
    return false;
  }
  const [target, handler] = proxyHandlerMap.get(specimen);
  if (isNonTrappingInternal(target)) {
    nonTrappingSet.add(specimen);
    return true;
  }
  const trap = handler.isNonTrapping;
  if (trap === undefined) {
    return false;
  }
  const result = apply(trap, handler, [target]);
  const ofTarget = isNonTrappingInternal(target);
  if (result !== ofTarget) {
    throw TypeError(
      `'isNonTrapping' proxy trap does not reflect 'isNonTrapping' of proxy target (which is '${ofTarget}')`,
    );
  }
  if (result) {
    nonTrappingSet.add(specimen);
  }
  return result;
};

/**
 *  Corresponds to the internal function shared by `Object.suppressTrapping` and
 * `Reflect.suppressTrapping`.
 *
 * @param {any} specimen
 * @returns {boolean}
 */
const suppressTrappingInternal = specimen => {
  if (nonTrappingSet.has(specimen)) {
    return true;
  }
  freeze(specimen);
  if (!proxyHandlerMap.has(specimen)) {
    nonTrappingSet.add(specimen);
    return true;
  }
  const [target, handler] = proxyHandlerMap.get(specimen);
  if (isNonTrappingInternal(target)) {
    nonTrappingSet.add(specimen);
    return true;
  }
  const trap = handler.suppressTrapping;
  if (trap === undefined) {
    const result = suppressTrappingInternal(target);
    if (result) {
      nonTrappingSet.add(specimen);
    }
    return result;
  }
  const result = apply(trap, handler, [target]);
  const ofTarget = isNonTrappingInternal(target);
  if (result !== ofTarget) {
    throw TypeError(
      `'suppressTrapping' proxy trap does not reflect 'isNonTrapping' of proxy target (which is '${ofTarget}')`,
    );
  }
  if (result) {
    nonTrappingSet.add(specimen);
  }
  return result;
};

export const extraReflectMethods = freeze({
  isNonTrapping(target) {
    if (isPrimitive(target)) {
      throw TypeError('Reflect.isNonTrapping called on non-object');
    }
    return isNonTrappingInternal(target);
  },
  suppressTrapping(target) {
    if (isPrimitive(target)) {
      throw TypeError('Reflect.suppressTrapping called on non-object');
    }
    return suppressTrappingInternal(target);
  },
});

export const extraObjectMethods = freeze({
  isNonTrapping(target) {
    if (isPrimitive(target)) {
      return true;
    }
    return isNonTrappingInternal(target);
  },
  suppressTrapping(target) {
    if (isPrimitive(target)) {
      return target;
    }
    if (suppressTrappingInternal(target)) {
      return target;
    }
    throw TypeError('suppressTrapping trap returned falsy');
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
export const ReflectPlus = {};
// An `export const` exported value is only visible to importing modules
// after the exporting module has initialized, so any sync initialization
// at the top the module reliably happens first.
addExtras(ReflectPlus, OriginalReflect, extraReflectMethods);

/**
 * In the shim, `ObjectPlus` replaces the global `Object`.
 *
 * @type {ObjectConstructor}
 */
// @ts-expect-error TS does not know the rest of the type is added below
export const ObjectPlus = function Object(...args) {
  if (new.target) {
    return construct(OriginalObject, args, new.target);
  } else {
    return apply(OriginalObject, this, args);
  }
};
// An `export const` exported value is only visible to importing modules
// after the exporting module has initialized, so any sync initialization
// at the top the module reliably happens first.
// @ts-expect-error We actually can assign to its `.prototype`.
ObjectPlus.prototype = OriginalObject.prototype;
addExtras(ObjectPlus, OriginalObject, extraObjectMethods);

/**
 * A way to store the `originalHandler` on the `handlerPlus` without
 * possible conflict with an future trap name.
 *
 * Normally, we'd use a WeakMap for this, so the property is also
 * undiscoverable. But in this case, the `handlerPlus` objects are
 * safely encapsulated within this module, so no one is in a position to
 * discovery this property by inspection.
 */
const ORIGINAL_HANDLER = Symbol('OriginalHandler');

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
      if (isNonTrappingInternal(target)) {
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
        const { [ORIGINAL_HANDLER]: originalHandler } = handlerPlus;
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
 *   isNonTrapping: (target: any) => boolean,
 *   suppressTrapping: (target: any) => boolean,
 *   originalHandler: ProxyHandler<any>
 * }}
 */
const makeHandlerPlus = originalHandler => ({
  // @ts-expect-error TS does not know what this __proto__ is doing
  __proto__: new OriginalProxy({}, metaHandler),
  [ORIGINAL_HANDLER]: originalHandler,
});

const ProxyInternal = function Proxy(target, handler) {
  if (new.target !== ProxyInternal) {
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

/**
 * In the shim, `ProxyPlus` replaces the global `Proxy`.
 *
 * We use `bind` as the only way for user code to produce a
 * constructible function (i.e., one that responds to `new`) without a
 * `.prototype` property.
 *
 * @type {ProxyConstructor}
 */
export const ProxyPlus = ProxyInternal.bind(undefined);
// An `export const` exported value is only visible to importing modules
// after the exporting module has initialized, so any sync initialization
// at the top the module reliably happens first.
defineProperty(ProxyPlus, 'name', { value: 'Proxy' });

ProxyPlus.revocable = (target, handler) => {
  const handlerPlus = makeHandlerPlus(handler);
  const { proxy, revoke } = OriginalProxy.revocable(target, handlerPlus);
  proxyHandlerMap.set(proxy, [target, handler]);
  return {
    proxy,
    revoke() {
      if (isNonTrappingInternal(target)) {
        throw TypeError('Cannot revoke non-trapping proxy');
      }
      revoke();
    },
  };
};
