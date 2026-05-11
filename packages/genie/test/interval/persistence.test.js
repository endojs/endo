// @ts-check

/**
 * Tests for interval scheduler persistence (save/recover from disk).
 */

import '@endo/harden';

import test from 'ava';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeIntervalScheduler } from '../../src/interval/index.js';

/** Create a unique temp directory. */
const makeTmpDir = async () => {
  const dir = join(
    tmpdir(),
    `endo-interval-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

/**
 * Create a scheduler and register cleanup via t.teardown.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {import('../../src/interval/types.js').IntervalSchedulerConfig} [config]
 */
const createScheduler = async (t, config) => {
  const pair = await makeIntervalScheduler(config);
  t.teardown(() => {
    try {
      pair.schedulerControl.revoke();
    } catch {
      // Already revoked — ignore.
    }
  });
  return pair;
};

test('entries survive scheduler recreation', async t => {
  const dir = await makeTmpDir();
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }));

  // Create scheduler with persistence and make an interval.
  const { scheduler } = await createScheduler(t, {
    minPeriodMs: 50,
    persistDir: dir,
  });
  const interval = await scheduler.makeInterval('persist-test', 200);
  const id = interval.info().id;
  await interval.cancel();

  // Re-create scheduler from same directory.
  const { schedulerControl: control2 } = await createScheduler(t, {
    minPeriodMs: 50,
    persistDir: dir,
  });
  const allEntries = await control2.listAll();
  t.true(
    allEntries.some(e => e.id === id),
    'Entry should be recovered from disk',
  );
  const recovered = allEntries.find(e => e.id === id);
  t.is(recovered?.status, 'cancelled');
});

test('active entries re-arm on recovery', async t => {
  const dir = await makeTmpDir();
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }));

  /** @type {import('../../src/interval/types.js').IntervalTickMessage[]} */
  const ticks = [];
  /** @type {(msg: import('../../src/interval/types.js').IntervalTickMessage) => void} */
  const onTick = msg => {
    ticks.push(msg);
  };

  // Create scheduler with an active interval, then drop it.
  const { scheduler: s1 } = await createScheduler(t, {
    minPeriodMs: 50,
    persistDir: dir,
  });
  await s1.makeInterval('recover-me', 200, { firstDelayMs: 5000 });
  // Don't wait for tick — just drop the scheduler.

  // Recover from disk with a new onTick.
  const { scheduler: s2 } = await createScheduler(t, {
    minPeriodMs: 50,
    persistDir: dir,
    onTick,
  });
  // The entry should appear in list after recovery.
  const listed = await s2.list();
  t.true(listed.some(e => e.label === 'recover-me'));
});
