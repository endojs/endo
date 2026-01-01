// @ts-check

import test from '@endo/ses-ava/test.js';
import { makeCborReader } from '../../src/cbor/decode.js';
import { makeCborWriter } from '../../src/cbor/encode.js';
import { hexToBytes, cborToDiagnostic } from '../../src/cbor/diagnostic.js';

/**
 * Test helper: decode bytes and return the reader
 * @param {string} hex - Hex encoded CBOR bytes
 * @returns {ReturnType<typeof makeCborReader>}
 */
function decode(hex) {
  return makeCborReader(hexToBytes(hex), { name: 'test' });
}

/**
 * Test round-trip: encode then decode
 * @param {(writer: ReturnType<typeof makeCborWriter>) => void} encoder
 * @returns {ReturnType<typeof makeCborReader>}
 */
function roundTrip(encoder) {
  const writer = makeCborWriter({ name: 'encode' });
  encoder(writer);
  const bytes = writer.getBytes();
  return makeCborReader(bytes, { name: 'decode' });
}

// ===== Simple Values =====

test('decode boolean true', t => {
  const reader = decode('f5');
  t.is(reader.readBoolean(), true);
});

test('decode boolean false', t => {
  const reader = decode('f4');
  t.is(reader.readBoolean(), false);
});

test('decode null via readTypeAndMaybeValue', t => {
  const reader = decode('f6');
  const { type, value } = reader.readTypeAndMaybeValue();
  t.is(type, 'null');
  t.is(value, null);
});

test('decode undefined via readTypeAndMaybeValue', t => {
  const reader = decode('f7');
  const { type, value } = reader.readTypeAndMaybeValue();
  t.is(type, 'undefined');
  t.is(value, undefined);
});

// ===== Integers =====

test('decode integer 0', t => {
  const reader = decode('c240'); // Tag 2 + empty byte string
  t.is(reader.readInteger(), 0n);
});

test('decode integer 1', t => {
  const reader = decode('c24101'); // Tag 2 + h'01'
  t.is(reader.readInteger(), 1n);
});

test('decode integer 255', t => {
  const reader = decode('c241ff');
  t.is(reader.readInteger(), 255n);
});

test('decode integer 256', t => {
  const reader = decode('c2420100');
  t.is(reader.readInteger(), 256n);
});

test('decode large integer', t => {
  const reader = decode('c248123456789abcdef0');
  t.is(reader.readInteger(), 0x123456789abcdef0n);
});

test('decode negative integer -1', t => {
  const reader = decode('c340'); // Tag 3 + empty byte string
  t.is(reader.readInteger(), -1n);
});

test('decode negative integer -2', t => {
  const reader = decode('c34101'); // Tag 3 + h'01'
  t.is(reader.readInteger(), -2n);
});

test('decode negative integer -256', t => {
  const reader = decode('c341ff');
  t.is(reader.readInteger(), -256n);
});

test('decode negative integer -257', t => {
  const reader = decode('c3420100');
  t.is(reader.readInteger(), -257n);
});

// ===== Float64 =====

test('decode float64 0.0', t => {
  const reader = decode('fb0000000000000000');
  t.is(reader.readFloat64(), 0.0);
});

test('decode float64 -0.0', t => {
  const reader = decode('fb8000000000000000');
  t.true(Object.is(reader.readFloat64(), -0.0));
});

test('decode float64 1.0', t => {
  const reader = decode('fb3ff0000000000000');
  t.is(reader.readFloat64(), 1.0);
});

test('decode float64 -1.0', t => {
  const reader = decode('fbbff0000000000000');
  t.is(reader.readFloat64(), -1.0);
});

test('decode float64 1.5', t => {
  const reader = decode('fb3ff8000000000000');
  t.is(reader.readFloat64(), 1.5);
});

test('decode float64 Infinity', t => {
  const reader = decode('fb7ff0000000000000');
  t.is(reader.readFloat64(), Infinity);
});

test('decode float64 -Infinity', t => {
  const reader = decode('fbfff0000000000000');
  t.is(reader.readFloat64(), -Infinity);
});

test('decode float64 canonical NaN', t => {
  const reader = decode('fb7ff8000000000000');
  t.true(Number.isNaN(reader.readFloat64()));
});

test('decode float64 rejects non-canonical NaN', t => {
  // A different NaN bit pattern (signaling NaN)
  const reader = decode('fb7ff0000000000001');
  t.throws(() => reader.readFloat64(), { message: /Non-canonical NaN/ });
});

// ===== Strings =====

test('decode empty string', t => {
  const reader = decode('60');
  t.is(reader.readString(), '');
});

test('decode short string', t => {
  const reader = decode('6568656c6c6f'); // "hello"
  t.is(reader.readString(), 'hello');
});

