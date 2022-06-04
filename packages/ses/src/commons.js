/* global globalThis */
/* eslint-disable no-restricted-globals */

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

// We cannot use globalThis as the local name since it would capture the
// lexical name.
const universalThis = globalThis;
export { universalThis as globalThis };

export const {
  Array,
  Date,
  FinalizationRegistry,
  Float32Array,
  JSON,
  Map,
  Math,
  Number,
  Object,
  Promise,
  Proxy,
  Reflect,
  RegExp: FERAL_REG_EXP,
  Set,
  String,
  WeakMap,
  WeakSet,
} = globalThis;

export const {
  // The feral Error constructor is safe for internal use, but must not be
  // revealed to post-lockdown code in any compartment including the start
  // compartment since in V8 at least it bears stack inspection capabilities.
  Error: FERAL_ERROR,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
} = globalThis;

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
  preventExtensions,
  setPrototypeOf,
  values,
} = Object;

export const {
  species: speciesSymbol,
  toStringTag: toStringTagSymbol,
  iterator: iteratorSymbol,
  matchAll: matchAllSymbol,
  keyFor: symbolKeyFor,
  for: symbolFor,
} = Symbol;

export const { isInteger } = Number;

export const { stringify: stringifyJson } = JSON;

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

// Needed only for the Safari bug workaround below
const { defineProperty: originalDefineProperty } = Object;

export const defineProperty = (object, prop, descriptor) => {
  // We used to do the following, until we had to reopen Safari bug
  // https://bugs.webkit.org/show_bug.cgi?id=222538#c17
  // Once this is fixed, we may restore it.
  // // Object.defineProperty is allowed to fail silently so we use
  // // Object.defineProperties instead.
  // return defineProperties(object, { [prop]: descriptor });

  // Instead, to workaround the Safari bug
  const result = originalDefineProperty(object, prop, descriptor);
  if (result !== object) {
    throw TypeError(
      `Please report that the original defineProperty silently failed to set ${stringifyJson(
        String(prop),
      )}. (SES_DEFINE_PROPERTY_FAILED_SILENTLY)`,
    );
  }
  return result;
};

export const {
  apply,
  construct,
  get: reflectGet,
  getOwnPropertyDescriptor: reflectGetOwnPropertyDescriptor,
  has: reflectHas,
  isExtensible: reflectIsExtensible,
  ownKeys,
  preventExtensions: reflectPreventExtensions,
  set: reflectSet,
} = Reflect;

export const { isArray, prototype: arrayPrototype } = Array;
export const { prototype: mapPrototype } = Map;
export const { revocable: proxyRevocable } = Proxy;
export const { prototype: regexpPrototype } = RegExp;
export const { prototype: setPrototype } = Set;
export const { prototype: stringPrototype } = String;
export const { prototype: weakmapPrototype } = WeakMap;
export const { prototype: weaksetPrototype } = WeakSet;
export const { prototype: functionPrototype } = Function;
export const { prototype: promisePrototype } = Promise;

export const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype);

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
 * @template {Function} F
 * @param {F} fn
 * returns {(thisArg: ThisParameterType<F>, ...args: Parameters<F>) => ReturnType<F>}
 */
export const uncurryThis = fn => (thisArg, ...args) => apply(fn, thisArg, args);

