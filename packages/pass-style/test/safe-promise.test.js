import test from '@endo/ses-ava/prepare-endo.js';

import { passStyleOf } from '../src/passStyleOf.js';

const { defineProperty } = Object;

const { toStringTag } = Symbol;

test('safe promise loophole', t => {
  {
    const p1 = Promise.resolve('p1');
    t.is(passStyleOf(harden(p1)), 'promise');
    t.is(p1[toStringTag], 'Promise');
    t.is(`${p1}`, '[object Promise]');
  }

  {
    const p2 = Promise.resolve('p2');
    // @ts-expect-error intentional
    p2.silly = 'silly own property';
    t.throws(() => passStyleOf(harden(p2)), {
      message:
        '"[Promise]" - Must not have any string-named own properties: ["silly"]',
    });
    t.is(p2[toStringTag], 'Promise');
    t.is(`${p2}`, '[object Promise]');
  }

  {
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
  }

  {
    const p4 = Promise.resolve('p4');
    defineProperty(p4, toStringTag, {
      value: 'Promise p4',
      enumerable: true,
    });
    t.is(passStyleOf(harden(p4)), 'promise');

    const p5 = Promise.resolve('p5');
    defineProperty(p5, toStringTag, {
      value: 'Promise p5',
    });
    t.is(passStyleOf(harden(p5)), 'promise');
    t.is(p5[toStringTag], 'Promise p5');
    t.is(`${p5}`, '[object Promise p5]');
  }
});
