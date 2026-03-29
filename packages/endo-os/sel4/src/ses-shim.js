// SES shim for QuickJS-ng native-ses branch.
//
// QuickJS-ng provides native lockdown(), harden(), and Compartment.
// JS_FreezeIntrinsics() is called from C before this file loads,
// so intrinsics are already frozen.
//
// This file only bridges any gaps the shell needs.

(function sesShim() {
  'use strict';

  // Native harden() and Compartment should already exist from
  // JS_AddIntrinsicLockdown or the native-ses engine defaults.

  if (typeof harden === 'undefined') {
    // Fallback if native harden isn't available.
    globalThis.harden = function harden(obj) {
      if (typeof obj === 'object' && obj !== null) {
        Object.freeze(obj);
      }
      return obj;
    };
    print('ses: Using fallback harden (not native)');
  }

  if (typeof Compartment === 'undefined') {
    // Fallback if native Compartment isn't available.
    // Uses Function() constructor with endowments as params.
    globalThis.Compartment = function Compartment(opts) {
      var globals = {};
      if (opts && opts.__options__ && opts.globals) {
        globals = opts.globals;
      } else if (opts && !opts.__options__) {
        globals = opts;
      }
      this.globalThis = Object.create(null);
      Object.assign(this.globalThis, globals);
    };
    Compartment.prototype.evaluate = function evaluate(source) {
      var names = Object.keys(this.globalThis);
      var values = [];
      for (var i = 0; i < names.length; i++) {
        values.push(this.globalThis[names[i]]);
      }
      try {
        var fn = Function.apply(null, names.concat([
          '"use strict"; return (' + source + ')'
        ]));
        return fn.apply(undefined, values);
      } catch (e) {
        var fn2 = Function.apply(null, names.concat([
          '"use strict";' + source
        ]));
        return fn2.apply(undefined, values);
      }
    };
    print('ses: Using fallback Compartment (not native)');
  }

  if (typeof lockdown === 'undefined') {
    globalThis.lockdown = function lockdown() {
      // Already done by JS_FreezeIntrinsics in C.
    };
  }

  // Provide assert global (needed by @endo/eventual-send and daemon).
  if (typeof globalThis.assert === 'undefined') {
    var baseAssert = function(flag, optDetails) {
      if (!flag) throw new Error(optDetails || 'assertion failed');
    };
    baseAssert.typeof = function(v, t) { baseAssert(typeof v === t); };
    baseAssert.equal = function(a, b) { baseAssert(a === b); };
    baseAssert.string = function(v) { baseAssert(typeof v === 'string'); };
    baseAssert.fail = function(d) { throw new Error(d || 'assertion failed'); };
    baseAssert.note = function() {};
    baseAssert.details = function(s) { return Array.isArray(s) ? s.join('') : String(s); };
    baseAssert.Fail = function(s) { throw new Error(Array.isArray(s) ? s.join('') : String(s)); };
    baseAssert.quote = function(v) { return String(v); };
    baseAssert.bare = function(v) { return String(v); };
    baseAssert.error = function(msg, errConstructor) {
      return new (errConstructor || Error)(msg || 'error');
    };
    baseAssert.makeError = baseAssert.error;
    baseAssert.makeAssert = function(raise) {
      var a = function(flag, d) { if (!flag) { if (raise) raise(d); else throw new Error(d || 'assertion failed'); } };
      a.typeof = baseAssert.typeof;
      a.equal = baseAssert.equal;
      a.string = baseAssert.string;
      a.fail = baseAssert.fail;
      a.note = baseAssert.note;
      a.details = baseAssert.details;
      a.Fail = baseAssert.Fail;
      a.quote = baseAssert.quote;
      a.bare = baseAssert.bare;
      a.error = baseAssert.error;
      a.makeError = baseAssert.makeError;
      a.makeAssert = baseAssert.makeAssert;
      return a;
    };
    globalThis.assert = baseAssert;
  }

  print('ses: Ready (native lockdown applied from C)');
})();
