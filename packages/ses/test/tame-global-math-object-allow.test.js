import tap from 'tap';
import tameGlobalMathObject from '../src/tame-global-math-object.js';

const { test } = tap;

const {
  start: {
    Math: { value: tamedMath },
  },
} = tameGlobalMathObject('unsafe');

test('tameGlobalMathObject - tamed properties', t => {
  t.equal(tamedMath.random.name, 'random');

  t.equal(typeof tamedMath.random(), 'number');

  t.end();
});
