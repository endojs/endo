// @ts-check
/* global globalThis */
import test from '@endo/ses-ava/prepare-endo.js';

import { Far } from '@endo/marshal';
import { E, makeLoopback } from '../src/loopback.js';

test('exportHook', async t => {
  await null;
  const exports = [];

  const { makeFar } = makeLoopback('us', {
    exportHook: (val, slot) => {
      // console.log('exporting', val, 'as', slot);
      exports.push({ val, slot });
    },
  });
  const bs = makeFar(
    Far('echoer', {
      echo: (...args) => args,
    }),
  );

  // Prime the pump.
  t.deepEqual(await E(bs).echo(), [], 'echoed');
  t.is(exports.length, 1, 'loopback metaprotocol');
  exports.splice(0);

  const expect = async (expectedExports, ...args) => {
    const ret = await E(bs).echo(...args);
    t.deepEqual(ret, args, 'arguments were echoed');
    t.deepEqual(exports, expectedExports);
    exports.splice(0);
    return ret;
  };

  await expect([], 1, 2, { foo: `I'm just data` });

  const pr = Promise.resolve('pr');
  const [roundPr] = await expect([{ val: pr, slot: 'p+1' }], pr);
  t.is(roundPr, pr);

  const pr2 = new globalThis.HandledPromise(() => {});
  const far = Far('far', {});

  const [
    {
      a: [{ pr2: roundPr2 }],
      b: roundPrAgain,
      c: { far: roundFar },
    },
  ] = await expect(
    [
      { val: pr2, slot: 'p+2' },
      { val: far, slot: 'o+2' },
    ],
    {
      a: [{ pr2 }],
      b: pr,
      c: { far },
    },
  );
  t.is(roundPr2, pr2);
  t.is(roundPrAgain, pr);
  t.is(roundFar, far);

  // Trigger the hook to throw.
  harden(exports);
  // @ts-ignore `isFake` purposely omitted from type
  if (!harden.isFake) {
    await t.throwsAsync(() => E(bs).echo(Promise.resolve('never exported')), {
      message: /.*object is not extensible/,
    });
  }
  t.deepEqual(exports, []);
});
