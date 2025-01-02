// Uses 'ava' rather than @endo/ses-ava to avoid worries about cyclic
// dependencies. We will need similar tests is higher level packages, in order
// to test compat with ses and ses-ava.
import test from 'ava';
import '../shim.js';

const { freeze, isFrozen } = Object;

test('non-trapping-pony', async t => {
  const specimen = { foo: 8 };

  const sillyHandler = freeze({
    get(target, prop, receiver) {
      return [target, prop, receiver];
    },
  });

  const safeProxy = new Proxy(specimen, sillyHandler);

  t.false(Reflect.isNonTrapping(specimen));
  t.false(isFrozen(specimen));
  t.deepEqual(safeProxy.foo, [specimen, 'foo', safeProxy]);

  t.true(Reflect.suppressTrapping(specimen));

  t.true(Reflect.isNonTrapping(specimen));
  t.true(isFrozen(specimen));
  t.deepEqual(safeProxy.foo, 8);
});
