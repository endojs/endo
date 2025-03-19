import test from 'ava';
import '../index.js';

lockdown({ evalTaming: 'safeEval' });

// 'safeEval' is deprecated, but testing that it still works
test('safe eval when evalTaming is safeEval.', t => {
  // eslint-disable-next-line no-unused-vars
  const a = 0;
  // eslint-disable-next-line no-eval
  t.is(eval('a'), undefined);
  // eslint-disable-next-line no-eval
  t.is(eval('1 + 1'), 2);
  // eslint-disable-next-line no-eval
  t.is(eval.toString(), 'function eval() { [native code] }');
});
