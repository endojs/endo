/* eslint-disable no-eval */

// Hermes doesn't support native I/O,
// so we concat the SES shim above,
// when running this test on Hermes.

/**
 * Test calling SES lockdown.
 */
const testLockdown = () => {
  lockdown({ evalTaming: 'unsafeEval', hostEvaluators: 'no-direct' });
};

testLockdown();

assert(typeof eval === 'function', 'eval is not a function');
assert(
  eval.toString() === 'function eval() { [native code] }',
  'eval is not a native code function',
);
assert(eval(42) === 42, 'eval is not functional');
assert(eval('42') === 42, 'eval is not functional');
// eslint-disable-next-line no-new-func
assert(Function('return 42')() === 42, 'eval is not functional');
