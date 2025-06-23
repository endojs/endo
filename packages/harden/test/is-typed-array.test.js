// @ts-check

import test from 'ava';
import '../index.js';

import { isTypedArray } from '../src/make-hardener.js';

// Tests borrowed from https://github.com/inspect-js/is-typed-array
// https://github.com/inspect-js/is-typed-array/blob/c1ad8eae617870e3b3700dda0ff736a267b7e990/LICENSE
// MIT license.

test('isTypedArray positive cases', t => {
  t.assert(isTypedArray(new Int8Array()));
  t.assert(isTypedArray(new Uint8Array()));
  t.assert(isTypedArray(new Uint8ClampedArray()));
  t.assert(isTypedArray(new Int16Array()));
  t.assert(isTypedArray(new Uint16Array()));
  t.assert(isTypedArray(new Int32Array()));
  t.assert(isTypedArray(new Uint32Array()));
  t.assert(isTypedArray(new Float32Array()));
  t.assert(isTypedArray(new Float64Array()));
  t.assert(isTypedArray(new BigInt64Array()));
  t.assert(isTypedArray(new BigUint64Array()));
});

test('isTypedArray negative cases', t => {
  t.assert(!isTypedArray(undefined));
  t.assert(!isTypedArray(null));
  t.assert(!isTypedArray(false));
  t.assert(!isTypedArray(true));
  t.assert(!isTypedArray([]));
  t.assert(!isTypedArray({}));
  t.assert(!isTypedArray(/a/g));
  t.assert(!isTypedArray(new RegExp('a', 'g')));
  t.assert(!isTypedArray(new Date()));
  t.assert(!isTypedArray(42));
  t.assert(!isTypedArray(NaN));
  t.assert(!isTypedArray(Infinity));
  // eslint-disable-next-line no-new-wrappers
  t.assert(!isTypedArray(new Number(42)));
  t.assert(!isTypedArray('foo'));
  t.assert(!isTypedArray(Object('foo')));
  // eslint-disable-next-line prefer-arrow-callback
  t.assert(!isTypedArray(function f() {}));
  t.assert(
    !isTypedArray(function* g() {
      yield;
    }),
  );
  t.assert(!isTypedArray(() => {}));
  t.assert(!isTypedArray([]));
  t.assert(!isTypedArray(new ArrayBuffer(1)));
});
