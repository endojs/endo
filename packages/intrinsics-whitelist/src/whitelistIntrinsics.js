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

import whitelist, { FunctionInstance } from './whitelist';

const {
  defineProperty,
  getPrototypeOf,
  getOwnPropertyNames,
  getOwnPropertyDescriptor,
} = Object;

const { apply } = Reflect;
const uncurryThis = fn => (thisArg, ...args) => apply(fn, thisArg, args);
const hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

export default function whitelistPrototypes({
  namedIntrinsics,
  anonIntrinsics,
}) {
  const intrinsics = new Map();

  function registerIntrinsics(rootIntrinsics) {
    // Create a flat map of intrinsics.
    for (const [key, value] of Object.entries(rootIntrinsics)) {
      if (hasOwnProperty(value, 'prototype')) {
        // Only register intrinsics that can create instances.
        intrinsics.set(key, value);
        intrinsics.set(`${key}Prototype`, value.prototype);
      }
    }
  }

  /**
   * Removes all non-whitelisted properties found by recursively and
   * reflectively walking own property chains.
   *
   * <p>Inherited properties are not checked, because we require that
   * inherited-from objects are otherwise reachable by this traversal.
   */
  function clean(path, obj, permit) {
    if (permit === false) {
      // Only allow boolean 'false' to forcibly remove a property.
      // We require a more specific permit instead of allowing 'true'.
      return false;
    }

    if (typeof permit === 'string') {
      // A string permit can have one of two meanings:
      if (path.endsWith('.constructor')) {
        // 1. Assert constructors the property value:
        if (hasOwnProperty(namedIntrinsics, permit)) {
          // 1a. ...is a named constructor.
          return obj === namedIntrinsics[permit];
        }
        if (hasOwnProperty(anonIntrinsics, permit)) {
          // 1a. ...is an anonymous constructor.
          return obj === anonIntrinsics[permit];
        }
      }

      // 2. Assert whether the property value is a primitive.
      // eslint-disable-next-line valid-typeof
      return typeof obj === permit;
    }

    if (permit === null || typeof permit !== 'object') {
      // Warn about errors in the structure of the whitelist.
      throw new Error(`Unexpected whitelist value ${path}`);
    }

    // Validate the object's [[prototype]].
    const proto = getPrototypeOf(obj);
    // If not specified, use Object.prototype as the default.
    const protoName = permit['**proto**'] || 'ObjectPrototype';
    if (proto === null && permit['**proto**'] === null) {
      // continue
    } else if (proto === intrinsics.get(protoName)) {
      // continue
    } else {
      throw new Error(`Unexpected intrinsic ${path}.__proto__`);
    }

    // Validate the object's properties.
    for (const prop of getOwnPropertyNames(obj)) {
      if (prop === '__proto__') {
        // Already checked above.
        continue;
      }

      const desc = getOwnPropertyDescriptor(obj, prop);
      const subPath = `${path}.${prop}`;

      if (hasOwnProperty(permit, prop)) {
        const subPermit = permit[prop];

        if (hasOwnProperty(desc, 'value')) {
          if (clean(subPath, desc.value, subPermit)) {
            continue;
          }
        } else {
          // Whitelisted, clean accssors
          if (hasOwnProperty(desc, 'get') && desc.get !== undefined) {
            if (subPermit.get) {
              clean(`${subPath} get`, desc.get, subPermit.get);
            } else {
              console.log(`Removing ${subPath}.get`);
              desc.get = undefined;
              defineProperty(obj, prop, desc);
            }
          }
          if (hasOwnProperty(desc, 'set') && desc.set !== undefined) {
            if (subPermit.set) {
              clean(`${subPath} set`, desc.set, subPermit.set);
            } else {
              console.log(`Removing ${subPath}.set`);
              desc.set = undefined;
              defineProperty(obj, prop, desc);
            }
          }
          continue;
        }
      } else if (
        protoName === 'FunctionPrototype' &&
        hasOwnProperty(FunctionInstance, prop)
      ) {
        const subPermit = FunctionInstance[prop];
        if (clean(subPath, desc.value, subPermit)) {
          continue;
        }
      }

      console.log(`Removing ${subPath}`);
      delete obj[prop];
    }

    // Object permits are whitelisted.
    return true;
  }
  registerIntrinsics(namedIntrinsics);
  registerIntrinsics(anonIntrinsics);
  clean('namedIntrinsics', namedIntrinsics, whitelist.namedIntrinsics);
}
