import test from 'ava';
import tameMathObject from '../src/tame-math-object.js';

const { '%InitialMath%': initialMath, '%SharedMath%': sharedMath } =
  tameMathObject();

test('tameMathObject - initial properties', t => {
  t.is(initialMath.random.name, 'random');

  t.is(typeof initialMath.random(), 'number');
});

test('tameMathObject - shared properties', t => {
  t.throws(() => sharedMath.random(), {
    message: /^secure mode/,
  });
});
