// This file does not start with "test-" because it is useful as an
// automated test. Rather, its purpose is just to run it to see what a
// deep stack looks like.

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava';

import { E } from './get-hp';

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

test('deep-stacks E', t => {
  const q = alice.test();
  return q.catch(reason => {
    t.assert(reason instanceof Error);
    console.log('expected failure', reason);
  });
});
