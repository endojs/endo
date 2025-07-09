/**
 * Captures native intrinsics during initialization, so vetted shims
 * (running between initialization of SES and calling lockdown) are free to
 * modify the environment without compromising the integrity of SES. For
 * example, a vetted shim can modify Object.assign because we capture and
 * export Object and assign here, then never again consult Object to get its
 * assign property.
 *
 * This pattern of use is enforced by eslint rules no-restricted-globals and
 * no-polymorphic-call.
 * We maintain the list of restricted globals in ../package.json.
 *
 * @module
 */

/* global globalThis */
/* eslint-disable no-restricted-globals */

// We cannot use globalThis as the local name since it would capture the
// lexical name.
const universalThis = globalThis;
export { universalThis as globalThis };

export const {
  Array,
  ArrayBuffer,
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
  Symbol,
  Uint8Array,
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
  AggregateError,
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
  isFrozen,
  isSealed,
  isExtensible,
  keys,
  prototype: objectPrototype,
  seal,
  preventExtensions,
  setPrototypeOf,
  values,
  fromEntries,
  hasOwn,
} = Object;

export const {
  species: speciesSymbol,
  toStringTag: toStringTagSymbol,
  iterator: iteratorSymbol,
  matchAll: matchAllSymbol,
  unscopables: unscopablesSymbol,
  keyFor: symbolKeyFor,
  for: symbolFor,
} = Symbol;

export const { isInteger } = Number;

export const { stringify: stringifyJson } = JSON;

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
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_DEFINE_PROPERTY_FAILED_SILENTLY.md
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
export const { prototype: arrayBufferPrototype } = ArrayBuffer;
export const { prototype: mapPrototype } = Map;
export const { revocable: proxyRevocable } = Proxy;
export const { prototype: regexpPrototype } = RegExp;
export const { prototype: setPrototype } = Set;
export const { prototype: stringPrototype } = String;
export const { prototype: weakmapPrototype } = WeakMap;
export const { prototype: weaksetPrototype } = WeakSet;
export const { prototype: functionPrototype } = Function;
export const { prototype: promisePrototype } = Promise;
export const { prototype: generatorPrototype } = getPrototypeOf(
  // eslint-disable-next-line no-empty-function, func-names
  function* () {},
);
export const iteratorPrototype = getPrototypeOf(
  // eslint-disable-next-line @endo/no-polymorphic-call
  getPrototypeOf(arrayPrototype.values()),
);

export const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype);

const { bind } = functionPrototype;

/**
 * uncurryThis()
 * Equivalent of: fn => (thisArg, ...args) => apply(fn, thisArg, args)
 *
 * See those reference for a complete explanation:
 * http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
 * which only lives at
 * http://web.archive.org/web/20160805225710/http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
 *
 * @type {<F extends (this: any, ...args: any[]) => any>(fn: F) => ((thisArg: ThisParameterType<F>, ...args: Parameters<F>) => ReturnType<F>)}
 */
export const uncurryThis = bind.bind(bind.call); // eslint-disable-line @endo/no-polymorphic-call

/**
 * @deprecated Use `hasOwn` instead
 */
