import test from 'ava';
import '../index.js';

// The Float*Arrays are not fully harmless because they open a NaN side-channel
// on some implementations like v8. However, they are still in the
// start compartment, the intrinsics, and therefore repaired and frozen. They
// are not endowed to constructed compartments by default, but can be
// explicitly endowed.
// The Int*Arrays remain fully harmless and universal.
//
test('float arrays in compartments', t => {
  t.false(Object.isFrozen(Float64Array));
  t.false(Object.isFrozen(Int32Array));
  lockdown();
  t.true(Object.isFrozen(Float64Array));
  t.true(Object.isFrozen(Int32Array));

  const c1 = new Compartment();
  const c2 = new Compartment({
    __options__: true,
    globals: { Float64Array },
  });

  t.false('Float64Array' in c1.globalThis);
  t.true('Int32Array' in c1.globalThis);
  t.true('Float64Array' in c2.globalThis);

  t.is(c1.evaluate('Float64Array'), undefined);
  t.is(c1.evaluate('Int32Array'), Int32Array);
  t.is(c2.evaluate('Float64Array'), Float64Array);

  t.throws(
    () => {
      c1.evaluate(`new Float64Array()`);
    },
    {
      message: 'Float64Array is not a constructor',
    },
  );
  t.true(c1.evaluate('new Int32Array()') instanceof Int32Array);
  t.true(c2.evaluate('new Float64Array()') instanceof Float64Array);
});
