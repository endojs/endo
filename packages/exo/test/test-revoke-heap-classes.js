// eslint-disable-next-line import/order
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { M } from '@endo/patterns';
import { defineExoClass, defineExoClassKit } from '../src/exo-makers.js';

const { apply } = Reflect;

const UpCounterI = M.interface('UpCounter', {
  incr: M.call()
    // TODO M.number() should not be needed to get a better error message
    .optional(M.and(M.number(), M.gte(0)))
    .returns(M.number()),
  done: M.call().returns(M.boolean()),
});

const DownCounterI = M.interface('DownCounter', {
  decr: M.call()
    // TODO M.number() should not be needed to get a better error message
    .optional(M.and(M.number(), M.gte(0)))
    .returns(M.number()),
});

test('test revoke defineExoClass', t => {
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
      done() {
        const { revoke } = this;
        return revoke();
      },
    },
  );
  const upCounter = makeUpCounter(3);
  t.is(upCounter.incr(5), 8);
  t.is(upCounter.done(), true);
  t.throws(() => upCounter.incr(1), {
    message:
      '"In \\"incr\\" method of (UpCounter)" may only be applied to a valid instance: "[Alleged: UpCounter]"',
  });
});

test('test revoke defineExoClassKit', t => {
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
        done() {
          const { revoke } = this;
          return revoke();
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
  );
  const { up: upCounter, down: downCounter } = makeCounterKit(3);
  t.is(upCounter.incr(5), 8);
  t.is(downCounter.decr(), 7);
  t.is(upCounter.done(), true);
  t.throws(() => upCounter.incr(3), {
    message:
      '"In \\"incr\\" method of (Counter up)" may only be applied to a valid instance: "[Alleged: Counter up]"',
  });
  t.throws(() => downCounter.decr(), {
    message:
      '"In \\"decr\\" method of (Counter down)" may only be applied to a valid instance: "[Alleged: Counter down]"',
  });
});

test('test facet cross-talk', t => {
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
        done() {
          const { revoke } = this;
          return revoke();
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
  );
  const { up: upCounter, down: downCounter } = makeCounterKit(3);
  t.throws(() => apply(upCounter.incr, downCounter, [2]), {
    message:
      '"In \\"incr\\" method of (Counter up)" may only be applied to a valid instance: "[Alleged: Counter down]"',
  });
});
