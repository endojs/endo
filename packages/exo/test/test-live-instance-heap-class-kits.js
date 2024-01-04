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

test('test revoke defineExoClass', t => {
  let revoke;
  let isLiveInstance;
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
      receiveRevoker(r) {
        revoke = r;
      },
      receiveInstanceTester(i) {
        isLiveInstance = i;
      },
    },
  );
  t.is(isLiveInstance(harden({})), false);
  t.throws(() => isLiveInstance(harden({}), 'up'), {
    message:
      'facetName can only be used with an exo class kit: "UpCounter" has no facet "up"',
  });

  const upCounter = makeUpCounter(3);

  t.is(isLiveInstance(upCounter), true);
  t.throws(() => isLiveInstance(upCounter, 'up'), {
    message:
      'facetName can only be used with an exo class kit: "UpCounter" has no facet "up"',
  });
  t.is(revoke(upCounter), true);
  t.is(isLiveInstance(upCounter), false);
});

test('test amplify defineExoClassKit', t => {
  let revoke;
  let isLiveInstance;
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
      receiveInstanceTester(i) {
        isLiveInstance = i;
      },
    },
  );

  t.is(isLiveInstance(harden({})), false);
  t.is(isLiveInstance(harden({}), 'up'), false);
  t.throws(() => isLiveInstance(harden({}), 'foo'), {
    message: 'exo class kit "Counter" has no facet named "foo"',
  });

  const { up: upCounter, down: downCounter } = makeCounterKit(3);

  t.is(isLiveInstance(upCounter), true);
  t.is(isLiveInstance(upCounter, 'up'), true);
  t.is(isLiveInstance(upCounter, 'down'), false);
  t.throws(() => isLiveInstance(upCounter, 'foo'), {
    message: 'exo class kit "Counter" has no facet named "foo"',
  });

  t.is(revoke(upCounter), true);

  t.is(isLiveInstance(upCounter), false);
  t.is(isLiveInstance(upCounter, 'up'), false);
  t.is(isLiveInstance(upCounter, 'down'), false);
  t.is(isLiveInstance(downCounter), true);
  t.is(isLiveInstance(downCounter, 'up'), false);
  t.is(isLiveInstance(downCounter, 'down'), true);
});
