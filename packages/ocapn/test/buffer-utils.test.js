// @ts-check

import test from '@endo/ses-ava/test.js';
import { passStyleOf } from '@endo/pass-style';
import {
  encodeStringToImmutableArrayBuffer,
  decodeImmutableArrayBufferToString,
  uint8ArrayToImmutableArrayBuffer,
} from '../src/buffer-utils.js';

test('encodeStringToArrayBuffer + decodeArrayBufferToString roundtrip', t => {
  const testCases = [
    'hello',
    'world',
    'Hello, World!',
    'UTF-8: 你好世界',
    'Emoji: 🎉🚀✨',
    '',
    'a',
    'Multi\nline\nstring',
    'Special chars: !@#$%^&*()',
  ];

  for (const str of testCases) {
    const buffer = encodeStringToImmutableArrayBuffer(str);
    t.true(
      buffer instanceof ArrayBuffer,
      `${str} should encode to ArrayBuffer`,
    );

    const decoded = decodeImmutableArrayBufferToString(buffer);
    t.is(decoded, str, `Roundtrip should preserve string: ${str}`);
  }
});

test('uint8ArrayToImmutableArrayBuffer creates valid buffer', t => {
  const testString = 'test string';
  const textEncoder = new TextEncoder();
  const uint8Array = textEncoder.encode(testString);

  const immutableBuffer = uint8ArrayToImmutableArrayBuffer(uint8Array);

  // Should be ArrayBufferLike
  t.true(
    immutableBuffer instanceof ArrayBuffer ||
      typeof immutableBuffer === 'object',
    'Result should be ArrayBufferLike',
  );

  // Should have correct byte length
  t.is(immutableBuffer.byteLength, uint8Array.byteLength);

  // Should be readable as a string
  const decoded = decodeImmutableArrayBufferToString(immutableBuffer);
  t.is(decoded, testString);
});

test('uint8ArrayToImmutableArrayBuffer with subarray', t => {
  const textEncoder = new TextEncoder();
  const fullString = 'Hello, World!';
  const fullArray = textEncoder.encode(fullString);

  // Create a subarray (offset view into the buffer)
  const subArray = fullArray.subarray(7, 12); // "World"

  const immutableBuffer = uint8ArrayToImmutableArrayBuffer(subArray);

  // Should have correct byte length
  t.is(immutableBuffer.byteLength, 5, 'Should be length of "World"');

  // Should be readable as the substring
  const decoded = decodeImmutableArrayBufferToString(immutableBuffer);
  t.is(decoded, 'World');
});

test('uint8ArrayToImmutableArrayBuffer preserves data integrity', t => {
  const testCases = [
    'Simple ASCII',
    'UTF-8: 日本語',
    'Emoji: 🌟💫⭐',
    'Mixed: ABC-123-あいう-🎨',
  ];

  const textEncoder = new TextEncoder();

  for (const str of testCases) {
    const uint8Array = textEncoder.encode(str);
    const immutableBuffer = uint8ArrayToImmutableArrayBuffer(uint8Array);
    const decoded = decodeImmutableArrayBufferToString(immutableBuffer);
    t.is(decoded, str, `Should preserve: ${str}`);
  }
});

test('decodeArrayBufferToString handles immutable buffers from slicing', t => {
  const textEncoder = new TextEncoder();
  const str = 'abcdefghijklmnopqrstuvwxyz';
  const uint8Array = textEncoder.encode(str);

  // Create immutable buffer from a slice
  const sliced = uint8Array.subarray(5, 10); // "fghij"
  const immutableBuffer = uint8ArrayToImmutableArrayBuffer(sliced);

  const decoded = decodeImmutableArrayBufferToString(immutableBuffer);
  t.is(decoded, 'fghij');
});

test('empty string handling', t => {
  const emptyBuffer = encodeStringToImmutableArrayBuffer('');
  t.is(emptyBuffer.byteLength, 0);

  const decoded = decodeImmutableArrayBufferToString(emptyBuffer);
  t.is(decoded, '');
});

test('uint8ArrayToImmutableArrayBuffer with empty array', t => {
  const emptyArray = new Uint8Array(0);
  const immutableBuffer = uint8ArrayToImmutableArrayBuffer(emptyArray);

  t.is(immutableBuffer.byteLength, 0);

  const decoded = decodeImmutableArrayBufferToString(immutableBuffer);
  t.is(decoded, '');
});

test('uint8ArrayToImmutableArrayBuffer has byteArray passStyle', t => {
  const uint8Array = new Uint8Array([1, 2, 3, 4, 5]);
  const immutableBuffer = uint8ArrayToImmutableArrayBuffer(uint8Array);
  // @ts-expect-error passStyleOf typing infers the wrong type.
  t.is(passStyleOf(immutableBuffer), 'byteArray');
});

test('encodeStringToImmutableArrayBuffer has byteArray passStyle', t => {
  const immutableBuffer = encodeStringToImmutableArrayBuffer('test');
  // @ts-expect-error passStyleOf typing infers the wrong type.
  t.is(passStyleOf(immutableBuffer), 'byteArray');
});
