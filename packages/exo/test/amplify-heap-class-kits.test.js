// modeled on test-heap-classes.js
import test from '@endo/ses-ava/prepare-endo.js';

import { M } from '@endo/patterns';
import { defineExoClass, defineExoClassKit } from '../src/exo-makers.js';

const UpCounterI = M.interface('UpCounter', {
  incr: M.call().optional(M.gte(0)).returns(M.number()),
});

const DownCounterI = M.interface('DownCounter', {
  decr: M.call().optional(M.gte(0)).returns(M.number()),
});

test('test amplify defineExoClass fails', t => {
  t.throws(
    () =>
      defineExoClass(
        'UpCounter',
        UpCounterI,
        /** @param {number} [x] */
        (x = 0) => ({ x }),
        {
          incr(y = 1) {
            const { state } = this;
            state.x += y;
            return state.x;
          },
        },
        {
          receiveAmplifier(_) {},
        },
      ),
    {
      message: 'Only facets of an exo class kit can be amplified "UpCounter"',
    },
  );
});

test('test amplify defineExoClassKit', t => {
  /** @type {any} */
  let amp;
  const makeCounterKit = defineExoClassKit(
    'Counter',
    { up: UpCounterI, down: DownCounterI },
    /** @param {number} [x] */
    (x = 0) => ({ x }),
    {
      up: {
        incr(y = 1) {
          const { state } = this;
          state.x += y;
          return state.x;
        },
      },
      down: {
        decr(y = 1) {
          const { state } = this;
          state.x -= y;
          return state.x;
        },
      },
    },
    {
      receiveAmplifier(a) {
        amp = a;
      },
    },
  );
  const counterKit = makeCounterKit(3);
  const { up: upCounter, down: downCounter } = counterKit;
  t.is(upCounter.incr(5), 8);
  t.is(downCounter.decr(), 7);

  t.throws(() => amp(harden({})), {
    message: 'Must be a facet of "Counter": {}',
  });
  t.deepEqual(amp(upCounter), counterKit);
  t.deepEqual(amp(downCounter), counterKit);
});
