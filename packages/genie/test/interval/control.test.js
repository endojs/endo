// @ts-check

/**
 * Tests for scheduler control facet: pause, resume, revoke, and config setters.
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

// ─── pause / resume ──────────────────────────────────────────────

test('pause disarms all timers', async t => {
  const { ticks, onTick } = makeTickCollector();
  const { scheduler, schedulerControl } = await createScheduler(t, {
    minPeriodMs: 50,
    onTick,
  });
  const interval = await scheduler.makeInterval('pause-test', 100, {
    firstDelayMs: 60,
  });
  // Pause before first tick fires.
  schedulerControl.pause();
  await delay(150);
  t.is(ticks.length, 0, 'Expected 0 ticks during pause');
  // Resume and wait for tick.
  schedulerControl.resume();
  await delay(30);
  t.true(ticks.length >= 1, 'Expected tick after resume');
  ticks[0].tickResponse.resolve();
  await interval.cancel();
});

// ─── revoke ──────────────────────────────────────────────────────

test('revoke permanently disables scheduler', async t => {
  const { scheduler, schedulerControl } = await createScheduler(t, {
    minPeriodMs: 50,
  });
  const interval = await scheduler.makeInterval('revoke-test', 100);
  schedulerControl.revoke();
  await t.throwsAsync(() => scheduler.makeInterval('after-revoke', 100), {
    message: /revoked/,
  });
  await t.throwsAsync(() => scheduler.list(), { message: /revoked/ });
  t.is(interval.info().status, 'cancelled');
});

// ─── setMaxActive ────────────────────────────────────────────────

test('setMaxActive adjusts limit', async t => {
  const { schedulerControl, scheduler } = await createScheduler(t, {
    minPeriodMs: 50,
    maxActive: 5,
  });
  schedulerControl.setMaxActive(1);
  await scheduler.makeInterval('only-one', 100);
  await t.throwsAsync(() => scheduler.makeInterval('too-many', 100), {
    message: /limit reached/,
  });
});

test('setMaxActive rejects invalid values', async t => {
  const { schedulerControl } = await createScheduler(t, { minPeriodMs: 50 });
  t.throws(() => schedulerControl.setMaxActive(0), {
    instanceOf: RangeError,
  });
  t.throws(() => schedulerControl.setMaxActive(101), {
    instanceOf: RangeError,
  });
});

// ─── setMinPeriodMs ──────────────────────────────────────────────

test('setMinPeriodMs adjusts floor', async t => {
  const { schedulerControl, scheduler } = await createScheduler(t, {
    minPeriodMs: 1000,
  });
  schedulerControl.setMinPeriodMs(5000);
  await t.throwsAsync(() => scheduler.makeInterval('too-fast', 2000), {
    message: /below the minimum/,
  });
  // Should work at the new floor.
  const interval = await scheduler.makeInterval('ok', 5000);
  await interval.cancel();
  t.pass();
});

test('setMinPeriodMs rejects invalid values', async t => {
  const { schedulerControl } = await createScheduler(t, { minPeriodMs: 50 });
  t.throws(() => schedulerControl.setMinPeriodMs(500), {
    instanceOf: RangeError,
  });
  t.throws(() => schedulerControl.setMinPeriodMs(100_000_000), {
    instanceOf: RangeError,
  });
});
