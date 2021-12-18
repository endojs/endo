import test from 'ava';
import '../index.js';

lockdown({ evalTaming: 'unsafe' });

test('direct eval is possible when evalTaming is unsafe.', t => {
  // eslint-disable-next-line no-unused-vars
  const a = 0;
  // eslint-disable-next-line no-eval
  t.is(eval('a'), 0);
});

test('compartment cannot be used when evalTaming is unsafe.', t => {
  t.is(typeof Compartment, 'undefined');
});
