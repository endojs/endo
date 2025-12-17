// @ts-check

/**
 * @import { CodecTestEntry } from './_codecs_util.js'
 */

import test from '@endo/ses-ava/test.js';

import { makeTagged } from '@endo/pass-style';
import { makeSyrupReader } from '../../src/syrup/decode.js';
import { makeSyrupWriter } from '../../src/syrup/encode.js';
import { makeSelector } from '../../src/selector.js';
import { recordSyrup } from './_syrup_util.js';
import {
  exporterLocation,
  makeCodecTestKit,
  runTableTests,
} from './_codecs_util.js';
import { throws } from '../_util.js';
import {
  immutableArrayBufferToUint8Array,
  uint8ArrayToImmutableArrayBuffer,
} from '../../src/buffer-utils.js';
import { encodeSwissnum } from '../../src/client/util.js';
import { getSturdyRefDetails } from '../../src/client/sturdyrefs.js';

const textEncoder = new TextEncoder();

const { PassableCodec } = makeCodecTestKit();

// The PassableCodec covers References (Targets and Promises), but these tests do not,
// as it would entrain the entire client (especially for third-party references). They are tested
// in the client tests.

/** @type {CodecTestEntry[]} */
const table = [
  { name: 'undefined', value: undefined },
  { name: 'null', value: null },
  { name: 'boolean true', value: true },
  { name: 'boolean false', value: false },
  { name: 'integer 123', value: 123n },
  { name: 'string hello', value: 'hello' },
  {
    name: 'byte array hello',
    value: uint8ArrayToImmutableArrayBuffer(
      new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]),
    ),
  },
  {
    name: 'byte array',
    value: uint8ArrayToImmutableArrayBuffer(
      new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]),
    ),
  },
  {
    name: 'selector',
    value: makeSelector('hello'),
  },
  {
    name: 'array of selectors',
    value: harden([makeSelector('hello'), makeSelector('world')]),
  },
  {
    name: 'array of strings',
    value: harden(['hello', 'world']),
  },
  {
    name: 'object with bigint and boolean',
    value: harden({ abc: 123n, xyz: true }),
  },
  {
    name: 'tagged value',
    value: makeTagged('hello', ['world']),
  },
  {
    name: 'object with empty string key',
    value: harden({ '': 10n, i: 20n }),
  },
  // Float64 numbers - 'D' (0x44) followed by 8 bytes of IEEE 754 big-endian
  {
    name: 'float64 positive',
    value: 3.2,
  },
  {
    name: 'float64 zero',
    value: 0,
  },
  {
    name: 'float64 negative',
    value: -42.5,
  },
  {
    name: 'float64 infinity',
    value: Infinity,
  },
  {
    name: 'float64 negative infinity',
    value: -Infinity,
  },
  {
    name: 'float64 NaN',
    value: NaN,
    customAssert: (t, actual, expected) => {
      t.true(Number.isNaN(actual), 'actual should be NaN');
      t.true(Number.isNaN(expected), 'expected should be NaN');
    },
  },
  // Errors - read as plain objects, write as dictionaries (different syrup format)
  {
    name: 'error simple',
    value: harden({ type: 'desc:error', message: 'Test error' }),
  },
  {
    name: 'error empty',
    value: harden({ type: 'desc:error', message: '' }),
  },
  {
    name: 'error with special chars',
    value: harden({
      type: 'desc:error',
      message: 'Error: "quoted" and \'single\' with\nnewline and\ttab',
    }),
  },
  // Nested structures with errors and floats
  {
    name: 'error in array',
    value: harden([
      'before',
      { type: 'desc:error', message: 'Nested error' },
      'after',
    ]),
  },
  {
    name: 'error in record',
    value: harden({
      error: { type: 'desc:error', message: 'Message' },
      text: 'hello',
    }),
  },
  // SturdyRef
  {
    name: 'sturdyref',
    makeValue: testKit =>
      testKit.sturdyRefTracker.makeSturdyRef(
        exporterLocation,
        encodeSwissnum('123'),
      ),
    customAssert: (t, actual) => {
      const details = getSturdyRefDetails(actual);
      if (!details) {
        throw Error('SturdyRef has no details');
      }
      t.deepEqual(details.location, exporterLocation);
      t.deepEqual(details.swissNum, encodeSwissnum('123'));
    },
  },
];

runTableTests(test, 'PassableCodec', table, testKit => testKit.PassableCodec);

test('error on unknown record type in passable', t => {
  const codec = PassableCodec;
  const syrup = recordSyrup('unknown-record-type');
  const syrupBytes = immutableArrayBufferToUint8Array(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'unknown record type',
  });
  throws(t, () => codec.read(syrupReader), {
    message: 'OcapnPassable: read failed at index 0 of unknown record type',
    cause: {
      message:
        'OcapnPassableRecordUnion: read failed at index 0 of unknown record type',
      cause: {
        message:
          'OcapnPassableRecordUnion: Unexpected record type: "unknown-record-type"',
      },
    },
  });
});

