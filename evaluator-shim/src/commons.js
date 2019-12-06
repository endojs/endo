/**
 * commons.js
 * Declare shorthand functions. Sharing these declarations across modules
 * improves on consistency and minification. Unused declarations are
 * dropped by the tree shaking process.
 *
 * We capture these, not just for brevity, but for security. If any code
 * modifies Object to change what 'assign' points to, the Evaluator shim
 * would be corrupted.
 */

export const {
  freeze: objectFreeze,
  // Object.defineProperty is allowed to fail silentlty
  // so we use Object.defineProperties instead.
  defineProperties,
  getOwnPropertyDescriptor,
  getOwnPropertyNames,
  getPrototypeOf,
  setPrototypeOf,
  prototype: objectPrototype,
} = Object;

export const { apply, get: reflectGet, set: reflectSet } = Reflect;

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
 */
export const getConstructorOf = fn =>
  reflectGet(getPrototypeOf(fn), 'constructor');

/**
 * immutableObject
 * An immutable (frozen) exotic object and is safe to share.
 */
export const immutableObject = objectFreeze({ __proto__: null });
