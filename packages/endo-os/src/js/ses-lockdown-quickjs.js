// SES Lockdown stub for QuickJS on seL4 (Phase 0a).
//
// QuickJS supports ES2023 including Proxy, which is needed for
// the real SES lockdown.  This stub validates the pattern.
// The real @endo/ses bundle can replace this once QuickJS
// integration is fully wired up.

(function sesLockdownStub() {
  'use strict';

  // QuickJS has a built-in print() — no need to bridge to ops.

  function harden(obj) {
    if (typeof obj === 'object' && obj !== null) {
      Object.freeze(obj);
    }
    return obj;
  }

  function Compartment(endowments) {
    this.globalThis = Object.create(null);
    if (endowments) {
      Object.assign(this.globalThis, endowments);
    }
  }
  Compartment.prototype.evaluate = function evaluate(source) {
    return (0, eval)(source);
  };

  globalThis.harden = harden;
  globalThis.Compartment = Compartment;

  globalThis.lockdown = function lockdown(options) {
    print('ses: lockdown() applied (Phase 0a stub)');
    Object.freeze(harden);
    Object.freeze(Compartment);
    Object.freeze(Compartment.prototype);
  };

  print('ses: SES lockdown module loaded (Phase 0a stub)');
})();
