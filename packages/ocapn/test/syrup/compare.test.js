// @ts-check

import test from '@endo/ses-ava/test.js';
import {
  compareImmutableArrayBuffers,
  compareUint8Arrays,
} from '../../src/syrup/compare.js';
import {
  uint8ArrayToImmutableArrayBuffer,
  encodeStringToImmutableArrayBuffer,
} from '../../src/buffer-utils.js';

test('equal', t => {
  const left = new Uint8Array([1, 2, 3]);
  const right = new Uint8Array([1, 2, 3]);
  t.is(compareUint8Arrays(left, right), 0);
});

test('left longer', t => {
  const left = new Uint8Array([1, 2, 3, 4]);
  const right = new Uint8Array([1, 2, 3]);
  t.is(compareUint8Arrays(left, right), 1);
});

test('right longer', t => {
  const left = new Uint8Array([1, 2, 3]);
  const right = new Uint8Array([1, 2, 3, 4]);
  t.is(compareUint8Arrays(left, right), -1);
});

test('compareImmutableArrayBuffers - equal buffers', t => {
  const buffer1 = encodeStringToImmutableArrayBuffer('hello');
  const buffer2 = encodeStringToImmutableArrayBuffer('hello');

  t.is(compareImmutableArrayBuffers(buffer1, buffer2), 0);
});

test('compareImmutableArrayBuffers - left less than right', t => {
  const buffer1 = encodeStringToImmutableArrayBuffer('abc');
  const buffer2 = encodeStringToImmutableArrayBuffer('xyz');

  t.is(compareImmutableArrayBuffers(buffer1, buffer2), -1);
});

test('compareImmutableArrayBuffers - left greater than right', t => {
  const buffer1 = encodeStringToImmutableArrayBuffer('xyz');
  const buffer2 = encodeStringToImmutableArrayBuffer('abc');

  t.is(compareImmutableArrayBuffers(buffer1, buffer2), 1);
});

test('compareImmutableArrayBuffers - left is prefix of right', t => {
  const buffer1 = encodeStringToImmutableArrayBuffer('hello');
  const buffer2 = encodeStringToImmutableArrayBuffer('helloworld');

  const result = compareImmutableArrayBuffers(buffer1, buffer2);
  t.true(result < 0, 'left should be less than right');
  t.is(result, 5 - 10, 'should return length difference when one is prefix');
});

test('compareImmutableArrayBuffers - right is prefix of left', t => {
  const buffer1 = encodeStringToImmutableArrayBuffer('helloworld');
  const buffer2 = encodeStringToImmutableArrayBuffer('hello');

  const result = compareImmutableArrayBuffers(buffer1, buffer2);
  t.true(result > 0, 'left should be greater than right');
});

test('compareImmutableArrayBuffers - empty buffers', t => {
  const buffer1 = encodeStringToImmutableArrayBuffer('');
  const buffer2 = encodeStringToImmutableArrayBuffer('');

  t.is(compareImmutableArrayBuffers(buffer1, buffer2), 0);
});

test('compareImmutableArrayBuffers - empty vs non-empty', t => {
  const buffer1 = encodeStringToImmutableArrayBuffer('');
  const buffer2 = encodeStringToImmutableArrayBuffer('a');

  t.is(compareImmutableArrayBuffers(buffer1, buffer2), -1);
  t.is(compareImmutableArrayBuffers(buffer2, buffer1), 1);
});

test('compareImmutableArrayBuffers - binary data', t => {
  const buffer1 = uint8ArrayToImmutableArrayBuffer(
    new Uint8Array([0x00, 0x01, 0x02]),
  );
  const buffer2 = uint8ArrayToImmutableArrayBuffer(
    new Uint8Array([0x00, 0x01, 0x03]),
  );

  t.is(compareImmutableArrayBuffers(buffer1, buffer2), -1);
  t.is(compareImmutableArrayBuffers(buffer2, buffer1), 1);
});

test('compareImmutableArrayBuffers - bytewise comparison', t => {
  // Test that comparison is bytewise, not lexicographic
  const buffer1 = uint8ArrayToImmutableArrayBuffer(new Uint8Array([0xff]));
  const buffer2 = uint8ArrayToImmutableArrayBuffer(
    new Uint8Array([0x00, 0x00]),
  );

  // 0xff > 0x00, so buffer1 > buffer2 despite being shorter
  t.is(compareImmutableArrayBuffers(buffer1, buffer2), 1);
  t.is(compareImmutableArrayBuffers(buffer2, buffer1), -1);
});
