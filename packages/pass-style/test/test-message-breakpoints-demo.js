import './prepare-breakpoints.js';
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { E } from '@endo/eventual-send';
import { Far } from '../src/make-far.js';

// Example from test-deep-send.js in @endo/eventual-send

const carol = Far('Carol', {
  bar: () => console.log('Wut?'),
});

const bob = Far('Bob', {
  foo: carolP => E(carolP).bar(),
});

const alice = Far('Alice', {
  test: () => E(bob).foo(carol),
});

// This is not useful as an automated test. Its purpose is to run it under a
// debugger and see where it breakpoints. To play with it, adjust the
// settings in prepare-breakpoints.js and try again.
test('test breakpoints on delivery', async t => {
  await alice.test();
  t.pass('introduced');
});
