/**
 * Shared assertion logic for the cyclic star-export with renaming reexport
 * regression (endojs/endo#59). Both the Node.js parity test and the
 * Compartment Mapper test import from this module so the expected values
 * live in exactly one place. If both tests pass, parity with Node.js is
 * verified by construction.
 *
 * The fixture under fixtures-cycle-rename/node_modules/app/ exercises this
 * arrangement:
 *
 *   star-reexporter.js: export * from './export-renamer.js';
 *   export-renamer.js:  export { y as x } from './star-reexporter.js';
 *                       export var y = 45;
 *   main.js:            import { x } from './star-reexporter.js';
 *                       import * as ns1 from './star-reexporter.js';
 *                       import * as ns2 from './export-renamer.js';
 *                       export const captured = x;
 *                       export const namespace1 = { x: ns1.x, y: ns1.y };
 *                       export const namespace2 = { x: ns2.x, y: ns2.y };
 *
 * Before the fix, the SES linker visited star-reexporter while its
 * star-imported notifier for `y` had not yet been wired. The synchronous
 * wireUp at the cycle's back-edge then passed `undefined` as the upstream
 * notifier, manifesting as `TypeError: notify is not a function`. Node.js
 * does not exhibit the defect, so the parity test pinned both layers to a
 * single expected shape.
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
export const assertCycleRename = (t, namespace) => {
  t.is(namespace.captured, expectedCaptured);
  t.deepEqual(namespace.namespace1, expectedNamespace1);
  t.deepEqual(namespace.namespace2, expectedNamespace2);
};
