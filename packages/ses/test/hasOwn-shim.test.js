import './_delete_hasOwn.js';
import '../index.js';
import './_lockdown-safe.js';
import test from 'ava';

const { hasOwn } = Object;

test('missing hasOwn repaired', t => {
  t.is(typeof hasOwn, 'function');
  t.true('hasOwn' in Object);
  t.true(hasOwn(Object, 'hasOwn'));
  t.true('hasOwnProperty' in Object);
  t.false(hasOwn(Object, 'hasOwnProperty'));
});
