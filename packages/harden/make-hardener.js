
// Adapted from SES/Caja - Copyright (C) 2011 Google Inc.
// Copyright (C) 2018 Agoric

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// based upon:
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/startSES.js
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/repairES5.js
// then copied from proposal-frozen-realms deep-freeze.js
// then copied from SES/src/bundle/deepFreeze.js

// @ts-check

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

// See https://github.com/endojs/endo/issues/2930
if (!('hasOwn' in Object)) {
  const ObjectPrototypeHasOwnProperty = objectPrototype.hasOwnProperty;
  const hasOwnShim = (obj, key) => {
    if (obj === undefined || obj === null) {
      // We need to add this extra test because of differences in
      // the order in which `hasOwn` vs `hasOwnProperty` validates
      // arguments.
      throw TypeError('Cannot convert undefined or null to object');
    }
    return apply(ObjectPrototypeHasOwnProperty, obj, [key]);
  };
  defineProperty(Object, 'hasOwn', {
    value: hasOwnShim,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

export const { hasOwn } = Object;

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

/** @type {(condition: any) => asserts condition} */
const assert = condition => {
  if (!condition) {
    throw new TypeError('assertion failed');
  }
};

/**
 * @import {Harden} from '../types.js'
 */

// Obtain the string tag accessor of of TypedArray so we can indirectly use the
// TypedArray brand check it employs.
const typedArrayToStringTag = getOwnPropertyDescriptor(
  typedArrayPrototype,
  toStringTagSymbol,
);
assert(typedArrayToStringTag);
const getTypedArrayToStringTag = typedArrayToStringTag.get;
assert(getTypedArrayToStringTag);

// Exported for tests.
/**
 * Duplicates packages/marshal/src/helpers/passStyle-helpers.js to avoid a dependency.
 *
 * @param {unknown} object
 */
export const isTypedArray = object => {
  // The object must pass a brand check or toStringTag will return undefined.
  const tag = apply(getTypedArrayToStringTag, object, []);
  return tag !== undefined;
};

/**
 * Tests if a property key is an integer-valued canonical numeric index.
 * https://tc39.es/ecma262/#sec-canonicalnumericindexstring
 *
 * @param {string | symbol} propertyKey
 */
const isCanonicalIntegerIndexString = propertyKey => {
  const n = +String(propertyKey);
  return isInteger(n) && String(n) === propertyKey;
};

/**
 * @template T
 * @param {ArrayLike<T>} array
 */
const freezeTypedArray = array => {
  preventExtensions(array);

  // Downgrade writable expandos to readonly, even if non-configurable.
  // We get each descriptor individually rather than using
  // getOwnPropertyDescriptors in order to fail safe when encountering
  // an obscure GraalJS issue where getOwnPropertyDescriptor returns
  // undefined for a property that does exist.
  arrayForEach(ownKeys(array), (/** @type {string | symbol} */ name) => {
    const desc = getOwnPropertyDescriptor(array, name);
    assert(desc);
    // TypedArrays are integer-indexed exotic objects, which define special
    // treatment for property names in canonical numeric form:
    // integers in range are permanently writable and non-configurable.
    // https://tc39.es/ecma262/#sec-integer-indexed-exotic-objects
    //
    // This is analogous to the data of a hardened Map or Set,
    // so we carve out this exceptional behavior but make all other
    // properties non-configurable.
    if (!isCanonicalIntegerIndexString(name)) {
      defineProperty(array, name, {
        ...desc,
        writable: false,
        configurable: false,
      });
    }
  });
};

/**
 * Create a `harden` function.
 *
 * @param {object} [args]
 * @param {boolean} [args.traversePrototypes]
 * @returns {Harden}
 */
export const makeHardener = ({ traversePrototypes = false } = {}) => {
  const hardened = new WeakSet();

  const { harden } = {
    /**
     * @template T
     * @param {T} root
     * @returns {T}
     */
    harden(root) {
      const toFreeze = new Set();

      // If val is something we should be freezing but aren't yet,
      // add it to toFreeze.
      /**
       * @param {any} val
       */
      function enqueue(val) {
        if (isPrimitive(val)) {
          // ignore primitives
          return;
        }
        const type = typeof val;
        if (type !== 'object' && type !== 'function') {
          // future proof: break until someone figures out what it should do
          throw TypeError(`Unexpected typeof: ${type}`);
        }
        if (weaksetHas(hardened, val) || setHas(toFreeze, val)) {
          // Ignore if this is an exit, or we've already visited it
          return;
        }
        // console.warn(`adding ${val} to toFreeze`, val);
        setAdd(toFreeze, val);
      }

      /**
       * @param {any} obj
       */
      const baseFreezeAndTraverse = obj => {
        // Now freeze the object to ensure reactive
        // objects such as proxies won't add properties
        // during traversal, before they get frozen.

        // Object are verified before being enqueued,
        // therefore this is a valid candidate.
        // Throws if this fails (strict mode).
        // Also throws if the object is an ArrayBuffer or any TypedArray.
        if (isTypedArray(obj)) {
          freezeTypedArray(obj);
        } else {
          freeze(obj);
        }

        // we rely upon certain commitments of Object.freeze and proxies here

        // get stable/immutable outbound links before a Proxy has a chance to do
        // something sneaky.
        const descs = getOwnPropertyDescriptors(obj);
        if (traversePrototypes) {
          const proto = getPrototypeOf(obj);
          enqueue(proto);
        }

        arrayForEach(ownKeys(descs), (/** @type {string | symbol} */ name) => {
          // The 'name' may be a symbol, and TypeScript doesn't like us to
          // index arbitrary symbols on objects, so we pretend they're just
          // strings.
          const desc = descs[/** @type {string} */ (name)];
          // getOwnPropertyDescriptors is guaranteed to return well-formed
          // descriptors, but they still inherit from Object.prototype. If
          // someone has poisoned Object.prototype to add 'value' or 'get'
          // properties, then a simple 'if ("value" in desc)' or 'desc.value'
          // test could be confused. We use hasOwnProperty to be sure about
          // whether 'value' is present or not, which tells us for sure that
          // this is a data property.
          if (hasOwn(desc, 'value')) {
            enqueue(desc.value);
          } else {
            enqueue(desc.get);
            enqueue(desc.set);
          }
        });
      };

      const freezeAndTraverse =
        FERAL_STACK_GETTER === undefined && FERAL_STACK_SETTER === undefined
          ? // On platforms without v8's error own stack accessor problem,
            // don't pay for any extra overhead.
            baseFreezeAndTraverse
          : obj => {
              if (isError(obj)) {
                // Only pay the overhead if it first passes this cheap isError
                // check. Otherwise, it will be unrepaired, but won't be judged
                // to be a passable error anyway, so will not be unsafe.
                const stackDesc = getOwnPropertyDescriptor(obj, 'stack');
                if (
                  stackDesc &&
                  stackDesc.get === FERAL_STACK_GETTER &&
                  stackDesc.configurable
                ) {
                  // Can only repair if it is configurable. Otherwise, leave
                  // unrepaired, in which case it will not be judged passable,
                  // avoiding a safety problem.
                  defineProperty(obj, 'stack', {
                    // NOTE: Calls getter during harden, which seems dangerous.
                    // But we're only calling the problematic getter whose
                    // hazards we think we understand.
                    // @ts-expect-error TS should know FERAL_STACK_GETTER
                    // cannot be `undefined` here.
                    // See https://github.com/endojs/endo/pull/2232#discussion_r1575179471
                    value: apply(FERAL_STACK_GETTER, obj, []),
                  });
                }
              }
              return baseFreezeAndTraverse(obj);
            };

      const dequeue = () => {
        // New values added before forEach() has finished will be visited.
        setForEach(toFreeze, freezeAndTraverse);
      };

      /** @param {any} value */
      const markHardened = value => {
        weaksetAdd(hardened, value);
      };

      const commit = () => {
        setForEach(toFreeze, markHardened);
      };

      enqueue(root);
      dequeue();
      // console.warn("toFreeze set:", toFreeze);
      commit();

      return root;
    },
  };

  return harden;
};
