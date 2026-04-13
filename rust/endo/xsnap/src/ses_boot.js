(functors => options => {
  'use strict';

  const {
    Map,
    Object,
    ReferenceError,
    Reflect,
    TypeError,
  } = globalThis;
  const {
    create,
    defineProperties,
    defineProperty,
    freeze,
    fromEntries,
    getOwnPropertyDescriptors,
    getOwnPropertyNames,
    keys,
  } = Object;
  const { get, set } = Reflect;

  const {
  } = options || {};



  const cell = (name, value = undefined) => {
    const observers = [];
    return freeze({
      get: freeze(() => {
        return value;
      }),
      set: freeze((newValue) => {
        value = newValue;
        for (const observe of observers) {
          observe(value);
        }
      }),
      observe: freeze((observe) => {
        observers.push(observe);
        observe(value);
      }),
      enumerable: true,
    });
  };

  const cells = [
    {
      makeHardener: cell("makeHardener"),
    },
    {
      makeHardenerSelector: cell("makeHardenerSelector"),
    },
    {
      default: cell("default"),
    },
    {
      makeEnvironmentCaptor: cell("makeEnvironmentCaptor"),
      getEnvironmentOption: cell("getEnvironmentOption"),
      getEnvironmentOptionsList: cell("getEnvironmentOptionsList"),
      environmentOptionsListHas: cell("environmentOptionsListHas"),
    },
    {
    },
    {
      trackTurns: cell("trackTurns"),
    },
    {
      makeMessageBreakpointTester: cell("makeMessageBreakpointTester"),
    },
    {
      getMethodNames: cell("getMethodNames"),
      localApplyFunction: cell("localApplyFunction"),
      localApplyMethod: cell("localApplyMethod"),
      localGet: cell("localGet"),
    },
    {
      makePostponedHandler: cell("makePostponedHandler"),
    },
    {
      makeHandledPromise: cell("makeHandledPromise"),
    },
    {
    },
    {
    },
  ];

  defineProperties(cells[4], getOwnPropertyDescriptors(cells[3]));

  const namespaces = cells.map(cells => freeze(create(null, {
    ...cells,
    // Make this appear like an ESM module namespace object.
    [Symbol.toStringTag]: {
      value: 'Module',
      writable: false,
      enumerable: false,
      configurable: false,
    },
  })));

  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }

function observeImports(map, importName, importIndex) {
  for (const [name, observers] of map.get(importName)) {
    const cell = cells[importIndex][name];
    if (cell === undefined) {
      throw new ReferenceError(`Cannot import name ${name} (has ${Object.getOwnPropertyNames(cells[importIndex]).join(', ')})`);
    }
    for (const observer of observers) {
      cell.observe(observer);
    }
  }
}

  functors[0]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeHardener: cells[0].makeHardener.set,
    },
    importMeta: {},
  });
  functors[1]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeHardenerSelector: cells[1].makeHardenerSelector.set,
    },
    importMeta: {},
  });
  functors[2]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./make-hardener.js", 0);
      observeImports(map, "./make-selector.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[2].default.set,
    },
    importMeta: {},
  });
  functors[3]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeEnvironmentCaptor: cells[3].makeEnvironmentCaptor.set,
      getEnvironmentOption: cells[3].getEnvironmentOption.set,
      getEnvironmentOptionsList: cells[3].getEnvironmentOptionsList.set,
      environmentOptionsListHas: cells[3].environmentOptionsListHas.set,
    },
    importMeta: {},
  });
  functors[4]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/env-options.js", 3);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[5]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/env-options", 4);
    },
    liveVar: {
    },
    onceVar: {
      trackTurns: cells[5].trackTurns.set,
    },
    importMeta: {},
  });
  functors[6]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/env-options", 4);
    },
    liveVar: {
    },
    onceVar: {
      makeMessageBreakpointTester: cells[6].makeMessageBreakpointTester.set,
    },
    importMeta: {},
  });
  functors[7]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 2);
      observeImports(map, "./message-breakpoints.js", 6);
    },
    liveVar: {
    },
    onceVar: {
      getMethodNames: cells[7].getMethodNames.set,
      localApplyFunction: cells[7].localApplyFunction.set,
      localApplyMethod: cells[7].localApplyMethod.set,
      localGet: cells[7].localGet.set,
    },
    importMeta: {},
  });
  functors[8]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makePostponedHandler: cells[8].makePostponedHandler.set,
    },
    importMeta: {},
  });
  functors[9]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 2);
      observeImports(map, "./track-turns.js", 5);
      observeImports(map, "./local.js", 7);
      observeImports(map, "./postponed.js", 8);
    },
    liveVar: {
    },
    onceVar: {
      makeHandledPromise: cells[9].makeHandledPromise.set,
    },
    importMeta: {},
  });
  functors[10]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/handled-promise.js", 9);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[11]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/harden", 2);
      observeImports(map, "@endo/eventual-send/shim.js", 10);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });

  return cells[cells.length - 1]['*'].get();
})([
// === 0. harden ./make-hardener.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);// Adapted from SES/Caja - Copyright (C) 2011 Google Inc.
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
       const makeHardener = ({ traversePrototypes = false } = {}) => {
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
};$h͏_once.makeHardener(makeHardener);
})()
,
// === 1. harden ./make-selector.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);/* This module provides the mechanism used by both the "unsafe" and "shallow"
 * (default) implementations of "@endo/harden" for racing to install an
 * implementation of harden at globalThis.harden and
 * Object[Symbol.for('harden')].
 */

/* global globalThis */

/** @import { Harden } from './make-hardener.js' */

const symbolForHarden = Symbol.for('harden');

