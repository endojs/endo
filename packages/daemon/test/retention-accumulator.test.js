import test from '@endo/ses-ava/prepare-endo.js';
import { makeRetentionAccumulator } from '../src/retention-accumulator.js';

/**
 * Create a manual flush scheduler for testing.
 * Returns the scheduleBatch function and a flush trigger.
 */
const makeManualScheduler = () => {
  /** @type {Array<() => void>} */
  const pending = [];
  const scheduleBatch = (/** @type {() => void} */ fn) => {
    pending.push(fn);
  };
  const flushAll = () => {
    while (pending.length > 0) {
      const fn = /** @type {() => void} */ (pending.shift());
      fn();
    }
  };
  return { scheduleBatch, flushAll };
};

/**
 * Collect the next N deltas from a subscription.
 * Returns a promise that resolves to the collected deltas.
 *
 * @param {AsyncGenerator<import('../src/retention-accumulator.js').RetentionDelta>} iter
 * @param {number} count
 */
const collectDeltas = async (iter, count) => {
  /** @type {import('../src/retention-accumulator.js').RetentionDelta[]} */
  const deltas = [];
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { value, done } = await iter.next();
    if (done) break;
    deltas.push(value);
  }
  return deltas;
};

test('snapshot emitted as first delta', async t => {
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionAccumulator({
    snapshot: ['aaa', 'bbb'],
    scheduleBatch,
  });

  const iter = acc.subscribe();

  // The snapshot is the first yield, no flush needed.
  const { value: snap } = await iter.next();
  t.deepEqual([...snap.add].sort(), ['aaa', 'bbb']);
  t.deepEqual(snap.remove, []);

  // No further deltas yet.
  flushAll();
});

test('empty snapshot emits nothing', async t => {
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionAccumulator({
    snapshot: [],
    scheduleBatch,
  });

  const iter = acc.subscribe();

  // Add something so we can verify the snapshot was skipped.
  acc.add('xxx');
  flushAll();

  const { value } = await iter.next();
  // First delta should be the add, not a snapshot.
  t.deepEqual(value.add, ['xxx']);
  t.deepEqual(value.remove, []);
});

test('add and remove accumulate into single delta', async t => {
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionAccumulator({
    snapshot: [],
    scheduleBatch,
  });

  const iter = acc.subscribe();

  acc.add('aaa');
  acc.add('bbb');
  acc.remove('ccc');
  // No delta emitted yet (not flushed).
  flushAll();

  const { value } = await iter.next();
  t.deepEqual([...value.add].sort(), ['aaa', 'bbb']);
  t.deepEqual(value.remove, ['ccc']);
});

test('add then remove cancels out', async t => {
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionAccumulator({
    snapshot: [],
    scheduleBatch,
  });

  const iter = acc.subscribe();

  acc.add('aaa');
  acc.remove('aaa'); // Cancels the add.
  acc.add('bbb');
  flushAll();

  const { value } = await iter.next();
  // 'aaa' should not appear in either add or remove.
  t.deepEqual(value.add, ['bbb']);
  t.deepEqual(value.remove, []);
});

test('remove then add cancels out', async t => {
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionAccumulator({
    snapshot: [],
    scheduleBatch,
  });

  const iter = acc.subscribe();

  acc.remove('aaa');
  acc.add('aaa'); // Cancels the remove.
  flushAll();

  // Nothing to emit — both cancelled.
  // Add something else to verify.
  acc.add('bbb');
  flushAll();

  const { value } = await iter.next();
  t.deepEqual(value.add, ['bbb']);
  t.deepEqual(value.remove, []);
});

test('multiple flushes produce separate deltas', async t => {
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionAccumulator({
    snapshot: [],
    scheduleBatch,
  });

  const iter = acc.subscribe();

  acc.add('aaa');
  flushAll();
  acc.add('bbb');
  flushAll();

  const deltas = await collectDeltas(iter, 2);
  t.is(deltas.length, 2);
  t.deepEqual(deltas[0].add, ['aaa']);
  t.deepEqual(deltas[1].add, ['bbb']);
});

test('flush with no pending changes emits nothing', async t => {
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionAccumulator({
    snapshot: [],
    scheduleBatch,
  });

  const iter = acc.subscribe();

  // Flush with nothing pending.
  acc.flush();
  flushAll();

  // Now add something to prove the iterator works.
  acc.add('aaa');
  flushAll();

  const { value } = await iter.next();
  t.deepEqual(value.add, ['aaa']);
});

test('complete cancellation across turns emits nothing', async t => {
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionAccumulator({
    snapshot: [],
    scheduleBatch,
  });

  const iter = acc.subscribe();

  // Simulate: formula added, then collected before flush.
  acc.add('transient');
  acc.remove('transient');
  flushAll();

  // Add something real to verify.
  acc.add('permanent');
  flushAll();

  const { value } = await iter.next();
  // Only 'permanent' should appear.
  t.deepEqual(value.add, ['permanent']);
  t.deepEqual(value.remove, []);
});

test('snapshot followed by delta', async t => {
  const { scheduleBatch, flushAll } = makeManualScheduler();
  const acc = makeRetentionAccumulator({
    snapshot: ['existing'],
    scheduleBatch,
  });

  const iter = acc.subscribe();

  // Get snapshot.
  const { value: snap } = await iter.next();
  t.deepEqual(snap.add, ['existing']);
  t.deepEqual(snap.remove, []);

  // Add a formula after snapshot.
  acc.add('new-one');
  flushAll();

  const { value: delta } = await iter.next();
  t.deepEqual(delta.add, ['new-one']);
  t.deepEqual(delta.remove, []);
});
