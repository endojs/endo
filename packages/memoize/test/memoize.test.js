import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import { memoize } from '../src/memoize.js';

test('memoize', t => {
  let count = 0;
  const incr = _ => (count += 1);
  const memoIncr = memoize(incr);

  const arg1 = harden({});
  const arg2 = harden({});
  const arg3 = harden({});

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
  // Verifies that the invalid weakmap key above caused rejection
  // *before* `incr` would have been called the first time with that argument
  // within `memoIncr`.
  t.is(incr('not a weakmap key'), 6);
  // With a new valid arg, memoIncr does call incr the first time.
  t.is(memoIncr(arg3), 7);
  t.is(memoIncr(arg3), 7);
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

test('recursion in function being memoized is fine', t => {
  let count = 0;
  /** @param {{n: number}} arg */
  const fact = ({ n }) => {
    count += 1;
    return n <= 0 ? 1 : n * fact({ n: n - 1 });
  };
  const memoFact = memoize(fact);

  const argN3 = harden({ n: 3 });

  t.is(memoFact(argN3), 6);
  t.is(count, 4);
  t.is(fact(argN3), 6);
  t.is(count, 8);
  t.is(memoFact(argN3), 6);
  t.is(count, 8);
});

test('recursion through memoization with fresh arg is fine', t => {
  let count = 0;
  /** @param {{n: number}} arg */
  const fact = ({ n }) => {
    count += 1;
    // eslint-disable-next-line no-use-before-define
    return n <= 0 ? 1 : n * memoFact({ n: n - 1 });
  };
  const memoFact = memoize(fact);

  const argN3 = harden({ n: 3 });

  t.is(memoFact(argN3), 6);
  t.is(count, 4);
  t.is(fact(argN3), 6);
  t.is(count, 8);
  t.is(memoFact(argN3), 6);
  t.is(count, 8);
});

test('no recursion through memoization with same arg', t => {
  let count = 0;
  const incrTwice = arg => {
    count += 1;
    if (count < 2) {
      // eslint-disable-next-line no-use-before-define
      return memoIncrTwice(arg);
    }
    return count;
  };
  const memoIncrTwice = memoize(incrTwice);

  const arg1 = harden({});

  // No memoization, but outer `incrTwice` incrs count before erroring,
  // advancing the count once.
  t.throws(() => memoIncrTwice(arg1), {
    message: 'no recursion through memoization with same arg',
  });
  t.is(count, 1);
  // The outer call incrs the count to 2, so it does not recur.
  // The count is memoized.
  t.is(memoIncrTwice(arg1), 2);
  t.is(count, 2);
  // Calling `incrTwice` directly still incrs count and avoids recuring.
  t.is(incrTwice(arg1), 3);
  t.is(count, 3);
  // just reuses memoized value from second call, without calling anything.
  t.is(memoIncrTwice(arg1), 2);
  t.is(count, 3);
});