/**
 * @template T
 * @param {() => Harden<T>} makeHardener
 */
       const makeHardenerSelector = makeHardener => {
  const selectHarden = () => {
    // @ts-expect-error Type 'unique symbol' cannot be used as an index type.
    const { [symbolForHarden]: objectHarden } = Object;
    if (objectHarden) {
      if (typeof objectHarden !== 'function') {
        throw new Error('@endo/harden expected callable Object[@harden]');
      }
      return objectHarden;
    }

    // @ts-ignore globalThis.harden is a HardenedJS convention
    const { harden: globalHarden } = globalThis;
    if (globalHarden) {
      if (typeof globalHarden !== 'function') {
        throw new Error('@endo/harden expected callable globalThis.harden');
      }
      return globalHarden;
    }

    const harden = makeHardener();
    // We should not reach this point if a harden implementation already exists here.
    // The non-configurability of this property will prevent any HardenedJS's
    // lockdown from succeeding.
    // Versions that predate the introduction of Object[@harden] will be unable
    // to remove the unknown intrinsic.
    // Versions that permit Object[@harden] fail explicitly.
    Object.defineProperty(Object, symbolForHarden, {
      value: harden,
      configurable: false,
      writable: false,
    });

    return harden;
  };

  let selectedHarden;

  /**
   * @template T
   * @param {T} object
   * @returns {T}
   */
  const harden = object => {
    if (!selectedHarden) {
      selectedHarden = selectHarden();
    }
    return selectedHarden(object);
  };
  Object.freeze(harden);

  return harden;
};$h͏_once.makeHardenerSelector(makeHardenerSelector);
})()
,
// === 2. harden ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let makeHardener,makeHardenerSelector;$h͏_imports([["./make-hardener.js", [["makeHardener",[$h͏_a => (makeHardener = $h͏_a)]]]],["./make-selector.js", [["makeHardenerSelector",[$h͏_a => (makeHardenerSelector = $h͏_a)]]]]]);












const harden = makeHardenerSelector(() =>
  makeHardener({ traversePrototypes: false }),
);
const{default:$c͏_default}={default:harden};$h͏_once.default($c͏_default);
})()
,
// === 3. env-options ./src/env-options.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);/* global globalThis */
// @ts-check

// `@endo/env-options` needs to be imported quite early, and so should
// avoid importing from ses or anything that depends on ses.

// /////////////////////////////////////////////////////////////////////////////
// Prelude of cheap good - enough imitations of things we'd use or
// do differently if we could depend on ses

// eslint-disable-next-line no-restricted-globals
const localThis = globalThis;

const { Object, Reflect, Array, String, JSON, Error } = localThis;
const { freeze } = Object;
const { apply } = Reflect;

// Should be equivalent to the one in ses' commons.js even though it
// uses the other technique.
const uncurryThis =
  fn =>
  (receiver, ...args) =>
    apply(fn, receiver, args);
const arrayPush = uncurryThis(Array.prototype.push);
const arrayIncludes = uncurryThis(Array.prototype.includes);
const stringSplit = uncurryThis(String.prototype.split);

const q = JSON.stringify;

const Fail = (literals, ...args) => {
  let msg = literals[0];
  for (let i = 0; i < args.length; i += 1) {
    msg = `${msg}${args[i]}${literals[i + 1]}`;
  }
  throw Error(msg);
};

// end prelude
// /////////////////////////////////////////////////////////////////////////////

/**
 * `makeEnvironmentCaptor` provides a mechanism for getting environment
 * variables, if they are needed, and a way to catalog the names of all
 * the environment variables that were captured.
 *
 * @param {object} aGlobal
 * @param {boolean} [dropNames] Defaults to false. If true, don't track
 * names used.
 */
       const makeEnvironmentCaptor = (aGlobal, dropNames = false) => {
  /** @type {string[]} */
  const capturedEnvironmentOptionNames = [];

  /**
   * Gets an environment option by name and returns the option value or the
   * given default.
   *
   * @param {string} optionName
   * @param {string} defaultSetting
   * @param {string[]} [optOtherValues]
   * If provided, the option value must be included or match `defaultSetting`.
   * @returns {string}
   */
  const getEnvironmentOption = (
    optionName,
    defaultSetting,
    optOtherValues = undefined,
  ) => {
    typeof optionName === 'string' ||
      Fail`Environment option name ${q(optionName)} must be a string.`;
    typeof defaultSetting === 'string' ||
      Fail`Environment option default setting ${q(
        defaultSetting,
      )} must be a string.`;

    /** @type {string} */
    let setting = defaultSetting;
    const globalProcess = aGlobal.process || undefined;
    const globalEnv =
      (typeof globalProcess === 'object' && globalProcess.env) || undefined;
    if (typeof globalEnv === 'object') {
      if (optionName in globalEnv) {
        if (!dropNames) {
          arrayPush(capturedEnvironmentOptionNames, optionName);
        }
        const optionValue = globalEnv[optionName];
        // eslint-disable-next-line @endo/no-polymorphic-call
        typeof optionValue === 'string' ||
          Fail`Environment option named ${q(
            optionName,
          )}, if present, must have a corresponding string value, got ${q(
            optionValue,
          )}`;
        setting = optionValue;
      }
    }
    optOtherValues === undefined ||
      setting === defaultSetting ||
      arrayIncludes(optOtherValues, setting) ||
      Fail`Unrecognized ${q(optionName)} value ${q(
        setting,
      )}. Expected one of ${q([defaultSetting, ...optOtherValues])}`;
    return setting;
  };
  freeze(getEnvironmentOption);

  /**
   * @template {string} [T=string]
   * @param {string} optionName
   * @returns {T[]}
   */
  const getEnvironmentOptionsList = optionName => {
    const option = getEnvironmentOption(optionName, '');
    return freeze(option === '' ? [] : stringSplit(option, ','));
  };
  freeze(getEnvironmentOptionsList);

  /**
   * @template {string} [T=string]
   * @param {string} optionName
   * @param {T} element
   * @returns {boolean}
   */
  const environmentOptionsListHas = (optionName, element) =>
    arrayIncludes(getEnvironmentOptionsList(optionName), element);

  const getCapturedEnvironmentOptionNames = () => {
    return freeze([...capturedEnvironmentOptionNames]);
  };
  freeze(getCapturedEnvironmentOptionNames);

  return freeze({
    getEnvironmentOption,
    getEnvironmentOptionsList,
    environmentOptionsListHas,
    getCapturedEnvironmentOptionNames,
  });
};$h͏_once.makeEnvironmentCaptor(makeEnvironmentCaptor);
freeze(makeEnvironmentCaptor);

/**
 * For the simple case, where the global in question is `globalThis` and no
 * reporting of option names is desired.
 */
       const {
  getEnvironmentOption,
  getEnvironmentOptionsList,
  environmentOptionsListHas,
} = makeEnvironmentCaptor(localThis, true);$h͏_once.getEnvironmentOption(getEnvironmentOption);$h͏_once.getEnvironmentOptionsList(getEnvironmentOptionsList);$h͏_once.environmentOptionsListHas(environmentOptionsListHas);
})()
,
// === 4. env-options ./index.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([["./src/env-options.js", []]]);
})()
,
// === 5. eventual-send ./src/track-turns.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let getEnvironmentOption,environmentOptionsListHas;$h͏_imports([["@endo/env-options", [["getEnvironmentOption",[$h͏_a => (getEnvironmentOption = $h͏_a)]],["environmentOptionsListHas",[$h͏_a => (environmentOptionsListHas = $h͏_a)]]]]]);





