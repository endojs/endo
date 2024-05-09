import test from 'ava';
import '../index.js';

lockdown({ evalTaming: 'noEval' });

test('no eval when evalTaming is noEval.', t => {
  // eslint-disable-next-line no-eval
  t.throws(() => eval('1+1'));

  const compartment = new Compartment();
  // should not throw
  compartment.evaluate('(1, eval)("1 + 1")');
  // eslint-disable-next-line no-eval
  t.is(eval.toString(), 'function eval() { [native code] }');
});
