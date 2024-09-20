// eslint-disable-next-line import/order
import test from './_prepare-test-env-ava-label-instances.js';

// eslint-disable-next-line import/order
import { passStyleOf } from '@endo/far';
import { M } from '@endo/patterns';

import { q } from '@endo/errors';
import {
  defineExoClass,
  defineExoClassKit,
  makeExo,
} from '../src/exo-makers.js';

const UpCounterI = M.interface('UpCounter', {
  incr: M.call().returns(M.number()),
});

const DownCounterI = M.interface('DownCounter', {
  decr: M.call().returns(M.number()),
});

test('test defineExoClass', t => {
  const makeUpCounter = defineExoClass(
    'UpCounter',
    UpCounterI,
    /** @param {number} [x] */
    (x = 0) => ({ x }),
    {
      incr() {
        const { state } = this;
        state.x += 1;
        return state.x;
      },
    },
  );
  const up1 = makeUpCounter(3);
  const up2 = makeUpCounter(7);
  t.is(passStyleOf(up1), 'remotable');
  t.is(`${up1}`, '[object Alleged: UpCounter#1]');
  t.is(`${q(up1)}`, '"[Alleged: UpCounter#1]"');

  t.is(passStyleOf(up2), 'remotable');
  t.is(`${up2}`, '[object Alleged: UpCounter#2]');
  t.is(`${q(up2)}`, '"[Alleged: UpCounter#2]"');
});

test('test defineExoClassKit', t => {
  const makeCounterKit = defineExoClassKit(
    'Counter',
    { up: UpCounterI, down: DownCounterI },
    /** @param {number} [x] */
    (x = 0) => ({ x }),
    {
      up: {
        incr() {
          const { state } = this;
          state.x += 1;
          return state.x;
        },
      },
      down: {
        decr() {
          const { state } = this;
          state.x -= 1;
          return state.x;
        },
      },
    },
  );
  const { up: up1, down: down1 } = makeCounterKit(3);
  const { up: up2, down: down2 } = makeCounterKit(7);

  t.is(passStyleOf(up1), 'remotable');
  t.is(`${up1}`, '[object Alleged: Counter up#1]');
  t.is(`${q(up1)}`, '"[Alleged: Counter up#1]"');

  t.is(passStyleOf(up2), 'remotable');
  t.is(`${up2}`, '[object Alleged: Counter up#2]');
  t.is(`${q(up2)}`, '"[Alleged: Counter up#2]"');

  t.is(passStyleOf(down1), 'remotable');
  t.is(`${down1}`, '[object Alleged: Counter down#1]');
  t.is(`${q(down1)}`, '"[Alleged: Counter down#1]"');

  t.is(passStyleOf(down2), 'remotable');
  t.is(`${down2}`, '[object Alleged: Counter down#2]');
  t.is(`${q(down2)}`, '"[Alleged: Counter down#2]"');
});

test('test makeExo', t => {
  let x = 3;
  const up1 = makeExo('upCounterA', UpCounterI, {
    incr() {
      x += 1;
      return x;
    },
  });
  const up2 = makeExo('upCounterB', UpCounterI, {
    incr() {
      x += 1;
      return x;
    },
  });

  t.is(passStyleOf(up1), 'remotable');
  t.is(`${up1}`, '[object Alleged: upCounterA#1]');
  t.is(`${q(up1)}`, '"[Alleged: upCounterA#1]"');

  t.is(passStyleOf(up2), 'remotable');
  t.is(`${up2}`, '[object Alleged: upCounterB#1]');
  t.is(`${q(up2)}`, '"[Alleged: upCounterB#1]"');
});