// NOTE: We can't import these because they're not in scope before lockdown.
// We also cannot currently import them because it would create a cyclic
// dependency, though this is more easily fixed.
// import { assert, X, Fail } from '@endo/errors';
// See also https://github.com/Agoric/agoric-sdk/issues/9515

// WARNING: Global Mutable State!
// This state is communicated to `assert` that makes it available to the
// causal console, which affects the console log output. Normally we
// regard the ability to see console log output as a meta-level privilege
// analogous to the ability to debug. Aside from that, this module should
// not have any observably mutable state.

let hiddenPriorError;
let hiddenCurrentTurn = 0;
let hiddenCurrentEvent = 0;

// Turn on if you seem to be losing error logging at the top of the event loop
const VERBOSE = environmentOptionsListHas('DEBUG', 'track-turns');

// Track-turns is disabled by default and can be enabled by an environment
// option.
const ENABLED =
  /** @type {'disabled' | 'enabled'} */
  (getEnvironmentOption('TRACK_TURNS', 'disabled', ['enabled'])) === 'enabled';

// We hoist the following functions out of trackTurns() to discourage the
// closures from holding onto 'args' or 'func' longer than necessary,
// which we've seen cause HandledPromise arguments to be retained for
// a surprisingly long time.

const addRejectionNote = detailsNote => reason => {
  if (reason instanceof Error) {
    globalThis.assert.note(reason, detailsNote);
  }
  if (VERBOSE) {
    console.log('REJECTED at top of event loop', reason);
  }
};

const wrapFunction =
  (func, sendingError, X) =>
  (...args) => {
    hiddenPriorError = sendingError;
    hiddenCurrentTurn += 1;
    hiddenCurrentEvent = 0;
    try {
      let result;
      try {
        result = func(...args);
      } catch (err) {
        if (err instanceof Error) {
          globalThis.assert.note(
            err,
            X`Thrown from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`,
          );
        }
        if (VERBOSE) {
          console.log('THROWN to top of event loop', err);
        }
        throw err;
      }
      // Must capture this now, not when the catch triggers.
      const detailsNote = X`Rejection from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`;
      Promise.resolve(result).catch(addRejectionNote(detailsNote));
      return result;
    } finally {
      hiddenPriorError = undefined;
    }
  };

/**
 * Given a list of `TurnStarterFn`s, returns a list of `TurnStarterFn`s whose
 * `this`-free call behaviors are not observably different to those that
 * cannot see console output. The only purpose is to cause additional
 * information to appear on the console.
 *
 * The call to `trackTurns` is itself a sending event, that occurs in some call
 * stack in some turn number at some event number within that turn. Each call
 * to any of the returned `TurnStartFn`s is a receiving event that begins a new
 * turn. This sending event caused each of those receiving events.
 *
 * @template {TurnStarterFn[]} T
 * @param {T} funcs
 * @returns {T}
 */
       const trackTurns = funcs => {
  if (!ENABLED || typeof globalThis === 'undefined' || !globalThis.assert) {
    return funcs;
  }
  const { details: X, note: annotateError } = globalThis.assert;

  hiddenCurrentEvent += 1;
  const sendingError = Error(
    `Event: ${hiddenCurrentTurn}.${hiddenCurrentEvent}`,
  );
  if (hiddenPriorError !== undefined) {
    annotateError(sendingError, X`Caused by: ${hiddenPriorError}`);
  }

  return /** @type {T} */ (
    funcs.map(func => func && wrapFunction(func, sendingError, X))
  );
};

/**
 * An optional function that is not this-sensitive, expected to be called at
 * bottom of stack to start a new turn.
 *
 * @typedef {((...args: any[]) => any) | undefined} TurnStarterFn
 */$h͏_once.trackTurns(trackTurns);
})()
,
// === 6. eventual-send ./src/message-breakpoints.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let getEnvironmentOption;$h͏_imports([["@endo/env-options", [["getEnvironmentOption",[$h͏_a => (getEnvironmentOption = $h͏_a)]]]]]);

const { quote: q, Fail } = assert;

const { hasOwn, freeze, entries } = Object;

/**
 * @typedef {string | '*'} MatchStringTag
 *   A star `'*'` matches any recipient. Otherwise, the string is
 *   matched against the value of a recipient's `@@toStringTag`
 *   after stripping out any leading `'Alleged: '` or `'DebugName: '`
 *   prefix. For objects defined with `Far` this is the first argument,
 *   known as the `farName`. For exos, this is the tag.
 */
/**
 * @typedef {string | '*'} MatchMethodName
 *   A star `'*'` matches any method name. Otherwise, the string is
 *   matched against the method name. Currently, this is only an exact match.
 *   However, beware that we may introduce a string syntax for
 *   symbol method names.
 */
/**
 * @typedef {number | '*'} MatchCountdown
 *   A star `'*'` will always breakpoint. Otherwise, the string
 *   must be a non-negative integer. Once that is zero, always breakpoint.
 *   Otherwise decrement by one each time it matches until it reaches zero.
 *   In other words, the countdown represents the number of
 *   breakpoint occurrences to skip before actually breakpointing.
 */

/**
 * This is the external JSON representation, in which
 * - the outer property name is the class-like tag or '*',
 * - the inner property name is the method name or '*',
 * - the value is a non-negative integer countdown or '*'.
 *
 * @typedef {Record<MatchStringTag, Record<MatchMethodName, MatchCountdown>>} MessageBreakpoints
 */

/**
 * This is the internal JSON representation, in which
 * - the outer property name is the method name or '*',
 * - the inner property name is the class-like tag or '*',
 * - the value is a non-negative integer countdown or '*'.
 *
 * @typedef {Record<MatchMethodName, Record<MatchStringTag, MatchCountdown>>} BreakpointTable
 */

/**
 * @typedef {object} MessageBreakpointTester
 * @property {() => MessageBreakpoints} getBreakpoints
 * @property {(newBreakpoints?: MessageBreakpoints) => void} setBreakpoints
 * @property {(
 *   recipient: object,
 *   methodName: string | symbol | undefined
 * ) => boolean} shouldBreakpoint
 */

