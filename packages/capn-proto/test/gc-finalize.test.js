// @ts-nocheck
/* global setTimeout */
/**
 * GC-driven Release: when an imported `Presence` becomes unreachable on the
 * near side, the FinalizationRegistry inside the import table should fire a
 * `Release` to the far side. After GC settles, the far peer's export table
 * for that id has shrunk.
 *
 * This test forces GC explicitly via `--expose_gc` (or
 * `v8.setFlagsFromString`) and waits a few timer ticks (not microtasks) for
 * the FinalizationRegistry to dispatch the finalizer — finalizers do not
 * reliably run before microtask drains on V8.
 */

import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeLoopback } from '../src/index.js';
import { detectEngineGC } from './engine-gc.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

test('imported Presence collection triggers a Release on the far side', async t => {
  const gc = await detectEngineGC();
  const inner = makeExo('inner', undefined, {
    name() {
      return 'inner';
    },
  });
  const root = makeExo('root', undefined, {
    getInner() {
      return inner;
    },
  });
  const { near, far, registerInterface } = makeLoopback({
    farBootstrap: root,
  });
  registerInterface({ id: 0xfa11n, methods: { getInner: 0, name: 1 } });
  const remote = near.getBootstrap();

  // Acquire a Presence for `inner`, then promptly drop it.
  let importedInner = await E(remote).getInner();
  // Confirm the export is live on far.
  const beforeExports = far.stats().exports;
  t.true(beforeExports >= 1, 'far exported `inner` while we held it');

  // Drop the only reference so the FinalizationRegistry can collect.
  importedInner = undefined;
  void importedInner;

  // Best-effort: a few rounds of GC + timer ticks so the registry's
  // finalizer can run, the Release message is sent, and far's handleRelease
  // updates its export table. Microtasks alone are insufficient — the
  // FinalizationRegistry callback is dispatched on a separate task.
  for (let i = 0; i < 20; i += 1) {
    gc();
    // eslint-disable-next-line no-await-in-loop
    await sleep(5);
  }

  const afterExports = far.stats().exports;
  // We expect at least one export (the bootstrap root) to remain. The inner
  // export should be gone. Either the count strictly decreased or far has
  // dropped to just its bootstrap root export.
  t.true(
    afterExports < beforeExports,
    `far's export table shrank after GC (was ${beforeExports}, now ${afterExports})`,
  );
});
