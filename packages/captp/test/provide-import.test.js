import test from '@endo/ses-ava/test.js';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makeCapTP } from '../src/index.js';

test('provideImport reconstructs imports after local restart', async t => {
  // The "worker" side lives for the whole test, like a peer restored from
  // a heap snapshot whose CapTP tables persist across our restarts.
  let count = 0;
  const thing = Far('Thing', {
    incr: () => {
      count += 1;
      return count;
    },
  });
  const boot = Far('Boot', {
    getThing: () => thing,
    isThing: specimen => specimen === thing,
  });

  /** @type {(obj: any) => void} */
  let sendToCurrentLocal;
  const remote = makeCapTP('remote', obj => sendToCurrentLocal(obj), boot);

  // First local incarnation records the slots of its imports, as a
  // persistent host would.
  /** @type {Map<any, string>} */
  const valToSlot = new Map();
  const local1 = makeCapTP('local1', obj => remote.dispatch(obj), undefined, {
    importHook: (val, slot) => {
      valToSlot.set(val, slot);
    },
  });
  sendToCurrentLocal = local1.dispatch;

  const boot1 = local1.getBootstrap();
  const thing1 = await E(boot1).getThing();
  t.is(await E(thing1).incr(), 1);

  const thingSlot = /** @type {string} */ (valToSlot.get(thing1));
  const bootSlot = /** @type {string} */ (valToSlot.get(await boot1));
  t.truthy(thingSlot);
  t.truthy(bootSlot);

  // Simulate a crash of the local side: no CTP_DISCONNECT is sent, so the
  // remote's tables (its "snapshot") still hold the exports.
  const local2 = makeCapTP('local2', obj => remote.dispatch(obj), undefined);
  sendToCurrentLocal = local2.dispatch;

  const thing2 = local2.provideImport(thingSlot, 'Alleged: Thing');
  const boot2 = local2.provideImport(bootSlot, 'Alleged: Boot');

  // State continuity: the remote counter kept its value.
  t.is(await E(thing2).incr(), 2);

  // Identity continuity: passing the reconstructed presence back to the
  // remote unwraps to the original object.
  t.is(await E(boot2).isThing(thing2), true);

  // Idempotency: reconstructing the same slot yields the same presence.
  t.is(local2.provideImport(thingSlot, 'Alleged: Thing'), thing2);
});

test('provideImport rejects non-import slots', t => {
  const noop = () => {};
  const captp = makeCapTP('lonely', noop, undefined);
  t.throws(() => captp.provideImport('o+1'), {
    message: /can only reconstruct imports/,
  });
});