/**
 * @param {any} val
 * @returns {val is Record<string, any>}
 */
const isJSONRecord = val =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

/**
 * Return `tag` after stripping off any `'Alleged: '` or `'DebugName: '`
 * prefix if present.
 * ```js
 * simplifyTag('Alleged: moola issuer') === 'moola issuer'
 * ```
 * If there are multiple such prefixes, only the outer one is removed.
 *
 * @param {string} tag
 * @returns {string}
 */
const simplifyTag = tag => {
  for (const prefix of ['Alleged: ', 'DebugName: ']) {
    if (tag.startsWith(prefix)) {
      return tag.slice(prefix.length);
    }
  }
  return tag;
};

/**
 * @param {string} optionName
 * @returns {MessageBreakpointTester | undefined}
 */
       const makeMessageBreakpointTester = optionName => {
  let breakpoints = JSON.parse(getEnvironmentOption(optionName, 'null'));

  if (breakpoints === null) {
    return undefined;
  }

  /** @type {BreakpointTable} */
  let breakpointsTable;

  const getBreakpoints = () => breakpoints;
  freeze(getBreakpoints);

  const setBreakpoints = (newBreakpoints = breakpoints) => {
    isJSONRecord(newBreakpoints) ||
      Fail`Expected ${q(optionName)} option to be a JSON breakpoints record`;

    /** @type {BreakpointTable} */
    // @ts-expect-error confused by __proto__
    const newBreakpointsTable = { __proto__: null };

    for (const [tag, methodBPs] of entries(newBreakpoints)) {
      tag === simplifyTag(tag) ||
        Fail`Just use simple tag ${q(simplifyTag(tag))} rather than ${q(tag)}`;
      isJSONRecord(methodBPs) ||
        Fail`Expected ${q(optionName)} option's ${q(
          tag,
        )} to be a JSON methods breakpoints record`;
      for (const [methodName, count] of entries(methodBPs)) {
        count === '*' ||
          (typeof count === 'number' &&
            Number.isSafeInteger(count) &&
            count >= 0) ||
          Fail`Expected ${q(optionName)} option's ${q(tag)}.${q(
            methodName,
          )} to be "*" or a non-negative integer`;

        const classBPs = hasOwn(newBreakpointsTable, methodName)
          ? newBreakpointsTable[methodName]
          : (newBreakpointsTable[methodName] = {
              // @ts-expect-error confused by __proto__
              __proto__: null,
            });
        classBPs[tag] = count;
      }
    }
    breakpoints = newBreakpoints;
    breakpointsTable = newBreakpointsTable;
  };
  freeze(setBreakpoints);

  const shouldBreakpoint = (recipient, methodName) => {
    if (methodName === undefined || methodName === null) {
      // TODO enable function breakpointing
      return false;
    }
    const classBPs = breakpointsTable[methodName] || breakpointsTable['*'];
    if (classBPs === undefined) {
      return false;
    }
    let tag = simplifyTag(recipient[Symbol.toStringTag]);
    let count = classBPs[tag];
    if (count === undefined) {
      tag = '*';
      count = classBPs[tag];
      if (count === undefined) {
        return false;
      }
    }
    if (count === '*') {
      return true;
    }
    if (count === 0) {
      return true;
    }
    assert(typeof count === 'number' && count >= 1);
    classBPs[tag] = count - 1;
    return false;
  };
  freeze(shouldBreakpoint);

  const breakpointTester = freeze({
    getBreakpoints,
    setBreakpoints,
    shouldBreakpoint,
  });
  breakpointTester.setBreakpoints();
  return breakpointTester;
};$h͏_once.makeMessageBreakpointTester(makeMessageBreakpointTester);
freeze(makeMessageBreakpointTester);
})()
,
// === 7. eventual-send ./src/local.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,makeMessageBreakpointTester;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["./message-breakpoints.js", [["makeMessageBreakpointTester",[$h͏_a => (makeMessageBreakpointTester = $h͏_a)]]]]]);


const { details: X, quote: q, Fail } = assert;

const { getOwnPropertyDescriptors, getPrototypeOf, freeze } = Object;
const { apply, ownKeys } = Reflect;

const ntypeof = specimen => (specimen === null ? 'null' : typeof specimen);

const onDelivery = makeMessageBreakpointTester('ENDO_DELIVERY_BREAKPOINTS');

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
const isPrimitive = val =>
  !val || (typeof val !== 'object' && typeof val !== 'function');

/**
 * Prioritize symbols as earlier than strings.
 *
 * @param {string|symbol} a
 * @param {string|symbol} b
 * @returns {-1 | 0 | 1}
 */
const compareStringified = (a, b) => {
  if (typeof a === typeof b) {
    const left = String(a);
    const right = String(b);
    // eslint-disable-next-line no-nested-ternary
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof a === 'symbol') {
    assert(typeof b === 'string');
    return -1;
  }
  assert(typeof a === 'string');
  assert(typeof b === 'symbol');
  return 1;
};