test('passable fails with unordered keys', t => {
  const codec = PassableCodec;
  const syrup = '{3"dog20+3"cat10+}';
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'passable with unordered keys',
  });
  throws(t, () => codec.read(syrupReader), {
    message:
      'OcapnPassable: read failed at index 0 of passable with unordered keys',
    cause: {
      message:
        'OcapnStruct: read failed at index 0 of passable with unordered keys',
      cause: {
        message:
          'OcapnStruct keys must be in bytewise sorted order, got "cat" immediately after "dog" at index 9 of passable with unordered keys',
      },
    },
  });
});

test('passable fails with repeated keys', t => {
  const codec = PassableCodec;
  const syrup = '{3"cat10+3"cat20+}';
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'passable with repeated keys',
  });
  throws(t, () => codec.read(syrupReader), {
    message:
      'OcapnPassable: read failed at index 0 of passable with repeated keys',
    cause: {
      message:
        'OcapnStruct: read failed at index 0 of passable with repeated keys',
      cause: {
        message:
          'OcapnStruct must have unique keys, got repeated "cat" at index 9 of passable with repeated keys',
      },
    },
  });
});

// ===== Special Cases =====

test('passable error - write Error object', t => {
  // Test writing an actual Error object (reads back as plain object)
  const codec = PassableCodec;
  const writer = makeSyrupWriter();
  codec.write(harden(Error('Test error')), writer);
  const syrupBytes = writer.getBytes();

  const reader = makeSyrupReader(syrupBytes, { name: 'error write' });
  const result = codec.read(reader);
  t.deepEqual(result, { type: 'desc:error', message: 'Test error' });
});

test('passable error - with unicode characters', t => {
  // Test error with basic unicode (emojis use surrogate pairs which are invalid)
  const codec = PassableCodec;
  const message = 'Error with unicode: © ñ Ω α β';
  const writer = makeSyrupWriter();
  codec.write(harden(Error(message)), writer);
  const syrupBytes = writer.getBytes();

  const reader = makeSyrupReader(syrupBytes, { name: 'error unicode' });
  const result = codec.read(reader);
  t.deepEqual(result, { type: 'desc:error', message });
});

test('passable nested - float64 in containers', t => {
  // Test floats in arrays and records
  const codec = PassableCodec;
  const value = harden({
    numbers: [1.0, 2.5, 3.14159],
    point: { x: 2.0, y: 3.5 },
  });
  const writer = makeSyrupWriter();
  codec.write(value, writer);
  const syrupBytes = writer.getBytes();

  const reader = makeSyrupReader(syrupBytes, { name: 'float64 nested' });
  const result = codec.read(reader);
  t.deepEqual(result, {
    numbers: [1.0, 2.5, 3.14159],
    point: { x: 2.0, y: 3.5 },
  });
});

test('passable nested - mixed types with error', t => {
  // Test error objects nested in complex structures
  const codec = PassableCodec;
  const value = harden({
    count: 10n,
    error: harden(Error('Failed')),
    name: 'test',
    ratio: 0.5,
  });
  const writer = makeSyrupWriter();
  codec.write(value, writer);
  const syrupBytes = writer.getBytes();

  const reader = makeSyrupReader(syrupBytes, { name: 'mixed with error' });
  const result = codec.read(reader);
  t.deepEqual(result, {
    count: 10n,
    error: { type: 'desc:error', message: 'Failed' },
    name: 'test',
    ratio: 0.5,
  });
});

test('passable string - fails with emoji (surrogate pairs)', t => {
  // Emojis like 🚀 use UTF-16 surrogate pairs (U+D800-U+DFFF) which are invalid in OCapN
  const codec = PassableCodec;
  const stringWithEmoji = 'Hello 🚀 World';
  const writer = makeSyrupWriter();

  throws(t, () => codec.write(stringWithEmoji, writer), {
    message: 'OcapnPassable: write failed at index 0 of <unknown>',
    cause: {
      message: 'String: write failed at index 0 of <unknown>',
      cause: {
        message:
          'Invalid string characters "🚀" in string "Hello 🚀 World" at index 0',
      },
    },
  });
});

test('passable string - fails with multiple emojis', t => {
  const codec = PassableCodec;
  const stringWithEmojis = '🚀 ❌ ✓';
  const writer = makeSyrupWriter();

  throws(t, () => codec.write(stringWithEmojis, writer), {
    message: 'OcapnPassable: write failed at index 0 of <unknown>',
    cause: {
      message: 'String: write failed at index 0 of <unknown>',
      cause: {
        message:
          'Invalid string characters "🚀" in string "🚀 ❌ ✓" at index 0',
      },
    },
  });
});
