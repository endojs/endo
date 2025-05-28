/* eslint-disable no-eval */

// Hermes doesn't support native I/O,
// so we concat the SES shim above,
// when running this test on Hermes.

/**
 * Test calling SES lockdown.
 */
const testLockdown = () => {
  lockdown({ evalTaming: 'unsafe-eval' });
};

testLockdown();

assert(typeof eval === 'function', 'eval is not a function');
assert(
  eval.toString() === 'function eval() { [native code] }',
  'eval is not a native code function',
);
// @ts-expect-error expects string
assert(eval(42) === 42, 'eval is not functional');
assert(eval('42') === 42, 'eval called with string argument is not functional');
assert(
  // eslint-disable-next-line no-new-func
  Function('return 42')() === 42,
  'Function constructor is not functional',
);
