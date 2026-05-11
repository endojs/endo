import test from '@endo/ses-ava/test.js';

import { makeSelector, getSelectorName } from '../src/selector.js';

test('makeSelector creates a symbol', t => {
  const sel = makeSelector('foo');
  t.is(typeof sel, 'symbol');
});

test('makeSelector round-trips through getSelectorName', t => {
  const sel = makeSelector('myMethod');
  t.is(getSelectorName(sel), 'myMethod');
});

test('makeSelector rejects @@ prefix', t => {
  t.throws(() => makeSelector('@@toPrimitive'), {
    message: /reserved for well-known symbols/,
  });
});

test('getSelectorName rejects non-symbol', t => {
  t.throws(() => getSelectorName(/** @type {any} */ ('not-a-symbol')), {
    message: /Expected symbol/,
  });
});

test('getSelectorName rejects non-passable symbol', t => {
  // A locally-created symbol that is not registered via Symbol.for()
  // is not passable.
  const local = Symbol('localOnly');
  t.throws(() => getSelectorName(local), {
    message: /not a passable symbol/,
  });
});

test('getSelectorName rejects well-known symbols (@@)', t => {
  // Well-known symbols like Symbol.iterator have passable name @@iterator
  t.throws(() => getSelectorName(Symbol.iterator), {
    message: /reserved for well-known symbols/,
  });
});
