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

test('provideExport rejects non-export and promise arguments', t => {
  const noop = () => {};
  const captp = makeCapTP('lonely', noop, undefined);
  t.throws(() => captp.provideExport('o-1', Far('X', {})), {
    message: /can only reconstruct exports/,
  });
  t.throws(() => captp.provideExport('p+1', Far('X', {})), {
    message: /can only reconstruct object exports/,
  });
  t.throws(() => captp.provideExport('o+1', Promise.resolve()), {
    message: /cannot reconstruct a promise/,
  });
});