test('decode string with unicode', t => {
  const reader = decode('6668c3a96c6c6f'); // "héllo"
  t.is(reader.readString(), 'héllo');
});

// ===== Byte Strings =====

test('decode empty byte string', t => {
  const reader = decode('40');
  const bytes = reader.readBytestring();
  t.is(bytes.byteLength, 0);
});

test('decode byte string', t => {
  const reader = decode('44deadbeef');
  const bytes = reader.readBytestring();
  const uint8 = new Uint8Array(bytes.slice());
  t.deepEqual(Array.from(uint8), [0xde, 0xad, 0xbe, 0xef]);
});

// ===== Selectors =====

test('decode selector', t => {
  const reader = decode('d90118666d6574686f64'); // 280("method")
  t.is(reader.readSelectorAsString(), 'method');
});

test('decode selector with colon', t => {
  // 280("op:deliver") - Tag 280 + "op:deliver" (10 chars)
  const reader = roundTrip(w => w.writeSelectorFromString('op:deliver'));
  t.is(reader.readSelectorAsString(), 'op:deliver');
});

// ===== Arrays =====

test('decode empty array', t => {
  const reader = decode('80'); // []
  reader.enterList();
  t.is(reader.peekListEnd(), true);
  reader.exitList();
});

test('decode array with elements', t => {
  // [true, false]
  const reader = decode('82f5f4');
  reader.enterList();
  t.is(reader.peekListEnd(), false);
  t.is(reader.readBoolean(), true);
  t.is(reader.peekListEnd(), false);
  t.is(reader.readBoolean(), false);
  t.is(reader.peekListEnd(), true);
  reader.exitList();
});

test('decode array with integers', t => {
  const reader = roundTrip(w => {
    w.writeArrayHeader(3);
    w.writeInteger(1n);
    w.writeInteger(2n);
    w.writeInteger(3n);
  });
  reader.enterList();
  t.is(reader.readInteger(), 1n);
  t.is(reader.readInteger(), 2n);
  t.is(reader.readInteger(), 3n);
  reader.exitList();
});

// ===== Maps =====

test('decode empty map', t => {
  const reader = decode('a0'); // {}
  reader.enterDictionary();
  t.is(reader.peekDictionaryEnd(), true);
  reader.exitDictionary();
});

test('decode map with string keys', t => {
  const reader = roundTrip(w => {
    w.writeMapHeader(2);
    w.writeString('a');
    w.writeInteger(1n);
    w.writeString('b');
    w.writeInteger(2n);
  });
  reader.enterDictionary();
  t.is(reader.readString(), 'a');
  t.is(reader.readInteger(), 1n);
  t.is(reader.readString(), 'b');
  t.is(reader.readInteger(), 2n);
  reader.exitDictionary();
});

// ===== Records (Tag 27) =====

test('decode record', t => {
  // 27([280("test"), 42])
  // Tag 27 = d81b
  // Array 2 = 82
  // Tag 280 "test" = d901186474657374
  // Integer 42 = c2412a
  const hex = 'd81b82d901186474657374c2412a';
  const reader = decode(hex);

  // Verify diagnostic notation
  const diag = cborToDiagnostic(hexToBytes(hex));
  t.is(diag, '27([280("test"), 2(h\'2a\')])');

  // Read the record
  reader.enterRecord();
  const label = reader.readRecordLabel();
  t.is(label.type, 'selector');
  t.is(label.value, 'test');
  t.is(reader.readInteger(), 42n);
  reader.exitRecord();
});

test('decode desc:import-object record', t => {
  const reader = roundTrip(w => {
    // Manually construct the record
    // We need to write Tag 27 prefix, which requires low-level access
    // For now, test components
    w.writeSelectorFromString('desc:import-object');
    w.writeInteger(5n);
  });

  const selector = reader.readSelectorAsString();
  t.is(selector, 'desc:import-object');
  const pos = reader.readInteger();
  t.is(pos, 5n);
});

// ===== Type Hints =====

test('peekTypeHint for boolean', t => {
  const reader = decode('f5');
  t.is(reader.peekTypeHint(), 'boolean');
});

test('peekTypeHint for float64', t => {
  const reader = decode('fb3ff0000000000000');
  t.is(reader.peekTypeHint(), 'float64');
});

test('peekTypeHint for integer (bignum)', t => {
  const reader = decode('c24101');
  t.is(reader.peekTypeHint(), 'number-prefix');
});

test('peekTypeHint for list', t => {
  const reader = decode('80');
  t.is(reader.peekTypeHint(), 'list');
});

test('peekTypeHint for dictionary', t => {
  const reader = decode('a0');
  t.is(reader.peekTypeHint(), 'dictionary');
});

