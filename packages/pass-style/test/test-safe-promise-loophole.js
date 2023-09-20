import { test } from './prepare-test-env-ava.js';

import { passStyleOf } from '../src/passStyleOf.js';

const { getOwnPropertyDescriptor, defineProperty } = Object;

const { toStringTag } = Symbol;

test('safe promise loophole', t => {
  const p1 = Promise.resolve('p1');
  t.is(passStyleOf(harden(p1)), 'promise');
  t.is(p1[toStringTag], 'Promise');
  t.is(`${p1}`, '[object Promise]');

  const p2 = Promise.resolve('p2');
  p2.silly = 'silly own property';
  t.throws(() => passStyleOf(harden(p2)), {
    message: '"[Promise]" - Must not have any own properties: ["silly"]',
  });
  t.is(p2[toStringTag], 'Promise');
  t.is(`${p2}`, '[object Promise]');

  const p3 = Promise.resolve('p3');
  t.throws(
    () => {
      p3[toStringTag] = 3;
    },
    {
      // Override mistake
      message:
        "Cannot assign to read only property 'Symbol(Symbol.toStringTag)' of object '[object Promise]'",
    },
  );
  defineProperty(p3, toStringTag, {
    value: 3,
  });
  t.is(passStyleOf(harden(p3)), 'promise');
  t.is(p3[toStringTag], 3);
  t.is(`${p3}`, '[object Object]');

  const p4 = Promise.resolve('p4');
  defineProperty(p4, toStringTag, {
    get: reveal => (reveal ? 'I am p4' : 4),
  });
  t.is(passStyleOf(harden(p4)), 'promise');
  t.is(p4[toStringTag], 4);
  t.is(`${p4}`, '[object Object]');
  const getter = getOwnPropertyDescriptor(p4, toStringTag).get;
  t.is(getter(true), 'I am p4');
});