export const objectHasOwnProperty = uncurryThis(objectPrototype.hasOwnProperty);
//
export const arrayFilter = uncurryThis(arrayPrototype.filter);
export const arrayForEach = uncurryThis(arrayPrototype.forEach);
export const arrayIncludes = uncurryThis(arrayPrototype.includes);
export const arrayJoin = uncurryThis(arrayPrototype.join);
export const arrayMap = uncurryThis(arrayPrototype.map);
export const arrayPop = uncurryThis(arrayPrototype.pop);
export const arrayPush = uncurryThis(arrayPrototype.push);
export const arraySlice = uncurryThis(arrayPrototype.slice);
export const arraySome = uncurryThis(arrayPrototype.some);
export const arraySort = uncurryThis(arrayPrototype.sort);
export const iterateArray = uncurryThis(arrayPrototype[iteratorSymbol]);
//
export const mapSet = uncurryThis(mapPrototype.set);
export const mapGet = uncurryThis(mapPrototype.get);
export const mapHas = uncurryThis(mapPrototype.has);
export const mapDelete = uncurryThis(mapPrototype.delete);
export const mapEntries = uncurryThis(mapPrototype.entries);
export const iterateMap = uncurryThis(mapPrototype[iteratorSymbol]);
//
export const setAdd = uncurryThis(setPrototype.add);
export const setDelete = uncurryThis(setPrototype.delete);
export const setForEach = uncurryThis(setPrototype.forEach);
export const setHas = uncurryThis(setPrototype.has);
export const iterateSet = uncurryThis(setPrototype[iteratorSymbol]);
//
export const regexpTest = uncurryThis(regexpPrototype.test);
export const regexpExec = uncurryThis(regexpPrototype.exec);
export const matchAllRegExp = uncurryThis(regexpPrototype[matchAllSymbol]);
//
export const stringEndsWith = uncurryThis(stringPrototype.endsWith);
export const stringIncludes = uncurryThis(stringPrototype.includes);
export const stringIndexOf = uncurryThis(stringPrototype.indexOf);
export const stringMatch = uncurryThis(stringPrototype.match);
export const stringReplace = uncurryThis(stringPrototype.replace);
export const stringSearch = uncurryThis(stringPrototype.search);
export const stringSlice = uncurryThis(stringPrototype.slice);
export const stringSplit = uncurryThis(stringPrototype.split);
export const stringStartsWith = uncurryThis(stringPrototype.startsWith);
export const iterateString = uncurryThis(stringPrototype[iteratorSymbol]);
//
export const weakmapDelete = uncurryThis(weakmapPrototype.delete);
/** @type {<K, V>(thisArg: WeakMap<K, V>, ...args: Parameters<WeakMap<K,V>['get']>) => ReturnType<WeakMap<K,V>['get']>} */
export const weakmapGet = uncurryThis(weakmapPrototype.get);
export const weakmapHas = uncurryThis(weakmapPrototype.has);
export const weakmapSet = uncurryThis(weakmapPrototype.set);
//
export const weaksetAdd = uncurryThis(weaksetPrototype.add);
export const weaksetGet = uncurryThis(weaksetPrototype.get);
export const weaksetHas = uncurryThis(weaksetPrototype.has);
//
export const functionToString = uncurryThis(functionPrototype.toString);
//
const { all } = Promise;
export const promiseAll = promises => apply(all, Promise, [promises]);
export const promiseCatch = uncurryThis(promisePrototype.catch);
export const promiseThen = uncurryThis(promisePrototype.then);
//
export const finalizationRegistryRegister =
  FinalizationRegistry && uncurryThis(FinalizationRegistry.prototype.register);
export const finalizationRegistryUnregister =
  FinalizationRegistry &&
  uncurryThis(FinalizationRegistry.prototype.unregister);

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
 * An immutable (frozen) empty object that is safe to share.
 */
export const immutableObject = freeze(create(null));

/**
 * isObject tests whether a value is an object.
 * Today, this is equivalent to:
 *
 *   const isObject = value => {
 *     if (value === null) return false;
 *     const type = typeof value;
 *     return type === 'object' || type === 'function';
 *   };
 *
 * But this is not safe in the face of possible evolution of the language, for
 * example new types or semantics of records and tuples.
 * We use this implementation despite the unnecessary allocation implied by
 * attempting to box a primitive.
 *
 * @param {any} value
 */
export const isObject = value => Object(value) === value;

/**
 * isError tests whether an object inherits from the intrinsic
 * `Error.prototype`.
 * We capture the original error constructor as FERAL_ERROR to provide a clear
 * signal for reviewers that we are handling an object with excess authority,
 * like stack trace inspection, that we are carefully hiding from client code.
 * Checking instanceof happens to be safe, but to avoid uttering FERAL_ERROR
 * for such a trivial case outside commons.js, we provide a utility function.
 *
 * @param {any} value
 */
export const isError = value => value instanceof FERAL_ERROR;

// The original unsafe untamed eval function, which must not escape.
// Sample at module initialization time, which is before lockdown can
// repair it.  Use it only to build powerless abstractions.
// eslint-disable-next-line no-eval
export const FERAL_EVAL = eval;

// The original unsafe untamed Function constructor, which must not escape.
// Sample at module initialization time, which is before lockdown can
// repair it.  Use it only to build powerless abstractions.
export const FERAL_FUNCTION = Function;

export const noEvalEvaluate = () => {
  throw new TypeError(
    'Cannot eval with evalTaming set to "noEval" (SES_NO_EVAL)',
  );
};
