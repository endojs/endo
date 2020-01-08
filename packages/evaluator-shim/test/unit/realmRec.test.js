import tap from 'tap';
import { getGlobalIntrinsics } from '@agoric/intrinsics-global';
import { getCurrentRealmRec } from '../../src/realmRec.js';

const { test } = tap;

test('realmRec', t => {
  t.plan(4);

  // TODO mock realmRec module dependencies instead of mimicking them.
  const realmRec = getCurrentRealmRec();
  // eslint-disable-next-line no-new-func
  const intrinsics = getGlobalIntrinsics();

  t.equal(Object.getPrototypeOf(realmRec), null);
  t.ok(Object.isFrozen(realmRec));
  t.deepEqual(realmRec.intrinsics, intrinsics);

  const descs = Object.getOwnPropertyDescriptors(realmRec);
  t.deepEqual(descs, {
    intrinsics: {
      value: intrinsics,
      configurable: false,
      writable: false,
      enumerable: true, // not important, implementation-specific
    },
  });
});
