import test from 'ava';
import '../index.js';

lockdown({ evalTaming: 'unsafeEval' });

test('direct eval is possible when evalTaming is unsafe.', t => {
  // eslint-disable-next-line no-unused-vars
  const a = 0;
  // eslint-disable-next-line no-eval
  t.is(eval('a'), 0);

  // should not throw
  const compartment = new Compartment();
  compartment.evaluate('(1, eval)("1 + 1")');
  // eslint-disable-next-line no-eval
  t.is(eval.toString(), 'function eval() { [native code] }');
});