/**
 * @param {any} val
 * @returns {(string|symbol)[]}
 */
       const getMethodNames = val => {
  let layer = val;
  const names = new Set(); // Set to deduplicate
  while (layer !== null && layer !== Object.prototype) {
    // be tolerant of non-objects
    const descs = getOwnPropertyDescriptors(layer);
    for (const name of ownKeys(descs)) {
      // In case a method is overridden by a non-method,
      // test `val[name]` rather than `layer[name]`
      if (typeof val[name] === 'function') {
        names.add(name);
      }
    }
    if (isPrimitive(val)) {
      break;
    }
    layer = getPrototypeOf(layer);
  }
  return harden([...names].sort(compareStringified));
};
// The top level of the eventual send modules can be evaluated before
// ses creates `harden`, and so cannot rely on `harden` at top level.
$h͏_once.getMethodNames(getMethodNames);freeze(getMethodNames);

       const localApplyFunction = (recipient, args) => {
  typeof recipient === 'function' ||
    assert.fail(
      X`Cannot invoke target as a function; typeof target is ${q(
        ntypeof(recipient),
      )}`,
      TypeError,
    );
  if (onDelivery && onDelivery.shouldBreakpoint(recipient, undefined)) {
    // eslint-disable-next-line no-debugger
    debugger; // STEP INTO APPLY
    // Stopped at a breakpoint on this delivery of an eventual function call
    // so that you can step *into* the following `apply` in order to see the
    // function call as it happens. Or step *over* to see what happens
    // after the function call returns.
  }
  const result = apply(recipient, undefined, args);
  return result;
};$h͏_once.localApplyFunction(localApplyFunction);

       const localApplyMethod = (recipient, methodName, args) => {
  if (methodName === undefined || methodName === null) {
    // Base case; bottom out to apply functions.
    return localApplyFunction(recipient, args);
  }
  if (recipient === undefined || recipient === null) {
    assert.fail(
      X`Cannot deliver ${q(methodName)} to target; typeof target is ${q(
        ntypeof(recipient),
      )}`,
      TypeError,
    );
  }
  const fn = recipient[methodName];
  if (fn === undefined) {
    assert.fail(
      X`target has no method ${q(methodName)}, has ${q(
        getMethodNames(recipient),
      )}`,
      TypeError,
    );
  }
  const ftype = ntypeof(fn);
  typeof fn === 'function' ||
    Fail`invoked method ${q(methodName)} is not a function; it is a ${q(
      ftype,
    )}`;
  if (onDelivery && onDelivery.shouldBreakpoint(recipient, methodName)) {
    // eslint-disable-next-line no-debugger
    debugger; // STEP INTO APPLY
    // Stopped at a breakpoint on this delivery of an eventual method call
    // so that you can step *into* the following `apply` in order to see the
    // method call as it happens. Or step *over* to see what happens
    // after the method call returns.
  }
  const result = apply(fn, recipient, args);
  return result;
};$h͏_once.localApplyMethod(localApplyMethod);

       const localGet = (t, key) => t[key];$h͏_once.localGet(localGet);
})()
,
// === 8. eventual-send ./src/postponed.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';$h͏_imports([]);/// <reference types="ses" />

/**
 * Create a simple postponedHandler that just postpones until donePostponing is
 * called.
 *
 * @param {import('./types.js').HandledPromiseConstructor} HandledPromise
 * @returns {[Required<import('./types.js').Handler<any>>, () => void]} postponedHandler and donePostponing callback.
 */
       const makePostponedHandler = HandledPromise => {
  /** @type {() => void} */
  let donePostponing;

  const interlockP = new Promise(resolve => {
    donePostponing = () => resolve(undefined);
  });

  const makePostponedOperation = postponedOperation => {
    // Just wait until the handler is resolved/rejected.
    return function postpone(x, ...args) {
      // console.log(`forwarding ${postponedOperation} ${args[0]}`);
      return new HandledPromise((resolve, reject) => {
        interlockP
          .then(_ => {
            resolve(HandledPromise[postponedOperation](x, ...args));
          })
          .catch(reject);
      });
    };
  };

  /** @type {Required<import('./types.js').Handler<any>>} */
  const postponedHandler = {
    get: makePostponedOperation('get'),
    getSendOnly: makePostponedOperation('getSendOnly'),
    applyFunction: makePostponedOperation('applyFunction'),
    applyFunctionSendOnly: makePostponedOperation('applyFunctionSendOnly'),
    applyMethod: makePostponedOperation('applyMethod'),
    applyMethodSendOnly: makePostponedOperation('applyMethodSendOnly'),
  };

  // @ts-expect-error 2454
  assert(donePostponing);

  return [postponedHandler, donePostponing];
};$h͏_once.makePostponedHandler(makePostponedHandler);
})()
,
// === 9. eventual-send ./src/handled-promise.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden,trackTurns,localApplyFunction,localApplyMethod,localGet,getMethodNames,makePostponedHandler;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["./track-turns.js", [["trackTurns",[$h͏_a => (trackTurns = $h͏_a)]]]],["./local.js", [["localApplyFunction",[$h͏_a => (localApplyFunction = $h͏_a)]],["localApplyMethod",[$h͏_a => (localApplyMethod = $h͏_a)]],["localGet",[$h͏_a => (localGet = $h͏_a)]],["getMethodNames",[$h͏_a => (getMethodNames = $h͏_a)]]]],["./postponed.js", [["makePostponedHandler",[$h͏_a => (makePostponedHandler = $h͏_a)]]]]]);











const { Fail, details: X, quote: q, note: annotateError } = assert;

const {
  create,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  defineProperties,
  getPrototypeOf,
  setPrototypeOf,
  isFrozen,
  is: objectIs,
} = Object;

const { apply, construct, ownKeys } = Reflect;

const SEND_ONLY_RE = /^(.*)SendOnly$/;

/**
 * Coerce to an object property (string or symbol).
 *
 * @param {any} specimen
 * @returns {string | symbol}
 */
const coerceToObjectProperty = specimen => {
  if (typeof specimen === 'symbol') {
    return specimen;
  }
  return String(specimen);
};

// the following method (makeHandledPromise) is part
// of the shim, and will not be exported by the module once the feature
// becomes a part of standard javascript

