// @ts-check

/**
 * @file Interoperability tests validating OCapN CBOR output can be parsed
 * by an off-the-shelf CBOR library (the `cbor` npm package).
 *
 * This is a critical validation step to ensure our encoding is spec-compliant
 * and interoperable with other implementations.
 */

import { Buffer } from 'buffer';
import test from '@endo/ses-ava/test.js';
import cbor from 'cbor';
import { makeCborWriter } from '../../src/cbor/encode.js';
import {
  bytesToHexString,
  cborToDiagnostic,
} from '../../src/cbor/diagnostic.js';
import { uint8ArrayToImmutableArrayBuffer } from '../../src/buffer-utils.js';

/**
 * Encode using our writer, then decode with the `cbor` npm package.
 * @param {(writer: ReturnType<typeof makeCborWriter>) => void} encoder
 * @returns {Promise<{value: any, hex: string, diagnostic: string}>}
 */
async function encodeAndValidate(encoder) {
  const writer = makeCborWriter({ name: 'test' });
  encoder(writer);
  const bytes = writer.getBytes();
  const hex = bytesToHexString(bytes);
  const diagnostic = cborToDiagnostic(bytes);

  // Decode with the external cbor library
  const value = await cbor.decodeFirst(bytes);

  return { value, hex, diagnostic };
}

// ===== Macros for Table-Driven Tests =====

/**
 * Macro for testing simple values with exact equality.
 */
const simpleValueMacro = test.macro({
  /**
   * @param {import('ava').ExecutionContext} t
   * @param {(w: ReturnType<typeof makeCborWriter>) => void} encoder
   * @param {any} expectedValue
   * @param {string} [expectedDiagnostic]
   */
  async exec(t, encoder, expectedValue, expectedDiagnostic) {
    const { value, diagnostic } = await encodeAndValidate(encoder);
    t.is(value, expectedValue);
    if (expectedDiagnostic !== undefined) {
      t.is(diagnostic, expectedDiagnostic);
    }
  },
  title(providedTitle = '') {
    return `interop: ${providedTitle}`;
  },
});

/**
 * Macro for testing float64 values with special handling for NaN/-0.
 */
const float64Macro = test.macro({
  /**
   * @param {import('ava').ExecutionContext} t
   * @param {number} inputValue
   * @param {string} [expectedDiagnostic]
   */
  async exec(t, inputValue, expectedDiagnostic) {
    const { value, diagnostic } = await encodeAndValidate(w =>
      w.writeFloat64(inputValue),
    );
    if (Number.isNaN(inputValue)) {
      t.true(Number.isNaN(value));
    } else if (Object.is(inputValue, -0)) {
      t.true(Object.is(value, -0));
    } else {
      t.is(value, inputValue);
    }
    if (expectedDiagnostic !== undefined) {
      t.is(diagnostic, expectedDiagnostic);
    }
  },
  title(providedTitle, inputValue) {
    return `interop: float64 ${providedTitle || inputValue}`;
  },
});

/**
 * Macro for testing bignum integers.
 */
const bignumMacro = test.macro({
  /**
   * @param {import('ava').ExecutionContext} t
   * @param {bigint} inputValue
   * @param {string} [expectedDiagnostic]
   */
  async exec(t, inputValue, expectedDiagnostic) {
    const { value, diagnostic } = await encodeAndValidate(w =>
      w.writeInteger(inputValue),
    );
    // cbor library may return a Tagged object for edge cases (0, -1)
    if (value && value.tag !== undefined) {
      // Tagged representation
      if (inputValue === 0n) {
        t.is(value.tag, 2);
        t.is(value.value.length, 0);
      } else if (inputValue === -1n) {
        t.is(value.tag, 3);
        t.is(value.value.length, 0);
      }
    } else {
      t.is(BigInt(value), inputValue);
    }
    if (expectedDiagnostic !== undefined) {
      t.is(diagnostic, expectedDiagnostic);
    }
  },
  title(providedTitle, inputValue) {
    return `interop: integer ${providedTitle || inputValue} (bignum)`;
  },
});

/**
 * Macro for testing string encoding.
 */
const stringMacro = test.macro({
  /**
   * @param {import('ava').ExecutionContext} t
   * @param {string} inputValue
   * @param {string} [expectedDiagnostic]
   */
  async exec(t, inputValue, expectedDiagnostic) {
    const { value, diagnostic } = await encodeAndValidate(w =>
      w.writeString(inputValue),
    );
    t.is(value, inputValue);
    if (expectedDiagnostic !== undefined) {
      t.is(diagnostic, expectedDiagnostic);
    }
  },
  title(providedTitle, inputValue) {
    return `interop: string ${providedTitle || JSON.stringify(inputValue)}`;
  },
});

/**
 * Macro for testing diagnostic notation output.
 */
