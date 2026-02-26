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

/* global globalThis */

const {
  Array,
  JSON,
  Number,
  Object,
  Reflect,
  Set,
  String,
  Symbol,
  Uint8Array,
  WeakSet,
} = globalThis;

const {
  // The feral Error constructor is safe for internal use, but must not be
  // revealed to post-lockdown code in any compartment including the start
  // compartment since in V8 at least it bears stack inspection capabilities.
  Error: FERAL_ERROR,
  TypeError,
} = globalThis;

const {
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  getPrototypeOf,
  prototype: objectPrototype,
  preventExtensions,
} = Object;

const { toStringTag: toStringTagSymbol } = Symbol;

const { isInteger } = Number;

const { stringify: stringifyJson } = JSON;

// Needed only for the Safari bug workaround below
const { defineProperty: originalDefineProperty } = Object;

const defineProperty = (object, prop, descriptor) => {
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

const { apply, ownKeys } = Reflect;

const { prototype: arrayPrototype } = Array;
const { prototype: setPrototype } = Set;
const { prototype: weaksetPrototype } = WeakSet;
const { prototype: functionPrototype } = Function;

const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype);

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
const uncurryThis = bind.bind(bind.call); // eslint-disable-line @endo/no-polymorphic-call

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

const { hasOwn } = Object;

const arrayForEach = uncurryThis(arrayPrototype.forEach);
//
const setAdd = uncurryThis(setPrototype.add);
const setForEach = uncurryThis(setPrototype.forEach);
const setHas = uncurryThis(setPrototype.has);

const weaksetAdd = uncurryThis(weaksetPrototype.add);
const weaksetHas = uncurryThis(weaksetPrototype.has);

/**
 * TODO Consolidate with `isPrimitive` that's currently in `@endo/pass-style`
 * and also `ses`.
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
const isPrimitive = val =>
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
const isError = value => value instanceof FERAL_ERROR;

// ////////////////// FERAL_STACK_GETTER FERAL_STACK_SETTER ////////////////////

// The error repair mechanism is very similar to code in ses/src/commons.js
// and these implementations should be kept in sync.

const makeTypeError = () => {
  try {
    // @ts-expect-error deliberate TypeError
    null.null;
    throw TypeError('obligatory'); // To convince the type flow inferrence.
  } catch (error) {
    return error;
  }
};

const typeErrorStackDesc = getOwnPropertyDescriptor(makeTypeError(), 'stack');
const errorStackDesc = getOwnPropertyDescriptor(Error('obligatory'), 'stack');

let feralStackGetter;
let feralStackSetter;

if (typeErrorStackDesc !== undefined && typeErrorStackDesc.get !== undefined) {
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
    errorStackDesc !== undefined &&
    typeof typeErrorStackDesc.get === 'function' &&
    typeErrorStackDesc.get === errorStackDesc.get &&
    typeof typeErrorStackDesc.set === 'function' &&
    typeErrorStackDesc.set === errorStackDesc.set
  ) {
    // Otherwise, we have own stack accessor properties that are outside
    // our expectations, that therefore need to be understood better
    // before we know how to repair them.
    feralStackGetter = freeze(typeErrorStackDesc.get);
    feralStackSetter = freeze(typeErrorStackDesc.set);
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
const FERAL_STACK_GETTER = feralStackGetter;

/**
 * If on a v8 with the problematic error own stack accessor behavior,
 * `FERAL_STACK_GETTER` will be the shared getter of all those accessors
 * and `FERAL_STACK_SETTER` will be the shared setter. On any platform
 * without this problem, `FERAL_STACK_GETTER` and `FERAL_STACK_SETTER` are
 * both `undefined`.
 *
 * @type {((newValue: any) => void) | undefined}
 */
const FERAL_STACK_SETTER = feralStackSetter;

/** @type {(condition: any) => asserts condition} */
const assert = condition => {
  if (!condition) {
    throw new TypeError('assertion failed');
  }
};

/**
 * @template T
 * @typedef {(value: T) => T} Harden
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
const isTypedArray = object => {
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
 * @template T
 * @param {object} [args]
 * @param {boolean} [args.traversePrototypes]
 * @returns {Harden<T>}
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
