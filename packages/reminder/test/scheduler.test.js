// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import { E } from '@endo/eventual-send';
import { passStyleOf } from '@endo/pass-style';
import { makeInMemoryFilesystem } from '@endo/platform/fs/extended';

import {
  makeReminderService,
  DEFAULT_MIN_PERIOD_MS,
  MAX_ACTIVE_CEILING,
} from '../src/scheduler.js';
import { makeReminderStore } from '../src/store.js';
import { computeBackoffDelay, defaultBackoff } from '../src/backoff.js';

/** @import { ReminderMessage } from '../src/types.js' */

let idCounter = 0;
const makeId = async () => {
  idCounter += 1;
  return `id${idCounter.toString(16).padStart(8, '0')}`;
};

/**
 * A fresh store-root Directory over an in-memory VFS. Returns both the store
 * adapter and the store-root cap (so a second incarnation can be built over the
 * same backing, and corrupt files can be injected).
 */
const makeTestStore = async () => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const storeRoot = await E(root).makeDirectory('reminder-store', {});
  const store = await makeReminderStore(storeRoot, makeId);
  return { store, storeRoot };
};

/**
 * A deterministic clock + timer queue. `advance(ms)` steps the clock forward,
 * firing due timers in order and draining microtasks between each fire so async
 * handlers (including the VFS store's eventual-send chains) settle.
 */
const makeFakeClock = () => {
  let clock = 1_000_000;
  let nextId = 1;
  /** @type {Map<number, { fireAt: number, callback: () => void }>} */
  const timers = new Map();
  const drainMicrotasks = async () => {
    for (let i = 0; i < 200; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await null;
    }
  };
  return {
    now: () => clock,
    /**
     * @param {() => void} callback
     * @param {number} ms
     */
    setTimeout: (callback, ms) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, { fireAt: clock + Math.max(0, ms), callback });
      return id;
    },
    /** @param {unknown} id */
    clearTimeout: id => {
      timers.delete(/** @type {number} */ (id));
    },
    /** @param {number} ms */
    advance: async ms => {
      const target = clock + ms;
      for (;;) {
        /** @type {{ fireAt: number, callback: () => void } | undefined} */
        let earliest;
        let earliestId = 0;
        for (const [id, timer] of timers) {
          if (timer.fireAt <= target) {
            if (earliest === undefined || timer.fireAt < earliest.fireAt) {
              earliest = timer;
              earliestId = id;
            }
          }
        }
        if (earliest === undefined) {
          break;
        }
        clock = earliest.fireAt;
        timers.delete(earliestId);
        earliest.callback();
        // eslint-disable-next-line no-await-in-loop
        await drainMicrotasks();
      }
      clock = target;
      await drainMicrotasks();
    },
  };
};

/** Neutralise backoff jitter for the ported timing tests. */
const noJitter = () => 0;

