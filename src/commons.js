// Declare shorthand functions. Sharing these declarations across modules
// improves both consistency and minification. Unused declarations are
// dropped by the tree shaking process.

// we capture these, not just for brevity, but for security. If any code
// modifies Object to change what 'assign' points to, the Realm shim would be
// corrupted.

export const {
  assign,
  create,
  freeze,
  defineProperties, // Object.defineProperty is allowed to fail
  // silentlty, use Object.defineProperties instead.
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  getOwnPropertyNames,
  getPrototypeOf,
  setPrototypeOf,
  prototype: objectPrototype
} = Object;

export const {
  apply,
  get: reflectGet,
  ownKeys, // Reflect.ownKeys includes Symbols and unenumerables,
  // unlike Object.keys()
  set: reflectSet
} = Reflect;

export const { isArray, prototype: arrayPrototype } = Array;
export const { symbolUnscopables } = Symbol;
export const { prototype: mapPrototype } = Map;
export const { revocable: proxyRevocable } = Proxy;
export const { prototype: regexpPrototype } = RegExp;
export const { prototype: setPrototype } = Set;
export const { prototype: stringPrototype } = String;
export const { prototype: weakmapPrototype } = WeakMap;

/**
 * isObject()
 * A more performant version of Object(obj) === obj to check objects.
 */
export const isObject = obj => typeof obj === 'object' && obj !== null;

/**
 * getConstructorOf()
 * Return the constructor from an instance.
 */
export const getConstructorOf = fn =>
  reflectGet(getPrototypeOf(fn), 'constructor');

/**
 * uncurryThis()
 * This for of uncurry uses Reflect.apply()
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
 * Performance:
 * 1. The native call is about 10x faster on FF than chrome
 * 2. The version using Function.bind() is about 100x slower on FF,
 *    equal on chrome, 2x slower on Safari
 * 3. The version using a spread and Reflect.apply() is about 10x
 *    slower on FF, equal on chrome, 2x slower on Safari
 */
export const uncurryThis = fn => (thisArg, ...args) => apply(fn, thisArg, args);

// We also capture these for security: changes to Array.prototype after the
// Realm shim runs shouldn't affect subsequent Realm operations.

export const objectHasOwnProperty = uncurryThis(objectPrototype.hasOwnProperty),
  //
  arrayForEach = uncurryThis(arrayPrototype.forEach),
  arrayFilter = uncurryThis(arrayPrototype.filter),
  arrayPush = uncurryThis(arrayPrototype.push),
  arrayPop = uncurryThis(arrayPrototype.pop),
  arrayJoin = uncurryThis(arrayPrototype.join),
  arrayReduce = uncurryThis(arrayPrototype.reduce),
  arrayConcat = uncurryThis(arrayPrototype.concat),
  //
  mapGet = uncurryThis(mapPrototype.has),
  mapHas = uncurryThis(mapPrototype.has),
  //
  regexpTest = uncurryThis(regexpPrototype.test),
  //
  setGet = uncurryThis(setPrototype.has),
  setHas = uncurryThis(setPrototype.has),
  //
  stringIncludes = uncurryThis(stringPrototype.includes),
  stringMatch = uncurryThis(stringPrototype.match),
  stringSearch = uncurryThis(stringPrototype.search),
  stringSlice = uncurryThis(stringPrototype.slice),
  stringSplit = uncurryThis(stringPrototype.split),
  //
  weakmapGet = uncurryThis(weakmapPrototype.get),
  weakmapSet = uncurryThis(weakmapPrototype.set),
  weakmapHas = uncurryThis(weakmapPrototype.has);
