import test from 'ava';
import tameMathObject from '../src/tame-math-object.js';

const { '%InitialMath%': initialMath, '%SharedMath%': sharedMath } =
  tameMathObject();

test('tameMathObject - initial properties', t => {
  t.is(initialMath.random.name, 'random');

  t.is(typeof initialMath.random(), 'number');
});

test('tameMathObject - shared properties', t => {
  t.is(typeof sharedMath.random, 'undefined');
});
