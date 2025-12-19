// @ts-check

import test from '@endo/ses-ava/test.js';
import {
  PositiveIntegerCodec,
  NonNegativeIntegerCodec,
} from '../../src/codecs/subtypes.js';
import { makeSyrupReader } from '../../src/syrup/decode.js';
import { makeSyrupWriter } from '../../src/syrup/encode.js';

/**
 * @import { SyrupCodec } from '../../src/syrup/codec.js'
 */

/**
 * Helper to test codec bidirectionally (write then read)
 * @param {any} t - AVA test instance
 * @param {SyrupCodec} codec - The codec to test
 * @param {any} value - The value to encode/decode
 */
const testCodecBidirectionally = (t, codec, value) => {
  const writer = makeSyrupWriter();
  codec.write(value, writer);
  const bytes = writer.getBytes();
  const reader = makeSyrupReader(bytes);
  const result = codec.read(reader);
  t.deepEqual(result, value);
};

/**
 * Helper to test that an error is thrown with the expected message in the cause chain
 * @param {any} t - AVA test instance
 * @param {() => void} fn - Function to test
 * @param {string} expectedMessage - Expected error message
 */
const testThrowsWithCause = (t, fn, expectedMessage) => {
  const error = t.throws(fn, { instanceOf: Error });
  t.is(error.cause.message, expectedMessage);
};

// ===== PositiveIntegerCodec Tests =====

test('PositiveIntegerCodec - valid positive integers', t => {
  testCodecBidirectionally(t, PositiveIntegerCodec, 1n);
  testCodecBidirectionally(t, PositiveIntegerCodec, 2n);
  testCodecBidirectionally(t, PositiveIntegerCodec, 42n);
  testCodecBidirectionally(t, PositiveIntegerCodec, 100n);
  testCodecBidirectionally(t, PositiveIntegerCodec, 1000000n);
  testCodecBidirectionally(
    t,
    PositiveIntegerCodec,
    123456789012345678901234567890n,
  );
});

test('PositiveIntegerCodec - write rejects non-bigint', t => {
  const writer = makeSyrupWriter();
  testThrowsWithCause(
    t,
    () => {
      PositiveIntegerCodec.write(42, writer);
    },
    'value must be a bigint',
  );
});

test('PositiveIntegerCodec - write rejects zero', t => {
  const writer = makeSyrupWriter();
  testThrowsWithCause(
    t,
    () => {
      PositiveIntegerCodec.write(0n, writer);
    },
    'value must be positive',
  );
});

test('PositiveIntegerCodec - write rejects negative integers', t => {
  const writer = makeSyrupWriter();
  testThrowsWithCause(
    t,
    () => {
      PositiveIntegerCodec.write(-1n, writer);
    },
    'value must be positive',
  );

  const writer2 = makeSyrupWriter();
  testThrowsWithCause(
    t,
    () => {
      PositiveIntegerCodec.write(-100n, writer2);
    },
    'value must be positive',
  );
});

test('PositiveIntegerCodec - read rejects zero', t => {
  // Manually create a syrup encoding of 0
  const writer = makeSyrupWriter();
  writer.writeInteger(0n);
  const bytes = writer.getBytes();
  const reader = makeSyrupReader(bytes);

  testThrowsWithCause(
    t,
    () => {
      PositiveIntegerCodec.read(reader);
    },
    'value must be positive',
  );
});

test('PositiveIntegerCodec - read rejects negative integers', t => {
  // Manually create a syrup encoding of -1
  const writer = makeSyrupWriter();
  writer.writeInteger(-1n);
  const bytes = writer.getBytes();
  const reader = makeSyrupReader(bytes);

  testThrowsWithCause(
    t,
    () => {
      PositiveIntegerCodec.read(reader);
    },
    'value must be positive',
  );
});

// ===== NonNegativeIntegerCodec Tests =====

test('NonNegativeIntegerCodec - valid non-negative integers including zero', t => {
  testCodecBidirectionally(t, NonNegativeIntegerCodec, 0n);
  testCodecBidirectionally(t, NonNegativeIntegerCodec, 1n);
  testCodecBidirectionally(t, NonNegativeIntegerCodec, 2n);
  testCodecBidirectionally(t, NonNegativeIntegerCodec, 42n);
  testCodecBidirectionally(t, NonNegativeIntegerCodec, 100n);
  testCodecBidirectionally(t, NonNegativeIntegerCodec, 1000000n);
  testCodecBidirectionally(
    t,
    NonNegativeIntegerCodec,
    123456789012345678901234567890n,
  );
});

test('NonNegativeIntegerCodec - write rejects non-bigint', t => {
  const writer = makeSyrupWriter();
  testThrowsWithCause(
    t,
    () => {
      NonNegativeIntegerCodec.write(42, writer);
    },
    'value must be a bigint',
  );
});

test('NonNegativeIntegerCodec - write rejects negative integers', t => {
  const writer = makeSyrupWriter();
  testThrowsWithCause(
    t,
    () => {
      NonNegativeIntegerCodec.write(-1n, writer);
    },
    'value must be non-negative',
  );

  const writer2 = makeSyrupWriter();
  testThrowsWithCause(
    t,
    () => {
      NonNegativeIntegerCodec.write(-100n, writer2);
    },
    'value must be non-negative',
  );
});

test('NonNegativeIntegerCodec - read rejects negative integers', t => {
  // Manually create a syrup encoding of -1
  const writer = makeSyrupWriter();
  writer.writeInteger(-1n);
  const bytes = writer.getBytes();
  const reader = makeSyrupReader(bytes);

  testThrowsWithCause(
    t,
    () => {
      NonNegativeIntegerCodec.read(reader);
    },
    'value must be non-negative',
  );
});
