// This file does not start with "test-" because it is useful as an
// automated test. Rather, its purpose is just to run it to see what a
// deep stack looks like.

import '@agoric/install-ses';
import test from 'ava';
import { assert } from '@agoric/assert';
import { E } from './get-hp';

test('deep-stacks when', t => {
  let r;
  const p = new Promise(res => (r = res));
  const q = E.when(p, v1 => E.when(v1 + 1, v2 => assert.equal(v2, 22)));
  r(33);
  return q.catch(reason => {
    t.assert(reason instanceof Error);
    console.log('expected failure', reason);
  });
});
