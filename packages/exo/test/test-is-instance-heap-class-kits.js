// modeled on test-heap-classes.js

import test from '@endo/ses-ava';

import { M } from '@endo/patterns';
import { defineExoClass, defineExoClassKit } from '../src/exo-makers.js';

const UpCounterI = M.interface('UpCounter', {
  incr: M.call().optional(M.gte(0)).returns(M.number()),
});

const DownCounterI = M.interface('DownCounter', {
  decr: M.call().optional(M.gte(0)).returns(M.number()),
});

test('test isInstance defineExoClass', t => {
  let isInstance;
  const makeUpCounter = defineExoClass(
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
      receiveInstanceTester(i) {
        isInstance = i;
      },
    },
  );
  t.is(isInstance(harden({})), false);
  t.throws(() => isInstance(harden({}), 'up'), {
    message:
      'facetName can only be used with an exo class kit: "UpCounter" has no facet "up"',
  });

  const upCounter = makeUpCounter(3);

  t.is(isInstance(upCounter), true);
  t.throws(() => isInstance(upCounter, 'up'), {
    message:
      'facetName can only be used with an exo class kit: "UpCounter" has no facet "up"',
  });
});

test('test isInstance defineExoClassKit', t => {
  let isInstance;
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
      receiveInstanceTester(i) {
        isInstance = i;
      },
    },
  );

  t.is(isInstance(harden({})), false);
  t.is(isInstance(harden({}), 'up'), false);
  t.throws(() => isInstance(harden({}), 'foo'), {
    message: 'exo class kit "Counter" has no facet named "foo"',
  });

  const { up: upCounter } = makeCounterKit(3);

  t.is(isInstance(upCounter), true);
  t.is(isInstance(upCounter, 'up'), true);
  t.is(isInstance(upCounter, 'down'), false);
  t.throws(() => isInstance(upCounter, 'foo'), {
    message: 'exo class kit "Counter" has no facet named "foo"',
  });
});
