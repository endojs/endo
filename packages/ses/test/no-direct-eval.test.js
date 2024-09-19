import test from 'ava';
import './_no-direct-eval.js';
import '../index.js';

test('lockdown must throw if dynamic eval is unavailable at initialization time', t => {
  t.throws(() => lockdown({ errorTaming: 'unsafe' }));
});
