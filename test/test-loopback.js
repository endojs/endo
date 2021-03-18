/* global setTimeout */
import '@agoric/install-ses';
import { Far } from '@agoric/marshal';
import test from 'ava';
import { E, makeLoopback } from '../lib/captp';

test('try loopback captp', async t => {
  const pr = {};
  pr.p = new Promise((resolve, reject) => {
    pr.res = resolve;
    pr.rej = reject;
  });

  const syncHandle = Far('iface', {});
  const syncAccess = Far('syncAccess', {
    checkHandle(hnd) {
      // console.log('check', hnd, oobHandle);
      return hnd === syncHandle;
    },
    getHandleP() {
      return Promise.resolve(syncHandle);
    },
    getHandle() {
      return syncHandle;
    },
  });

  const { makeFar } = makeLoopback('dean');
  const objNear = harden({
    promise: pr.p,
    syncAccess,
    encourager: Far('encourager', {
      encourage(name) {
        const bang = new Promise(resolve => {
          setTimeout(
            () =>
              resolve(
                Far('triggerObj', {
                  trigger() {
                    return `${name} BANG!`;
                  },
                }),
              ),
            200,
          );
        });
        return { comment: `good work, ${name}`, bang };
      },
    }),
  });

  // Mark obj as far.
  const obj = makeFar(objNear);

  const { comment, bang } = await E(E.get(obj).encourager).encourage('buddy');
  t.is(comment, 'good work, buddy', 'got encouragement');
  t.is(await E(bang).trigger(), 'buddy BANG!', 'called on promise');
  pr.res('resolution');
  t.is(await E.get(obj).promise, 'resolution', 'get resolution');

  const asyncAccess = E.get(obj).syncAccess;
  t.is(
    await E(asyncAccess).checkHandle(syncHandle),
    false,
    'sync handle fails inband',
  );

  const sa = makeFar(syncAccess);

  const asyncHandle = await E(asyncAccess).getHandle();
  // console.log('handle', ibHandle);
  t.is(
    await E(asyncAccess).checkHandle(asyncHandle),
    true,
    'async handle succeeds inband',
  );
  t.is(
    await E(sa).checkHandle(asyncHandle),
    true,
    'async handle succeeds out-of-band',
  );

  const oobHandleP = await E(sa).getHandleP();
  t.assert(
    await E(sa).checkHandle(oobHandleP),
    'out-of-band handle promise succeeds out-of-band',
  );
  t.assert(
    await E(asyncAccess).checkHandle(oobHandleP),
    'out-of-band handle promise succeeds inband',
  );
});
