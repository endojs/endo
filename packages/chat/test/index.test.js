// @ts-check

// This file exists to verify the test infrastructure works.
// Individual test files in subdirectories are run directly by ava's glob pattern.

import '@endo/init/debug.js';

import test from 'ava';

test('test infrastructure works', t => {
  t.pass();
});
