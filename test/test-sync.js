import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava';
import { Far } from '@agoric/marshal';
import { E, makeCapTP, makeLoopback } from '../lib/captp';
import { nearSyncImpl } from '../lib/sync';

function createFarBootstrap(exportAsSyncable) {
  // Create a remotable that has a syncable return value.
  return Far('test sync', {
    getSyncable(n) {
      const syncable = exportAsSyncable(
        Far('getN', {
          getN() {
            return n;
          },
        }),
      );
      return syncable;
    },
  });
}

async function runSyncTests(t, Sync, bs) {
  // Demonstrate async compatibility of syncable.
  const pn = E(E(bs).getSyncable(3)).getN();
  t.is(Promise.resolve(pn), pn);
  t.is(await pn, 3);

  // Demonstrate Sync cannot be used on a promise.
  const ps = E(bs).getSyncable(4);
  t.throws(() => Sync(ps).getN(), {
    instanceOf: Error,
    message: /target cannot be a promise/,
  });

  // Demonstrate Sync used on a remotable.
  const s = await ps;
  t.is(Sync(s).getN(), 4);

  // Demonstrate Sync fails on an unmarked remotable.
  const b = await bs;
  t.throws(() => Sync(b).getSyncable(5), {
    instanceOf: Error,
    message: /imported target was not exportAsSyncable/,
  });
}

test('try loopback syncable', async t => {
  const { makeFar, Sync, exportAsSyncable } = makeLoopback('us');
  const bs = makeFar(createFarBootstrap(exportAsSyncable));

  await runSyncTests(t, Sync, bs);
});

test('try explicit syncable', async t => {
  const makeFarSyncImpl = implMethod => (slot, ...args) => {
    // Cross the boundary to pull out the far object.
    const body = JSON.stringify({
      '@qclass': 'slot',
      index: 0,
    });
    // eslint-disable-next-line no-use-before-define
    const far = farUnserialize({ body, slots: [slot] });
    return nearSyncImpl[implMethod](far, ...args);
  };

  let farDispatch;
  const { dispatch: nearDispatch, getBootstrap, Sync } = makeCapTP(
    'near',
    o => farDispatch(o),
    undefined,
    {
      syncImpl: {
        applyFunction: makeFarSyncImpl('applyFunction'),
        applyMethod: makeFarSyncImpl('applyMethod'),
        get: makeFarSyncImpl('get'),
        has: makeFarSyncImpl('has'),
      },
    },
  );
  const {
    dispatch,
    exportAsSyncable,
    unserialize: farUnserialize,
  } = makeCapTP('far', nearDispatch, () =>
    createFarBootstrap(exportAsSyncable),
  );
  farDispatch = dispatch;

  const bs = getBootstrap();
  await runSyncTests(t, Sync, bs);
});
