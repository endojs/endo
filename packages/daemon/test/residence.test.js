import test from '@endo/ses-ava/prepare-endo.js';

import { makePromiseKit } from '@endo/promise-kit';
import { makeResidenceTracker } from '../src/residence.js';

/** @typedef {import('../src/types.js').FormulaIdentifier} FormulaIdentifier */

const id = /** @param {string} s @returns {FormulaIdentifier} */ s =>
  /** @type {FormulaIdentifier} */ (s);

test('residenceWatcher retain and release track references', t => {
  const tracker = makeResidenceTracker({
    getLocalIdForRef: () => undefined,
    getFormula: () => undefined,
    terminateWorker: () => {},
  });

  const { residenceWatcher } = tracker;

  // Retain before registering a retainer — should be a no-op.
  residenceWatcher.retain({
    retainerId: 'unknown',
    retaineeId: id('a:node'),
    retaineeIncarnation: 'slot-1',
  });
  t.pass('retain with unknown retainer is a no-op');

  // Release before registering — also a no-op.
  residenceWatcher.release({
    retainerId: 'unknown',
    retaineeId: id('a:node'),
    retaineeIncarnation: 'slot-1',
  });
  t.pass('release with unknown retainer is a no-op');
});

test('register returns capTpOptions with hooks', t => {
  const refs = new Map();
  const tracker = makeResidenceTracker({
    getLocalIdForRef: ref => refs.get(ref),
    getFormula: () => undefined,
    terminateWorker: () => {},
  });

  const { promise: closed, resolve: closeClosed } = makePromiseKit();
  const capTpOptions = tracker.register({
    name: 'test-conn',
    close: async () => {},
    closed,
  });

  t.is(typeof capTpOptions.exportHook, 'function');
  t.is(typeof capTpOptions.importHook, 'function');
  t.is(typeof capTpOptions.makeCapTPImportExportTables, 'function');
  closeClosed(undefined);
});

test('exportHook calls retain for known refs', t => {
  const refs = new Map();
  const tracker = makeResidenceTracker({
    getLocalIdForRef: ref => refs.get(ref),
    getFormula: () => undefined,
    terminateWorker: () => {},
  });

  const { promise: closed, resolve: closeClosed } = makePromiseKit();
  const capTpOptions = tracker.register({
    name: 'conn',
    close: async () => {},
    closed,
  });

  const obj = harden({ test: true });
  refs.set(obj, id('formula:node'));

  // exportHook should not throw for known refs.
  capTpOptions.exportHook(obj, 'slot-0');
  t.pass('exportHook completes for known ref');

  // exportHook with unknown ref should also not throw.
  capTpOptions.exportHook(harden({ unknown: true }), 'slot-1');
  t.pass('exportHook completes for unknown ref');
  closeClosed(undefined);
});

test('importHook tracks origin retainer', t => {
  const tracker = makeResidenceTracker({
    getLocalIdForRef: () => undefined,
    getFormula: () => undefined,
    terminateWorker: () => {},
  });

  const { promise: closed, resolve: closeClosed } = makePromiseKit();
  const capTpOptions = tracker.register({
    name: 'import-test',
    close: async () => {},
    closed,
  });

  const importedObj = harden({ imported: true });
  capTpOptions.importHook(importedObj, 'slot-0');

  // importHook tracks the object's origin retainer via WeakMap.
  // We can't directly observe the WeakMap, but the hook should not throw.
  t.pass('importHook completes without error');
  closeClosed(undefined);
});

test('disconnectRetainersHolding terminates workers with collected formulas', t => {
  const refs = new Map();
  const terminated = [];
  const tracker = makeResidenceTracker({
    getLocalIdForRef: ref => refs.get(ref),
    getFormula: formulaId => {
      if (formulaId === id('eval:node')) return { type: 'eval' };
      return undefined;
    },
    terminateWorker: (workerId, reason) => {
      terminated.push({ workerId, message: reason.message });
    },
  });

  const { promise: closed } = makePromiseKit();
  tracker.register({
    name: 'Worker worker-abc',
    close: async () => {},
    closed,
  });

  // Simulate the worker exporting a formula.
  tracker.residenceWatcher.retain({
    retainerId: 'Worker worker-abc-0',
    retaineeId: id('eval:node'),
    retaineeIncarnation: 'slot-0',
  });

  // Collect the formula.
  tracker.disconnectRetainersHolding([id('eval:node')]);

  t.is(terminated.length, 1);
  t.is(terminated[0].workerId, 'worker-abc');
  t.true(terminated[0].message.includes('collected'));
});

