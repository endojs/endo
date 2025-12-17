// @ts-check

import test from '@endo/ses-ava/test.js';
import { passStyleOf } from '@endo/pass-style';
import {
  encodeStringToImmutableArrayBuffer,
  decodeImmutableArrayBufferToString,
  uint8ArrayToImmutableArrayBuffer,
  immutableArrayBufferToUint8Array,
  concatArrayBuffers,
  hexToArrayBuffer,
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

test('immutableArrayBufferToUint8Array converts correctly', t => {
  const testString = 'hello world';
  const immutableBuffer = encodeStringToImmutableArrayBuffer(testString);

  const uint8Array = immutableArrayBufferToUint8Array(immutableBuffer);

  // Should be a Uint8Array
  t.true(uint8Array instanceof Uint8Array, 'Result should be Uint8Array');

  // Should have correct length
  t.is(uint8Array.byteLength, immutableBuffer.byteLength);

  // Should not be all zeros
  const hasNonZero = Array.from(uint8Array).some(byte => byte !== 0);
  t.true(hasNonZero, 'Uint8Array should not be all zeros');

  // Should decode back to original string
  const textDecoder = new TextDecoder();
  const decoded = textDecoder.decode(uint8Array);
  t.is(decoded, testString);
});

test('immutableArrayBufferToUint8Array preserves byte values', t => {
  const testBytes = new Uint8Array([1, 2, 3, 255, 128, 0, 42, 100]);
  const immutableBuffer = uint8ArrayToImmutableArrayBuffer(testBytes);

  const result = immutableArrayBufferToUint8Array(immutableBuffer);

  // Should have same length
  t.is(result.length, testBytes.length);

  // Should have same byte values
  for (let i = 0; i < testBytes.length; i += 1) {
    t.is(result[i], testBytes[i], `Byte at index ${i} should match`);
  }
});

test('immutableArrayBufferToUint8Array with concatenated buffers', t => {
  const part1 = encodeStringToImmutableArrayBuffer('Hello');
  const part2 = encodeStringToImmutableArrayBuffer(' ');
  const part3 = encodeStringToImmutableArrayBuffer('World');

  const concatenated = concatArrayBuffers([part1, part2, part3]);

  const uint8Array = immutableArrayBufferToUint8Array(concatenated);

  // Should not be all zeros
  const hasNonZero = Array.from(uint8Array).some(byte => byte !== 0);
  t.true(hasNonZero, 'Concatenated buffer should not be all zeros');

  // Should decode to correct string
  const textDecoder = new TextDecoder();
  const decoded = textDecoder.decode(uint8Array);
  t.is(decoded, 'Hello World');
});

test('immutableArrayBufferToUint8Array with syrup-like structure', t => {
  // Simulate what recordSyrup does
  const openBracket = encodeStringToImmutableArrayBuffer('<');
  const label = encodeStringToImmutableArrayBuffer('test-record');
  const closeBracket = encodeStringToImmutableArrayBuffer('>');

  const syrup = concatArrayBuffers([openBracket, label, closeBracket]);

  const uint8Array = immutableArrayBufferToUint8Array(syrup);

  // Should not be empty
  t.true(uint8Array.length > 0, 'Should have non-zero length');

  // Should not be all zeros
  const allZeros = Array.from(uint8Array).every(byte => byte === 0);
  t.false(allZeros, 'Should not be all zeros');

  // Should decode to expected structure
  const decoded = decodeImmutableArrayBufferToString(syrup);
  t.is(decoded, '<test-record>');

  // Verify byte-by-byte that uint8Array matches
  const textDecoder = new TextDecoder();
  const decodedFromUint8 = textDecoder.decode(uint8Array);
  t.is(decodedFromUint8, '<test-record>');
});

test('immutableArrayBufferToUint8Array with UTF-8 characters', t => {
  const testStrings = ['UTF-8: 你好', 'Emoji: 🎉', 'Mixed: ABC-123-あいう'];

  for (const str of testStrings) {
    const immutableBuffer = encodeStringToImmutableArrayBuffer(str);
    const uint8Array = immutableArrayBufferToUint8Array(immutableBuffer);

    // Should not be all zeros
    const hasNonZero = Array.from(uint8Array).some(byte => byte !== 0);
    t.true(hasNonZero, `"${str}" should not be all zeros`);

    // Should decode correctly
    const textDecoder = new TextDecoder();
    const decoded = textDecoder.decode(uint8Array);
    t.is(decoded, str);
  }
});

test('immutableArrayBufferToUint8Array with empty buffer', t => {
  const emptyBuffer = encodeStringToImmutableArrayBuffer('');
  const uint8Array = immutableArrayBufferToUint8Array(emptyBuffer);

  t.is(uint8Array.length, 0);
  t.true(uint8Array instanceof Uint8Array);
});

test('hexToArrayBuffer converts basic hex strings', t => {
  const testCases = [
    { hex: '00', expected: [0x00] },
    { hex: 'ff', expected: [0xff] },
    { hex: 'FF', expected: [0xff] },
    { hex: '01', expected: [0x01] },
    { hex: '7f', expected: [0x7f] },
    { hex: '80', expected: [0x80] },
    { hex: 'deadbeef', expected: [0xde, 0xad, 0xbe, 0xef] },
    { hex: 'DEADBEEF', expected: [0xde, 0xad, 0xbe, 0xef] },
  ];

  for (const { hex, expected } of testCases) {
    const buffer = hexToArrayBuffer(hex);
    t.true(buffer instanceof ArrayBuffer, `${hex} should create ArrayBuffer`);

    const uint8Array = immutableArrayBufferToUint8Array(buffer);
    t.is(
      uint8Array.length,
      expected.length,
      `${hex} should have correct length`,
    );

    for (let i = 0; i < expected.length; i += 1) {
      t.is(uint8Array[i], expected[i], `Byte ${i} of ${hex} should match`);
    }
  }
});

test('hexToArrayBuffer handles empty string', t => {
  const buffer = hexToArrayBuffer('');
  t.true(buffer instanceof ArrayBuffer);
  t.is(buffer.byteLength, 0);
});

test('hexToArrayBuffer handles lowercase and uppercase', t => {
  const lowerBuffer = hexToArrayBuffer('abcdef');
  const upperBuffer = hexToArrayBuffer('ABCDEF');
  const mixedBuffer = hexToArrayBuffer('AbCdEf');

  const lowerBytes = immutableArrayBufferToUint8Array(lowerBuffer);
  const upperBytes = immutableArrayBufferToUint8Array(upperBuffer);
  const mixedBytes = immutableArrayBufferToUint8Array(mixedBuffer);

  t.is(lowerBytes.length, 3);
  t.is(upperBytes.length, 3);
  t.is(mixedBytes.length, 3);

  // All should produce same bytes
  for (let i = 0; i < 3; i += 1) {
    t.is(lowerBytes[i], upperBytes[i]);
    t.is(lowerBytes[i], mixedBytes[i]);
  }
});

test('hexToArrayBuffer converts all byte values', t => {
  // Test all possible byte values (0x00 to 0xFF)
  const hexString = Array.from({ length: 256 }, (_, i) =>
    i.toString(16).padStart(2, '0'),
  ).join('');

  const buffer = hexToArrayBuffer(hexString);
  const uint8Array = immutableArrayBufferToUint8Array(buffer);

  t.is(uint8Array.length, 256);

  for (let i = 0; i < 256; i += 1) {
    t.is(uint8Array[i], i, `Byte value ${i} should be preserved`);
  }
});

test('hexToArrayBuffer rejects odd-length strings', t => {
  const oddLengthStrings = ['a', 'abc', 'abcde', '1', '123456789'];

  for (const hex of oddLengthStrings) {
    const error = t.throws(
      () => hexToArrayBuffer(hex),
      { instanceOf: Error },
      `Should reject odd-length string: ${hex}`,
    );
    t.true(
      error.message.includes('even length'),
      'Error message should mention even length',
    );
    t.true(
      error.message.includes(String(hex.length)),
      'Error message should include actual length',
    );
  }
});

test('hexToArrayBuffer with zero bytes', t => {
  const buffer = hexToArrayBuffer('000000');
  const uint8Array = immutableArrayBufferToUint8Array(buffer);

  t.is(uint8Array.length, 3);
  for (let i = 0; i < 3; i += 1) {
    t.is(uint8Array[i], 0);
  }
});

test('hexToArrayBuffer with max bytes', t => {
  const buffer = hexToArrayBuffer('ffffff');
  const uint8Array = immutableArrayBufferToUint8Array(buffer);

  t.is(uint8Array.length, 3);
  for (let i = 0; i < 3; i += 1) {
    t.is(uint8Array[i], 255);
  }
});

test('hexToArrayBuffer creates buffer with byteArray passStyle', t => {
  const buffer = hexToArrayBuffer('deadbeef');
  // @ts-expect-error passStyleOf typing infers the wrong type.
  t.is(passStyleOf(buffer), 'byteArray');
});

test('hexToArrayBuffer with common hash-like strings', t => {
  // Test strings that might represent hashes
  const hashLike = '0123456789abcdef0123456789abcdef'; // 16 bytes
  const buffer = hexToArrayBuffer(hashLike);
  const uint8Array = immutableArrayBufferToUint8Array(buffer);

  t.is(uint8Array.length, 16);
  t.is(uint8Array[0], 0x01);
  t.is(uint8Array[1], 0x23);
  t.is(uint8Array[15], 0xef);
});

test('hexToArrayBuffer preserves byte boundaries', t => {
  // Ensure each pair of hex digits becomes exactly one byte
  const testCases = [
    { hex: '0001', expected: [0x00, 0x01] },
    { hex: '00ff', expected: [0x00, 0xff] },
    { hex: 'ff00', expected: [0xff, 0x00] },
    { hex: '0102030405', expected: [0x01, 0x02, 0x03, 0x04, 0x05] },
  ];

  for (const { hex, expected } of testCases) {
    const buffer = hexToArrayBuffer(hex);
    const uint8Array = immutableArrayBufferToUint8Array(buffer);

    t.is(uint8Array.length, expected.length);
    for (let i = 0; i < expected.length; i += 1) {
      t.is(uint8Array[i], expected[i]);
    }
  }
});