test('peekTypeHint for record (tag 27)', t => {
  const reader = decode('d81b80'); // Tag 27 + empty array
  t.is(reader.peekTypeHint(), 'record');
});

// ===== readTypeAndMaybeValue =====

test('readTypeAndMaybeValue for boolean', t => {
  const reader = decode('f5');
  const result = reader.readTypeAndMaybeValue();
  t.is(result.type, 'boolean');
  t.is(result.value, true);
});

test('readTypeAndMaybeValue for integer', t => {
  const reader = decode('c24101');
  const result = reader.readTypeAndMaybeValue();
  t.is(result.type, 'integer');
  t.is(result.value, 1n);
});

test('readTypeAndMaybeValue for string', t => {
  const reader = decode('6568656c6c6f');
  const result = reader.readTypeAndMaybeValue();
  t.is(result.type, 'string');
  t.is(result.value, 'hello');
});

test('readTypeAndMaybeValue for bytestring', t => {
  const reader = decode('44deadbeef');
  const result = reader.readTypeAndMaybeValue();
  t.is(result.type, 'bytestring');
  t.is(result.value.byteLength, 4);
});

test('readTypeAndMaybeValue for selector', t => {
  const reader = decode('d90118666d6574686f64');
  const result = reader.readTypeAndMaybeValue();
  t.is(result.type, 'selector');
  t.is(result.value, 'method');
});

test('readTypeAndMaybeValue for list (returns null value)', t => {
  const reader = decode('80');
  const result = reader.readTypeAndMaybeValue();
  t.is(result.type, 'list');
  t.is(result.value, null);
});

test('readTypeAndMaybeValue for record (returns null value)', t => {
  const reader = decode('d81b80');
  const result = reader.readTypeAndMaybeValue();
  t.is(result.type, 'record');
  t.is(result.value, null);
});

// ===== Round-Trip Tests =====

test('round-trip: boolean', t => {
  t.is(roundTrip(w => w.writeBoolean(true)).readBoolean(), true);
  t.is(roundTrip(w => w.writeBoolean(false)).readBoolean(), false);
});

test('round-trip: integers', t => {
  const values = [0n, 1n, -1n, 255n, 256n, -256n, -257n, 0x123456789abcdef0n];
  for (const value of values) {
    t.is(roundTrip(w => w.writeInteger(value)).readInteger(), value);
  }
});

test('round-trip: floats', t => {
  const values = [0.0, -0.0, 1.0, -1.0, 1.5, Math.PI, Infinity, -Infinity];
  for (const value of values) {
    const result = roundTrip(w => w.writeFloat64(value)).readFloat64();
    if (Object.is(value, -0.0)) {
      t.true(Object.is(result, -0.0));
    } else {
      t.is(result, value);
    }
  }
});

test('round-trip: NaN', t => {
  t.true(Number.isNaN(roundTrip(w => w.writeFloat64(NaN)).readFloat64()));
});

test('round-trip: strings', t => {
  const values = ['', 'hello', 'héllo', '日本語', 'a'.repeat(256)];
  for (const value of values) {
    t.is(roundTrip(w => w.writeString(value)).readString(), value);
  }
});

test('round-trip: selectors', t => {
  const values = ['method', 'op:deliver', 'desc:import-object'];
  for (const value of values) {
    t.is(
      roundTrip(w => w.writeSelectorFromString(value)).readSelectorAsString(),
      value,
    );
  }
});

// ===== Error Cases =====

test('error: exit record when not in record', t => {
  const reader = decode('80'); // empty array
  reader.enterList();
  t.throws(() => reader.exitRecord(), { message: /not inside a record/ });
});

test('error: exit list when not in list', t => {
  const reader = decode('a0'); // empty map
  reader.enterDictionary();
  t.throws(() => reader.exitList(), { message: /not inside a list/ });
});

test('error: exit with remaining elements', t => {
  const reader = decode('82f5f4'); // [true, false]
  reader.enterList();
  reader.readBoolean(); // consume only one
  t.throws(() => reader.exitList(), { message: /remaining elements/ });
});

test('error: wrong type for readBoolean', t => {
  const reader = decode('6568656c6c6f'); // "hello"
  t.throws(() => reader.readBoolean(), { message: /Expected boolean/ });
});

test('error: wrong type for readInteger', t => {
  const reader = decode('f5'); // true
  t.throws(() => reader.readInteger(), { message: /Expected tag/ });
});

test('error: wrong tag for readInteger', t => {
  const reader = decode('d90118666d6574686f64'); // 280("method")
  t.throws(() => reader.readInteger(), { message: /Expected bignum tag/ });
});