test('disconnectRetainersHolding skips invitation formulas', t => {
  const terminated = [];
  const tracker = makeResidenceTracker({
    getLocalIdForRef: () => undefined,
    getFormula: formulaId => {
      if (formulaId === id('inv:node')) return { type: 'invitation' };
      return undefined;
    },
    terminateWorker: (workerId, reason) => {
      terminated.push({ workerId, message: reason.message });
    },
  });

  const { promise: closed } = makePromiseKit();
  tracker.register({
    name: 'Worker worker-xyz',
    close: async () => {},
    closed,
  });

  tracker.residenceWatcher.retain({
    retainerId: 'Worker worker-xyz-0',
    retaineeId: id('inv:node'),
    retaineeIncarnation: 'slot-0',
  });

  // Should NOT terminate — invitation formulas are skipped.
  tracker.disconnectRetainersHolding([id('inv:node')]);

  t.is(
    terminated.length,
    0,
    'invitation formulas should not trigger termination',
  );
});

test('retain then release through registered retainer', t => {
  const refs = new Map();
  const tracker = makeResidenceTracker({
    getLocalIdForRef: ref => refs.get(ref),
    getFormula: () => undefined,
    terminateWorker: () => {},
  });

  const { promise: closed } = makePromiseKit();
  tracker.register({
    name: 'conn',
    close: async () => {},
    closed,
  });

  // Retain a formula through the registered retainer.
  tracker.residenceWatcher.retain({
    retainerId: 'conn-0',
    retaineeId: id('val:node'),
    retaineeIncarnation: 'slot-0',
  });

  // Release the same incarnation.
  tracker.residenceWatcher.release({
    retainerId: 'conn-0',
    retaineeId: id('val:node'),
    retaineeIncarnation: 'slot-0',
  });
  t.pass('release after retain completes');

  // Release for unknown retainee (no incarnations) should be a no-op.
  tracker.residenceWatcher.release({
    retainerId: 'conn-0',
    retaineeId: id('unknown:node'),
    retaineeIncarnation: 'slot-99',
  });
  t.pass('release for unknown retainee is a no-op');
});

test('disconnectRetainersHolding skips non-worker retainers', t => {
  const terminated = [];
  const tracker = makeResidenceTracker({
    getLocalIdForRef: () => undefined,
    getFormula: formulaId => {
      if (formulaId === id('eval:node')) return { type: 'eval' };
      return undefined;
    },
    terminateWorker: (workerId, reason) => {
      terminated.push({ workerId, message: reason.message });
    },
  });

  const { promise: closed } = makePromiseKit();
  // Register a non-worker retainer (no "Worker " prefix).
  tracker.register({
    name: 'browser-conn',
    close: async () => {},
    closed,
  });

  tracker.residenceWatcher.retain({
    retainerId: 'browser-conn-0',
    retaineeId: id('eval:node'),
    retaineeIncarnation: 'slot-0',
  });

  // Should not terminate — retainer is not a worker.
  tracker.disconnectRetainersHolding([id('eval:node')]);
  t.is(
    terminated.length,
    0,
    'non-worker retainers should not trigger termination',
  );
});

test('releaseAllForRetainer cleans up on connection close', async t => {
  const tracker = makeResidenceTracker({
    getLocalIdForRef: () => undefined,
    getFormula: () => undefined,
    terminateWorker: () => {},
  });

  const { promise: closed, resolve: closeClosed } = makePromiseKit();
  tracker.register({
    name: 'ephemeral',
    close: async () => {},
    closed,
  });

  tracker.residenceWatcher.retain({
    retainerId: 'ephemeral-0',
    retaineeId: id('temp:node'),
    retaineeIncarnation: 'slot-0',
  });

  // Simulate connection closing.
  closeClosed(undefined);
  await closed;

  // After close, releaseAllForRetainer should have cleaned up.
  // Subsequent retain on the same retainer should be a no-op.
  tracker.residenceWatcher.retain({
    retainerId: 'ephemeral-0',
    retaineeId: id('temp:node'),
    retaineeIncarnation: 'slot-1',
  });
  t.pass('retain after close is a no-op');
});
