// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava.js';

import { Far } from '../src/marshal.js';
import { getInterfaceOf, passStyleOf } from '../src/passStyleOf.js';

const { freeze } = Object;

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
