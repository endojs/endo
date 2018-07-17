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


  var hop = Object.prototype.hasOwnProperty;

  var getProto = Object.getPrototypeOf;
  var defProp = Object.defineProperty;
  var gopd = Object.getOwnPropertyDescriptor;
  var gopn = Object.getOwnPropertyNames;
  var keys = Object.keys;
  var freeze = Object.freeze;
  var create = Object.create;





  /**
   * The whiteTable should map from each path-accessible primordial
   * object to the permit object that describes how it should be
   * cleaned.
   *
   * We initialize the whiteTable only so that {@code getPermit} can
   * process "*" inheritance using the whitelist, by walking actual
   * inheritance chains.
   */
  var whitelistSymbols = [true, false, '*', 'maybeAccessor'];
  var whiteTable = new WeakMap();
  function register(value, permit) {
    if (value !== Object(value)) { return; }
    if (typeof permit !== 'object') {
      if (whitelistSymbols.indexOf(permit) < 0) {
        fail('syntax error in whitelist; unexpected value: ' + permit);
      }
      return;
    }
    if (whiteTable.has(value)) {
      fail('primordial reachable through multiple paths');
    }
    whiteTable.set(value, permit);
    keys(permit).forEach(function(name) {
      // Use gopd to avoid invoking an accessor property.
      // Accessor properties for which permit !== 'maybeAccessor'
      // are caught later by clean().
      var desc = gopd(value, name);
      if (desc) {
        register(desc.value, permit[name]);
      }
    });
  }
  register(sharedImports, whitelist);

  /**
   * Should the property named {@code name} be whitelisted on the
   * {@code base} object, and if so, with what Permit?
   *
   * <p>If it should be permitted, return the Permit (where Permit =
   * true | "maybeAccessor" | "*" | Record(Permit)), all of which are
   * truthy. If it should not be permitted, return false.
   */
  function getPermit(base, name) {
    var permit = whiteTable.get(base);
    if (permit) {
      if (hop.call(permit, name)) { return permit[name]; }
    }
    while (true) {
      base = getProto(base);
      if (base === null) { return false; }
      permit = whiteTable.get(base);
      if (permit && hop.call(permit, name)) {
        var result = permit[name];
        if (result === '*') {
          return result;
        } else {
          return false;
        }
      }
    }
  }

  var cleaning = new WeakMap();

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

    var proto = getProto(value);
    if (proto !== null && !whiteTable.has(proto)) {
      reportItemProblem(rootReports, ses.severities.NOT_ISOLATED,
                        'unexpected intrinsic', prefix + '.__proto__');
    }

    cleaning.set(value, true);
    gopn(value).forEach(function(name) {
      var path = prefix + (prefix ? '.' : '') + name;
      var p = getPermit(value, name);
      if (p) {
        var desc = gopd(value, name);
        if (hop.call(desc, 'value')) {
          // Is a data property
          var subValue = desc.value;
          clean(subValue, path);
        } else {
          if (p !== 'maybeAccessor') {
            // We are not saying that it is safe for the prop to be
            // unexpectedly an accessor; rather, it will be deleted
            // and thus made safe.
            reportProperty(ses.severities.SAFE_SPEC_VIOLATION,
                           'Not a data property', path);
            cleanProperty(value, name, path);
          } else {
            clean(desc.get, path + '<getter>');
            clean(desc.set, path + '<setter>');
          }
        }
      } else {
        cleanProperty(value, name, path);
      }
    });
  }
  clean(sharedImports, '');
