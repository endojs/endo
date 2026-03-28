// SES Lockdown stub for Phase 0.
//
// In the real build, this file is replaced by the full SES bundle
// from @endo/ses.  This stub provides just enough to test the
// V8 host + deno_core op pipeline.

(function sesLockdownStub() {
  'use strict';

  // Bridge print() to our Rust op.
  if (typeof globalThis.print === 'undefined') {
    globalThis.print = function print(...args) {
      Deno.core.ops.op_print(args.join(' '));
    };
  }

  // Simulate harden() — real SES deep-freezes the object graph.
  function harden(obj) {
    if (typeof obj === 'object' && obj !== null) {
      Object.freeze(obj);
    }
    return obj;
  }

  // Simulate Compartment — real SES creates a sandboxed evaluator.
  function Compartment(endowments, modules, options) {
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
    print('ses: lockdown() applied (Phase 0 stub)');
    Object.freeze(harden);
    Object.freeze(Compartment);
    Object.freeze(Compartment.prototype);
  };

  print('ses: SES lockdown module loaded (Phase 0 stub)');
})();
