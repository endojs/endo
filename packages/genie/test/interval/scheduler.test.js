// @ts-check

/**
 * Tests for interval scheduler creation, facets, validation, listing, and help.
 */

import '@endo/harden';

import test from 'ava';
import { makeIntervalScheduler } from '../../src/interval/index.js';

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

// ─── Facets ──────────────────────────────────────────────────────

test('makeIntervalScheduler returns scheduler and control facets', async t => {
  const { scheduler, schedulerControl } = await createScheduler(t, {
    minPeriodMs: 50,
  });
  t.is(typeof scheduler.makeInterval, 'function');
  t.is(typeof scheduler.list, 'function');
  t.is(typeof scheduler.help, 'function');
  t.is(typeof schedulerControl.pause, 'function');
  t.is(typeof schedulerControl.resume, 'function');
  t.is(typeof schedulerControl.revoke, 'function');
  t.is(typeof schedulerControl.listAll, 'function');
  t.is(typeof schedulerControl.help, 'function');
});

// ─── makeInterval ────────────────────────────────────────────────

test('makeInterval creates an interval and returns a handle', async t => {
  const { scheduler } = await createScheduler(t, { minPeriodMs: 50 });
  const interval = await scheduler.makeInterval('test', 100);
  t.is(interval.label(), 'test');
  t.is(interval.period(), 100);
  const info = interval.info();
  t.is(info.label, 'test');
  t.is(info.periodMs, 100);
  t.is(info.status, 'active');
  t.is(info.tickCount, 0);
  await interval.cancel();
});

test('makeInterval enforces minPeriodMs', async t => {
  const { scheduler } = await createScheduler(t, { minPeriodMs: 1000 });
  await t.throwsAsync(() => scheduler.makeInterval('fast', 500), {
    message: /below the minimum/,
  });
});

test('makeInterval enforces maxActive', async t => {
  const { scheduler } = await createScheduler(t, {
    minPeriodMs: 50,
    maxActive: 2,
  });
  await scheduler.makeInterval('a', 100);
  await scheduler.makeInterval('b', 100);
  await t.throwsAsync(() => scheduler.makeInterval('c', 100), {
    message: /limit reached/,
  });
});

test('makeInterval rejects empty label', async t => {
  const { scheduler } = await createScheduler(t, { minPeriodMs: 50 });
  await t.throwsAsync(() => scheduler.makeInterval('', 100), {
    message: /non-empty string/,
  });
});

// ─── cancel ──────────────────────────────────────────────────────

test('cancel makes interval cancelled', async t => {
  const { scheduler } = await createScheduler(t, { minPeriodMs: 50 });
  const interval = await scheduler.makeInterval('cancel-me', 100);
  await interval.cancel();
  t.is(interval.info().status, 'cancelled');
  const listed = await scheduler.list();
  t.is(listed.length, 0);
});

test('cancel is idempotent', async t => {
  const { scheduler } = await createScheduler(t, { minPeriodMs: 50 });
  const interval = await scheduler.makeInterval('cancel-me', 100);
  await interval.cancel();
  await interval.cancel(); // should not throw
  t.is(interval.info().status, 'cancelled');
});

// ─── setPeriod ───────────────────────────────────────────────────

test('setPeriod updates interval period', async t => {
  const { scheduler } = await createScheduler(t, { minPeriodMs: 50 });
  const interval = await scheduler.makeInterval('period-change', 100);
  await interval.setPeriod(200);
  t.is(interval.period(), 200);
  t.is(interval.info().periodMs, 200);
  await interval.cancel();
});

// ─── list / listAll ──────────────────────────────────────────────

test('list excludes cancelled intervals', async t => {
  const { scheduler } = await createScheduler(t, { minPeriodMs: 50 });
  const a = await scheduler.makeInterval('a', 100);
  await scheduler.makeInterval('b', 100);
  await a.cancel();
  const listed = await scheduler.list();
  t.is(listed.length, 1);
  t.is(listed[0].label, 'b');
});

test('listAll includes cancelled intervals', async t => {
  const { scheduler, schedulerControl } = await createScheduler(t, {
    minPeriodMs: 50,
  });
  const a = await scheduler.makeInterval('a', 100);
  await scheduler.makeInterval('b', 100);
  await a.cancel();
  const all = await schedulerControl.listAll();
  t.is(all.length, 2);
});

// ─── help ────────────────────────────────────────────────────────

test('help methods return descriptive strings', async t => {
  const { scheduler, schedulerControl } = await createScheduler(t, {
    minPeriodMs: 50,
  });
  t.true(scheduler.help().includes('IntervalScheduler'));
  t.true(schedulerControl.help().includes('IntervalControl'));
  const interval = await scheduler.makeInterval('help-test', 100);
  t.true(interval.help().includes('help-test'));
  await interval.cancel();
});