const diagnosticMacro = test.macro({
  /**
   * @param {import('ava').ExecutionContext} t
   * @param {(w: ReturnType<typeof makeCborWriter>) => void} encoder
   * @param {string} expectedDiagnostic
   */
  async exec(t, encoder, expectedDiagnostic) {
    const { diagnostic } = await encodeAndValidate(encoder);
    t.is(diagnostic, expectedDiagnostic);
  },
  title(providedTitle, _encoder, expectedDiagnostic) {
    return `interop: diagnostic ${providedTitle || expectedDiagnostic}`;
  },
});

// ===== Simple Values =====

test('boolean true', simpleValueMacro, w => w.writeBoolean(true), true, 'true');
test(
  'boolean false',
  simpleValueMacro,
  w => w.writeBoolean(false),
  false,
  'false',
);
test('null', simpleValueMacro, w => w.writeNull(), null, 'null');
test(
  'undefined',
  simpleValueMacro,
  w => w.writeUndefined(),
  undefined,
  'undefined',
);

// ===== Integers as Bignums =====

test('0', bignumMacro, 0n, "2(h'')");
test('1', bignumMacro, 1n, "2(h'01')");
test('255', bignumMacro, 255n, "2(h'ff')");
test('256', bignumMacro, 256n, "2(h'0100')");
test('large', bignumMacro, 0x123456789abcdef0n, "2(h'123456789abcdef0')");
test('-1', bignumMacro, -1n, "3(h'')");
test('-256', bignumMacro, -256n);
test('large negative', bignumMacro, -0x123456789abcdef0n);

// ===== Float64 =====

test('0.0', float64Macro, 0.0, '0.0');
test('-0.0', float64Macro, -0.0, '-0.0');
test('1.0', float64Macro, 1.0);
test('pi', float64Macro, Math.PI);
test('Infinity', float64Macro, Infinity, 'Infinity');
test('-Infinity', float64Macro, -Infinity, '-Infinity');
test('NaN', float64Macro, NaN, 'NaN');

// ===== Strings =====

test('empty', stringMacro, '', '""');
test('simple', stringMacro, 'hello', '"hello"');
test('unicode', stringMacro, '日本語');
test('long (256 bytes)', stringMacro, 'a'.repeat(256));

test('interop: emoji string (supplementary characters)', async t => {
  // Emojis and other supplementary characters (outside BMP) are valid Unicode
  // and can be encoded in UTF-8.
  const { value } = await encodeAndValidate(w => w.writeString('👋🌍'));
  t.is(value, '👋🌍');
});

// ===== Byte Strings =====

test('interop: empty byte string', async t => {
  const { value, diagnostic } = await encodeAndValidate(w =>
    w.writeBytestring(new ArrayBuffer(0)),
  );
  t.true(value instanceof Uint8Array || value instanceof Buffer);
  t.is(value.length, 0);
  t.is(diagnostic, "h''");
});

test('interop: byte string', async t => {
  const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
  const { value, diagnostic } = await encodeAndValidate(w =>
    w.writeBytestring(uint8ArrayToImmutableArrayBuffer(bytes)),
  );
  t.is(value.length, 4);
  t.deepEqual(Array.from(value), [0xde, 0xad, 0xbe, 0xef]);
  t.is(diagnostic, "h'deadbeef'");
});

// ===== Selectors (Tag 280) =====

test('interop: selector is parsed as tagged value', async t => {
  const { value, diagnostic } = await encodeAndValidate(w =>
    w.writeSelectorFromString('method'),
  );
  // cbor library returns a Tagged object
  t.is(value.tag, 280);
  t.is(value.value, 'method');
  t.is(diagnostic, '280("method")');
});

test('interop: selector with colon', async t => {
  const { value, diagnostic } = await encodeAndValidate(w =>
    w.writeSelectorFromString('op:deliver'),
  );
  t.is(value.tag, 280);
  t.is(value.value, 'op:deliver');
  t.is(diagnostic, '280("op:deliver")');
});

// ===== Arrays =====

test('interop: empty array', async t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeArrayHeader(0);
  const bytes = writer.getBytes();
  const value = await cbor.decodeFirst(bytes);
  t.deepEqual(value, []);
  t.is(cborToDiagnostic(bytes), '[]');
});

test('interop: array with integers', async t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeArrayHeader(3);
  writer.writeInteger(1n);
  writer.writeInteger(2n);
  writer.writeInteger(3n);
  const bytes = writer.getBytes();
  const value = await cbor.decodeFirst(bytes);
  t.is(value.length, 3);
  t.is(BigInt(value[0]), 1n);
  t.is(BigInt(value[1]), 2n);
  t.is(BigInt(value[2]), 3n);
});

