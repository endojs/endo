import test from 'ava';
import '../index.js';

lockdown({ evalTaming: 'noEval' });

test('no eval when evalTaming is noEval.', t => {
  // eslint-disable-next-line no-eval
  t.throws(() => eval('1+1'));
});
