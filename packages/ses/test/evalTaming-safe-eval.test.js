import test from 'ava';
import '../index.js';

lockdown({ evalTaming: 'safe-eval' });

test('safe eval when evalTaming is safe-eval.', t => {
  // eslint-disable-next-line no-unused-vars
  const a = 0;
  // eslint-disable-next-line no-eval
  t.is(eval('a'), undefined);
  // eslint-disable-next-line no-eval
  t.is(eval('1 + 1'), 2);
  // eslint-disable-next-line no-eval
  t.is(eval.toString(), 'function eval() { [native code] }');
});