test('interop: array with mixed types', async t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeArrayHeader(4);
  writer.writeBoolean(true);
  writer.writeInteger(42n);
  writer.writeString('hello');
  writer.writeFloat64(3.14);
  const bytes = writer.getBytes();
  const value = await cbor.decodeFirst(bytes);
  t.is(value.length, 4);
  t.is(value[0], true);
  t.is(BigInt(value[1]), 42n);
  t.is(value[2], 'hello');
  t.is(value[3], 3.14);
});

test('interop: nested arrays', async t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeArrayHeader(2);
  writer.writeArrayHeader(1);
  writer.writeInteger(1n);
  writer.writeArrayHeader(2);
  writer.writeInteger(2n);
  writer.writeInteger(3n);
  const bytes = writer.getBytes();
  const value = await cbor.decodeFirst(bytes);
  t.is(value[0].length, 1);
  t.is(BigInt(value[0][0]), 1n);
  t.is(value[1].length, 2);
  t.is(BigInt(value[1][0]), 2n);
  t.is(BigInt(value[1][1]), 3n);
});

// ===== Maps =====

test('interop: empty map', async t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeMapHeader(0);
  const bytes = writer.getBytes();
  const value = await cbor.decodeFirst(bytes);
  // cbor library may return empty object or Map
  t.true(
    value instanceof Map ? value.size === 0 : Object.keys(value).length === 0,
  );
  t.is(cborToDiagnostic(bytes), '{}');
});

test('interop: map with string keys', async t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeMapHeader(2);
  writer.writeString('a');
  writer.writeInteger(1n);
  writer.writeString('b');
  writer.writeInteger(2n);
  const bytes = writer.getBytes();
  const value = await cbor.decodeFirst(bytes);
  // cbor library may return Map or object depending on version/config
  if (value instanceof Map) {
    t.is(BigInt(value.get('a')), 1n);
    t.is(BigInt(value.get('b')), 2n);
  } else {
    t.is(BigInt(value.a), 1n);
    t.is(BigInt(value.b), 2n);
  }
});

// ===== Records (Tag 27) =====

test('interop: record structure', async t => {
  // Manually write Tag 27 + array
  // Tag 27 = 0xD8 0x1B
  const tag27Bytes = new Uint8Array([0xd8, 0x1b]);

  // Create a simple record: 27([280("test"), 42])
  const innerWriter = makeCborWriter({ name: 'inner' });
  innerWriter.writeArrayHeader(2);
  innerWriter.writeSelectorFromString('test');
  innerWriter.writeInteger(42n);
  const innerBytes = innerWriter.getBytes();

  // Prepend Tag 27
  const fullBytes = new Uint8Array(tag27Bytes.length + innerBytes.length);
  fullBytes.set(tag27Bytes, 0);
  fullBytes.set(innerBytes, tag27Bytes.length);

  const value = await cbor.decodeFirst(fullBytes);

  // cbor library returns a Tagged object
  t.is(value.tag, 27);
  t.true(Array.isArray(value.value));
  t.is(value.value.length, 2);
  t.is(value.value[0].tag, 280);
  t.is(value.value[0].value, 'test');
  t.is(BigInt(value.value[1]), 42n);

  // Verify diagnostic notation
  const diag = cborToDiagnostic(fullBytes);
  t.is(diag, '27([280("test"), 2(h\'2a\')])');
});

test('interop: desc:import-object record', async t => {
  // Create: 27([280("desc:import-object"), 5])
  const tag27Bytes = new Uint8Array([0xd8, 0x1b]);

  const innerWriter = makeCborWriter({ name: 'inner' });
  innerWriter.writeArrayHeader(2);
  innerWriter.writeSelectorFromString('desc:import-object');
  innerWriter.writeInteger(5n);
  const innerBytes = innerWriter.getBytes();

  const fullBytes = new Uint8Array(tag27Bytes.length + innerBytes.length);
  fullBytes.set(tag27Bytes, 0);
  fullBytes.set(innerBytes, tag27Bytes.length);

  const value = await cbor.decodeFirst(fullBytes);

  t.is(value.tag, 27);
  t.is(value.value[0].tag, 280);
  t.is(value.value[0].value, 'desc:import-object');
  t.is(BigInt(value.value[1]), 5n);
});

// ===== Tagged Values (Tag 55799) =====

test('interop: tagged value', async t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeTaggedValue('decimal', () => {
    writer.writeString('3.14');
  });
  const bytes = writer.getBytes();
  const value = await cbor.decodeFirst(bytes);

  // cbor library returns a Tagged object
  t.is(value.tag, 55799);
  t.true(Array.isArray(value.value));
  t.is(value.value[0], 'decimal');
  t.is(value.value[1], '3.14');

  t.is(cborToDiagnostic(bytes), '55799(["decimal", "3.14"])');
});

