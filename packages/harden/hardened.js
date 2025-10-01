/* global globalThis */

export const harden = globalThis.harden ?? Object[Symbol.for('harden')];

if (harden === undefined) {
  throw new Error(
    'Cannot initialize @endo/harden. This program was initialized with the "hardened" condition (-C hardened) but not executed in a hardened JavaScript environment',
  );
}
