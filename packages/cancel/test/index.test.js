import test from '@endo/ses-ava/prepare-endo.js';

import { makeCancelKit, allMap, anyMap } from '../index.js';

// ==================== makeCancelKit tests ====================

test('makeCancelKit returns cancelled and cancel', t => {
  const kit = makeCancelKit();
  t.true('cancelled' in kit, 'kit has cancelled');
  t.true('cancel' in kit, 'kit has cancel');
  t.true(kit.cancelled instanceof Promise, 'cancelled is a Promise');
  t.is(typeof kit.cancel, 'function', 'cancel is a function');
});

test('cancelled starts as undefined', t => {
  const { cancelled } = makeCancelKit();
  t.is(cancelled.cancelled, undefined);
});

test('cancelled becomes true after cancel is called', t => {
  const { cancelled, cancel } = makeCancelKit();
  t.is(cancelled.cancelled, undefined);
  cancel();
  t.is(cancelled.cancelled, true);
});

test('cancelled promise rejects after cancel', async t => {
  const { cancelled, cancel } = makeCancelKit();
  const reason = Error('test cancellation');
  cancel(reason);
  await t.throwsAsync(cancelled, { message: 'test cancellation' });
});

test('cancelled promise rejects with default error if no reason', async t => {
  const { cancelled, cancel } = makeCancelKit();
  cancel();
  await t.throwsAsync(cancelled, { message: 'Cancelled' });
});

test('cancel is idempotent', t => {
  const { cancelled, cancel } = makeCancelKit();
  cancel();
  t.is(cancelled.cancelled, true);
  cancel(); // Should not throw
  t.is(cancelled.cancelled, true);
});

// ==================== allMap tests ====================

test('allMap transforms all values', async t => {
  const values = [1, 2, 3];
  const result = await allMap(values, (value, index) => value * 2 + index);
  t.deepEqual(result, [2, 5, 8]);
});

test('allMap works with async callbacks', async t => {
  const values = [1, 2, 3];
  const result = await allMap(values, async value => {
    await Promise.resolve();
    return value * 2;
  });
  t.deepEqual(result, [2, 4, 6]);
});

test('allMap provides cancellation token to callback', async t => {
  const values = [1];
  await allMap(values, (_value, _index, cancelled) => {
    t.true(cancelled instanceof Promise);
    t.is(cancelled.cancelled, undefined);
  });
});

test('allMap cancels on first rejection', async t => {
  const values = [1, 2, 3];
  /** @type {import('../src/types.js').Cancelled | undefined} */
  let capturedCancelled;

  await t.throwsAsync(
    allMap(values, async (value, _index, cancelled) => {
      capturedCancelled = cancelled;
      if (value === 2) {
        throw Error('fail on 2');
      }
      return value;
    }),
    { message: 'fail on 2' },
  );

  // After allMap rejects, the cancellation token should be triggered
  t.is(capturedCancelled?.cancelled, true, 'cancellation was triggered');
});

test('allMap respects external cancellation', async t => {
  const { cancelled: externalCancelled, cancel } = makeCancelKit();
  const values = [1, 2, 3];

  // Cancel immediately
  cancel(Error('external cancel'));

  let observedCancellation = false;
  const result = allMap(
    values,
    async (_value, _index, cancelled) => {
      await Promise.resolve();
      if (cancelled.cancelled) {
        observedCancellation = true;
      }
      return 1;
    },
    externalCancelled,
  );

  await result;
  t.true(observedCancellation, 'callback observed external cancellation');
});

test('allMap handles empty array', async t => {
  const result = await allMap([], value => value);
  t.deepEqual(result, []);
});

// ==================== anyMap tests ====================

test('anyMap returns first successful result', async t => {
  const values = [1, 2, 3];
  const result = await anyMap(values, value => value * 2);
  // All should succeed, but we get one of them
  t.true([2, 4, 6].includes(result));
});

test('anyMap cancels remaining after first success', async t => {
  const values = [1, 2, 3];
  /** @type {import('../src/types.js').Cancelled | undefined} */
  let capturedCancelled;

  const result = await anyMap(values, async (value, _index, cancelled) => {
    capturedCancelled = cancelled;
    if (value === 1) {
      return 'first';
    }
    return `value-${value}`;
  });

  t.is(result, 'first');
  // After anyMap succeeds, the cancellation token should be triggered
  t.is(capturedCancelled?.cancelled, true, 'cancellation was triggered');
});

test('anyMap rejects with AggregateError if all fail', async t => {
  const values = [1, 2, 3];
  const error = await t.throwsAsync(
    anyMap(values, value => {
      throw Error(`fail-${value}`);
    }),
  );
  t.true(error instanceof AggregateError);
});

test('anyMap succeeds if at least one succeeds', async t => {
  const values = [1, 2, 3];
  const result = await anyMap(values, value => {
    if (value === 2) {
      return 'success';
    }
    throw Error(`fail-${value}`);
  });
  t.is(result, 'success');
});

test('anyMap throws for empty array', async t => {
  await t.throwsAsync(
    anyMap([], value => value),
    { instanceOf: AggregateError },
  );
});

test('anyMap provides cancellation token to callback', async t => {
  const values = [1];
  await anyMap(values, (_value, _index, cancelled) => {
    t.true(cancelled instanceof Promise);
    t.is(cancelled.cancelled, undefined);
    return 'done';
  });
});

test('anyMap respects external cancellation', async t => {
  const { cancelled: externalCancelled, cancel } = makeCancelKit();
  const values = [1, 2, 3];

  // Cancel immediately
  cancel(Error('external cancel'));

  let observedCancellation = false;
  const result = await anyMap(
    values,
    async (_value, _index, cancelled) => {
      await Promise.resolve();
      if (cancelled.cancelled) {
        observedCancellation = true;
      }
      return 'done';
    },
    externalCancelled,
  );

  t.is(result, 'done');
  t.true(observedCancellation, 'callback observed external cancellation');
});
