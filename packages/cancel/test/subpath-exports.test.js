import test from '@endo/ses-ava/prepare-endo.js';

import { makeCancelKit } from '../index.js';

// The `./abort` subpath aggregates `toAbortSignal` and `fromAbortSignal` so
// callers can convert in both directions without two imports. The README
// documents this form (`import { toAbortSignal, fromAbortSignal } from
// '@endo/cancel/abort'`). The standalone `to-abort` / `from-abort` shims are
// exercised by the main suite via direct imports; this file ensures the
// combined `abort` shim and the remaining single-symbol shims stay
// importable as published in package.json `exports`.

test('subpath ./abort re-exports toAbortSignal and fromAbortSignal', async t => {
  const mod = await import('../abort.js');
  t.is(typeof mod.toAbortSignal, 'function');
  t.is(typeof mod.fromAbortSignal, 'function');

  // Confirm the aggregated re-exports behave like the direct imports by
  // round-tripping a cancellation through both halves.
  const controller = new AbortController();
  const { cancelled, isCancelled } = mod.fromAbortSignal(controller.signal);
  t.is(isCancelled(), false);

  const signal = mod.toAbortSignal(cancelled, isCancelled);
  t.false(signal.aborted);

  controller.abort(Error('aggregate round-trip'));
  await Promise.resolve();
  t.is(isCancelled(), true);
  t.true(signal.aborted);
  t.is(signal.reason.message, 'aggregate round-trip');
});

test('subpath ./all-map re-exports allMap', async t => {
  const mod = await import('../all-map.js');
  t.is(typeof mod.allMap, 'function');
  const { cancelled: parentCancelled } = makeCancelKit();
  const result = await mod.allMap([1, 2], value => value + 10, parentCancelled);
  t.deepEqual(result, [11, 12]);
});

test('subpath ./any-map re-exports anyMap', async t => {
  const mod = await import('../any-map.js');
  t.is(typeof mod.anyMap, 'function');
  const result = await mod.anyMap([1], value => `got-${value}`);
  t.is(result, 'got-1');
});

test('subpath ./to-abort re-exports toAbortSignal', async t => {
  const mod = await import('../to-abort.js');
  t.is(typeof mod.toAbortSignal, 'function');
  const { cancelled } = makeCancelKit();
  const signal = mod.toAbortSignal(cancelled);
  t.true(signal instanceof AbortSignal);
});

test('subpath ./from-abort re-exports fromAbortSignal', async t => {
  const mod = await import('../from-abort.js');
  t.is(typeof mod.fromAbortSignal, 'function');
  const controller = new AbortController();
  const { isCancelled } = mod.fromAbortSignal(controller.signal);
  t.is(isCancelled(), false);
});

test('subpath ./delay re-exports delay backed by global setTimeout', async t => {
  const mod = await import('../delay.js');
  t.is(typeof mod.delay, 'function');
  const { cancelled: parentCancelled } = makeCancelKit();
  // The shim wires through to the platform setTimeout; a near-zero delay
  // exercises that wiring without slowing the suite.
  t.is(await mod.delay(0, parentCancelled), undefined);
});

test('subpath ./delay-lite re-exports makeDelay factory', async t => {
  const mod = await import('../delay-lite.js');
  t.is(typeof mod.makeDelay, 'function');
  // Confirm the factory yields a working delay when handed a synchronous
  // setTimeout-shaped callable.
  const customDelay = mod.makeDelay(globalThis.setTimeout);
  const { cancelled: parentCancelled } = makeCancelKit();
  t.is(await customDelay(0, parentCancelled), undefined);
});
