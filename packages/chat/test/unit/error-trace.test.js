// @ts-check

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoHost } from '@endo/daemon' */

import '@endo/init/debug.js';

import test from 'ava';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import {
  resolveErrorTrace,
  watchErrorTrace,
  noteDecodedErrorId,
} from '@endo/spaces-util/error-trace.js';

/**
 * Build a mock `powers` whose `diagnostics().traces().lookup(errorId)` reads a
 * live map, plus a way to count lookups. Mutating the map mid-test models the
 * daemon's trace record arriving LATER than the error itself — the cross-process
 * race that the single-process test harness never exposed.
 *
 * @param {Map<string, { message?: string, stack?: string, workerId?: string }>} reports
 */
const makeMockPowersWithReports = reports => {
  let lookups = 0;
  const mockPowers = makeExo(
    'MockPowers',
    M.interface('MockPowers', {}, { defaultGuards: 'passable' }),
    {
      diagnostics() {
        return makeExo(
          'MockDiagnostics',
          M.interface('MockDiagnostics', {}, { defaultGuards: 'passable' }),
          {
            traces() {
              return makeExo(
                'MockTraces',
                M.interface('MockTraces', {}, { defaultGuards: 'passable' }),
                {
                  /** @param {string} errorId */
                  lookup(errorId) {
                    lookups += 1;
                    return reports.get(errorId);
                  },
                },
              );
            },
          },
        );
      },
    },
  );
  return {
    powers: /** @type {ERef<EndoHost>} */ (/** @type {unknown} */ (mockPowers)),
    lookupCount: () => lookups,
  };
};

/** @param {number} ms */
const sleep = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms));

test('resolveErrorTrace carries the errorId even when the record has not arrived', async t => {
  // The enabling contract for the watch: when an errorId is recoverable but the
  // aggregator has no record yet (the race), resolveErrorTrace still returns the
  // errorId so the caller knows to watch rather than degrade permanently.
  const reports = new Map();
  const { powers } = makeMockPowersWithReports(reports);
  const error = Error('x');
  noteDecodedErrorId(error, 'error:daemon#1');

  const detail = await resolveErrorTrace(powers, error);
  t.is(detail.message, 'x');
  t.is(detail.stack, undefined, 'no stack yet (record not delivered)');
  t.is(detail.workerId, undefined, 'no worker yet (record not delivered)');
  t.is(detail.errorId, 'error:daemon#1', 'errorId is carried for the watch');
});

test('watchErrorTrace delivers the trace once the daemon record lands late', async t => {
  const reports = new Map();
  const { powers } = makeMockPowersWithReports(reports);

  /** @type {Array<{ stack: string | undefined, workerId: string | undefined }>} */
  const delivered = [];
  const cancel = watchErrorTrace(
    powers,
    'error:daemon#1',
    resolved => delivered.push(resolved),
    { intervalMs: 5, attempts: 200 },
  );
  t.teardown(cancel);

  // Simulate the late `reportTrace`: the daemon files the record after a few
  // watch polls have already missed.
  await sleep(30);
  reports.set('error:daemon#1', {
    message: 'x',
    stack: 'Error: x\n    at eval (worker:1:7)',
    workerId: 'worker-abc',
  });

  for (let i = 0; i < 100 && delivered.length === 0; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(5);
  }

  t.is(delivered.length, 1, 'the watch delivered exactly once after it landed');
  t.is(
    delivered[0].stack,
    'Error: x\n    at eval (worker:1:7)',
    'stack delivered',
  );
  t.is(delivered[0].workerId, 'worker-abc', 'producing worker id delivered');
});

test('watchErrorTrace stops polling after cancel (no leaked watcher)', async t => {
  const reports = new Map();
  const { powers, lookupCount } = makeMockPowersWithReports(reports);

  /** @type {unknown[]} */
  const delivered = [];
  const cancel = watchErrorTrace(
    powers,
    'error:daemon#2',
    resolved => delivered.push(resolved),
    { intervalMs: 5, attempts: 200 },
  );

  // Let it poll a few times (all missing), then cancel — as the bubble's
  // dismissal (next command submitted) does.
  await sleep(30);
  const countAtCancel = lookupCount();
  t.true(countAtCancel >= 1, 'the watch polled while active');
  cancel();

  // Even if the record lands after cancellation, a cancelled watch must never
  // poll again nor deliver.
  await sleep(40);
  reports.set('error:daemon#2', { message: 'x', stack: 'S', workerId: 'w' });
  await sleep(40);

  t.is(lookupCount(), countAtCancel, 'no lookups after cancel');
  t.is(delivered.length, 0, 'no delivery after cancel');
});

test('watchErrorTrace gives up after a bounded number of misses', async t => {
  const reports = new Map();
  const { powers, lookupCount } = makeMockPowersWithReports(reports);

  const cancel = watchErrorTrace(powers, 'error:never', () => {}, {
    intervalMs: 3,
    attempts: 4,
  });
  t.teardown(cancel);

  await sleep(80);
  t.true(
    lookupCount() <= 4,
    'the watch stops after its attempt budget (no unbounded polling)',
  );
});