/**
 * Create a HandledPromise class to have it support eventual send
 * (wavy-dot) operations.
 *
 * Based heavily on nanoq
 * https://github.com/drses/nanoq/blob/master/src/nanoq.js
 *
 * Original spec for the infix-bang (predecessor to wavy-dot) desugaring:
 * https://web.archive.org/web/20161026162206/http://wiki.ecmascript.org/doku.php?id=strawman:concurrency
 *
 */
       const makeHandledPromise = () => {
  const presenceToHandler = new WeakMap();
  /** @type {WeakMap<any, any>} */
  const presenceToPromise = new WeakMap();
  const promiseToPendingHandler = new WeakMap();
  const promiseToPresence = new WeakMap();
  const forwardedPromiseToPromise = new WeakMap(); // forwarding, union-find-ish

  /**
   * You can imagine a forest of trees in which the roots of each tree is an
   * unresolved HandledPromise or a non-Promise, and each node's parent is the
   * HandledPromise to which it was forwarded.  We maintain that mapping of
   * forwarded HandledPromise to its resolution in forwardedPromiseToPromise.
   *
   * We use something like the description of "Find" with "Path splitting"
   * to propagate changes down to the children efficiently:
   * https://en.wikipedia.org/wiki/Disjoint-set_data_structure
   *
   * @param {any} target Any value.
   * @returns {any} If the target was a HandledPromise, the most-resolved parent
   * of it, otherwise the target.
   */
  const shorten = target => {
    let p = target;
    // Find the most-resolved value for p.
    while (forwardedPromiseToPromise.has(p)) {
      p = forwardedPromiseToPromise.get(p);
    }
    const presence = promiseToPresence.get(p);
    if (presence) {
      // Presences are final, so it is ok to propagate
      // this upstream.
      while (!objectIs(target, p)) {
        const parent = forwardedPromiseToPromise.get(target);
        forwardedPromiseToPromise.delete(target);
        promiseToPendingHandler.delete(target);
        promiseToPresence.set(target, presence);
        target = parent;
      }
    } else {
      // We propagate p and remove all other pending handlers
      // upstream.
      // Note that everything except presences is covered here.
      while (!objectIs(target, p)) {
        const parent = forwardedPromiseToPromise.get(target);
        forwardedPromiseToPromise.set(target, p);
        promiseToPendingHandler.delete(target);
        target = parent;
      }
    }
    return target;
  };

  /**
   * This special handler accepts Promises, and forwards
   * handled Promises to their corresponding fulfilledHandler.
   *
   * @type {Required<Handler<any>>}
   */
  let forwardingHandler;
  /** @type {(...args: any[]) => Promise<unknown>} */
  let handle;

  /**
   * @param {string} handlerName
   * @param {Handler<any>} handler
   * @param {keyof Handler<any>} operation
   * @param {any} o
   * @param {any[]} opArgs
   * @param {Promise<unknown>} [returnedP]
   * @returns {any}
   */
  const dispatchToHandler = (
    handlerName,
    handler,
    operation,
    o,
    opArgs,
    returnedP,
  ) => {
    let actualOp = operation;

    const matchSendOnly = SEND_ONLY_RE.exec(actualOp);

    const makeResult = result => (matchSendOnly ? undefined : result);

    if (matchSendOnly) {
      // We don't specify the resulting promise if it is sendonly.
      returnedP = undefined;
    }

    if (matchSendOnly && typeof handler[actualOp] !== 'function') {
      // Substitute for sendonly with the corresponding non-sendonly operation.
      actualOp = /** @type {'get' | 'applyMethod' | 'applyFunction'} */ (
        matchSendOnly[1]
      );
    }

    // Fast path: just call the actual operation.
    const hfn = handler[actualOp];
    if (typeof hfn === 'function') {
      const result = apply(hfn, handler, [o, ...opArgs, returnedP]);
      return makeResult(result);
    }

    if (actualOp === 'applyMethod') {
      // Compose a missing applyMethod by get followed by applyFunction.
      const [prop, args] = opArgs;
      const getResultP = handle(
        o,
        'get',
        // The argument to 'get' is a string or symbol.
        [coerceToObjectProperty(prop)],
        undefined,
      );
      return makeResult(handle(getResultP, 'applyFunction', [args], returnedP));
    }

    // BASE CASE: applyFunction bottoms out into applyMethod, if it exists.
    if (actualOp === 'applyFunction') {
      const amfn = handler.applyMethod;
      if (typeof amfn === 'function') {
        // Downlevel a missing applyFunction to applyMethod with undefined name.
        const [args] = opArgs;
        const result = apply(amfn, handler, [o, undefined, [args], returnedP]);
        return makeResult(result);
      }
    }

    throw assert.fail(
      X`${q(handlerName)} is defined but has no methods needed for ${q(
        operation,
      )} (has ${q(getMethodNames(handler))})`,
      TypeError,
    );
  };

  /** @typedef {{new <R>(executor: HandledExecutor<R>, unfulfilledHandler?: Handler<Promise<unknown>>): Promise<R>, prototype: Promise<unknown>} & PromiseConstructor & HandledPromiseStaticMethods} HandledPromiseConstructor */
  /** @type {HandledPromiseConstructor} */
  let HandledPromise;

  /**
   * This *needs* to be a `function X` so that we can use it as a constructor.
   *
   * @template R
   * @param {HandledExecutor<R>} executor
   * @param {Handler<Promise<R>>} [pendingHandler]
   * @returns {Promise<R>}
   */
  function baseHandledPromise(executor, pendingHandler = undefined) {
    new.target || Fail`must be invoked with "new"`;
    let handledResolve;
    let handledReject;
    let resolved = false;
    let resolvedTarget = null;
    /** @type {Promise<R>} */
    let handledP;
    let continueForwarding = () => {};
    const assertNotYetForwarded = () => {
      !forwardedPromiseToPromise.has(handledP) ||
        assert.fail(X`internal: already forwarded`, TypeError);
    };
    const superExecutor = (superResolve, superReject) => {
      handledResolve = value => {
        if (resolved) {
          return;
        }
        assertNotYetForwarded();
        value = shorten(value);
        let targetP;
        if (
          promiseToPendingHandler.has(value) ||
          promiseToPresence.has(value)
        ) {
          targetP = value;
        } else {
          // We're resolving to a non-promise, so remove our handler.
          promiseToPendingHandler.delete(handledP);
          targetP = presenceToPromise.get(value);
        }
        // Ensure our data structure is a proper tree (avoid cycles).
        if (targetP && !objectIs(targetP, handledP)) {
          forwardedPromiseToPromise.set(handledP, targetP);
        } else {
          forwardedPromiseToPromise.delete(handledP);
        }

        // Remove stale pending handlers, set to canonical form.
        shorten(handledP);

        // Finish the resolution.
        superResolve(value);
        resolved = true;
        resolvedTarget = value;

        // We're resolved, so forward any postponed operations to us.
        continueForwarding();
      };
      handledReject = reason => {
        if (resolved) {
          return;
        }
        harden(reason);
        assertNotYetForwarded();
        promiseToPendingHandler.delete(handledP);
        resolved = true;
        superReject(reason);
        continueForwarding();
      };
    };
    handledP = harden(construct(Promise, [superExecutor], new.target));

    if (!pendingHandler) {
      // This is insufficient for actual remote handled Promises
      // (too many round-trips), but is an easy way to create a
      // local handled Promise.
      [pendingHandler, continueForwarding] =
        makePostponedHandler(HandledPromise);
    }

    const validateHandler = h => {
      Object(h) === h ||
        assert.fail(X`Handler ${h} cannot be a primitive`, TypeError);
    };
    validateHandler(pendingHandler);

    // Until the handled promise is resolved, we use the pendingHandler.
    promiseToPendingHandler.set(handledP, pendingHandler);

    const rejectHandled = reason => {
      if (resolved) {
        return;
      }
      assertNotYetForwarded();
      handledReject(reason);
    };

    const resolveWithPresence = (
      presenceHandler = pendingHandler,
      options = {},
    ) => {
      if (resolved) {
        return resolvedTarget;
      }
      assertNotYetForwarded();
      try {
        // Sanity checks.
        validateHandler(presenceHandler);

        const { proxy: proxyOpts } = options;
        let presence;
        if (proxyOpts) {
          const {
            handler: proxyHandler,
            // The proxy target can be frozen but should not be hardened
            // so it remains trapping.
            // See https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
            target: proxyTarget,
            revokerCallback,
          } = proxyOpts;
          if (revokerCallback) {
            // Create a proxy and its revoke function.
            const { proxy, revoke } = Proxy.revocable(
              proxyTarget,
              proxyHandler,
            );
            presence = proxy;
            revokerCallback(revoke);
          } else {
            presence = new Proxy(proxyTarget, proxyHandler);
          }
        } else {
          // Default presence.
          presence = create(null);
        }

        // Validate and install our mapped target (i.e. presence).
        resolvedTarget = presence;

        // Create table entries for the presence mapped to the
        // fulfilledHandler.
        presenceToPromise.set(resolvedTarget, handledP);
        promiseToPresence.set(handledP, resolvedTarget);
        presenceToHandler.set(resolvedTarget, presenceHandler);

        // We committed to this presence, so resolve.
        handledResolve(resolvedTarget);
        return resolvedTarget;
      } catch (e) {
        annotateError(e, X`during resolveWithPresence`);
        handledReject(e);
        throw e;
      }
    };

    const resolveHandled = target => {
      if (resolved) {
        return;
      }
      assertNotYetForwarded();
      try {
        // Resolve the target.
        handledResolve(target);
      } catch (e) {
        handledReject(e);
      }
    };

    // Invoke the callback to let the user resolve/reject.
    executor(resolveHandled, rejectHandled, resolveWithPresence);

    return handledP;
  }

  /**
   * If the promise `p` is safe, then during the evaluation of the
   * expressopns `p.then` and `await p`, `p` cannot mount a reentrancy attack.
   * Unfortunately, due to limitations of the current JavaScript standard,
   * it seems impossible to prevent `p` from mounting a reentrancy attack
   * during the evaluation of `isSafePromise(p)`, and therefore during
   * operations like `HandledPromise.resolve(p)` that call
   * `isSafePromise(p)` synchronously.
   *
   * The `@endo/marshal` package defines a related notion of a passable
   * promise, i.e., one for which which `passStyleOf(p) === 'promise'`. All
   * passable promises are also safe. But not vice versa because the
   * requirements for a promise to be passable are slightly greater. A safe
   * promise must not override `then` or `constructor`. A passable promise
   * must not have any own properties. The requirements are otherwise
   * identical.
   *
   * @param {Promise<unknown>} p
   * @returns {boolean}
   */
  const isSafePromise = p => {
    return (
      isFrozen(p) &&
      getPrototypeOf(p) === Promise.prototype &&
      Promise.resolve(p) === p &&
      getOwnPropertyDescriptor(p, 'then') === undefined &&
      getOwnPropertyDescriptor(p, 'constructor') === undefined
    );
  };

  /** @type {HandledPromiseStaticMethods & Pick<PromiseConstructor, 'resolve'>} */
  const staticMethods = {
    get(target, prop) {
      prop = coerceToObjectProperty(prop);
      return handle(target, 'get', [prop]);
    },
    getSendOnly(target, prop) {
      prop = coerceToObjectProperty(prop);
      handle(target, 'getSendOnly', [prop]).catch(() => {});
    },
    applyFunction(target, args) {
      // Ensure args is an array.
      args = [...args];
      return handle(target, 'applyFunction', [args]);
    },
    applyFunctionSendOnly(target, args) {
      // Ensure args is an array.
      args = [...args];
      handle(target, 'applyFunctionSendOnly', [args]).catch(() => {});
    },
    applyMethod(target, prop, args) {
      prop = coerceToObjectProperty(prop);
      // Ensure args is an array.
      args = [...args];
      return handle(target, 'applyMethod', [prop, args]);
    },
    applyMethodSendOnly(target, prop, args) {
      prop = coerceToObjectProperty(prop);
      // Ensure args is an array.
      args = [...args];
      handle(target, 'applyMethodSendOnly', [prop, args]).catch(() => {});
    },
    resolve(value) {
      // Resolving a Presence returns the pre-registered handled promise.
      let resolvedPromise = presenceToPromise.get(/** @type {any} */ (value));
      if (!resolvedPromise) {
        resolvedPromise = Promise.resolve(value);
      }
      // Prevent any proxy trickery.
      harden(resolvedPromise);
      if (isSafePromise(resolvedPromise)) {
        // We can use the `resolvedPromise` directly, since it is guaranteed to
        // have a `then` which is actually `Promise.prototype.then`.
        return resolvedPromise;
      }
      // Assimilate the `resolvedPromise` as an actual frozen Promise, by
      // treating `resolvedPromise` as if it is a non-promise thenable.
      /** @type {Promise['then']} */
      const executeThen = (resolve, reject) =>
        resolvedPromise.then(resolve, reject);
      return harden(
        Promise.resolve().then(() => new HandledPromise(executeThen)),
      );
    },
  };

  const makeForwarder = (operation, localImpl) => {
    return (o, ...args) => {
      // We are in another turn already, and have the naked object.
      const presenceHandler = presenceToHandler.get(o);
      if (!presenceHandler) {
        return localImpl(o, ...args);
      }
      return dispatchToHandler(
        'presenceHandler',
        presenceHandler,
        operation,
        o,
        args,
      );
    };
  };

  // eslint-disable-next-line prefer-const
  forwardingHandler = {
    get: makeForwarder('get', localGet),
    getSendOnly: makeForwarder('getSendOnly', localGet),
    applyFunction: makeForwarder('applyFunction', localApplyFunction),
    applyFunctionSendOnly: makeForwarder(
      'applyFunctionSendOnly',
      localApplyFunction,
    ),
    applyMethod: makeForwarder('applyMethod', localApplyMethod),
    applyMethodSendOnly: makeForwarder('applyMethodSendOnly', localApplyMethod),
  };

  handle = (...handleArgs) => {
    // We're in SES mode, so we should harden.
    harden(handleArgs);
    const [_p, operation, opArgs, ...dispatchArgs] = handleArgs;
    let [p] = handleArgs;
    const doDispatch = (handlerName, handler, o) =>
      dispatchToHandler(
        handlerName,
        handler,
        operation,
        o,
        opArgs,
        // eslint-disable-next-line no-use-before-define
        ...(dispatchArgs.length === 0 ? [returnedP] : dispatchArgs),
      );
    const [trackedDoDispatch] = trackTurns([doDispatch]);
    const returnedP = new HandledPromise((resolve, reject) => {
      // We run in a future turn to prevent synchronous attacks,
      let raceIsOver = false;

      /** @type {(handlerName: string, handler: any, o: any) => any} */
      const win = (handlerName, handler, o) => {
        if (raceIsOver) {
          return;
        }
        try {
          resolve(harden(trackedDoDispatch(handlerName, handler, o)));
        } catch (reason) {
          reject(harden(reason));
        }
        raceIsOver = true;
      };

      /** @type {(reason: unknown) => void} */
      const lose = reason => {
        if (raceIsOver) {
          return;
        }
        reject(harden(reason));
        raceIsOver = true;
      };

      // This contestant tries to win with the target's resolution.
      staticMethods
        .resolve(p)
        .then(o => win('forwardingHandler', forwardingHandler, o))
        .catch(lose);

      // This contestant sleeps a turn, but then tries to win immediately.
      staticMethods
        .resolve()
        .then(() => {
          p = shorten(p);
          const pendingHandler = promiseToPendingHandler.get(p);
          if (pendingHandler) {
            // resolve to the answer from the specific pending handler,
            win('pendingHandler', pendingHandler, p);
          } else if (!p || typeof p.then !== 'function') {
            // Not a Thenable, so use it.
            win('forwardingHandler', forwardingHandler, p);
          } else if (promiseToPresence.has(p)) {
            // We have the object synchronously, so resolve with it.
            const o = promiseToPresence.get(p);
            win('forwardingHandler', forwardingHandler, o);
          }
          // If we made it here without winning, then we will wait
          // for the other contestant to win instead.
        })
        .catch(lose);
    });

    // We return a handled promise with the default pending handler.  This
    // prevents a race between the above Promise.resolves and pipelining.
    return harden(returnedP);
  };

  // Add everything needed on the constructor.
  baseHandledPromise.prototype = Promise.prototype;
  setPrototypeOf(baseHandledPromise, Promise);
  defineProperties(
    baseHandledPromise,
    getOwnPropertyDescriptors(staticMethods),
  );

  // FIXME: This is really ugly to bypass the type system, but it will be better
  // once we use Promise.delegated and don't have any [[Constructor]] behaviours.
  // @ts-expect-error cast
  HandledPromise = baseHandledPromise;

  // We're a vetted shim which runs before `lockdown` allows
  // `harden(HandledPromise)` to function, but single-level `freeze` is a
  // suitable replacement because all mutable objects reachable afterwards are
  // intrinsics hardened by lockdown.
  freeze(HandledPromise);
  for (const key of ownKeys(HandledPromise)) {
    // prototype is the intrinsic Promise.prototype to be hardened by lockdown.
    if (key !== 'prototype') {
      freeze(HandledPromise[key]);
    }
  }

  return HandledPromise;
};

