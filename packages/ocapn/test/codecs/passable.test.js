// @ts-check

/**
 * @import { CodecTestEntry } from './_codecs_util.js'
 */

import test from '@endo/ses-ava/test.js';

import { makeTagged } from '@endo/pass-style';
import { makeSelector } from '../../src/selector.js';
import { recordSyrup } from './_syrup_util.js';
import {
  exporterLocation,
  makeCodecTestKit,
  runTableTestsAllCodecs,
  AllCodecs,
  SyrupCodec,
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
    name: 'struct with bigint and boolean',
    value: harden({ abc: 123n, xyz: true }),
  },
  {
    name: 'struct with empty string key',
    value: harden({ '': 10n, i: 20n }),
  },
  {
    name: 'struct with out of order keys',
    value: harden({ b: 10n, a: 20n }),
  },
  {
    name: 'struct with "type" key',
    value: harden({ type: 'invalid', abc: 'foo' }),
  },
  {
    name: 'struct with known record type',
    value: harden({ type: 'ocapn-peer', b: 10n, a: 20n }),
  },
  {
    name: 'tagged value',
    value: makeTagged('hello', ['world']),
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
    value: harden(Error('Test error')),
  },
  {
    name: 'error empty',
    value: harden(Error('')),
  },
  {
    name: 'error with special chars',
    value: harden(
      Error('Error: "quoted" and \'single\' with\nnewline and\ttab'),
    ),
  },
  // Nested structures with errors and floats
  {
    name: 'error in array',
    value: harden(['before', Error('Nested error'), 'after']),
  },
  {
    name: 'error in record',
    value: harden({
      error: Error('Message'),
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
  {
    name: 'sturdyref in list',
    makeValue: testKit =>
      harden([
        testKit.sturdyRefTracker.makeSturdyRef(
          exporterLocation,
          encodeSwissnum('123'),
        ),
      ]),
    customAssert: (t, actual) => {
      t.is(actual.length, 1);
      const details = getSturdyRefDetails(actual[0]);
      if (!details) {
        throw Error('SturdyRef has no details');
      }
      t.deepEqual(details.location, exporterLocation);
      t.deepEqual(details.swissNum, encodeSwissnum('123'));
    },
  },
  // Tagged objects containing references
  {
    name: 'tagged with reference (local object)',
    makeValue: testKit => makeTagged('myTag', testKit.makeLocalObject(100n)),
    makeExpectedValue: testKit =>
      makeTagged('myTag', testKit.referenceKit.provideRemoteObjectValue(100n)),
  },
  {
    name: 'tagged with reference (local promise)',
    makeValue: testKit =>
      makeTagged('promiseTag', testKit.makeLocalPromise(101n)),
    makeExpectedValue: testKit =>
      makeTagged(
        'promiseTag',
        testKit.referenceKit.provideRemotePromiseValue(101n),
      ),
  },
  {
    name: 'tagged with reference in list',
    makeValue: testKit =>
      makeTagged('listTag', harden([testKit.makeLocalObject(102n), 'hello'])),
    makeExpectedValue: testKit =>
      makeTagged(
        'listTag',
        harden([testKit.referenceKit.provideRemoteObjectValue(102n), 'hello']),
      ),
  },
  {
    name: 'tagged with sturdyref',
    makeValue: testKit =>
      makeTagged(
        'sturdyTag',
        testKit.sturdyRefTracker.makeSturdyRef(
          exporterLocation,
          encodeSwissnum('456'),
        ),
      ),
    // SturdyRefs need customAssert because object identity differs after round-trip
    customAssert: (t, actual) => {
      t.is(actual[Symbol.toStringTag], 'sturdyTag');
      const details = getSturdyRefDetails(actual.payload);
      if (!details) {
        throw Error('SturdyRef has no details');
      }
      t.deepEqual(details.location, exporterLocation);
      t.deepEqual(details.swissNum, encodeSwissnum('456'));
    },
  },
];

runTableTestsAllCodecs(
  test,
  'PassableCodec',
  table,
  testKit => testKit.PassableCodec,
);

// ===== Syrup-specific error tests =====
// These tests use Syrup-specific encoding to test error handling

test('error on unknown record type in passable [syrup]', t => {
  const codec = PassableCodec;
  const syrup = recordSyrup('unknown-record-type');
  const syrupBytes = immutableArrayBufferToUint8Array(syrup);
  const syrupReader = SyrupCodec.makeReader(syrupBytes, {
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

test('passable fails with unordered keys [syrup]', t => {
  const codec = PassableCodec;
  const syrup = '{3"dog20+3"cat10+}';
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = SyrupCodec.makeReader(syrupBytes, {
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

test('passable fails with repeated keys [syrup]', t => {
  const codec = PassableCodec;
  const syrup = '{3"cat10+3"cat20+}';
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = SyrupCodec.makeReader(syrupBytes, {
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

// ===== Special Cases (run with all codec formats) =====

for (const codec of AllCodecs) {
  test(`passable error - write Error object [${codec.name}]`, t => {
    // Test writing an actual Error object (reads back as plain object)
    const writer = codec.makeWriter();
    PassableCodec.write(harden(Error('Test error')), writer);
    const bytes = writer.getBytes();

    const reader = codec.makeReader(bytes, { name: 'error write' });
    const result = PassableCodec.read(reader);
    t.deepEqual(result, Error('Test error'));
  });

  test(`passable error - with unicode characters [${codec.name}]`, t => {
    // Test error with unicode characters
    const message = 'Error with unicode: © ñ Ω α β';
    const writer = codec.makeWriter();
    PassableCodec.write(harden(Error(message)), writer);
    const bytes = writer.getBytes();

    const reader = codec.makeReader(bytes, { name: 'error unicode' });
    const result = PassableCodec.read(reader);
    t.deepEqual(result, Error(message));
  });

  test(`passable nested - float64 in containers [${codec.name}]`, t => {
    // Test floats in arrays and records
    const value = harden({
      numbers: [1.0, 2.5, 3.14159],
      point: { x: 2.0, y: 3.5 },
    });
    const writer = codec.makeWriter();
    PassableCodec.write(value, writer);
    const bytes = writer.getBytes();

    const reader = codec.makeReader(bytes, { name: 'float64 nested' });
    const result = PassableCodec.read(reader);
    t.deepEqual(result, {
      numbers: [1.0, 2.5, 3.14159],
      point: { x: 2.0, y: 3.5 },
    });
  });

  test(`passable nested - mixed types with error [${codec.name}]`, t => {
    // Test error objects nested in complex structures
    const value = harden({
      count: 10n,
      error: harden(Error('Failed')),
      name: 'test',
      ratio: 0.5,
    });
    const writer = codec.makeWriter();
    PassableCodec.write(value, writer);
    const bytes = writer.getBytes();

    const reader = codec.makeReader(bytes, { name: 'mixed with error' });
    const result = PassableCodec.read(reader);
    t.deepEqual(result, {
      count: 10n,
      error: Error('Failed'),
      name: 'test',
      ratio: 0.5,
    });
  });

  test(`passable string - with emoji (supplementary characters) [${codec.name}]`, t => {
    // Emojis and other supplementary characters (outside BMP) are valid Unicode
    // and can be encoded in UTF-8.
    const stringWithEmoji = 'Hello 🚀 World';
    const writer = codec.makeWriter();
    PassableCodec.write(stringWithEmoji, writer);
    const bytes = writer.getBytes();

    const reader = codec.makeReader(bytes, { name: 'emoji string' });
    const result = PassableCodec.read(reader);
    t.is(result, stringWithEmoji);
  });

  test(`passable string - with multiple emojis [${codec.name}]`, t => {
    const stringWithEmojis = '🚀 ❌ ✓';
    const writer = codec.makeWriter();
    PassableCodec.write(stringWithEmojis, writer);
    const bytes = writer.getBytes();

    const reader = codec.makeReader(bytes, { name: 'multi-emoji string' });
    const result = PassableCodec.read(reader);
    t.is(result, stringWithEmojis);
  });
}
