// Copyright (C) 2011 Google Inc.
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

import { buildWhitelist } from './whitelist.js';
import { getAnonIntrinsics } from './anonIntrinsics.js';

export function removeProperties(global) {
  // walk global object, test against whitelist, delete

  const whitelist = buildWhitelist();

  const uncurryThis = fn => (thisArg, ...args) => Reflect.apply(fn, thisArg, args);
  const gopd = Object.getOwnPropertyDescriptor;
  const gopn = Object.getOwnPropertyNames;
  const keys = Object.keys;
  const cleaning = new WeakMap();
  const getProto = Object.getPrototypeOf;
  const hop = uncurryThis(Object.prototype.hasOwnProperty);

  const whiteTable = new WeakMap();

  function addToWhiteTable(global) {
    /**
     * The whiteTable should map from each path-accessible primordial
     * object to the permit object that describes how it should be
     * cleaned.
     *
     * We initialize the whiteTable only so that {@code getPermit} can
     * process "*" inheritance using the whitelist, by walking actual
     * inheritance chains.
     */
    const whitelistSymbols = [true, false, '*', 'maybeAccessor'];
    function register(value, permit) {
      if (value !== Object(value)) { return; }
      if (typeof permit !== 'object') {
        if (whitelistSymbols.indexOf(permit) < 0) {
          throw new Error('syntax error in whitelist; unexpected value: ' + permit);
        }
        return;
      }
      if (whiteTable.has(value)) {
        throw new Error('primordial reachable through multiple paths');
      }
      whiteTable.set(value, permit);
      keys(permit).forEach(function(name) {
        // Use gopd to avoid invoking an accessor property.
        // Accessor properties for which permit !== 'maybeAccessor'
        // are caught later by clean().
        const desc = gopd(value, name);
        if (desc) {
          register(desc.value, permit[name]);
        }
      });
    }
    register(global, whitelist);
  }


  /**
   * Should the property named {@code name} be whitelisted on the
   * {@code base} object, and if so, with what Permit?
   *
   * <p>If it should be permitted, return the Permit (where Permit =
   * true | "maybeAccessor" | "*" | Record(Permit)), all of which are
   * truthy. If it should not be permitted, return false.
   */
  function getPermit(base, name) {
    let permit = whiteTable.get(base);
    if (permit) {
      if (hop(permit, name)) { return permit[name]; }
    }
    while (true) {
      base = getProto(base);
      if (base === null) { return false; }
      permit = whiteTable.get(base);
      if (permit && hop(permit, name)) {
        const result = permit[name];
        if (result === '*') {
          return result;
        } else {
          return false;
        }
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
  function clean(value, prefix) {
    if (value !== Object(value)) { return; }
    if (cleaning.get(value)) { return; }

    const proto = getProto(value);
    if (proto !== null && !whiteTable.has(proto)) {
      //reportItemProblem(rootReports, ses.severities.NOT_ISOLATED,
      //                  'unexpected intrinsic', prefix + '.__proto__');
      throw new Error(`unexpected intrinsic ${prefix}.__proto__`);
    }

    cleaning.set(value, true);
    gopn(value).forEach(function(name) {
      const path = prefix + (prefix ? '.' : '') + name;
      const p = getPermit(value, name);
      if (p) {
        const desc = gopd(value, name);
        if (hop(desc, 'value')) {
          // Is a data property
          const subValue = desc.value;
          clean(subValue, path);
        } else {
          if (p !== 'maybeAccessor') {
            // We are not saying that it is safe for the prop to be
            // unexpectedly an accessor; rather, it will be deleted
            // and thus made safe.
            //reportProperty(ses.severities.SAFE_SPEC_VIOLATION,
            //               'Not a data property', path);
            delete value[name];
          } else {
            clean(desc.get, path + '<getter>');
            clean(desc.set, path + '<setter>');
          }
        }
      } else {
        delete value[name];
      }
    });
  }

  addToWhiteTable(global);
  addToWhiteTable(getAnonIntrinsics());
  clean(global, '');

}
