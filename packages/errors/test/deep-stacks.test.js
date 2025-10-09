// This file is not really useful as an
// automated test. Rather, its purpose is just to run it to see what a
// deep stack looks like.

import '@endo/eventual-send/shim.js';
import test from 'ava';

import { E } from '@endo/eventual-send';

test('deep-stacks demo test', t => {
  /** @type {any} */
  let r;
  const p = new Promise(res => (r = res));
  const q = E.when(p, v1 => E.when(v1 + 1, v2 => assert.equal(v2, 22)));
  r(33);
  return q.catch(reason => {
    t.assert(reason instanceof Error);
    t.log('expected failure', reason);
  });
});
