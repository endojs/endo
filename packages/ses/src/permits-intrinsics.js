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

// This module removes all non-allowed properties found by recursively and
// reflectively walking own property chains.
//
// The prototype properties are type checked.
//
// In addition, it verifies that the `prototype`, `__proto__`, and
// `constructor` properties do point to their allowed values.
//
// Typically, this module will not be used directly, but via the
// [lockdown-shim] which handles all necessary repairs and taming in SES.
//
// In the permits, the `prototype`, `__proto__`, and `constructor` must be
// specified and point to top level entries in the map. For example,
// `Object.__proto__` leads to `FunctionPrototype` which is a top level entry
// in the map.
//
// The permit value must be
//    * the typeof name of a primitive for type-checking (for example,
//      `Error.stackTraceLimit` leads to 'number'),
//    * the name of an intrinsic,
//    * an internal constant(for example, `eval` leads to `fn` which
//      is an alias for `FunctionInstance`, a record that permits all
//      properties allowed on such instance).
//    * false, a property to be removed that we know about.
//
// All unlisted properties are also removed. But for the ones that are removed
// because they are unlisted, as opposed to `false`, we also print their
// name to the console as a useful diagnostic, possibly provoking an expansion
// of the permits.

import { permitted, FunctionInstance, isAccessorPermit } from './permits.js';
import {
  Map,
  String,
  Symbol,
  TypeError,
  arrayFilter,
  arrayIncludes,
  arrayMap,
  entries,
  getOwnPropertyDescriptor,
  getPrototypeOf,
  isPrimitive,
  mapGet,
  hasOwn,
  ownKeys,
  symbolKeyFor,
} from './commons.js';
import { cauterizeProperty } from './cauterize-property.js';

/**
 * @import {Reporter} from './reporting-types.js'
 */

/**
 * Removes all non-allowed properties found by recursively and
 * reflectively walking own property chains.
 *
 * @param {object} intrinsics
 * @param {(virtualizedNativeFunction: object) => void} markVirtualizedNativeFunction
 * @param {Reporter} reporter
 */
