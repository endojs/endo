import { test } from './prepare-test-env-ava.js';
import { memoize } from '../src/memoize.js';

test('memoize', t => {
  let count = 0;
  const incr = _ => (count += 1);
  const memoIncr = memoize(incr);

  const arg1 = harden({});
  const arg2 = harden({});

  t.is(incr(arg1), 1);
  t.is(memoIncr(arg1), 2);
  t.is(incr(arg1), 3);
  t.is(memoIncr(arg1), 2);
  t.is(memoIncr(arg2), 4);

  t.is(incr('not a weakmap key'), 5);
  t.throws(() => memoIncr('not a weakmap key'), {
    // Beware fragile golden. This error message comes from the engine
    message: 'Invalid value used as weak map key',
  });
  t.is(incr('not a weakmap key'), 7);
});

test('memoize fn throws', t => {
  let count = 0;
  const incrThrow = _ => {
    count += 1;
    throw Error(`${count}`);
  };
  const memoIncr = memoize(incrThrow);

  const arg1 = harden({});
  const arg2 = harden({});

  t.throws(() => incrThrow(arg1), {
    message: '1',
  });
  t.throws(() => memoIncr(arg1), {
    message: '2',
  });
  t.throws(() => incrThrow(arg1), {
    message: '3',
  });
  t.throws(() => memoIncr(arg1), {
    message: '4',
  });
  t.throws(() => memoIncr(arg2), {
    message: '5',
  });
});
