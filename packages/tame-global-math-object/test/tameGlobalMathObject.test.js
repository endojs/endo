import test from 'tape';
// eslint-disable-next-line import/no-extraneous-dependencies
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalMathObject from '../src/main';

test('tameGlobalMathObject - tamed properties', t => {
  t.plan(1);

  const restore = captureGlobals('Math');
  tameGlobalMathObject();

  t.throws(() => Math.random(), 'disabled');

  restore();
});
