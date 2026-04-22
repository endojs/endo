import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import { Far } from '../src/make-far.js';
import { makeTagged } from '../src/makeTagged.js';
import { deeplyFulfilled } from '../src/deeplyFulfilled.js';

// Currently, just copied from deeplyFulfilledObject test.
// TODO extend to test cases unique to deeplyFulfilled, i.e. primitives
test('deeplyFulfilled', async t => {
  const someFar = Far('somefar', { getAsync: () => Promise.resolve('async') });
  const unfulfilled = harden({
    obj1: {
      obj2a: {
        stringP: Promise.resolve('foo'),
      },
      obj2b: someFar,
    },
  });
  const fulfilled = await deeplyFulfilled(unfulfilled);
  // JS check that it's a now string
  fulfilled.obj1.obj2a.stringP.length;
  t.deepEqual(fulfilled, {
    obj1: { obj2a: { stringP: 'foo' }, obj2b: someFar },
  });
});

test('deeplyFulfilled with tagged value', async t => {
  const tagged = makeTagged('test', harden([Promise.resolve(42)]));
  const result = await deeplyFulfilled(tagged);
  t.deepEqual(result.payload, [42]);
});

test('deeplyFulfilled with error', async t => {
  const err = harden(Error('test error'));
  const result = await deeplyFulfilled(err);
  t.is(result, err, 'error passes through unchanged');
});

test('deeplyFulfilled with remotable', async t => {
  const far = Far('test', { hello: () => 'world' });
  const result = await deeplyFulfilled(far);
  t.is(result, far, 'remotable passes through unchanged');
});

test('deeplyFulfilled with hardened promise', async t => {
  const p = harden(Promise.resolve('resolved'));
  const result = await deeplyFulfilled(p);
  t.is(result, 'resolved');
});

test('deeplyFulfilled with copyArray containing promises', async t => {
  const arr = harden([Promise.resolve(1), Promise.resolve(2), 3]);
  const result = await deeplyFulfilled(arr);
  t.deepEqual(result, [1, 2, 3]);
});
