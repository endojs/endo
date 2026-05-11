// @ts-check

/**
 * Tests for tick firing, resolve, reschedule, timeout, and idempotency.
 */

import '@endo/harden';

import test from 'ava';
import { setTimeout } from 'node:timers';

import { makeIntervalScheduler } from '../../src/interval/index.js';

/** @param {number} ms */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Collect tick messages via onTick callback. */
const makeTickCollector = () => {
  /** @type {import('../../src/interval/types.js').IntervalTickMessage[]} */
  const ticks = [];
  /** @type {(msg: import('../../src/interval/types.js').IntervalTickMessage) => void} */
  const onTick = msg => {
    ticks.push(msg);
  };
  return { ticks, onTick };
};

/**
 * Create a scheduler with tick collection and register cleanup.
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

// ─── Tick firing ─────────────────────────────────────────────────

test('tick fires with firstDelayMs=0 (immediate)', async t => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler(t, {
    minPeriodMs: 50,
    onTick,
  });
  await scheduler.makeInterval('immediate', 200, { firstDelayMs: 0 });
  await delay(50);
  t.true(ticks.length >= 1, `Expected at least 1 tick, got ${ticks.length}`);
  t.is(ticks[0].type, 'interval-tick');
  t.is(ticks[0].label, 'immediate');
  t.is(ticks[0].tickNumber, 1);
  ticks[0].tickResponse.resolve();
});

test('tick delivers correct fields', async t => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler(t, {
    minPeriodMs: 50,
    onTick,
  });
  await scheduler.makeInterval('fields-test', 200);
  await delay(50);
  t.true(ticks.length >= 1);
  const tick = ticks[0];
  t.is(tick.type, 'interval-tick');
  t.is(typeof tick.intervalId, 'string');
  t.is(tick.label, 'fields-test');
  t.is(tick.periodMs, 200);
  t.is(tick.tickNumber, 1);
  t.is(typeof tick.scheduledAt, 'number');
  t.is(typeof tick.actualAt, 'number');
  t.is(tick.missedTicks, 0);
  t.truthy(tick.tickResponse);
  t.is(typeof tick.tickResponse.resolve, 'function');
  t.is(typeof tick.tickResponse.reschedule, 'function');
  tick.tickResponse.resolve();
});

// ─── Resolve ─────────────────────────────────────────────────────

test('resolve advances to next period (start-to-start)', async t => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler(t, {
    minPeriodMs: 50,
    onTick,
  });
  const interval = await scheduler.makeInterval('advance', 100);
  await delay(30);
  t.true(ticks.length >= 1);
  ticks[0].tickResponse.resolve();

  // Wait for second tick.
  await delay(120);
  t.true(ticks.length >= 2, `Expected 2 ticks, got ${ticks.length}`);
  t.is(ticks[1].tickNumber, 2);
  ticks[1].tickResponse.resolve();
  await interval.cancel();
});

test('resolve is idempotent (double-call is no-op)', async t => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler(t, {
    minPeriodMs: 50,
    onTick,
  });
  await scheduler.makeInterval('idempotent', 500);
  await delay(30);
  ticks[0].tickResponse.resolve();
  ticks[0].tickResponse.resolve(); // should not throw or duplicate
  ticks[0].tickResponse.reschedule(); // also no-op after resolve
  t.pass();
});

// ─── Reschedule ──────────────────────────────────────────────────

test('reschedule retries with backoff', async t => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler(t, {
    minPeriodMs: 50,
    onTick,
  });
  const interval = await scheduler.makeInterval('retry', 500, {
    tickTimeoutMs: 2000,
  });
  await delay(30);
  t.true(ticks.length >= 1);
  ticks[0].tickResponse.reschedule();

  // Wait for retry (backoff should be min(1000, 500/10) * 2^0 = 50ms).
  await delay(100);
  t.true(ticks.length >= 2, `Expected retry tick, got ${ticks.length} ticks`);
  t.is(ticks[1].tickNumber, 1); // same tick number on retry
  ticks[1].tickResponse.resolve();
  await interval.cancel();
});

// ─── Timeout ─────────────────────────────────────────────────────

test('tick timeout auto-resolves', async t => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler } = await createScheduler(t, {
    minPeriodMs: 50,
    onTick,
  });
  const interval = await scheduler.makeInterval('timeout', 500, {
    tickTimeoutMs: 80,
  });
  await delay(30);
  t.true(ticks.length >= 1);
  // Do NOT resolve — let it time out.
  await delay(120);
  // After timeout, the scheduler should have auto-resolved and armed next tick.
  t.is(interval.info().status, 'active');
  await interval.cancel();
});
