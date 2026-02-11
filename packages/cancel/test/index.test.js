/* global globalThis */

import test from '@endo/ses-ava/prepare-endo.js';

import { makeCancelKit } from '../index.js';
import { allMap } from '../all-map.js';
import { anyMap } from '../any-map.js';
import { toAbortSignal } from '../to-abort.js';
import { fromAbortSignal } from '../from-abort.js';
import { delay } from '../delay.js';
import { makeDelay } from '../delay-lite.js';

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

test('makeCancelKit propagates cancellation from parent', async t => {
  const { cancelled: parentCancelled, cancel: cancelParent } = makeCancelKit();
  const { cancelled: childCancelled } = makeCancelKit(parentCancelled);

  t.is(childCancelled.cancelled, undefined);

  cancelParent(Error('parent cancelled'));

  // Give time for propagation
  await Promise.resolve();

  t.is(childCancelled.cancelled, true);
  await t.throwsAsync(childCancelled, { message: 'parent cancelled' });
});

test('makeCancelKit child can cancel independently of parent', t => {
  const { cancelled: parentCancelled } = makeCancelKit();
  const { cancelled: childCancelled, cancel: cancelChild } =
    makeCancelKit(parentCancelled);

  cancelChild(Error('child cancelled'));

  t.is(childCancelled.cancelled, true);
  t.is(parentCancelled.cancelled, undefined); // Parent not affected
});

// ==================== allMap tests ====================

test('allMap transforms all values', async t => {
  const { cancelled: parentCancelled } = makeCancelKit();
  const values = [1, 2, 3];
  const result = await allMap(
    values,
    (value, index) => value * 2 + index,
    parentCancelled,
  );
  t.deepEqual(result, [2, 5, 8]);
});

test('allMap works with async callbacks', async t => {
  const { cancelled: parentCancelled } = makeCancelKit();
  const values = [1, 2, 3];
  const result = await allMap(
    values,
    async value => {
      await Promise.resolve();
      return value * 2;
    },
    parentCancelled,
  );
  t.deepEqual(result, [2, 4, 6]);
});

test('allMap provides cancellation token to callback', async t => {
  const { cancelled: parentCancelled } = makeCancelKit();
  const values = [1];
  await allMap(
    values,
    (_value, _index, cancelled) => {
      t.true(cancelled instanceof Promise);
      t.is(cancelled.cancelled, undefined);
    },
    parentCancelled,
  );
});

test('allMap cancels on first rejection', async t => {
  const { cancelled: parentCancelled } = makeCancelKit();
  const values = [1, 2, 3];
  /** @type {import('../src/types.js').Cancelled | undefined} */
  let capturedCancelled;

  await t.throwsAsync(
    allMap(
      values,
      async (value, _index, cancelled) => {
        capturedCancelled = cancelled;
        if (value === 2) {
          throw Error('fail on 2');
        }
        return value;
      },
      parentCancelled,
    ),
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
  const { cancelled: parentCancelled } = makeCancelKit();
  const result = await allMap([], value => value, parentCancelled);
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

// ==================== toAbortSignal tests ====================

test('toAbortSignal returns an AbortSignal', t => {
  const { cancelled } = makeCancelKit();
  const signal = toAbortSignal(cancelled);
  t.true(signal instanceof AbortSignal);
  t.false(signal.aborted);
});

test('toAbortSignal aborts when cancelled', async t => {
  const { cancelled, cancel } = makeCancelKit();
  const signal = toAbortSignal(cancelled);

  t.false(signal.aborted);
  cancel(Error('test abort'));

  // Give time for the abort to propagate
  await Promise.resolve();
  t.true(signal.aborted);
  t.is(signal.reason.message, 'test abort');
});

test('toAbortSignal handles already cancelled token', t => {
  const { cancelled, cancel } = makeCancelKit();
  cancel(Error('already cancelled'));

  const signal = toAbortSignal(cancelled);
  t.true(signal.aborted);
});

// ==================== fromAbortSignal tests ====================

test('fromAbortSignal returns a Cancelled token', t => {
  const controller = new AbortController();
  const cancelled = fromAbortSignal(controller.signal);

  t.true(cancelled instanceof Promise);
  t.is(cancelled.cancelled, undefined);
});

test('fromAbortSignal triggers when signal aborts', async t => {
  const controller = new AbortController();
  const cancelled = fromAbortSignal(controller.signal);

  t.is(cancelled.cancelled, undefined);
  controller.abort(Error('test abort'));

  // Give time for the abort to propagate
  await Promise.resolve();
  t.is(cancelled.cancelled, true);
});

test('fromAbortSignal handles already aborted signal', t => {
  const controller = new AbortController();
  controller.abort(Error('already aborted'));

  const cancelled = fromAbortSignal(controller.signal);
  t.is(cancelled.cancelled, true);
});

test('fromAbortSignal promise rejects with abort reason', async t => {
  const controller = new AbortController();
  const cancelled = fromAbortSignal(controller.signal);

  controller.abort(Error('abort reason'));
  await t.throwsAsync(cancelled, { message: 'abort reason' });
});

// ==================== delay tests ====================

test('delay fulfills with undefined after ms', async t => {
  const { cancelled: parentCancelled } = makeCancelKit();
  const start = Date.now();
  const result = await delay(50, parentCancelled);
  const elapsed = Date.now() - start;

  t.is(result, undefined);
  t.true(elapsed >= 40, `elapsed ${elapsed}ms should be >= 40ms`);
});

test('delay rejects when parentCancelled is triggered', async t => {
  const { cancelled: parentCancelled, cancel } = makeCancelKit();

  // Cancel after a short delay
  globalThis.setTimeout(() => cancel(Error('cancelled early')), 10);

  const start = Date.now();
  await t.throwsAsync(delay(1000, parentCancelled), {
    message: 'cancelled early',
  });
  const elapsed = Date.now() - start;

  // Should have rejected much sooner than 1000ms
  t.true(elapsed < 500, `elapsed ${elapsed}ms should be < 500ms`);
});

test('delay rejects immediately if already cancelled', async t => {
  const { cancelled: parentCancelled, cancel } = makeCancelKit();
  cancel(Error('already cancelled'));

  await t.throwsAsync(delay(1000, parentCancelled), {
    message: 'already cancelled',
  });
});

test('delay treats parentCancelled fulfillment as error', async t => {
  // Create a promise that fulfills instead of rejects
  const fulfillingPromise = Promise.resolve();
  // @ts-expect-error - intentionally testing invalid usage
  fulfillingPromise.cancelled = undefined;

  await t.throwsAsync(
    // @ts-expect-error - intentionally testing invalid usage
    delay(50, fulfillingPromise),
    { message: /parentCancelled must not fulfill/ },
  );
});

// ==================== makeDelay tests ====================

test('makeDelay creates a delay function with custom setTimeout', async t => {
  const calls = [];
  const fakeSetTimeout = (callback, ms) => {
    calls.push({ ms });
    // Call immediately for testing
    callback();
  };

  const customDelay = makeDelay(fakeSetTimeout);
  const { cancelled: parentCancelled } = makeCancelKit();

  const result = await customDelay(100, parentCancelled);

  t.is(result, undefined);
  t.is(calls.length, 1);
  t.is(calls[0].ms, 100);
});