// ===== Complex Nested Structures =====

test('interop: complex nested structure', async t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeArrayHeader(3);

  // Element 1: map
  writer.writeMapHeader(2);
  writer.writeString('name');
  writer.writeString('Alice');
  writer.writeString('age');
  writer.writeInteger(30n);

  // Element 2: array of selectors
  writer.writeArrayHeader(2);
  writer.writeSelectorFromString('foo');
  writer.writeSelectorFromString('bar');

  // Element 3: nested array with mixed types
  writer.writeArrayHeader(3);
  writer.writeBoolean(true);
  writer.writeFloat64(1.5);
  writer.writeBytestring(
    uint8ArrayToImmutableArrayBuffer(new Uint8Array([1, 2, 3])),
  );

  const bytes = writer.getBytes();
  const value = await cbor.decodeFirst(bytes);

  // Verify structure
  t.is(value.length, 3);

  // Map - cbor library may return Map or object
  const mapValue = value[0];
  if (mapValue instanceof Map) {
    t.is(mapValue.get('name'), 'Alice');
    t.is(BigInt(mapValue.get('age')), 30n);
  } else {
    t.is(mapValue.name, 'Alice');
    t.is(BigInt(mapValue.age), 30n);
  }

  // Array of selectors
  t.is(value[1][0].tag, 280);
  t.is(value[1][0].value, 'foo');
  t.is(value[1][1].tag, 280);
  t.is(value[1][1].value, 'bar');

  // Mixed array
  t.is(value[2][0], true);
  t.is(value[2][1], 1.5);
  t.deepEqual(Array.from(value[2][2]), [1, 2, 3]);
});

// ===== Diagnostic Notation Verification =====

/** @type {Array<{name: string, encode: (w: ReturnType<typeof makeCborWriter>) => void, expected: string}>} */
const diagnosticTests = [
  { name: 'true', encode: w => w.writeBoolean(true), expected: 'true' },
  { name: 'false', encode: w => w.writeBoolean(false), expected: 'false' },
  { name: 'null', encode: w => w.writeNull(), expected: 'null' },
  { name: 'undefined', encode: w => w.writeUndefined(), expected: 'undefined' },
  { name: 'empty string', encode: w => w.writeString(''), expected: '""' },
  { name: 'string', encode: w => w.writeString('hello'), expected: '"hello"' },
  { name: 'float64 0.0', encode: w => w.writeFloat64(0.0), expected: '0.0' },
  { name: 'float64 -0.0', encode: w => w.writeFloat64(-0.0), expected: '-0.0' },
  {
    name: 'float64 Infinity',
    encode: w => w.writeFloat64(Infinity),
    expected: 'Infinity',
  },
  {
    name: 'float64 -Infinity',
    encode: w => w.writeFloat64(-Infinity),
    expected: '-Infinity',
  },
  { name: 'float64 NaN', encode: w => w.writeFloat64(NaN), expected: 'NaN' },
  { name: 'integer 0', encode: w => w.writeInteger(0n), expected: "2(h'')" },
  { name: 'integer 1', encode: w => w.writeInteger(1n), expected: "2(h'01')" },
  { name: 'integer -1', encode: w => w.writeInteger(-1n), expected: "3(h'')" },
  {
    name: 'selector',
    encode: w => w.writeSelectorFromString('x'),
    expected: '280("x")',
  },
];

for (const { name, encode, expected } of diagnosticTests) {
  test(name, diagnosticMacro, encode, expected);
}

// ===== Specific OCapN Message Patterns =====

test('interop: op:deliver-only pattern', async t => {
  // Pattern: 27([280("op:deliver-only"), to-desc, args])
  const tag27Bytes = new Uint8Array([0xd8, 0x1b]);

  const innerWriter = makeCborWriter({ name: 'inner' });
  innerWriter.writeArrayHeader(3);

  // Label
  innerWriter.writeSelectorFromString('op:deliver-only');

  // Write the to-desc record inline (simplified without nested Tag 27)
  innerWriter.writeArrayHeader(2);
  innerWriter.writeSelectorFromString('desc:export');
  innerWriter.writeInteger(0n);

  // args: ["hello"]
  innerWriter.writeArrayHeader(1);
  innerWriter.writeString('hello');

  // Note: This is simplified - real message would have nested Tag 27
  const innerBytes = innerWriter.getBytes();
  const fullBytes = new Uint8Array(tag27Bytes.length + innerBytes.length);
  fullBytes.set(tag27Bytes, 0);
  fullBytes.set(innerBytes, tag27Bytes.length);

  const value = await cbor.decodeFirst(fullBytes);

  // Verify it can be parsed
  t.is(value.tag, 27);
  t.is(value.value[0].tag, 280);
  t.is(value.value[0].value, 'op:deliver-only');
});