export const objectHasOwnProperty = hasOwn;
//
export const arrayFilter = uncurryThis(arrayPrototype.filter);
export const arrayForEach = uncurryThis(arrayPrototype.forEach);
export const arrayIncludes = uncurryThis(arrayPrototype.includes);
export const arrayJoin = uncurryThis(arrayPrototype.join);
/** @type {<T, U>(thisArg: readonly T[], callbackfn: (value: T, index: number, array: T[]) => U, cbThisArg?: any) => U[]} */
export const arrayMap = /** @type {any} */ (uncurryThis(arrayPrototype.map));
export const arrayFlatMap = /** @type {any} */ (
  uncurryThis(arrayPrototype.flatMap)
);
export const arrayPop = uncurryThis(arrayPrototype.pop);
/** @type {<T>(thisArg: T[], ...items: T[]) => number} */
export const arrayPush = uncurryThis(arrayPrototype.push);
export const arraySlice = uncurryThis(arrayPrototype.slice);
export const arraySome = uncurryThis(arrayPrototype.some);
export const arraySort = uncurryThis(arrayPrototype.sort);
export const iterateArray = uncurryThis(arrayPrototype[iteratorSymbol]);
//
export const arrayBufferSlice = uncurryThis(arrayBufferPrototype.slice);
/** @type {(b: ArrayBuffer) => number} */
export const arrayBufferGetByteLength = uncurryThis(
  // @ts-expect-error we know it is there on all conforming platforms
  getOwnPropertyDescriptor(arrayBufferPrototype, 'byteLength').get,
);
//
export const typedArraySet = uncurryThis(typedArrayPrototype.set);
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
export const generatorNext = uncurryThis(generatorPrototype.next);
export const generatorThrow = uncurryThis(generatorPrototype.throw);

/**
 * @type { &
 *   ((thisArg: string, searchValue: { [Symbol.replace](string: string, replaceValue: string): string; }, replaceValue: string) => string) &
 *   ((thisArg: string, searchValue: { [Symbol.replace](string: string, replacer: (substring: string, ...args: any[]) => string): string; }, replacer: (substring: string, ...args: any[]) => string) => string)
 * }
 */
export const stringReplace = /** @type {any} */ (
  uncurryThis(stringPrototype.replace)
);
export const stringSearch = uncurryThis(stringPrototype.search);
export const stringSlice = uncurryThis(stringPrototype.slice);
export const stringSplit =
  /** @type {(thisArg: string, splitter: string | RegExp | { [Symbol.split](string: string, limit?: number): string[]; }, limit?: number) => string[]} */ (
    uncurryThis(stringPrototype.split)
  );
export const stringStartsWith = uncurryThis(stringPrototype.startsWith);
export const iterateString = uncurryThis(stringPrototype[iteratorSymbol]);
//
export const weakmapDelete = uncurryThis(weakmapPrototype.delete);
/** @type {<K extends {}, V>(thisArg: WeakMap<K, V>, ...args: Parameters<WeakMap<K,V>['get']>) => ReturnType<WeakMap<K,V>['get']>} */
export const weakmapGet = uncurryThis(weakmapPrototype.get);
export const weakmapHas = uncurryThis(weakmapPrototype.has);
export const weakmapSet = uncurryThis(weakmapPrototype.set);
//
export const weaksetAdd = uncurryThis(weaksetPrototype.add);
export const weaksetHas = uncurryThis(weaksetPrototype.has);
//
export const functionToString = uncurryThis(functionPrototype.toString);
export const functionBind = uncurryThis(bind);
//
const { all } = Promise;
export const promiseAll = promises => apply(all, Promise, [promises]);
export const promiseCatch = uncurryThis(promisePrototype.catch);
/** @type {<T, TResult1 = T, TResult2 = never>(thisArg: T, onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null) => Promise<TResult1 | TResult2>} */
export const promiseThen = /** @type {any} */ (
  uncurryThis(promisePrototype.then)
);
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
 * TODO Consolidate with `isPrimitive` that's currently in `@endo/pass-style`.
 * Layering constraints make this tricky, which is why we haven't yet figured
 * out how to do this.
 *
 * @type {(val: unknown) => val is (undefined
 * | null
 * | boolean
 * | number
 * | bigint
 * | string
 * | symbol)}
 */
export const isPrimitive = val =>
  !val || (typeof val !== 'object' && typeof val !== 'function');

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

/**
 * @template T
 * @param {T} x
 */
export const identity = x => x;

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
  // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_NO_EVAL.md
  throw TypeError('Cannot eval with evalTaming set to "no-eval" (SES_NO_EVAL)');
};

// ////////////////// FERAL_STACK_GETTER FERAL_STACK_SETTER ////////////////////

const er1StackDesc = getOwnPropertyDescriptor(Error('er1'), 'stack');
const er2StackDesc = getOwnPropertyDescriptor(TypeError('er2'), 'stack');

