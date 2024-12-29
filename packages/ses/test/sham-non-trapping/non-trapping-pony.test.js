// Uses 'ava' rather than @endo/ses-ava to avoid worries about cyclic
// dependencies. We will need similar tests is higher level packages, in order
// to test compat with ses and ses-ava.
import test from 'ava';
import {
  ReflectPlus,
  ProxyPlus,
} from '../../src/sham-non-trapping/non-trapping-pony.js';

const { freeze, isFrozen } = Object;

test('non-trapping-pony', async t => {
  const specimen = { foo: 8 };

  const sillyHandler = freeze({
    get(target, prop, receiver) {
      return [target, prop, receiver];
    },
  });

  const safeProxy = new ProxyPlus(specimen, sillyHandler);

  t.false(ReflectPlus.isNonTrapping(specimen));
  t.false(isFrozen(specimen));
  t.deepEqual(safeProxy.foo, [specimen, 'foo', safeProxy]);

  t.true(ReflectPlus.suppressTrapping(specimen));

  t.true(ReflectPlus.isNonTrapping(specimen));
  t.true(isFrozen(specimen));
  t.deepEqual(safeProxy.foo, 8);
});
