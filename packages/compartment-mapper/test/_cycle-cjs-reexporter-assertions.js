/**
 * Shared assertion logic for the cyclic CommonJS reexporter scenario.
 * Both the Node.js parity test and the Compartment Mapper test import from
 * this module so the expected values live in exactly one place. If both
 * tests pass, parity with Node.js is verified by construction.
 *
 * The fixture under fixtures-cycle-cjs-reexporter/node_modules/app/ exercises
 * this arrangement, all three modules being CommonJS:
 *
 *   star-reexporter.cjs: Object.assign(exports, require('./export-renamer.cjs'));
 *   export-renamer.cjs:  require('./star-reexporter.cjs');
 *                        Object.defineProperty(exports, 'x', {
 *                          get() { return module.exports.y; }, enumerable: true });
 *                        exports.y = 45;
 *   main.js:             const reexp = require('./star-reexporter.cjs');
 *                        const ren = require('./export-renamer.cjs');
 *                        exports.captured = reexp.x;
 *                        exports.namespace1 = { x: reexp.x, y: reexp.y };
 *                        exports.namespace2 = { x: ren.x, y: ren.y };
 *
 * In a pure-CommonJS cycle, the reexporter's `Object.assign` reads the
 * renamer's `x` getter after the renamer has set `y = 45`, so the copied
 * value is 45. Both namespaces project { x: 45, y: 45 }. Node.js and the
 * compartment mapper agree on this shape, so the same assertions apply to
 * both layers.
 *
 * The companion divergence scenario (ESM module participating in a cycle
 * with a CommonJS module) is exercised by fixtures-cycle-esm-in-cjs and
 * its tests; Node.js rejects that topology with ERR_REQUIRE_CYCLE_MODULE
 * while SES allows it.
 *
 * @module
 */

/** @import {ExecutionContext} from 'ava' */

export const expectedCaptured = 45;
export const expectedNamespace1 = { x: 45, y: 45 };
export const expectedNamespace2 = { x: 45, y: 45 };

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertCycleCjsReexporter = (t, namespace) => {
  t.is(namespace.captured, expectedCaptured);
  t.deepEqual(
    { x: namespace.namespace1.x, y: namespace.namespace1.y },
    expectedNamespace1,
  );
  t.deepEqual(
    { x: namespace.namespace2.x, y: namespace.namespace2.y },
    expectedNamespace2,
  );
};
