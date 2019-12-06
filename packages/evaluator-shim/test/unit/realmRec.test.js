import test from 'tape';
import { getCurrentRealmRec } from '../../src/realmRec';
import { createIntrinsics } from '../../src/intrinsics';

test('realmRec', t => {
  t.plan(4);

  // TODO mock realmRec module dependencies instead of mimicking them.
  const realmRec = getCurrentRealmRec();
  // eslint-disable-next-line no-new-func
  const intrinsics = createIntrinsics();

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
