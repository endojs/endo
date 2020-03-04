import tap from 'tap';
import { getGlobalIntrinsics } from '../src/intrinsics-global.js';
import { getCurrentRealmRec } from '../src/realm-rec.js';

const { test } = tap;

test('realmRec', t => {
  t.plan(4);

  // TODO mock realmRec module dependencies instead of mimicking them.
  const realmRec = getCurrentRealmRec();
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
