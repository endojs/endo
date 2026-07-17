/* global setTimeout */
import test from '@endo/ses-ava/test.js';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makeCapTP } from '../src/index.js';

test('provideExport rebinds exports after local restart', async t => {
  // The "worker" side lives for the whole test, like a peer restored
  // from a heap snapshot that still holds presences for our exports.
  /** @type {(obj: any) => void} */
  let sendToCurrentLocal;
  /** @type {any} */
  let remoteHeld;
  const remoteBoot = Far('RemoteBoot', {
    hold: presence => {
      remoteHeld = presence;
    },
    pokeHeld: () => E(remoteHeld).poke(),
    echoHeld: () => remoteHeld,
  });
  const remote = makeCapTP(
    'remote',
    obj => sendToCurrentLocal(obj),
    remoteBoot,
  );

  // First local incarnation exports a capability to the remote and
  // records its slot, as a persistent host would.
  /** @type {Map<any, string>} */
  const exportedValToSlot = new Map();
  const thing1 = Far('Thing', { poke: () => 'poked by incarnation 1' });
  const local1 = makeCapTP('local1', obj => remote.dispatch(obj), undefined, {
    exportHook: (val, slot) => {
      exportedValToSlot.set(val, slot);
    },
  });
  sendToCurrentLocal = local1.dispatch;

  const boot1 = local1.getBootstrap();
  await E(boot1).hold(thing1);
  t.is(await E(boot1).pokeHeld(), 'poked by incarnation 1');

  const thingSlot = /** @type {string} */ (exportedValToSlot.get(thing1));
  t.truthy(thingSlot);

  // Simulate a crash of the local side (no CTP_DISCONNECT), then rebind
  // a re-instantiated export at the recorded slot.
  const thing2 = Far('Thing', { poke: () => 'poked by incarnation 2' });
  const local2 = makeCapTP('local2', obj => remote.dispatch(obj), undefined);
  sendToCurrentLocal = local2.dispatch;
  t.is(local2.provideExport(thingSlot, thing2), thing2);

  // The presence the remote kept across our restart reaches the new
  // incarnation of the export.
  const boot2 = local2.getBootstrap();
  t.is(await E(boot2).pokeHeld(), 'poked by incarnation 2');

  // Identity: the remote passing the presence back unwraps to the
  // re-instantiated export.
  t.is(await E(boot2).echoHeld(), thing2);

  // Idempotent for the same pair; rebinding elsewhere is an error.
  t.is(local2.provideExport(thingSlot, thing2), thing2);
  t.throws(() => local2.provideExport(thingSlot, Far('Thing', {})), {
    message: /already bound to another export/,
  });
  t.throws(() => local2.provideExport('o+999', thing2), {
    message: /already exported as/,
  });
});

test('provideExport rebinds promise exports with a live resolution subscription', async t => {
  /** @type {(obj: any) => void} */
  let sendToCurrentLocal;
  /** @type {any} */
  let remoteHeld;
  /** @type {any} */
  let remoteSaw;
  const remoteBoot = Far('RemoteBoot', {
    hold: promise => {
      remoteHeld = promise;
      remoteHeld.then(value => {
        remoteSaw = value;
      });
    },
  });
  const remote = makeCapTP(
    'remote',
    obj => sendToCurrentLocal(obj),
    remoteBoot,
  );

  // First local incarnation exports an unresolved promise and records
  // its slot.
  /** @type {Map<any, string>} */
  const exportedValToSlot = new Map();
  const local1 = makeCapTP('local1', obj => remote.dispatch(obj), undefined, {
    exportHook: (val, slot) => {
      exportedValToSlot.set(val, slot);
    },
  });
  sendToCurrentLocal = local1.dispatch;
  const never = new Promise(() => {});
  await E(local1.getBootstrap()).hold(never);
  const promiseSlot = /** @type {string} */ (exportedValToSlot.get(never));
  t.truthy(promiseSlot);
  t.is(promiseSlot[0], 'p');

  // Crash the local side; rebind a fresh promise at the recorded slot.
  /** @type {(value: string) => void} */
  let release = () => {};
  const replacement = new Promise(resolve => {
    release = resolve;
  });
  const local2 = makeCapTP('local2', obj => remote.dispatch(obj), undefined);
  sendToCurrentLocal = local2.dispatch;
  t.is(local2.provideExport(promiseSlot, replacement), replacement);

  // Resolving the rebound promise reaches the import the remote kept
  // across our restart.
  release('made it across');
  await replacement;
  for (let i = 0; remoteSaw === undefined && i < 100; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  t.is(remoteSaw, 'made it across');
});

test('provideExport rejects non-export and mismatched arguments', t => {
  const noop = () => {};
  const captp = makeCapTP('lonely', noop, undefined);
  t.throws(() => captp.provideExport('o-1', Far('X', {})), {
    message: /can only reconstruct exports/,
  });
  t.throws(() => captp.provideExport('q+1', Far('X', {})), {
    message: /can only reconstruct object or promise exports/,
  });
  t.throws(() => captp.provideExport('p+1', Far('X', {})), {
    message: /requires a promise/,
  });
  t.throws(() => captp.provideExport('o+1', Promise.resolve()), {
    message: /cannot take a promise/,
  });
});
