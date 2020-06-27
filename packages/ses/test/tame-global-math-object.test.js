import tap from 'tap';
import tameGlobalMathObject from '../src/tame-global-math-object.js';

const { test } = tap;

const {
  start: {
    Math: { value: tamedMath },
  },
} = tameGlobalMathObject('safe');

test('tameGlobalMathObject - tamed properties', t => {
  t.equal(tamedMath.random.name, 'random');

  t.throws(() => tamedMath.random(), TypeError);

  t.end();
});
