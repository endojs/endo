// Copyright (C) 2011 Google Inc.
// Copyright (C) 2018 Agoric
//
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

// This module removes all non-whitelisted properties found by recursively and
// reflectively walking own property chains.
//
// The prototype properties are type checked.
//
// In addition, it verifies that the `prototype`, `__proto__`, and
// `constructor` properties do point to their whitelisted values.
//
// Typically, this module will not be used directly, but via the
// [lockdown-shim] which handles all necessary repairs and taming in SES.
//
// Differences with the Caja implementation
//
// Several improvements were made to reduce the complexity of the whitelisting
// algorithm and improve the accuracy and maintainability of the whitelist.
//
// 1. The indicators "maybeAccessor" and "\*" are replace with more explicit
// mapping. This memoved the implicit recursive structure.
//
// 2. Instead, the `prototype`, `__proto__`, and `constructor` must be
// specified and point to top level entries in the map. For example,
// `Object.__proto__` leads to `FunctionPrototype` which is a top level entry
// in the map.
//
// 3. The whitelist defines all prototypoe properties `\*Prototype` as top
// level entries. This creates a much more maintainable two level map, which is
// closer to how the languare is spefified.
//
// 4. The indicator `true` has been removed. Instead, the map value must the
// name of a primitive for type-checking (for example, `Error.stackTraceLimit`
// leads to 'number'), the name of an intrinsic (for example,
// `ErrorPrototype.constructor` leads to 'Error'), or a internal constant (for
// example, `eval` leads to `fn` which is an alias for `FunctionInstance`, a
// record that whitelist all properties on allows on such instance).
//
// 5. In debug mode, all removed properties are listed to the console.

import whitelist, { FunctionInstance } from './whitelist.js';

const { getPrototypeOf, getOwnPropertyDescriptor } = Object;

const { apply, ownKeys } = Reflect;
const uncurryThis = fn => (thisArg, ...args) => apply(fn, thisArg, args);
const hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

/**
 * asStringPropertyName()
 */
function asStringPropertyName(path, prop) {
  if (typeof prop === 'string') {
    return prop;
  }

  if (typeof prop === 'symbol') {
    return `@@${prop.toString().slice(14, -1)}`;
  }

  throw new TypeError(`Unexpected property name type ${path} ${prop}`);
}

/**
 * whitelistIntrinsics()
 * Removes all non-whitelisted properties found by recursively and
 * reflectively walking own property chains.
 */
export default function whitelistIntrinsics(intrinsics) {
  // These primities are allowed allowed for permits.
  const primitives = ['undefined', 'boolean', 'number', 'string', 'symbol'];

  /**
   * whitelistPrototype()
   * Validate the object's [[prototype]] against a permit.
   */
  function whitelistPrototype(path, obj, protoName) {
    const proto = getPrototypeOf(obj);

    // Null prototype.
    if (proto === null && protoName === null) {
      return;
    }

    // Assert: protoName, if provided, is a string.
    if (protoName !== undefined && typeof protoName !== 'string') {
      throw new TypeError(`Malformed whitelist permit ${path}.__proto__`);
    }

    // If permit not specified, default tp Object.prototype.
    if (proto === intrinsics[protoName || 'ObjectPrototype']) {
      return;
    }

    // We can't clean [[prototype]], therefore abort.
    throw new Error(`Unexpected intrinsic ${path}.__proto__`);
  }

  /**
   * isWhitelistPropertyValue()
   * Whitelist a single property value against a permit.
   */
  function isWhitelistPropertyValue(path, value, prop, permit) {
    if (typeof permit === 'object') {
      // eslint-disable-next-line no-use-before-define
      whitelistProperties(path, value, permit);
      // The property is whitelisted.
      return true;
    }

    if (permit === false) {
      // A boolan 'false' permit specifies the removal of a property.
      // We require a more specific permit instead of allowing 'true'.
      return false;
    }

    if (typeof permit === 'string') {
      // A string permit can have one of two meanings:

      if (prop === 'prototype' || prop === 'constructor') {
        // For prototype and constructor value properties, the permit
        // is the mame of an intrinsic.
        // Assumption: prototype and constructor cannot be primitives.
        // Assert: the permit is the name of an untrinsic.
        // Assert: the property value is equal to that intrinsic.

        if (hasOwnProperty(intrinsics, permit)) {
          return value === intrinsics[permit];
        }
      } else {
        // For all other properties, the permit is the name of a primitive.
        // Assert: the permit is the name of a primitive.
        // Assert: the property value type is equal to that primitive.

        // eslint-disable-next-line no-lonely-if
        if (primitives.includes(permit)) {
          // eslint-disable-next-line valid-typeof
          return typeof value === permit;
        }
      }
    }

    throw new TypeError(`Unexpected whitelist permit ${path}`);
  }

  /**
   * isWhitelistProperty()
   * Whitelist a single property against a permit.
   */
  function isWhitelistProperty(path, obj, prop, permit) {
    const desc = getOwnPropertyDescriptor(obj, prop);

    // Is this a value property?
    if (hasOwnProperty(desc, 'value')) {
      return isWhitelistPropertyValue(path, desc.value, prop, permit);
    }

    return (
      isWhitelistPropertyValue(`${path}<get>`, desc.get, prop, permit.get) &&
      isWhitelistPropertyValue(`${path}<set>`, desc.set, prop, permit.set)
    );
  }

  /**
   * getSubPermit()
   */
  function getSubPermit(permit, prop) {
    if (hasOwnProperty(permit, prop)) {
      return permit[prop];
    }

    if (permit['**proto**'] === 'FunctionPrototype') {
      if (hasOwnProperty(FunctionInstance, prop)) {
        return FunctionInstance[prop];
      }
    }

    return undefined;
  }

  /**
   * whitelistProperties()
   * Whitelist all properties against a permit.
   */
  function whitelistProperties(path, obj, permit) {
    const protoName = permit['**proto**'];
    whitelistPrototype(path, obj, protoName);

    for (const prop of ownKeys(obj)) {
      if (prop === '__proto__') {
        // Ignore, already checked above.
        // eslint-disable-next-line no-continue
        continue;
      }

      const propString = asStringPropertyName(path, prop);
      const subPath = `${path}.${propString}`;
      const subPermit = getSubPermit(permit, propString);

      if (subPermit) {
        // Property has a permit.
        if (isWhitelistProperty(subPath, obj, prop, subPermit)) {
          // Property is whitelisted.
          // eslint-disable-next-line no-continue
          continue;
        }
      }

      // console.log(`Removing ${subPath}`);
      delete obj[prop];
    }
  }

  // Start path with 'intrinsics' to clarify that properties are not
  // removed from the global object by the whitelisting operation.
  whitelistProperties('intrinsics', intrinsics, whitelist);
}
