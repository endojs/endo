// This file is not really useful as an
// automated test. Rather, its purpose is just to run it to see what a
// deep stack looks like.

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from './prepare-test-env-ava.js';

import { E } from './get-hp.js';

const { freeze } = Object;

const carol = freeze({
  bar: () => assert.fail('Wut?'),
});

const bob = freeze({
  foo: carolP => E(carolP).bar(),
});

const alice = freeze({
  test: () => E(bob).foo(carol),
});

test('deep-stacks E ses-ava', t => {
  const q = alice.test();
  return q.catch(reason => {
    t.assert(reason instanceof Error);
    t.log('expected failure', reason);
  });
});
