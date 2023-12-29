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

import {
  Set,
  String,
  TypeError,
  WeakMap,
  WeakSet,
  apply,
  arrayForEach,
  defineProperty,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  getPrototypeOf,
  isInteger,
  isObject,
  objectHasOwnProperty,
  ownKeys,
  preventExtensions,
  setAdd,
  setForEach,
  setHas,
  toStringTagSymbol,
  typedArrayPrototype,
  weakmapGet,
  weakmapSet,
  weaksetAdd,
  weaksetHas,
  setDelete,
  arrayPush,
  setGetSize,
  arrayJoin,
  weakmapHas,
} from './commons.js';
import { assert } from './error/assert.js';

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
 * @typedef {object} HardenerKit
 * @property {import('../types.js').Harden} harden
 * @property {import('../types.js').IsHardened} isHardened
 * @property {import('../types.js').Harden} hardenIntrinsics
 */

/**
 * Create a HardenerKit.
 *
 * @returns {HardenerKit}
 */
export const makeHardenerKit = () => {
  const hardened = new WeakSet();
  const hardenedAtLockdown = new WeakSet();
  let hardenedAtLockdownSize = 0;
  let intrinsicsWereHardened = false;

  /** @param {any} value */
  function markHardened(value) {
    weaksetAdd(hardened, value);
  }

  /** @type {HardenerKit} */
  const { harden, isHardened, hardenIntrinsics } = {
    isHardened(value) {
      return weaksetHas(hardened, value);
    },
    hardenIntrinsics(root) {
      intrinsicsWereHardened = true;
      return harden(root);
    },
    harden(root) {
      const toFreeze = new Set();
      const paths = new WeakMap();
      const protosToCheck = new Set();

      // If val is something we should be freezing but aren't yet,
      // add it to toFreeze.
      /**
       * @param {any} val
       * @param {string} [path]
       */
      function enqueue(val, path = undefined) {
        if (!isObject(val)) {
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
        const wasAProto = setDelete(protosToCheck, val);
        if (!wasAProto) {
          weakmapSet(paths, val, path);
        }
      }

      /**
       * @param {any} val
       * @param {string} [path]
       */
      function enqueueProto(val, path = undefined) {
        if (
          val == null ||
          weaksetHas(hardened, val) ||
          (!intrinsicsWereHardened && weaksetHas(hardenedAtLockdown, val)) ||
          weakmapHas(paths, val)
        ) {
          // Ignore if this is an exit, or we've already visited it
          return;
        }
        // console.warn(`adding ${val} to protosToCheck`, val);
        setAdd(protosToCheck, val);
        weakmapSet(paths, val, path);
      }

      /**
       * @param {any} obj
       */
      function freezeAndTraverse(obj) {
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
        const path = weakmapGet(paths, obj) || 'unknown';
        const descs = getOwnPropertyDescriptors(obj);
        const proto = getPrototypeOf(obj);
        enqueueProto(proto, `${path}.__proto__`);

        arrayForEach(ownKeys(descs), (/** @type {string | symbol} */ name) => {
          const pathname = `${path}.${String(name)}`;
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
          if (objectHasOwnProperty(desc, 'value')) {
            enqueue(desc.value, `${pathname}`);
          } else {
            enqueue(desc.get, `${pathname}(get)`);
            enqueue(desc.set, `${pathname}(set)`);
          }
        });
      }

      function dequeue() {
        // New values added before forEach() has finished will be visited.
        setForEach(toFreeze, freezeAndTraverse);
      }

      function checkProtos() {
        if (intrinsicsWereHardened) {
          if (setGetSize(protosToCheck) > 0) {
            const unhardenedProtoPaths = [];
            setForEach(protosToCheck, proto => {
              arrayPush(unhardenedProtoPaths, weakmapGet(paths, proto));
            });
            throw TypeError(
              `Expected the following paths to be hardened: ${arrayJoin(
                unhardenedProtoPaths,
                ', ',
              )}`,
            );
          }
          if (hardenedAtLockdownSize > 0) {
            const actuallyHardenedIntrinsics = new Set();

            setForEach(toFreeze, value => {
              if (weaksetHas(hardenedAtLockdown, value)) {
                setAdd(actuallyHardenedIntrinsics, value);
              }
            });
            const actuallyHardenedIntrinsicsSize = setGetSize(
              actuallyHardenedIntrinsics,
            );
            if (actuallyHardenedIntrinsicsSize !== hardenedAtLockdownSize) {
              throw TypeError(
                `Not all expected prototypes were hardened (expected=${hardenedAtLockdownSize}, got=${actuallyHardenedIntrinsicsSize})`,
              );
            } else {
              hardenedAtLockdownSize = 0;
              setForEach(actuallyHardenedIntrinsics, value => {
                setDelete(hardenedAtLockdown, value);
              });
            }
          }
        } else if (setGetSize(protosToCheck) > 0) {
          setForEach(protosToCheck, proto => {
            if (!weaksetHas(hardenedAtLockdown, proto)) {
              weaksetAdd(hardenedAtLockdown, proto);
              hardenedAtLockdownSize += 1;
            }
          });
        }
      }

      function commit() {
        setForEach(toFreeze, markHardened);
      }

      enqueue(root, '<root>');
      dequeue();
      checkProtos();
      // console.warn("toFreeze set:", toFreeze);
      commit();

      return root;
    },
  };

  return { harden, isHardened, hardenIntrinsics };
};
