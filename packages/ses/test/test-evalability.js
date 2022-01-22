import test from 'ava';
import './unevalability.js';
import '../index.js';

test('lockdown must throw if dynamic eval is unavailable at initialization time', t => {
  t.throws(() => lockdown({ errorTaming: 'unsafe' }));
});
