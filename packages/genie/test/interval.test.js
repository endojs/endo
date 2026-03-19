#!/usr/bin/env node
// @ts-check

/**
 * Tests for the interval scheduler.
 *
 * Run with: node --experimental-vm-modules packages/genie/test/interval.test.js
 *
 * These tests use plain Node.js assertions (no test framework) so they
 * can run without additional dev dependencies.
 */

// Must run before any other imports to polyfill harden.
import './setup.js';

import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeIntervalScheduler } from '../src/interval/index.js';

/** Helper: create a temp directory for persistence tests. */
const makeTmpDir = async () => {
  const dir = join(tmpdir(), `endo-interval-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

/** Helper: clean up a temp directory. */
const cleanTmpDir = async (/** @type {string} */ dir) => {
  await fs.rm(dir, { recursive: true, force: true });
};

/** Helper: collect tick messages via onTick callback. */
const makeTickCollector = () => {
  /** @type {import('../src/interval/types.js').IntervalTickMessage[]} */
  const ticks = [];
  const onTick = (/** @type {import('../src/interval/types.js').IntervalTickMessage} */ msg) => {
    ticks.push(msg);
  };
  return { ticks, onTick };
};

/** Helper: wait for a given ms. */
const delay = (/** @type {number} */ ms) =>
  new Promise(resolve => setTimeout(resolve, ms));

let passed = 0;
let failed = 0;
const results = [];

/** @type {import('../src/interval/types.js').IntervalControlFacet[]} */
const allControls = [];

/**
 * Create a scheduler and track its control facet for cleanup.
 *
 * @param {import('../src/interval/types.js').IntervalSchedulerConfig} [config]
 */
const createScheduler = async (config) => {
  const pair = await makeIntervalScheduler(config);
  allControls.push(pair.schedulerControl);
  return pair;
};

/**
 * @param {string} name
 * @param {() => Promise<void>} fn
 */
const test = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    results.push(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    results.push(`  FAIL  ${name}: ${/** @type {Error} */ (err).message}`);
  }
};

// ─── Tests ────────────────────────────────────────────────────────

await test('makeIntervalScheduler returns scheduler and control facets', async () => {
  const { scheduler, schedulerControl } = await createScheduler({
    minPeriodMs: 50,
  });
  assert.equal(typeof scheduler.makeInterval, 'function');
  assert.equal(typeof scheduler.list, 'function');
  assert.equal(typeof scheduler.help, 'function');
  assert.equal(typeof schedulerControl.pause, 'function');
  assert.equal(typeof schedulerControl.resume, 'function');
  assert.equal(typeof schedulerControl.revoke, 'function');
  assert.equal(typeof schedulerControl.listAll, 'function');
  assert.equal(typeof schedulerControl.help, 'function');
});

await test('makeInterval creates an interval and returns a handle', async () => {
  const { scheduler } = await createScheduler({ minPeriodMs: 50 });
  const interval = await scheduler.makeInterval('test', 100);
  assert.equal(interval.label(), 'test');
  assert.equal(interval.period(), 100);
  const info = interval.info();
  assert.equal(info.label, 'test');
  assert.equal(info.periodMs, 100);
  assert.equal(info.status, 'active');
  assert.equal(info.tickCount, 0);
  await interval.cancel();
});

await test('makeInterval enforces minPeriodMs', async () => {
  const { scheduler } = await createScheduler({ minPeriodMs: 1000 });
  await assert.rejects(
    () => scheduler.makeInterval('fast', 500),
    /below the minimum/,
  );
});

await test('makeInterval enforces maxActive', async () => {
  const { scheduler } = await createScheduler({
    minPeriodMs: 50,
    maxActive: 2,
  });
  await scheduler.makeInterval('a', 100);
  await scheduler.makeInterval('b', 100);
  await assert.rejects(
    () => scheduler.makeInterval('c', 100),
    /limit reached/,
  );
});

await test('makeInterval rejects empty label', async () => {
  const { scheduler } = await createScheduler({ minPeriodMs: 50 });
  await assert.rejects(
    () => scheduler.makeInterval('', 100),
    /non-empty string/,
  );
});

await test('cancel makes interval cancelled', async () => {
  const { scheduler } = await createScheduler({ minPeriodMs: 50 });
  const interval = await scheduler.makeInterval('cancel-me', 100);
  await interval.cancel();
  assert.equal(interval.info().status, 'cancelled');
  // Should not appear in list.
  const listed = await scheduler.list();
  assert.equal(listed.length, 0);
});

await test('cancel is idempotent', async () => {
  const { scheduler } = await createScheduler({ minPeriodMs: 50 });
  const interval = await scheduler.makeInterval('cancel-me', 100);
  await interval.cancel();
  await interval.cancel(); // should not throw
  assert.equal(interval.info().status, 'cancelled');
});

await test('tick fires with firstDelayMs=0 (immediate)', async () => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler({
    minPeriodMs: 50,
    onTick,
  });
  await scheduler.makeInterval('immediate', 200, { firstDelayMs: 0 });
  // Wait a bit for the immediate tick to fire.
  await delay(50);
  assert.ok(ticks.length >= 1, `Expected at least 1 tick, got ${ticks.length}`);
  assert.equal(ticks[0].type, 'interval-tick');
  assert.equal(ticks[0].label, 'immediate');
  assert.equal(ticks[0].tickNumber, 1);
  // Resolve the tick to clean up.
  ticks[0].tickResponse.resolve();
});

await test('tick delivers correct fields', async () => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler({
    minPeriodMs: 50,
    onTick,
  });
  await scheduler.makeInterval('fields-test', 200);
  await delay(50);
  assert.ok(ticks.length >= 1);
  const tick = ticks[0];
  assert.equal(tick.type, 'interval-tick');
  assert.equal(typeof tick.intervalId, 'string');
  assert.equal(tick.label, 'fields-test');
  assert.equal(tick.periodMs, 200);
  assert.equal(tick.tickNumber, 1);
  assert.equal(typeof tick.scheduledAt, 'number');
  assert.equal(typeof tick.actualAt, 'number');
  assert.equal(tick.missedTicks, 0);
  assert.ok(tick.tickResponse);
  assert.equal(typeof tick.tickResponse.resolve, 'function');
  assert.equal(typeof tick.tickResponse.reschedule, 'function');
  tick.tickResponse.resolve();
});

await test('resolve advances to next period (start-to-start)', async () => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler({
    minPeriodMs: 50,
    onTick,
  });
  const interval = await scheduler.makeInterval('advance', 100);
  await delay(30);
  assert.ok(ticks.length >= 1);
  ticks[0].tickResponse.resolve();

  // Wait for second tick.
  await delay(120);
  assert.ok(ticks.length >= 2, `Expected 2 ticks, got ${ticks.length}`);
  assert.equal(ticks[1].tickNumber, 2);
  ticks[1].tickResponse.resolve();
  await interval.cancel();
});

await test('reschedule retries with backoff', async () => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler({
    minPeriodMs: 50,
    onTick,
  });
  const interval = await scheduler.makeInterval('retry', 500, {
    tickTimeoutMs: 2000,
  });
  await delay(30);
  assert.ok(ticks.length >= 1);
  // Reschedule the first tick.
  ticks[0].tickResponse.reschedule();

  // Wait for retry (backoff should be min(1000, 500/10) * 2^0 = 50ms).
  await delay(100);
  assert.ok(ticks.length >= 2, `Expected retry tick, got ${ticks.length} ticks`);
  assert.equal(ticks[1].tickNumber, 1); // same tick number on retry
  ticks[1].tickResponse.resolve();
  await interval.cancel();
});

await test('tick timeout auto-resolves', async () => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler({
    minPeriodMs: 50,
    onTick,
  });
  const interval = await scheduler.makeInterval('timeout', 500, {
    tickTimeoutMs: 80,
  });
  await delay(30);
  assert.ok(ticks.length >= 1);
  // Do NOT resolve — let it time out.
  await delay(120);
  // After timeout, the scheduler should have auto-resolved and armed the next tick.
  const info = interval.info();
  assert.equal(info.status, 'active');
  await interval.cancel();
});

await test('resolve is idempotent (double-call is no-op)', async () => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler({
    minPeriodMs: 50,
    onTick,
  });
  await scheduler.makeInterval('idempotent', 500);
  await delay(30);
  ticks[0].tickResponse.resolve();
  ticks[0].tickResponse.resolve(); // should not throw or duplicate
  ticks[0].tickResponse.reschedule(); // also no-op after resolve
});

await test('pause disarms all timers', async () => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler, schedulerControl } = await createScheduler({
    minPeriodMs: 50,
    onTick,
  });
  const interval = await scheduler.makeInterval('pause-test', 100, {
    firstDelayMs: 60,
  });
  // Pause before first tick fires.
  schedulerControl.pause();
  await delay(150);
  // No ticks should have fired.
  assert.equal(ticks.length, 0, 'Expected 0 ticks during pause');
  // Resume and wait for tick.
  schedulerControl.resume();
  await delay(30);
  assert.ok(ticks.length >= 1, 'Expected tick after resume');
  ticks[0].tickResponse.resolve();
  await interval.cancel();
});

await test('revoke permanently disables scheduler', async () => {
  const { scheduler, schedulerControl } = await createScheduler({
    minPeriodMs: 50,
  });
  const interval = await scheduler.makeInterval('revoke-test', 100);
  schedulerControl.revoke();
  await assert.rejects(
    () => scheduler.makeInterval('after-revoke', 100),
    /revoked/,
  );
  await assert.rejects(() => scheduler.list(), /revoked/);
  assert.equal(interval.info().status, 'cancelled');
});

await test('setMaxActive adjusts limit', async () => {
  const { schedulerControl, scheduler } = await createScheduler({
    minPeriodMs: 50,
    maxActive: 5,
  });
  schedulerControl.setMaxActive(1);
  await scheduler.makeInterval('only-one', 100);
  await assert.rejects(
    () => scheduler.makeInterval('too-many', 100),
    /limit reached/,
  );
});

await test('setMinPeriodMs adjusts floor', async () => {
  const { schedulerControl, scheduler } = await createScheduler({
    minPeriodMs: 1000,
  });
  schedulerControl.setMinPeriodMs(5000);
  await assert.rejects(
    () => scheduler.makeInterval('too-fast', 2000),
    /below the minimum/,
  );
  // Should work at the new floor.
  const interval = await scheduler.makeInterval('ok', 5000);
  await interval.cancel();
});

await test('setMaxActive rejects invalid values', async () => {
  const { schedulerControl } = await createScheduler({ minPeriodMs: 50 });
  assert.throws(() => schedulerControl.setMaxActive(0), /RangeError/);
  assert.throws(() => schedulerControl.setMaxActive(101), /RangeError/);
});

await test('setMinPeriodMs rejects invalid values', async () => {
  const { schedulerControl } = await createScheduler({ minPeriodMs: 50 });
  assert.throws(() => schedulerControl.setMinPeriodMs(500), /RangeError/);
  assert.throws(() => schedulerControl.setMinPeriodMs(100_000_000), /RangeError/);
});

await test('setPeriod updates interval period', async () => {
  const { scheduler } = await createScheduler({ minPeriodMs: 50 });
  const interval = await scheduler.makeInterval('period-change', 100);
  await interval.setPeriod(200);
  assert.equal(interval.period(), 200);
  assert.equal(interval.info().periodMs, 200);
  await interval.cancel();
});

await test('help methods return descriptive strings', async () => {
  const { scheduler, schedulerControl } = await createScheduler({
    minPeriodMs: 50,
  });
  assert.ok(scheduler.help().includes('IntervalScheduler'));
  assert.ok(schedulerControl.help().includes('IntervalControl'));
  const interval = await scheduler.makeInterval('help-test', 100);
  assert.ok(interval.help().includes('help-test'));
  await interval.cancel();
});

await test('persistence: entries survive scheduler recreation', async () => {
  const dir = await makeTmpDir();
  try {
    // Create scheduler with persistence and make an interval.
    const { scheduler } = await createScheduler({
      minPeriodMs: 50,
      persistDir: dir,
    });
    const interval = await scheduler.makeInterval('persist-test', 200);
    const id = interval.info().id;
    await interval.cancel();

    // Re-create scheduler from same directory.
    const { schedulerControl: control2 } = await createScheduler({
      minPeriodMs: 50,
      persistDir: dir,
    });
    const allEntries = await control2.listAll();
    assert.ok(
      allEntries.some(e => e.id === id),
      'Entry should be recovered from disk',
    );
    assert.equal(
      allEntries.find(e => e.id === id)?.status,
      'cancelled',
    );
  } finally {
    await cleanTmpDir(dir);
  }
});

await test('persistence: active entries re-arm on recovery', async () => {
  const dir = await makeTmpDir();
  const { ticks, onTick } = makeTickCollector();
  try {
    // Create scheduler with an active interval, then drop it.
    const { scheduler: s1 } = await createScheduler({
      minPeriodMs: 50,
      persistDir: dir,
    });
    await s1.makeInterval('recover-me', 200, { firstDelayMs: 5000 });
    // Don't wait for tick — just drop the scheduler.

    // Recover from disk with a new onTick.
    const { scheduler: s2 } = await createScheduler({
      minPeriodMs: 50,
      persistDir: dir,
      onTick,
    });
    // The entry's nextTickAt is in the future (~5s). In recovery the entry
    // should be re-armed. Let's check it appears in list.
    const listed = await s2.list();
    assert.ok(listed.some(e => e.label === 'recover-me'));
  } finally {
    await cleanTmpDir(dir);
  }
});

await test('list excludes cancelled intervals', async () => {
  const { scheduler } = await createScheduler({ minPeriodMs: 50 });
  const a = await scheduler.makeInterval('a', 100);
  await scheduler.makeInterval('b', 100);
  await a.cancel();
  const listed = await scheduler.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].label, 'b');
});

await test('listAll includes cancelled intervals', async () => {
  const { scheduler, schedulerControl } = await createScheduler({
    minPeriodMs: 50,
  });
  const a = await scheduler.makeInterval('a', 100);
  await scheduler.makeInterval('b', 100);
  await a.cancel();
  const all = await schedulerControl.listAll();
  assert.equal(all.length, 2);
});

// ─── Cleanup ──────────────────────────────────────────────────────
// Revoke all schedulers to disarm outstanding timers so the process can exit.
for (const control of allControls) {
  try {
    control.revoke();
  } catch {
    // Already revoked — ignore.
  }
}

// ─── Report ───────────────────────────────────────────────────────

console.log('\n=== Interval Scheduler Tests ===\n');
for (const r of results) {
  console.log(r);
}
console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total\n`);

if (failed > 0) {
  process.exit(1);
}