/**
 * @template T
 * @typedef {{
 *   get?(p: T, name: PropertyKey, returnedP?: Promise<unknown>): unknown;
 *   getSendOnly?(p: T, name: PropertyKey): void;
 *   applyFunction?(p: T, args: unknown[], returnedP?: Promise<unknown>): unknown;
 *   applyFunctionSendOnly?(p: T, args: unknown[]): void;
 *   applyMethod?(p: T, name: PropertyKey | undefined, args: unknown[], returnedP?: Promise<unknown>): unknown;
 *   applyMethodSendOnly?(p: T, name: PropertyKey | undefined, args: unknown[]): void;
 * }} Handler
 */

/**
 * @template {{}} T
 * @typedef {{
 *   proxy?: {
 *     handler: ProxyHandler<T>;
 *     target: unknown;
 *     revokerCallback?(revoker: () => void): void;
 *   };
 * }} ResolveWithPresenceOptionsBag
 */

/**
 * @template [R = unknown]
 * @typedef {(
 *   resolveHandled: (value?: R) => void,
 *   rejectHandled: (reason?: unknown) => void,
 *   resolveWithPresence: (presenceHandler: Handler<{}>, options?: ResolveWithPresenceOptionsBag<{}>) => object,
 * ) => void} HandledExecutor
 */

