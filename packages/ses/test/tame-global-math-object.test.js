import tap from 'tap';
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalMathObject from '../src/tame-global-math-object.js';

const { test } = tap;

test('tameGlobalMathObject - tamed properties', t => {
  t.plan(2);

  const restore = captureGlobals('Math');
  tameGlobalMathObject();

  t.equal(Math.random.name, 'random');

  t.throws(() => Math.random(), TypeError);

  restore();
});
