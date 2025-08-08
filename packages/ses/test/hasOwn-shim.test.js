import './_delete_hasOwn.js'; // emulate platforms without `Object.hasOwn`
import '../index.js';
import './_lockdown-safe.js';
import test from 'ava';

const { hasOwn } = Object;

// See https://github.com/endojs/endo/issues/2930
test('missing hasOwn repaired', t => {
  t.is(typeof hasOwn, 'function');
  t.true('hasOwn' in Object);
  t.true(hasOwn(Object, 'hasOwn'));
  t.true('hasOwnProperty' in Object);
  t.false(hasOwn(Object, 'hasOwnProperty'));
});