/**
 * @template [R = unknown]
 * @typedef {{
 *   resolve(value?: R): void;
 *   reject(reason: unknown): void;
 *   resolveWithPresence(presenceHandler?: Handler<{}>, options?: ResolveWithPresenceOptionsBag<{}>): object;
 * }} Settler
 */

/**
 * @typedef {{
 *   applyFunction(target: unknown, args: unknown[]): Promise<unknown>;
 *   applyFunctionSendOnly(target: unknown, args: unknown[]): void;
 *   applyMethod(target: unknown, prop: PropertyKey | undefined, args: unknown[]): Promise<unknown>;
 *   applyMethodSendOnly(target: unknown, prop: PropertyKey, args: unknown[]): void;
 *   get(target: unknown, prop: PropertyKey): Promise<unknown>;
 *   getSendOnly(target: unknown, prop: PropertyKey): void;
 * }} HandledPromiseStaticMethods
 */

/** @typedef {ReturnType<typeof makeHandledPromise>} HandledPromiseConstructor */$h͏_once.makeHandledPromise(makeHandledPromise);
})()
,
// === 10. eventual-send ./shim.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let makeHandledPromise;$h͏_imports([["./src/handled-promise.js", [["makeHandledPromise",[$h͏_a => (makeHandledPromise = $h͏_a)]]]]]);


if (typeof globalThis.HandledPromise === 'undefined') {
  globalThis.HandledPromise = makeHandledPromise();
}
})()
,
// === 11. daemon ./src/bus-worker-xs-ses-boot.js ===
({imports:$h͏_imports,liveVar:$h͏_live,onceVar:$h͏_once,import:$h͏_import,importMeta:$h͏____meta})=>(function(){'use strict';let harden;$h͏_imports([["@endo/harden", [["default",[$h͏_a => (harden = $h͏_a)]]]],["@endo/eventual-send/shim.js", []]]);



















globalThis.harden = harden;

// Install HandledPromise shim needed by E() and CapTP.
// This MUST come after assert and harden are on globalThis.
})()
,
])()