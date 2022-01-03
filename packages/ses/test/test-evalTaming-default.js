import test from 'ava';
import '../index.js';

lockdown({});

test('safe eval when evalTaming is undefined.', t => {
  // eslint-disable-next-line no-unused-vars
  const a = 0;
  // eslint-disable-next-line no-eval
  t.throws(() => eval('a'));
  // eslint-disable-next-line no-eval
  t.is(eval('1 + 1'), 2);
});
