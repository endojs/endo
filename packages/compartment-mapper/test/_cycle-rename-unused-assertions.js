/**
 * Shared assertion logic for the unused-live-binding shape of the cyclic
 * star-export with renaming reexport regression (endojs/endo#59). This is
 * the companion to the populated shape exercised by
 * `_cycle-rename-assertions.js`; the only difference is that the renamer's
 * `export var y` here has no initializer, so the live binding is declared
 * but never updated. Every projection of the cycle therefore reads
 * `undefined`. Both the Node.js parity test and the Compartment Mapper test
 * import from this module so the expected values live in exactly one place;
 * if both tests pass, parity with Node.js is verified by construction.
 *
 * The fixture under fixtures-cycle-rename-unused/node_modules/app/ exercises
 * this arrangement:
 *
 *   star-reexporter.js: export * from './export-renamer.js';
 *   export-renamer.js:  export { y as x } from './star-reexporter.js';
 *                       export var y;
 *   main.js:            import { x } from './star-reexporter.js';
 *                       import * as ns1 from './star-reexporter.js';
 *                       import * as ns2 from './export-renamer.js';
 *                       export const captured = x;
 *                       export const namespace1 = { x: ns1.x, y: ns1.y };
 *                       export const namespace2 = { x: ns2.x, y: ns2.y };
 *
 * The deferring closure introduced by the issue #59 fix queues subscribers
 * until the upstream notifier resolves, then forwards them. With no
 * initializer the upstream's value never updates, so every read is
 * `undefined`. Node.js exhibits the same shape, so the parity test pins
 * both layers to a single expected projection.
 *
 * @module
 */

/** @import {ExecutionContext} from 'ava' */

export const expectedCaptured = undefined;
export const expectedNamespace1 = { x: undefined, y: undefined };
export const expectedNamespace2 = { x: undefined, y: undefined };

/**
 * @param {ExecutionContext} t
 * @param {object} namespace
 */
export const assertCycleRenameUnused = (t, namespace) => {
  t.is(namespace.captured, expectedCaptured);
  t.deepEqual(namespace.namespace1, expectedNamespace1);
  t.deepEqual(namespace.namespace2, expectedNamespace2);
};
