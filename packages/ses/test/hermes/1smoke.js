/* eslint-disable no-eval */
/* global test */

test('smoke: lockdown works', () => {
  lockdown({ evalTaming: 'unsafe-eval' });

  assert(typeof eval === 'function', 'eval is not a function');
  assert(
    eval.toString() === 'function eval() { [native code] }',
    'eval is not a native code function',
  );
  // @ts-expect-error expects string
  assert(eval(42) === 42, 'eval is not functional');
  assert(
    eval('42') === 42,
    'eval called with string argument is not functional',
  );
  assert(
    // eslint-disable-next-line no-new-func
    Function('return 42')() === 42,
    'Function constructor is not functional',
  );
});
