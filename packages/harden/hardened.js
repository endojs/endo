/* This implementation of harden asserts that there is a harden implementation
 * on the global or shared intrinsics as provided by a valid HardenedJS
 * environment.
 * Select this implementation of @endo/harden with -C hardened
 * with tools like Node.js or Endo's bundle-source bundler.
 */

/* global globalThis */

const harden = Object[Symbol.for('harden')] ?? globalThis.harden;

if (harden === undefined) {
  throw new Error(
    'Cannot initialize @endo/harden. This program was initialized with the "hardened" condition (-C hardened) but not executed in a hardened JavaScript environment',
  );
}

export default harden;
