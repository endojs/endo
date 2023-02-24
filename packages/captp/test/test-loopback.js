/* global setTimeout */
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { Far } from '@endo/marshal';
import { E, makeLoopback } from '../src/loopback.js';

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

  const { makeFar, isOnlyFar, isOnlyNear } = makeLoopback('dean');
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
  t.assert(isOnlyNear(objNear));

  // Mark obj as far.
  const obj = await makeFar(objNear);
  t.assert(isOnlyFar(obj));
  t.assert(!isOnlyNear(obj));

  const ret = await E(E.get(obj).encourager).encourage('buddy');
  t.assert(isOnlyFar(ret));
  t.assert(!isOnlyNear(ret));
  const { comment, bang } = ret;
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