test('makeReminder creates, persists, lists, and fires messages', async t => {
  const { store } = await makeTestStore();
  const clock = makeFakeClock();
  /** @type {ReminderMessage[]} */
  const messages = [];
  const { scheduler } = await makeReminderService({
    store,
    makeId,
    onMessage: message => {
      messages.push(message);
    },
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  const reminder = await scheduler.makeReminder('heartbeat', 10_000);
  t.is(reminder.label(), 'heartbeat');
  t.is(reminder.period(), 10_000);

  const listed = await scheduler.list();
  t.is(listed.length, 1);
  t.is(listed[0].label, 'heartbeat');
  t.is(listed[0].status, 'active');

  // The entry was persisted to the durable store.
  const persisted = await store.readAllReminders();
  t.is(persisted.length, 1);

  // First message fires immediately (firstDelayMs default 0); the recipient
  // resolves and the next message fires one period later.
  await clock.advance(0);
  t.is(messages.length, 1);
  t.is(messages[0].messageNumber, 1);
  t.is(messages[0].missedMessages, 0);
  t.deepEqual(messages[0].annotation, { kind: 'count', count: 1 });
  messages[0].reminderResponse.resolve();
  await clock.advance(10_000);
  t.is(messages.length, 2);
  t.is(messages[1].messageNumber, 2);
});

test('each message delivers a ReminderResponse guarded exo', async t => {
  const { store } = await makeTestStore();
  const clock = makeFakeClock();
  /** @type {ReminderMessage[]} */
  const messages = [];
  const { scheduler } = await makeReminderService({
    store,
    makeId,
    onMessage: message => {
      messages.push(message);
    },
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  await scheduler.makeReminder('heartbeat', 10_000);
  await clock.advance(0);
  t.is(messages.length, 1);

  const { reminderResponse } = messages[0];
  // A proper exo, not a bare record: a remotable with guarded methods, so
  // unknown method calls are rejected rather than silently accepted.
  t.is(passStyleOf(/** @type {any} */ (reminderResponse)), 'remotable');
  t.throws(() => /** @type {any} */ (reminderResponse).frobnicate(), {
    message: /frobnicate/,
  });
  t.is(reminderResponse.resolve(), undefined);
});

test('makeReminder enforces minPeriodMs and maxActive', async t => {
  const { store } = await makeTestStore();
  const clock = makeFakeClock();
  const { scheduler, control } = await makeReminderService({
    store,
    makeId,
    minPeriodMs: 5000,
    maxActive: 2,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  await t.throwsAsync(() => scheduler.makeReminder('too-fast', 1000), {
    message: /below the minimum/,
  });

  await scheduler.makeReminder('a', 5000);
  await scheduler.makeReminder('b', 5000);
  await t.throwsAsync(() => scheduler.makeReminder('c', 5000), {
    message: /active reminder limit reached/,
  });

  control.setMaxActive(3);
  const c = await scheduler.makeReminder('c', 5000);
  t.is(c.label(), 'c');
});

test('cancel disarms and marks the reminder cancelled', async t => {
  const { store } = await makeTestStore();
  const clock = makeFakeClock();
  /** @type {ReminderMessage[]} */
  const messages = [];
  const { scheduler } = await makeReminderService({
    store,
    makeId,
    onMessage: message => {
      messages.push(message);
    },
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  const reminder = await scheduler.makeReminder('gone', 10_000, {
    firstDelayMs: 10_000,
  });
  await reminder.cancel();
  t.is(reminder.info().status, 'cancelled');

  const listed = await scheduler.list();
  t.is(listed.length, 0, 'cancelled reminders are not listed');

  await clock.advance(30_000);
  t.is(messages.length, 0);
});

test('cancel notifies onReminderCancel so a per-reminder response is released', async t => {
  const { store } = await makeTestStore();
  const clock = makeFakeClock();
  /** @type {ReminderMessage[]} */
  const messages = [];
  /** @type {string[]} */
  const cancelled = [];
  const { scheduler } = await makeReminderService({
    store,
    makeId,
    onMessage: message => {
      messages.push(message);
    },
    onReminderCancel: reminderId => {
      cancelled.push(reminderId);
    },
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  const reminder = await scheduler.makeReminder('gone', 10_000, {
    firstDelayMs: 0,
  });
  const reminderId = reminder.info().id;
  await clock.advance(0);
  t.is(messages.length, 1);
  t.deepEqual(cancelled, [], 'no cancel notification before cancel');

  await reminder.cancel();
  t.deepEqual(
    cancelled,
    [reminderId],
    'cancel notifies onReminderCancel with the reminder id',
  );

  await reminder.cancel();
  t.deepEqual(cancelled, [reminderId], 'a redundant cancel does not re-notify');
});

test('pause suppresses messages; resume re-arms', async t => {
  const { store } = await makeTestStore();
  const clock = makeFakeClock();
  /** @type {ReminderMessage[]} */
  const messages = [];
  const { scheduler, control } = await makeReminderService({
    store,
    makeId,
    onMessage: message => {
      messages.push(message);
    },
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  await scheduler.makeReminder('beat', 10_000, { firstDelayMs: 10_000 });
  control.pause();
  await clock.advance(30_000);
  t.is(messages.length, 0, 'no messages while paused');

  control.resume();
  await clock.advance(0);
  t.is(messages.length, 1, 'resume re-arms and the overdue message fires');
});

test('revoke is permanent and blocks further use', async t => {
  const { store } = await makeTestStore();
  const clock = makeFakeClock();
  const { scheduler, control } = await makeReminderService({
    store,
    makeId,
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  await scheduler.makeReminder('a', 5000);
  await control.revoke();

  await t.throwsAsync(() => scheduler.makeReminder('b', 5000), {
    message: /revoked/,
  });
  await t.throwsAsync(() => scheduler.list(), { message: /revoked/ });

  const all = await control.listAll();
  t.true(all.every(e => e.status === 'cancelled'));
});

test('startup recovery re-arms active reminders and coalesces missed messages', async t => {
  const { store, storeRoot } = await makeTestStore();
  const clock = makeFakeClock();

  // First incarnation: create a reminder, resolve its immediate message so the
  // next is scheduled one period out, then simulate a shutdown.
  const first = await makeReminderService({
    store,
    makeId,
    onMessage: message => message.reminderResponse.resolve(),
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });
  await first.scheduler.makeReminder('heartbeat', 10_000);
  await clock.advance(0); // fire + resolve the immediate message
  first.stop();

  // Jump forward well past several periods of downtime.
  await clock.advance(35_000);

  // Second incarnation recovers from the same VFS backing.
  const store2 = await makeReminderStore(storeRoot, makeId);
  /** @type {ReminderMessage[]} */
  const messages = [];
  const second = await makeReminderService({
    store: store2,
    makeId,
    onMessage: message => {
      messages.push(message);
    },
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  const recovered = await second.scheduler.list();
  t.is(recovered.length, 1, 'the active reminder is recovered');
  t.is(recovered[0].label, 'heartbeat');

  // A single coalesced catch-up message is delivered. nextTickAt was 1_010_000
  // at shutdown; recovery at 1_035_000 missed floor(25000/10000) = 2 periods.
  t.is(messages.length, 1);
  t.is(messages[0].missedMessages, 2, 'exact coalesced missed count');
  t.deepEqual(messages[0].annotation, { kind: 'count', count: 3 });

  // Recovery re-arms the schedule: the next real message fires one period after
  // the catch-up boundary (1_040_000).
  await clock.advance(5000);
  t.is(messages.length, 2, 'a subsequent message fires after recovery re-arm');
  t.is(messages[1].missedMessages, 0);
});

test('skip catch-up policy drops missed messages on recovery but re-arms', async t => {
  const { store, storeRoot } = await makeTestStore();
  const clock = makeFakeClock();

  const first = await makeReminderService({
    store,
    makeId,
    onMessage: message => message.reminderResponse.resolve(),
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });
  await first.scheduler.makeReminder('alive', 10_000, {
    catchUpPolicy: 'skip',
  });
  await clock.advance(0);
  first.stop();
  await clock.advance(35_000);

  const store2 = await makeReminderStore(storeRoot, makeId);
  /** @type {ReminderMessage[]} */
  const messages = [];
  const second = await makeReminderService({
    store: store2,
    makeId,
    onMessage: message => {
      messages.push(message);
    },
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  // No catch-up message for the missed periods.
  t.is(messages.length, 0, 'skip drops the missed messages entirely');
  t.is((await second.scheduler.list()).length, 1, 'the reminder is still live');

  // The schedule is re-armed at the next future boundary. nextTickAt advanced to
  // 1_040_000; from now = 1_035_000 the next message fires 5000ms later.
  await clock.advance(5000);
  t.is(messages.length, 1, 'the next scheduled message fires after recovery');
  t.is(messages[0].missedMessages, 0, 'a fresh message, not a catch-up');
});

test('timestamps annotation lists the coalesced scheduled times', async t => {
  const { store, storeRoot } = await makeTestStore();
  const clock = makeFakeClock();

  const first = await makeReminderService({
    store,
    makeId,
    onMessage: message => message.reminderResponse.resolve(),
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });
  await first.scheduler.makeReminder('report', 10_000, {
    annotation: 'timestamps',
  });
  await clock.advance(0);
  first.stop();
  await clock.advance(35_000);

  const store2 = await makeReminderStore(storeRoot, makeId);
  /** @type {ReminderMessage[]} */
  const messages = [];
  const second = await makeReminderService({
    store: store2,
    makeId,
    onMessage: message => {
      messages.push(message);
    },
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });
  second.stop();

  t.is(messages.length, 1);
  t.is(messages[0].annotation.kind, 'timestamps');
  // The coalesced message stands in for the missed firings due at 1_010_000,
  // 1_020_000, 1_030_000 (missedMessages 2 → three timestamps ending at
  // scheduledAt = 1_030_000); the next real message fires at 1_040_000.
  t.deepEqual(
    /** @type {any} */ (messages[0].annotation).scheduledTimes,
    [1_010_000, 1_020_000, 1_030_000],
  );
});

test('reschedule redelivers the same message, holds the deadline fixed, and gives up without drift', async t => {
  const { store } = await makeTestStore();
  const clock = makeFakeClock();
  /** @type {ReminderMessage[]} */
  const messages = [];
  const { scheduler } = await makeReminderService({
    store,
    makeId,
    onMessage: message => {
      messages.push(message);
    },
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  // period 10_000 → messageTimeoutMs default 5000, initialMs min(1000, 1000)=1000.
  await scheduler.makeReminder('retry', 10_000);
  await clock.advance(0);
  t.is(messages.length, 1);
  t.is(messages[0].messageNumber, 1);
  const originalScheduledAt = messages[0].scheduledAt;

  // reschedule #1 (backoff 1000ms): the SAME message number is redelivered.
  messages[0].reminderResponse.reschedule();
  await clock.advance(1000);
  t.is(messages.length, 2);
  t.is(messages[1].messageNumber, 1, 'reschedule redelivers the same number');
  t.is(
    messages[1].scheduledAt,
    originalScheduledAt,
    'scheduled time does not drift across a reschedule',
  );

  // A second reschedule() on the FIRST (already-consumed) response is a no-op.
  messages[0].reminderResponse.reschedule();
  await clock.advance(0);
  t.is(messages.length, 2, 'a stale response cannot trigger another retry');

  // reschedule #2 (backoff 2000ms) then #3, which exceeds the fixed deadline and
  // gives up → the message resolves and the schedule advances to the next period
  // boundary rather than looping.
  messages[1].reminderResponse.reschedule();
  await clock.advance(2000);
  t.is(messages.length, 3);
  t.is(messages[2].messageNumber, 1);
  messages[2].reminderResponse.reschedule(); // retryAt now >= deadline → give up

  await clock.advance(10_000);
  t.is(messages.length, 4);
  t.is(messages[3].messageNumber, 2, 'a bounded retry budget resumes ticking');
  t.is(
    messages[3].scheduledAt,
    originalScheduledAt + 10_000,
    'exactly one period elapsed despite the retries (no drift)',
  );
});

test('a message with no response auto-resolves at its deadline and the schedule continues', async t => {
  const { store } = await makeTestStore();
  const clock = makeFakeClock();
  /** @type {ReminderMessage[]} */
  const messages = [];
  const { scheduler } = await makeReminderService({
    store,
    makeId,
    onMessage: message => {
      messages.push(message);
    },
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  await scheduler.makeReminder('unanswered', 10_000); // messageTimeoutMs = 5000
  await clock.advance(0);
  t.is(messages.length, 1);

  await clock.advance(4999);
  t.is(messages.length, 1);

  await clock.advance(1); // deadline fires (auto-resolve)
  await clock.advance(10_000);
  t.is(
    messages.length,
    2,
    'the next message fires after the deadline auto-resolve',
  );
  t.is(messages[1].messageNumber, 2);

  // A stale response on the already-timed-out message 1 is inert.
  const beforeStale = messages.length;
  messages[0].reminderResponse.reschedule();
  messages[0].reminderResponse.resolve();
  await clock.advance(0);
  t.is(
    messages.length,
    beforeStale,
    'a stale timed-out response cannot inject a message',
  );
});

test('stop() is permanent: a late reminderResponse cannot resurrect the service', async t => {
  const { store } = await makeTestStore();
  const clock = makeFakeClock();
  /** @type {ReminderMessage[]} */
  const messages = [];
  const { scheduler, stop } = await makeReminderService({
    store,
    makeId,
    onMessage: message => {
      messages.push(message);
    },
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  await scheduler.makeReminder('beat', 10_000);
  await clock.advance(0);
  t.is(messages.length, 1);

  stop();

  messages[0].reminderResponse.resolve();
  await clock.advance(60_000);
  t.is(
    messages.length,
    1,
    'no messages fire after stop(), even on a late resolve()',
  );
});

test('initial limits and reminder options are validated', async t => {
  const clock = makeFakeClock();
  const base = async () => ({
    store: (await makeTestStore()).store,
    makeId,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  await t.throwsAsync(
    async () => makeReminderService({ ...(await base()), maxActive: 0 }),
    { message: /maxActive must be between/ },
    'maxActive below 1 is rejected at construction',
  );
  await t.throwsAsync(
    async () => makeReminderService({ ...(await base()), minPeriodMs: 500 }),
    { message: /minPeriodMs must be between/ },
    'minPeriodMs below the absolute floor is rejected at construction',
  );

  const { scheduler } = await makeReminderService({
    ...(await base()),
    minPeriodMs: 1000,
  });
  await t.throwsAsync(
    () => scheduler.makeReminder('bad-delay', 10_000, { firstDelayMs: -1 }),
    { message: /firstDelayMs must be/ },
  );
  await t.throwsAsync(
    () =>
      scheduler.makeReminder('bad-timeout', 10_000, { messageTimeoutMs: 0 }),
    { message: /messageTimeoutMs must be/ },
  );
  await t.throwsAsync(
    () =>
      scheduler.makeReminder('bad-policy', 10_000, { catchUpPolicy: 'nope' }),
    { message: /catchUpPolicy must be/ },
  );
  await t.throwsAsync(
    () =>
      scheduler.makeReminder('bad-backoff', 10_000, {
        backoff: { jitterFraction: 2 },
      }),
    { message: /jitterFraction must be/ },
  );
});

test('control setters enforce the ceiling and floor', async t => {
  const { store } = await makeTestStore();
  const clock = makeFakeClock();
  const { control } = await makeReminderService({
    store,
    makeId,
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });

  t.throws(() => control.setMaxActive(MAX_ACTIVE_CEILING + 1), {
    message: /between 1 and/,
  });
  t.throws(() => control.setMaxActive(0), { message: /between 1 and/ });
  t.throws(() => control.setMinPeriodMs(500), { message: /between/ });
});

test('limits persist across incarnations via the durable config', async t => {
  const { store, storeRoot } = await makeTestStore();
  const clock = makeFakeClock();
  const first = await makeReminderService({
    store,
    makeId,
    maxActive: 3,
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });
  first.control.setMaxActive(7);
  first.control.setMinPeriodMs(2000);
  first.control.pause();
  await clock.advance(0);
  first.stop();

  // A fresh incarnation over the same store adopts the persisted config, NOT the
  // env initials passed here.
  const store2 = await makeReminderStore(storeRoot, makeId);
  const second = await makeReminderService({
    store: store2,
    makeId,
    maxActive: 3,
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });
  // maxActive persisted as 7: creating a 4th reminder (over the env limit of 3)
  // is allowed. (paused persisted true, so no messages fire.)
  const help = second.scheduler.help();
  t.true(help.includes('maxActive=7'), 'persisted maxActive adopted');
  t.true(help.includes('minPeriodMs=2000'), 'persisted minPeriodMs adopted');
  second.stop();
});

test('a corrupt persisted entry is skipped, not fatal, during recovery', async t => {
  const { store, storeRoot } = await makeTestStore();
  const clock = makeFakeClock();

  const first = await makeReminderService({
    store,
    makeId,
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });
  await first.scheduler.makeReminder('good', 10_000);
  first.stop();

  // Inject a truncated/corrupt entry file alongside the valid one.
  const remindersDirectory = await E(storeRoot).lookup('reminders');
  await E(remindersDirectory).write('corrupt.json', '{ this is not valid json');

  const store2 = await makeReminderStore(storeRoot, makeId);
  const second = await makeReminderService({
    store: store2,
    makeId,
    minPeriodMs: 1000,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    random: noJitter,
  });
  const recovered = await second.scheduler.list();
  t.is(recovered.length, 1, 'the valid reminder survives a corrupt sibling');
  t.is(recovered[0].label, 'good');
  second.stop();
});

test('backoff: exponential growth, clamp, and full jitter', t => {
  const backoff = defaultBackoff(10_000, 5000);
  t.deepEqual(backoff, {
    initialMs: 1000,
    maxMs: 5000,
    multiplier: 2,
    jitterFraction: 0.1,
  });
  // With zero random draw, jitter subtracts nothing: raw exponential clamped.
  t.is(
    computeBackoffDelay(1, backoff, () => 0),
    1000,
  );
  t.is(
    computeBackoffDelay(2, backoff, () => 0),
    2000,
  );
  t.is(
    computeBackoffDelay(3, backoff, () => 0),
    4000,
  );
  t.is(
    computeBackoffDelay(4, backoff, () => 0),
    5000,
    'clamped to maxMs',
  );
  // Full jitter draws down by up to jitterFraction of the raw delay.
  t.is(
    computeBackoffDelay(1, backoff, () => 1),
    900,
    'max jitter draws down 10%',
  );
  t.is(
    computeBackoffDelay(1, backoff, () => 0.5),
    950,
  );
});

test('exported constants match the design defaults', t => {
  t.is(DEFAULT_MIN_PERIOD_MS, 30_000);
  t.is(MAX_ACTIVE_CEILING, 100);
});
