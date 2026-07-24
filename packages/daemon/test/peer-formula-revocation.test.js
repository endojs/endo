// @ts-nocheck
// Tests for Option A: peer formula context cancellation on connection loss.
//
// Option A changes the dispose callback in `makePeer` from:
//   dropLiveValue(context.id)
// to:
//   context.cancel(new Error('peer connection lost'))
//
// This ensures that any connection loss cascades via `thisDiesIfThatDies`
// to all dependent remote presences, revoking them.  The next use of any
// remote presence reincarnates the peer formula and re-dials from scratch.
//
// These tests verify the lifecycle contract at the level of the context and
// remote-control primitives, without spinning up a full daemon.

import test from '@endo/ses-ava/prepare-endo.js';

import harden from '@endo/harden';
import { makePromiseKit as _makePromiseKit } from '@endo/promise-kit';

import { makeContextMaker } from '../src/context.js';
import { makeRemoteControlProvider } from '../src/remote-control.js';

/** @import { PromiseKit } from '@endo/promise-kit' */

/** @type {<T = never>() => PromiseKit<T>} */
const makePromiseKit = _makePromiseKit;

/** @typedef {import('../src/types.js').FormulaIdentifier} FormulaIdentifier */

const id = /** @param {string} s @returns {FormulaIdentifier} */ s =>
  /** @type {FormulaIdentifier} */ (s);

/**
 * Build a minimal context maker wired up to the real context implementation.
 * Returns a `makeContext` factory and the shared `controllerForId` map.
 */
const setupContextMaker = () => {
  /** @type {Map<FormulaIdentifier, { context: any }>} */
  const controllerForId = new Map();
  const formulaTypes = new Map();

  const makeContext = makeContextMaker({
    controllerForId,
    provideController: formulaId => {
      let controller = controllerForId.get(formulaId);
      if (!controller) {
        const ctx = makeContext(formulaId);
        controller = { context: ctx };
        controllerForId.set(formulaId, controller);
      }
      return controller;
    },
    getFormulaType: formulaId => formulaTypes.get(formulaId),
  });

  /**
   * @param {FormulaIdentifier} formulaId
   * @param {string} [type]
   */
  const createContext = (formulaId, type = 'test') => {
    formulaTypes.set(formulaId, type);
    const ctx = makeContext(formulaId);
    controllerForId.set(formulaId, { context: ctx });
    return ctx;
  };

  return { createContext, controllerForId };
};

// ---------------------------------------------------------------------------
// Test 1: connection dispose triggers context.cancel on the peer formula.
//
// Simulates the Option A dispose callback shape:
//   () => { context.cancel(new Error('peer connection lost')); }
// The peer formula's `cancelled` promise must reject with that error.
// ---------------------------------------------------------------------------
test('connection dispose cancels the peer formula context', async t => {
  t.timeout(5000);
  const { createContext } = setupContextMaker();
  const peerFormulaId = id('peer:local');
  const peerContext = createContext(peerFormulaId, 'peer');

  // Simulate the Option A dispose callback.
  const disposeCallback = () => {
    peerContext.cancel(new Error('peer connection lost'));
  };

  // Verify the context is alive before dispose.
  let isCancelled = false;
  peerContext.cancelled.catch(() => {
    isCancelled = true;
  });

  // Fire the dispose callback (mimicking what remote-control does on loss).
  disposeCallback();

  // Wait for microtask queue to drain.
  await Promise.resolve();

  t.true(isCancelled, 'peer formula context must be cancelled after dispose');
  await t.throwsAsync(() => peerContext.cancelled, {
    message: 'peer connection lost',
  });
});

// ---------------------------------------------------------------------------
// Test 2: cancelling the peer formula cascades via thisDiesIfThatDies
// to all dependent remote presences.
//
// `evaluateFormulaForId` registers remote formulas with:
//   context.thisDiesIfThatDies(peerId)
// so when the peer formula is cancelled, every remote presence is revoked.
// ---------------------------------------------------------------------------
test('peer formula cancellation cascades to dependent remote presences', async t => {
  t.timeout(5000);
  const { createContext } = setupContextMaker();

  const peerFormulaId = id('peer:local');
  const peerContext = createContext(peerFormulaId, 'peer');

  // Two remote presences that depend on the peer formula.
  const remotePresence1Id = id('rp1:local');
  const remotePresence2Id = id('rp2:local');
  const rp1Context = createContext(remotePresence1Id, 'remote-slot');
  const rp2Context = createContext(remotePresence2Id, 'remote-slot');

  // Wire dependencies: each remote presence dies if the peer formula dies.
  // This matches evaluateFormulaForId: context.thisDiesIfThatDies(peerId).
  rp1Context.thisDiesIfThatDies(peerFormulaId);
  rp2Context.thisDiesIfThatDies(peerFormulaId);

  // Option A dispose callback: cancel the peer formula's context.
  // The cancel call itself is synchronous in its initial effects;
  // cascade via thatDiesIfThisDies is also synchronous.
  peerContext.cancel(new Error('peer connection lost'));

  // Both remote presences must be revoked with the same error.
  // The cascade is synchronous in the context implementation (cancel
  // iterates dependents and calls their cancel immediately), so the
  // cancelled promises are already rejected at this point.
  await t.throwsAsync(() => rp1Context.cancelled, {
    message: 'peer connection lost',
  });
  await t.throwsAsync(() => rp2Context.cancelled, {
    message: 'peer connection lost',
  });
});

