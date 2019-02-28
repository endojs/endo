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

import getAnonIntrinsics from './anonIntrinsics';
import whitelist from './whitelist';

function buildTable(global) {
  // walk global object, add whitelisted properties to table

  const uncurryThis = fn => (thisArg, ...args) =>
    Reflect.apply(fn, thisArg, args);
  const {
    getOwnPropertyDescriptor: gopd,
    getOwnPropertyNames: gopn,
    keys,
  } = Object;
  const getProto = Object.getPrototypeOf;
  const hop = uncurryThis(Object.prototype.hasOwnProperty);

  const whiteTable = new Map();

  function addToWhiteTable(rootValue, rootPermit) {
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
      if (value !== Object(value)) {
        return;
      }
      if (typeof permit !== 'object') {
        if (whitelistSymbols.indexOf(permit) < 0) {
          throw new Error(
            `syntax error in whitelist; unexpected value: ${permit}`,
          );
        }
        return;
      }
      if (whiteTable.has(value)) {
        throw new Error('primordial reachable through multiple paths');
      }
      whiteTable.set(value, permit);
      keys(permit).forEach(name => {
        // Use gopd to avoid invoking an accessor property.
        // Accessor properties for which permit !== 'maybeAccessor'
        // are caught later by clean().
        const desc = gopd(value, name);
        if (desc) {
          register(desc.value, permit[name]);
        }
      });
    }
    register(rootValue, rootPermit);
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
      if (hop(permit, name)) {
        return permit[name];
      }
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      base = getProto(base); // eslint-disable-line no-param-reassign
      if (base === null) {
        return false;
      }
      permit = whiteTable.get(base);
      if (permit && hop(permit, name)) {
        const result = permit[name];
        if (result === '*') {
          return result;
        }
        return false;
      }
    }
  }

  const table = new Set();
  /**
   * Walk the table, adding everything that's on the whitelist to a Set for
     later use.
   *
   */
  function add(value, prefix) {
    if (value !== Object(value)) {
      return;
    }
    if (table.has(value)) {
      return;
    }

    table.add(value);
    gopn(value).forEach(name => {
      const path = prefix + (prefix ? '.' : '') + name;
      const p = getPermit(value, name);
      if (p) {
        const desc = gopd(value, name);
        if (hop(desc, 'value')) {
          // Is a data property
          const subValue = desc.value;
          add(subValue, path);
        }
      }
    });
  }

  addToWhiteTable(global, whitelist.namedIntrinsics);
  const intr = getAnonIntrinsics(global);
  addToWhiteTable(intr, whitelist.anonIntrinsics);
  add(global, '');
  return table;
}

export default buildTable;
