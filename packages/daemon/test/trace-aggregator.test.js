import assert from 'node:assert';
import test from '@endo/ses-ava/prepare-endo.js';

import { makeTraceAggregator } from '../src/trace-aggregator.js';

/** @import { TraceRecord, TraceCauseRef } from '../src/trace-aggregator.js' */

/**
 * @param {Partial<TraceRecord> & { errorId: string }} overrides
 * @returns {TraceRecord}
 */
const baseRecord = ({
  errorId,
  workerId = 'w1',
  message = 'boom',
  name = 'Error',
  causes = /** @type {TraceCauseRef[]} */ ([]),
  site = 'marshal',
  t = 0,
  stack = 'at line 1',
  annotations = /** @type {string[]} */ ([]),
}) => ({
  errorId,
  workerId,
  name,
  message,
  stack,
  annotations,
  causes,
  t,
  site,
});

test('record / lookup roundtrip', t => {
  const agg = makeTraceAggregator();
  agg.record('w1', baseRecord({ errorId: 'error:Endo#1', t: 1 }));
  const report = agg.lookup('error:Endo#1');
  assert(report);
  t.is(report.errorId, 'error:Endo#1');
  t.is(report.workerId, 'w1');
  t.is(report.message, 'boom');
  t.is(report.partial, false);
  t.deepEqual(report.causes, []);
});

test('record overwrites caller-supplied workerId with connection identity', t => {
  const agg = makeTraceAggregator();
  agg.record(
    'w-connection',
    baseRecord({ errorId: 'error:Endo#1', workerId: 'w-forged' }),
  );
  const report = agg.lookup('error:Endo#1');
  assert(report);
  t.is(report.workerId, 'w-connection');
});

test('alias makes a daemon-side errorId resolve to the worker record', t => {
  const agg = makeTraceAggregator();
  agg.record('w1', baseRecord({ errorId: 'error:Endo#1', message: 'inner' }));
  agg.alias({
    workerId: 'w1',
    errorId: 'error:Endo#1',
    aliasErrorId: 'error:captp:CLI#5',
  });
  const report = agg.lookup('error:captp:CLI#5');
  assert(report);
  t.is(report.message, 'inner');
  t.is(report.workerId, 'w1');
});

test('alias registered before its record still resolves once the record lands', t => {
  // The race the daemon must tolerate: the daemon forwards a worker error to a
  // client (minting the client-facing alias) BEFORE the worker's separate,
  // asynchronous `reportTrace` has delivered the record. Until the record
  // lands, the alias must resolve to nothing (no phantom trace); once it lands,
  // the same alias must resolve to it — otherwise the client can never recover
  // the stack no matter how long its error bubble watches.
  const agg = makeTraceAggregator();
  agg.alias({
    workerId: 'w1',
    errorId: 'error:Endo#1',
    aliasErrorId: 'error:captp:CLI#5',
  });
  // Record not yet present: lookup is undefined, not a phantom.
  t.is(agg.lookup('error:captp:CLI#5'), undefined);
  // The late `reportTrace` finally files the record...
  agg.record(
    'w1',
    baseRecord({ errorId: 'error:Endo#1', message: 'inner', stack: 'S' }),
  );
  // ...and the pre-registered alias now resolves to it (the old drop-on-absent
  // behavior left this permanently undefined — the reported bug).
  const report = agg.lookup('error:captp:CLI#5');
  assert(report);
  t.is(report.message, 'inner');
  t.is(report.workerId, 'w1');
  t.is(report.stack, 'S');
});

test('per-worker FIFO eviction by count', t => {
  const agg = makeTraceAggregator({ maxRecordsPerWorker: 3 });
  for (let i = 1; i <= 5; i += 1) {
    agg.record('w1', baseRecord({ errorId: `e${i}`, t: i }));
  }
  t.is(agg.lookup('e1'), undefined);
  t.is(agg.lookup('e2'), undefined);
  t.truthy(agg.lookup('e3'));
  t.truthy(agg.lookup('e4'));
  t.truthy(agg.lookup('e5'));
});

test('LRU eviction across workers', t => {
  const agg = makeTraceAggregator({ maxWorkers: 2 });
  agg.record('w1', baseRecord({ errorId: 'e1' }));
  agg.record('w2', baseRecord({ errorId: 'e2', workerId: 'w2' }));
  // Touching w1 should bump it.
  agg.record('w1', baseRecord({ errorId: 'e1b' }));
  agg.record('w3', baseRecord({ errorId: 'e3', workerId: 'w3' }));
  // w2 should have been evicted as the least-recently-used.
  t.is(agg.lookup('e2'), undefined);
  t.truthy(agg.lookup('e1'));
  t.truthy(agg.lookup('e1b'));
  t.truthy(agg.lookup('e3'));
});

test('byte-budget eviction trims oldest records', t => {
  const small = JSON.stringify(baseRecord({ errorId: 'e0' })).length + 32;
  const agg = makeTraceAggregator({ maxBytes: small * 2 });
  agg.record('w1', baseRecord({ errorId: 'e1' }));
  agg.record('w1', baseRecord({ errorId: 'e2' }));
  agg.record('w1', baseRecord({ errorId: 'e3' }));
  const stats = agg.stats();
  t.true(stats.bytes <= small * 2);
  // e1 should be evicted.
  t.is(agg.lookup('e1'), undefined);
});

