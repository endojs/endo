// @ts-check

import test from '@endo/ses-ava/test.js';
import {
  PositiveIntegerCodec,
  NonNegativeIntegerCodec,
} from '../../src/codecs/subtypes.js';
import { AllCodecs } from './_codecs_util.js';

/**
 * @import { SyrupCodec as DataCodec } from '../../src/syrup/codec.js'
 * @import { Codec } from './_codecs_util.js'
 */

/**
 * Helper to test a data codec bidirectionally (write then read)
 * @param {any} t - AVA test instance
 * @param {DataCodec} dataCodec - The data codec to test (e.g., PositiveIntegerCodec)
 * @param {any} value - The value to encode/decode
 * @param {Codec} codec - The wire codec to use (e.g., SyrupCodec, CborCodec)
 */
const testCodecBidirectionally = (t, dataCodec, value, codec) => {
  const writer = codec.makeWriter();
  dataCodec.write(value, writer);
  const bytes = writer.getBytes();
  const reader = codec.makeReader(bytes);
  const result = dataCodec.read(reader);
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

// Run all tests with all codec formats
for (const codec of AllCodecs) {
  // ===== PositiveIntegerCodec Tests =====

  test(`PositiveIntegerCodec - valid positive integers [${codec.name}]`, t => {
    testCodecBidirectionally(t, PositiveIntegerCodec, 1n, codec);
    testCodecBidirectionally(t, PositiveIntegerCodec, 2n, codec);
    testCodecBidirectionally(t, PositiveIntegerCodec, 42n, codec);
    testCodecBidirectionally(t, PositiveIntegerCodec, 100n, codec);
    testCodecBidirectionally(t, PositiveIntegerCodec, 1000000n, codec);
    testCodecBidirectionally(
      t,
      PositiveIntegerCodec,
      123456789012345678901234567890n,
      codec,
    );
  });

  test(`PositiveIntegerCodec - write rejects non-bigint [${codec.name}]`, t => {
    const writer = codec.makeWriter();
    testThrowsWithCause(
      t,
      () => {
        PositiveIntegerCodec.write(42, writer);
      },
      'value must be a bigint',
    );
  });

  test(`PositiveIntegerCodec - write rejects zero [${codec.name}]`, t => {
    const writer = codec.makeWriter();
    testThrowsWithCause(
      t,
      () => {
        PositiveIntegerCodec.write(0n, writer);
      },
      'value must be positive',
    );
  });

  test(`PositiveIntegerCodec - write rejects negative integers [${codec.name}]`, t => {
    const writer = codec.makeWriter();
    testThrowsWithCause(
      t,
      () => {
        PositiveIntegerCodec.write(-1n, writer);
      },
      'value must be positive',
    );

    const writer2 = codec.makeWriter();
    testThrowsWithCause(
      t,
      () => {
        PositiveIntegerCodec.write(-100n, writer2);
      },
      'value must be positive',
    );
  });

  test(`PositiveIntegerCodec - read rejects zero [${codec.name}]`, t => {
    // Manually create an encoding of 0
    const writer = codec.makeWriter();
    writer.writeInteger(0n);
    const bytes = writer.getBytes();
    const reader = codec.makeReader(bytes);

    testThrowsWithCause(
      t,
      () => {
        PositiveIntegerCodec.read(reader);
      },
      'value must be positive',
    );
  });

  test(`PositiveIntegerCodec - read rejects negative integers [${codec.name}]`, t => {
    // Manually create an encoding of -1
    const writer = codec.makeWriter();
    writer.writeInteger(-1n);
    const bytes = writer.getBytes();
    const reader = codec.makeReader(bytes);

    testThrowsWithCause(
      t,
      () => {
        PositiveIntegerCodec.read(reader);
      },
      'value must be positive',
    );
  });

  // ===== NonNegativeIntegerCodec Tests =====

  test(`NonNegativeIntegerCodec - valid non-negative integers including zero [${codec.name}]`, t => {
    testCodecBidirectionally(t, NonNegativeIntegerCodec, 0n, codec);
    testCodecBidirectionally(t, NonNegativeIntegerCodec, 1n, codec);
    testCodecBidirectionally(t, NonNegativeIntegerCodec, 2n, codec);
    testCodecBidirectionally(t, NonNegativeIntegerCodec, 42n, codec);
    testCodecBidirectionally(t, NonNegativeIntegerCodec, 100n, codec);
    testCodecBidirectionally(t, NonNegativeIntegerCodec, 1000000n, codec);
    testCodecBidirectionally(
      t,
      NonNegativeIntegerCodec,
      123456789012345678901234567890n,
      codec,
    );
  });

  test(`NonNegativeIntegerCodec - write rejects non-bigint [${codec.name}]`, t => {
    const writer = codec.makeWriter();
    testThrowsWithCause(
      t,
      () => {
        NonNegativeIntegerCodec.write(42, writer);
      },
      'value must be a bigint',
    );
  });

  test(`NonNegativeIntegerCodec - write rejects negative integers [${codec.name}]`, t => {
    const writer = codec.makeWriter();
    testThrowsWithCause(
      t,
      () => {
        NonNegativeIntegerCodec.write(-1n, writer);
      },
      'value must be non-negative',
    );

    const writer2 = codec.makeWriter();
    testThrowsWithCause(
      t,
      () => {
        NonNegativeIntegerCodec.write(-100n, writer2);
      },
      'value must be non-negative',
    );
  });

  test(`NonNegativeIntegerCodec - read rejects negative integers [${codec.name}]`, t => {
    // Manually create an encoding of -1
    const writer = codec.makeWriter();
    writer.writeInteger(-1n);
    const bytes = writer.getBytes();
    const reader = codec.makeReader(bytes);

    testThrowsWithCause(
      t,
      () => {
        NonNegativeIntegerCodec.read(reader);
      },
      'value must be non-negative',
    );
  });
}