export default function removeUnpermittedIntrinsics(
  intrinsics,
  markVirtualizedNativeFunction,
  reporter,
) {
  // These primitives are allowed for permits.
  const primitives = ['undefined', 'boolean', 'number', 'string', 'symbol'];

  // These symbols are allowed as well-known symbols
  const wellKnownSymbolNames = new Map(
    Symbol
      ? arrayMap(
          arrayFilter(
            entries(permitted['%SharedSymbol%']),
            ([name, permit]) =>
              permit === 'symbol' && typeof Symbol[name] === 'symbol',
          ),
          ([name]) => [Symbol[name], `@@${name}`],
        )
      : [],
  );

  /**
   * asStringPropertyName()
   *
   * @param {string} path
   * @param {string | symbol} prop
   */
  function asStringPropertyName(path, prop) {
    if (typeof prop === 'string') {
      return prop;
    }

    const wellKnownSymbol = mapGet(wellKnownSymbolNames, prop);

    if (typeof prop === 'symbol') {
      if (wellKnownSymbol) {
        return wellKnownSymbol;
      } else {
        const registeredKey = symbolKeyFor(prop);
        if (registeredKey !== undefined) {
          return `RegisteredSymbol(${registeredKey})`;
        } else {
          return `Unique${String(prop)}`;
        }
      }
    }

    throw TypeError(`Unexpected property name type ${path} ${prop}`);
  }

  /*
   * visitPrototype()
   * Validate the object's [[prototype]] against a permit.
   */
  function visitPrototype(path, obj, protoName) {
    if (isPrimitive(obj)) {
      throw TypeError(`Object expected: ${path}, ${String(obj)}, ${protoName}`);
    }
    const proto = getPrototypeOf(obj);

    // Null prototype.
    if (proto === null && protoName === null) {
      return;
    }

    // Assert: protoName, if provided, is a string.
    if (protoName !== undefined && typeof protoName !== 'string') {
      throw TypeError(`Malformed permit ${path}.__proto__`);
    }

    // If permit not specified, default to Object.prototype.
    if (proto === intrinsics[protoName || '%ObjectPrototype%']) {
      return;
    }

    // We can't clean [[Prototype]], therefore abort.
    throw TypeError(
      `Unexpected [[Prototype]] at ${path}.__proto__ (expected ${protoName || '%ObjectPrototype%'})`,
    );
  }

  /*
   * isAllowedPropertyValue()
   * enforce permit for a single property value.
   */
  function isAllowedPropertyValue(path, value, prop, permit) {
    if (typeof permit === 'object') {
      // eslint-disable-next-line no-use-before-define
      visitProperties(path, value, permit);
      // The property is allowed.
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
        // is the name of an intrinsic.
        // Assumption: prototype and constructor cannot be primitives.
        // Assert: the permit is the name of an intrinsic.
        // Assert: the property value is equal to that intrinsic.

        if (hasOwn(intrinsics, permit)) {
          if (value !== intrinsics[permit]) {
            throw TypeError(`Does not match permit for ${path}`);
          }
          return true;
        }
      } else {
        // For all other properties, the permit is the name of a primitive.
        // Assert: the permit is the name of a primitive.
        // Assert: the property value type is equal to that primitive.

        // eslint-disable-next-line no-lonely-if
        if (arrayIncludes(primitives, permit)) {
          // eslint-disable-next-line valid-typeof
          if (typeof value !== permit) {
            throw TypeError(
              `At ${path} expected ${permit} not ${typeof value}`,
            );
          }
          return true;
        }
      }
    }

    throw TypeError(
      `Unexpected property ${prop} with permit ${permit} at ${path}`,
    );
  }

  /*
   * isAllowedProperty()
   * Check whether a single property is allowed.
   */
  function isAllowedProperty(path, obj, prop, permit) {
    const desc = getOwnPropertyDescriptor(obj, prop);
    if (!desc) {
      throw TypeError(`Property ${prop} not found at ${path}`);
    }

    // Is this a value property?
    if (hasOwn(desc, 'value')) {
      if (isAccessorPermit(permit)) {
        throw TypeError(`Accessor expected at ${path}`);
      }
      return isAllowedPropertyValue(path, desc.value, prop, permit);
    }
    if (!isAccessorPermit(permit)) {
      throw TypeError(`Accessor not expected at ${path}`);
    }
    return (
      isAllowedPropertyValue(`${path}<get>`, desc.get, prop, permit.get) &&
      isAllowedPropertyValue(`${path}<set>`, desc.set, prop, permit.set)
    );
  }

  /*
   * getSubPermit()
   */
  function getSubPermit(obj, permit, prop) {
    const permitProp = prop === '__proto__' ? '--proto--' : prop;
    if (hasOwn(permit, permitProp)) {
      return permit[permitProp];
    }

    if (typeof obj === 'function') {
      if (hasOwn(FunctionInstance, permitProp)) {
        return FunctionInstance[permitProp];
      }
    }

    return undefined;
  }

  /*
   * visitProperties()
   * Visit all properties for a permit.
   */
  function visitProperties(path, obj, permit) {
    if (obj === undefined || obj === null) {
      return;
    }

    const protoName = permit['[[Proto]]'];
    visitPrototype(path, obj, protoName);

    if (typeof obj === 'function') {
      markVirtualizedNativeFunction(obj);
    }

    for (const prop of ownKeys(obj)) {
      const propString = asStringPropertyName(path, prop);
      const subPath = `${path}.${propString}`;
      const subPermit = getSubPermit(obj, permit, propString);

      if (!subPermit || !isAllowedProperty(subPath, obj, prop, subPermit)) {
        cauterizeProperty(obj, prop, subPermit === false, subPath, reporter);
      }
    }
  }

  // Start path with 'intrinsics' to clarify that properties are not
  // removed from the global object by the permitting operation.
  visitProperties('intrinsics', intrinsics, permitted);
}