// ---------------------------------------------------------------------------
// Test 3: prior behavior (dropLiveValue only) did NOT cancel remote presences.
//
// This is a regression-evidence test: it demonstrates the exact failure mode
// that Option A fixes.  Without context.cancel, `thisDiesIfThatDies` never
// fires, so remote presences remain live after connection loss.
// ---------------------------------------------------------------------------
test('regression evidence: dropLiveValue alone does not cancel remote presences', async t => {
  t.timeout(5000);
  const { createContext, controllerForId } = setupContextMaker();

  const peerFormulaId = id('peer:regression');
  // peerContext is intentionally not captured: the regression test only needs
  // the formula to be registered in the context map so that thisDiesIfThatDies
  // can find it.  The returned context is not exercised directly.
  createContext(peerFormulaId, 'peer');

  const remotePresenceId = id('rp:regression');
  const rpContext = createContext(remotePresenceId, 'remote-slot');

  rpContext.thisDiesIfThatDies(peerFormulaId);

  // Old dispose callback: only dropLiveValue (remove from cache, no cancel).
  const oldDisposeCallback = () => {
    controllerForId.delete(peerFormulaId);
  };

  oldDisposeCallback();

  // The remote presence context must NOT be cancelled by dropLiveValue alone.
  // We race its `cancelled` promise against a short delay; it should stay
  // pending.
  const raceResult = await Promise.race([
    rpContext.cancelled.then(() => 'resolved').catch(() => 'rejected'),
    new Promise(resolve => setTimeout(resolve, 50)).then(() => 'pending'),
  ]);
  t.is(
    raceResult,
    'pending',
    'remote presence must remain live after dropLiveValue alone (pre-Option-A behavior)',
  );
});

// ---------------------------------------------------------------------------
// Test 4: remote-control dispose callback integration.
//
// The dispose callback is called by the remote-control state machine after
// the connection's `cancelled` promise rejects (via `.then(currentDispose)` in
// remote-control.js).  This test wires together the remote-control and the
// Option A dispose callback to verify end-to-end cascade.
// ---------------------------------------------------------------------------
test('remote-control dispose triggers peer formula cancellation and cascades', async t => {
  t.timeout(5000);
  const { createContext } = setupContextMaker();

  const peerFormulaId = id('peer:rc-test');
  const peerContext = createContext(peerFormulaId, 'peer');

  const remotePresenceId = id('rp:rc-test');
  const rpContext = createContext(remotePresenceId, 'remote-slot');
  rpContext.thisDiesIfThatDies(peerFormulaId);

  // Option A dispose callback (what makePeer installs via remoteControl.connect).
  const disposeCallback = () => {
    peerContext.cancel(new Error('peer connection lost'));
  };

  const provideRemoteControl = makeRemoteControlProvider('local-node');
  const remoteControl = provideRemoteControl('remote-node');

  const { promise: connCancelled, reject: cancelConn } = makePromiseKit();

  // A minimal fake gateway stub (the returned value is not exercised in
  // this test; we only care that the dispose callback fires on cancel).
  const fakeGateway = harden({});

  // Install the dispose callback via remoteControl.connect.
  remoteControl.connect(
    () => fakeGateway,
    cancelConn,
    connCancelled,
    disposeCallback,
  );

  // Simulate connection loss by cancelling the connection.
  cancelConn(new Error('QUIC connection closed'));

  // The remote-control calls disposeCallback after connCancelled rejects.
  // The dispose is chained via `.then(currentDispose)` in remote-control.js
  // so it fires asynchronously in the next microtask turn.
  // Awaiting a short Promise.resolve() chain is sufficient to drain it.
  await Promise.resolve();
  await Promise.resolve();

  await t.throwsAsync(() => rpContext.cancelled, {
    message: 'peer connection lost',
  });
  await t.throwsAsync(() => peerContext.cancelled, {
    message: 'peer connection lost',
  });
});
