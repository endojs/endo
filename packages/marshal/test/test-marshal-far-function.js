import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { getInterfaceOf, passStyleOf, Far } from '@endo/pass-style';

const { freeze, setPrototypeOf } = Object;

test('Far functions', t => {
  t.notThrows(() => Far('arrow', a => a + 1), 'Far function');
  const arrow = Far('arrow', a => a + 1);
  t.is(passStyleOf(arrow), 'remotable');
  t.is(getInterfaceOf(arrow), 'Alleged: arrow');
});

test('Acceptable far functions', t => {
  t.is(passStyleOf(Far('asyncArrow', async a => a + 1)), 'remotable');
  // Even though concise methods start as methods, they can be
  // made into far functions *instead*.
  const concise = { doFoo() {} }.doFoo;
  t.is(passStyleOf(Far('concise', concise)), 'remotable');
});

test('Unacceptable far functions', t => {
  t.throws(
    () =>
      Far(
        'alreadyFrozen',
        freeze(a => a + 1),
      ),
    {
      message: /is already frozen/,
    },
  );
  t.throws(() => Far('keywordFunc', function keyword() {}), {
    message: /unexpected properties besides \.name and \.length/,
  });
});

test('Far functions cannot be methods', t => {
  const doFoo = Far('doFoo', a => a + 1);
  t.throws(
    () =>
      Far('badMethod', {
        doFoo,
      }),
    {
      message: /Remotables with non-methods/,
    },
  );
});

test('Data can contain far functions', t => {
  const arrow = Far('arrow', a => a + 1);
  t.is(passStyleOf(harden({ x: 8, foo: arrow })), 'copyRecord');
  const mightBeMethod = a => a + 1;
  t.throws(() => passStyleOf(freeze({ x: 8, foo: mightBeMethod })), {
    message: /Remotables with non-methods like "x" /,
  });
});

test('function without prototype', t => {
  const arrow = a => a;
  setPrototypeOf(arrow, null);
  t.throws(() => Far('arrow', arrow), {
    message: /must not inherit from null/,
  });
});
