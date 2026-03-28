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

  print('ses: Ready (native lockdown applied from C)');
})();