let feralStackGetter;
let feralStackSetter;
if (er1StackDesc && er2StackDesc && er1StackDesc.get) {
  // We should only encounter this case on v8 because of its problematic
  // error own stack accessor behavior.
  // Note that FF/SpiderMonkey, Moddable/XS, and the error stack proposal
  // all inherit a stack accessor property from Error.prototype, which is
  // great. That case needs no heroics to secure.
  if (
    // In the v8 case as we understand it, all errors have an own stack
    // accessor property, but within the same realm, all these accessor
    // properties have the same getter and have the same setter.
    // This is therefore the case that we repair.
    typeof er1StackDesc.get === 'function' &&
    er1StackDesc.get === er2StackDesc.get &&
    typeof er1StackDesc.set === 'function' &&
    er1StackDesc.set === er2StackDesc.set
  ) {
    // Otherwise, we have own stack accessor properties that are outside
    // our expectations, that therefore need to be understood better
    // before we know how to repair them.
    feralStackGetter = freeze(er1StackDesc.get);
    feralStackSetter = freeze(er1StackDesc.set);
  } else {
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR.md
    throw TypeError(
      'Unexpected Error own stack accessor functions (SES_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR)',
    );
  }
}

/**
 * If on a v8 with the problematic error own stack accessor behavior,
 * `FERAL_STACK_GETTER` will be the shared getter of all those accessors
 * and `FERAL_STACK_SETTER` will be the shared setter. On any platform
 * without this problem, `FERAL_STACK_GETTER` and `FERAL_STACK_SETTER` are
 * both `undefined`.
 *
 * @type {(() => any) | undefined}
 */
export const FERAL_STACK_GETTER = feralStackGetter;

/**
 * If on a v8 with the problematic error own stack accessor behavior,
 * `FERAL_STACK_GETTER` will be the shared getter of all those accessors
 * and `FERAL_STACK_SETTER` will be the shared setter. On any platform
 * without this problem, `FERAL_STACK_GETTER` and `FERAL_STACK_SETTER` are
 * both `undefined`.
 *
 * @type {((newValue: any) => void) | undefined}
 */
export const FERAL_STACK_SETTER = feralStackSetter;

const getAsyncGeneratorFunctionInstance = () => {
  // Test for async generator function syntax support.
  try {
    // Wrapping one in an new Function lets the `hermesc` binary file
    // parse the Metro js bundle without SyntaxError, to generate the
    // optimised Hermes bytecode bundle, when `gradlew` is called to
    // assemble the release build APK for React Native prod Android apps.
    // Delaying the error until runtime lets us customise lockdown behaviour.
    return new FERAL_FUNCTION(
      'return (async function* AsyncGeneratorFunctionInstance() {})',
    )();
  } catch (error) {
    // Note: `Error.prototype.jsEngine` is only set by React Native runtime, not Hermes:
    // https://github.com/facebook/react-native/blob/main/packages/react-native/ReactCommon/hermes/executor/HermesExecutorFactory.cpp#L224-L230
    if (error.name === 'SyntaxError') {
      // Swallows Hermes error `async generators are unsupported` at runtime.
      // Note: `console` is not a JS built-in, so Hermes engine throws:
      // Uncaught ReferenceError: Property 'console' doesn't exist
      // See: https://github.com/facebook/hermes/issues/675
      // However React Native provides a `console` implementation when setting up error handling:
      // https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/Core/InitializeCore.js
      return undefined;
    } else if (error.name === 'EvalError') {
      // eslint-disable-next-line no-empty-function
      return async function* AsyncGeneratorFunctionInstance() {};
    } else {
      throw error;
    }
  }
};

/**
 * If the platform supports async generator functions, this will be an
 * async generator function instance. Otherwise, it will be `undefined`.
 *
 * @type {AsyncGeneratorFunction | undefined}
 */
export const AsyncGeneratorFunctionInstance =
  getAsyncGeneratorFunctionInstance();
