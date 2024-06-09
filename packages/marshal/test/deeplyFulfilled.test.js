import test from '@endo/ses-ava/prepare-endo.js';

import { Far } from '@endo/pass-style';
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
