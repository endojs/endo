import tap from 'tap';
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalMathObject from '../src/tame-global-math-object.js';

const { test } = tap;

test('tameGlobalMathObject - tamed properties', t => {
  const restore = captureGlobals('Math');
  tameGlobalMathObject(true);

  t.equal(Math.random.name, 'random');

  t.equal(typeof Math.random(), 'number');

  restore();
  t.end();
});
