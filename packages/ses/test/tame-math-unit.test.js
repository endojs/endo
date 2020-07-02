import tap from 'tap';
import tameMathObject from '../src/tame-math-object.js';

const { test } = tap;

const {
  '%InitialMath%': initialMath,
  '%SharedMath%': sharedMath,
} = tameMathObject();

test('tameMathObject - initial properties', t => {
  t.equal(initialMath.random.name, 'random');

  t.equal(typeof initialMath.random(), 'number');

  t.end();
});

test('tameMathObject - shared properties', t => {
  t.equal(typeof sharedMath.random, 'undefined');

  t.end();
});
