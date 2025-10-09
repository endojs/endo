/**
 * By default, this module simply reexports test from ava.
 * After importing ses-ava/prepare-endo.js, this exports the wrapped test
 * function.
 * This allows tests that import test from ses-ava/test.js to receive the
 * default ava by default, or the wrapped ava if they require
 * ses-ava/prepare-endo.js.
 */

import rawTest from 'ava';

// A smelly but convenient use for a mutable export binding.
// The alternative is to create another layer of wrapping around the test
// function tree, which in this case, would be onerous.
// eslint-disable-next-line import/no-mutable-exports
let test = rawTest;

export const register = newTest => {
  test = newTest;
};

// Also smelly, but the only way to export a let binding named default, so here
// we are, once again staring deeply into the alleged simplicity of ESM.
// eslint-disable-next-line no-restricted-exports
export { test as default };
