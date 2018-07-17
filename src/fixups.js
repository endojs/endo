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
   * Delete the property if possible, else try to poison.
   */
  function cleanProperty(base, name, path) {
    if (path === 'Promise.all.arguments') {
      debugger;
    }
    if (path === 'Q.all.arguments') {
      debugger;
    }
    var poison = ses.getAnonIntrinsics().ThrowTypeError;
    var diagnostic;

    if (typeof base === 'function' && !ses.noFuncPoison) {
      if (name === 'caller') {
        diagnostic = ses.makeCallerHarmless(base, path);
        // We can use a severity of SAFE here since if this isn't
        // safe, it is the responsibility of repairES5.js to tell us
        // so. All the same, we should inspect the reports on all
        // platforms we care about to see if there are any surprises.
        reportProperty(ses.severities.SAFE,
                       diagnostic, path);
        return true;
      }
      if (name === 'arguments') {
        diagnostic = ses.makeArgumentsHarmless(base, path);
        // We can use a severity of SAFE here since if this isn't
        // safe, it is the responsibility of repairES5.js to tell us
        // so. All the same, we should inspect the reports on all
        // platforms we care about to see if there are any surprises.
        reportProperty(ses.severities.SAFE,
                       diagnostic, path);
        return true;
      }
    }

    if (name === '__proto__') {
      // At least Chrome Version 27.0.1428.0 canary, Safari Version
      // 6.0.2 (8536.26.17), and Opera 12.14 include '__proto__' in the
      // result of Object.getOwnPropertyNames. However, the meaning of
      // deleting this isn't clear, so here we effectively whitelist
      // it on all objects.
      //
      // We do not whitelist it in whitelist.js, as that would involve
      // creating a property {@code __proto__: '*'} which, on some
      // engines (and perhaps as standard on ES6) attempt to make this
      // portion of the whitelist inherit from {@code '*'}, which
      // would fail in amusing ways.
      reportProperty(ses.severities.SAFE_SPEC_VIOLATION,
                     'Skipped', path);
      return true;
    }

    var deleted = void 0;
    var err = void 0;
    try {
      deleted = delete base[name];
    } catch (er) { err = er; }
    var exists = hop.call(base, name);
    if (deleted) {
      if (!exists) {
        reportProperty(ses.severities.SAFE,
                       'Deleted', path);
        return true;
      }
      reportProperty(ses.severities.SAFE_SPEC_VIOLATION,
                     'Bounced back', path);
    } else if (deleted === false) {
      reportProperty(ses.severities.SAFE_SPEC_VIOLATION,
                     'Strict delete returned false rather than throwing', path);
    } else if (err instanceof TypeError) {
      // This is the normal abnormal case, so leave it to the next
      // section to emit a diagnostic.
      //
      // reportProperty(ses.severities.SAFE_SPEC_VIOLATION,
      //                'Cannot be deleted', path);
    } else {
      reportProperty(ses.severities.NEW_SYMPTOM,
                     'Delete failed with' + err, path);
    }

    try {
      defProp(base, name, {
        get: poison,
        set: poison,
        enumerable: false,
        configurable: false
      });
    } catch (cantPoisonErr) {
      try {
        // Perhaps it's writable non-configurable, in which case we
        // should still be able to freeze it in a harmless state.
        var value = gopd(base, name).value;
        defProp(base, name, {
          // If it's a primitive value, like IE10's non-standard,
          // non-deletable, but harmless RegExp.prototype.options,
          // then we allow it to retain its value.
          value: value === Object(value) ? void 0 : value,
          writable: false,
          configurable: false
        });
      } catch (cantFreezeHarmless) {
        reportProperty(ses.severities.NOT_ISOLATED,
                       'Cannot be poisoned', path);
        return false;
      }
    }
    var desc2 = gopd(base, name);
    if (desc2.get === poison &&
        desc2.set === poison &&
        !desc2.configurable) {
      try {
        var dummy2 = base[name];
      } catch (expectedErr) {
        if (expectedErr instanceof TypeError) {
          reportProperty(ses.severities.SAFE,
                         'Successfully poisoned', path);
          return true;
        }
      }
    } else if (desc2.value !== Object(desc2.value2) && // is primitive
               !desc2.writable &&
               !desc2.configurable) {
      var diagnostic = 'Frozen harmless';
      if (name === 'caller' || name === 'arguments') {
        diagnostic = name + ' ' + diagnostic;
      }
      reportProperty(ses.severities.SAFE,
                     diagnostic , path);
      return false;
    }
    reportProperty(ses.severities.NEW_SYMPTOM,
                   'Failed to be poisoned', path);
    return false;
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
