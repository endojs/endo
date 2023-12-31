// modeled on test-revoke-heap-classes.js

// eslint-disable-next-line import/order
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
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
        /** @param {number} x */
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
  let revoke;
  let amp;
  const makeCounterKit = defineExoClassKit(
    'Counter',
    { up: UpCounterI, down: DownCounterI },
    /** @param {number} x */
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
      receiveRevoker(r) {
        revoke = r;
      },
      receiveAmplifier(a) {
        amp = a;
      },
    },
  );
  const { up: upCounter, down: downCounter } = makeCounterKit(3);
  t.is(upCounter.incr(5), 8);
  t.is(downCounter.decr(), 7);

  t.throws(() => amp(upCounter, 'sideways'), {
    message: '"sideways" must be a facet name of "Counter"',
  });
  t.throws(() => amp(harden({}), 'down'), {
    message: 'Must be an unrevoked facet of "Counter": {}',
  });
  t.is(amp(upCounter, 'down'), downCounter);
  t.is(amp(upCounter, 'up'), upCounter);
  t.is(amp(downCounter, 'up'), upCounter);
  t.is(amp(downCounter, 'down'), downCounter);

  t.is(revoke(upCounter), true);

  t.throws(() => amp(upCounter, 'down'), {
    message: 'Must be an unrevoked facet of "Counter": "[Alleged: Counter up]"',
  });
  t.throws(() => amp(upCounter, 'up'), {
    message: 'Must be an unrevoked facet of "Counter": "[Alleged: Counter up]"',
  });
  t.is(amp(downCounter, 'up'), upCounter);
  t.throws(() => upCounter.incr(3), {
    message:
      '"In \\"incr\\" method of (Counter up)" may only be applied to a valid instance: "[Alleged: Counter up]"',
  });
  t.is(amp(downCounter, 'down'), downCounter);
  t.is(downCounter.decr(), 6);
});
