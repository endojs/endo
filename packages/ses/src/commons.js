/**
 * commons.js
 * Declare shorthand functions. Sharing these declarations across modules
 * improves on consistency and minification. Unused declarations are
 * dropped by the tree shaking process.
 *
 * We capture these, not just for brevity, but for security. If any code
 * modifies Object to change what 'assign' points to, the Compartment shim
 * would be corrupted.
 */

export const {
  assign,
  create,
  defineProperties,
  entries,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  getOwnPropertyNames,
  getPrototypeOf,
  is,
  isExtensible,
  keys,
  prototype: objectPrototype,
  seal,
  setPrototypeOf,
  values,
} = Object;

// At time of this writing, we still support Node 10 which doesn't have
// `Object.fromEntries`. If it is absent, this should be an adequate
// replacement.
// By the terminology of https://ponyfoo.com/articles/polyfills-or-ponyfills
// it is a ponyfill rather than a polyfill or shim because we do not
// install it on `Object`.
const objectFromEntries = entryPairs => {
  const result = {};
  for (const [prop, val] of entryPairs) {
    result[prop] = val;
  }
  return result;
};

export const fromEntries = Object.fromEntries || objectFromEntries;

export const defineProperty = (object, prop, descriptor) => {
  // Object.defineProperty is allowed to fail silently so we use
  // Object.defineProperties instead.
  return defineProperties(object, { [prop]: descriptor });
};

export const { apply, construct, get: reflectGet, set: reflectSet } = Reflect;

export const { isArray, prototype: arrayPrototype } = Array;
export const { symbolUnscopables } = Symbol;
export const { prototype: mapPrototype } = Map;
export const { revocable: proxyRevocable } = Proxy;
export const { prototype: regexpPrototype } = RegExp;
export const { prototype: setPrototype } = Set;
export const { prototype: stringPrototype } = String;
export const { prototype: weakmapPrototype } = WeakMap;

/**
 * uncurryThis()
 * This form of uncurry uses Reflect.apply()
 *
 * The original uncurry uses:
 * const bind = Function.prototype.bind;
 * const uncurryThis = bind.bind(bind.call);
 *
 * See those reference for a complete explanation:
 * http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
 * which only lives at
 * http://web.archive.org/web/20160805225710/http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
 *
 * @param {(thisArg: Object, ...args: any[]) => any} fn
 */
export const uncurryThis = fn => (thisArg, ...args) => apply(fn, thisArg, args);

export const objectHasOwnProperty = uncurryThis(objectPrototype.hasOwnProperty);
//
export const arrayFilter = uncurryThis(arrayPrototype.filter);
export const arrayJoin = uncurryThis(arrayPrototype.join);
export const arrayPush = uncurryThis(arrayPrototype.push);
export const arrayPop = uncurryThis(arrayPrototype.pop);
export const arrayIncludes = uncurryThis(arrayPrototype.includes);
//
export const regexpTest = uncurryThis(regexpPrototype.test);
//
export const stringMatch = uncurryThis(stringPrototype.match);
export const stringSearch = uncurryThis(stringPrototype.search);
export const stringSlice = uncurryThis(stringPrototype.slice);
export const stringSplit = uncurryThis(stringPrototype.split);
//
export const weakmapGet = uncurryThis(weakmapPrototype.get);
export const weakmapSet = uncurryThis(weakmapPrototype.set);
export const weakmapHas = uncurryThis(weakmapPrototype.has);

/**
 * getConstructorOf()
 * Return the constructor from an instance.
 *
 * @param {Function} fn
 */
export const getConstructorOf = fn =>
  reflectGet(getPrototypeOf(fn), 'constructor');

/**
 * immutableObject
 * An immutable (frozen) exotic object and is safe to share.
 */
export const immutableObject = freeze({ __proto__: null });