test('lookup includes related entries from the same worker', t => {
  const agg = makeTraceAggregator();
  agg.record('w1', baseRecord({ errorId: 'inner', t: 1 }));
  agg.record(
    'w1',
    baseRecord({
      errorId: 'outer',
      t: 2,
      causes: [{ errorId: 'inner', name: 'Error', message: 'inner' }],
    }),
  );
  const report = agg.lookup('outer');
  assert(report);
  t.is(report.causes.length, 1);
  t.is(report.causes[0].errorId, 'inner');
  // related includes the cause as well as adjacent entries.
  t.true(report.related.length >= 1);
});

test('lookup marks partial when a cause is missing', t => {
  const agg = makeTraceAggregator();
  agg.record(
    'w1',
    baseRecord({
      errorId: 'outer',
      causes: [{ errorId: 'gone', name: 'Error', message: 'lost' }],
    }),
  );
  const report = agg.lookup('outer');
  assert(report);
  t.is(report.partial, true);
  t.is(report.causes[0].errorId, 'gone');
  t.is(report.causes[0].partial, true);
});

test('recent returns most recently inserted records first', t => {
  const agg = makeTraceAggregator();
  for (let i = 1; i <= 5; i += 1) {
    agg.record('w1', baseRecord({ errorId: `e${i}` }));
  }
  const list = agg.recent({ limit: 3 });
  t.is(list.length, 3);
  t.is(list[0].errorId, 'e5');
  t.is(list[2].errorId, 'e3');
});

test('recent filtered by workerId', t => {
  const agg = makeTraceAggregator();
  agg.record('w1', baseRecord({ errorId: 'e1' }));
  agg.record('w2', baseRecord({ errorId: 'e2', workerId: 'w2' }));
  agg.record('w1', baseRecord({ errorId: 'e3' }));
  const list = agg.recent({ workerId: 'w1' });
  t.is(list.length, 2);
  t.true(list.every(r => r.workerId === 'w1'));
});

test('clear empties the aggregate', t => {
  const agg = makeTraceAggregator();
  agg.record('w1', baseRecord({ errorId: 'e1' }));
  agg.alias({ workerId: 'w1', errorId: 'e1', aliasErrorId: 'a1' });
  agg.clear();
  t.is(agg.lookup('e1'), undefined);
  t.is(agg.lookup('a1'), undefined);
  t.deepEqual(agg.stats(), {
    workers: 0,
    totalRecords: 0,
    bytes: 0,
    aliases: 0,
  });
});

test('clear by workerId only removes that worker', t => {
  const agg = makeTraceAggregator();
  agg.record('w1', baseRecord({ errorId: 'e1' }));
  agg.record('w2', baseRecord({ errorId: 'e2', workerId: 'w2' }));
  agg.clear('w1');
  t.is(agg.lookup('e1'), undefined);
  t.truthy(agg.lookup('e2'));
});

test('record requires non-empty workerId', t => {
  const agg = makeTraceAggregator();
  t.throws(() => agg.record('', baseRecord({ errorId: 'e1' })), {
    message: /non-empty workerId/,
  });
});

test('record requires errorId', t => {
  const agg = makeTraceAggregator();
  t.throws(() => agg.record('w1', baseRecord({ errorId: '' })), {
    message: /errorId/,
  });
});

test('aliasByErrorId scans workers and registers an alias', t => {
  const agg = makeTraceAggregator();
  agg.record('w7', baseRecord({ errorId: 'inner', message: 'inner-msg' }));
  agg.aliasByErrorId('inner', 'cli:99');
  const report = agg.lookup('cli:99');
  assert(report);
  t.is(report.workerId, 'w7');
  t.is(report.message, 'inner-msg');
});

test('aliasByErrorId follows existing aliases', t => {
  const agg = makeTraceAggregator();
  agg.record('w1', baseRecord({ errorId: 'inner' }));
  agg.alias({ workerId: 'w1', errorId: 'inner', aliasErrorId: 'mid' });
  agg.aliasByErrorId('mid', 'outer');
  const report = agg.lookup('outer');
  assert(report);
  t.is(report.workerId, 'w1');
});

test('two workers may record under the same errorId without colliding', t => {
  const agg = makeTraceAggregator();
  agg.record('w1', baseRecord({ errorId: 'error:Endo#1', message: 'from-w1' }));
  agg.record(
    'w2',
    baseRecord({
      errorId: 'error:Endo#1',
      workerId: 'w2',
      message: 'from-w2',
    }),
  );
  // The naked lookup picks one (the first match); both records still
  // exist in the aggregate.
  agg.alias({
    workerId: 'w1',
    errorId: 'error:Endo#1',
    aliasErrorId: 'cli:1',
  });
  agg.alias({
    workerId: 'w2',
    errorId: 'error:Endo#1',
    aliasErrorId: 'cli:2',
  });
  const r1 = agg.lookup('cli:1');
  const r2 = agg.lookup('cli:2');
  assert(r1);
  assert(r2);
  t.is(r1.message, 'from-w1');
  t.is(r2.message, 'from-w2');
});
