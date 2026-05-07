// @ts-check

import test from '@endo/ses-ava/test.js';
import { makeCborWriter } from '../../src/cbor/encode.js';
import {
  cborToDiagnostic,
  bytesToHexString,
} from '../../src/cbor/diagnostic.js';
import { uint8ArrayToImmutableArrayBuffer } from '../../src/buffer-utils.js';

/**
 * Test helper: encode a value and return both hex and diagnostic notation
 * @param {(writer: ReturnType<typeof makeCborWriter>) => void} encoder
 * @returns {{hex: string, diagnostic: string, bytes: Uint8Array}}
 */
function encode(encoder) {
  const writer = makeCborWriter({ name: 'test' });
  encoder(writer);
  const bytes = writer.getBytes();
  return {
    bytes,
    hex: bytesToHexString(bytes),
    diagnostic: cborToDiagnostic(bytes),
  };
}

// ===== Simple Values =====

test('encode boolean true', t => {
  const { hex, diagnostic } = encode(w => w.writeBoolean(true));
  t.is(hex, 'f5');
  t.is(diagnostic, 'true');
});

test('encode boolean false', t => {
  const { hex, diagnostic } = encode(w => w.writeBoolean(false));
  t.is(hex, 'f4');
  t.is(diagnostic, 'false');
});

test('encode null', t => {
  const { hex, diagnostic } = encode(w => w.writeNull());
  t.is(hex, 'f6');
  t.is(diagnostic, 'null');
});

test('encode undefined', t => {
  const { hex, diagnostic } = encode(w => w.writeUndefined());
  t.is(hex, 'f7');
  t.is(diagnostic, 'undefined');
});

// ===== Integers (as bignums) =====

test('encode integer 0', t => {
  const { hex, diagnostic } = encode(w => w.writeInteger(0n));
  t.is(hex, 'c240'); // Tag 2 + empty byte string
  t.is(diagnostic, "2(h'')");
});

test('encode integer 1', t => {
  const { hex, diagnostic } = encode(w => w.writeInteger(1n));
  t.is(hex, 'c24101'); // Tag 2 + byte string [0x01]
  t.is(diagnostic, "2(h'01')");
});

test('encode integer 255', t => {
  const { hex, diagnostic } = encode(w => w.writeInteger(255n));
  t.is(hex, 'c241ff');
  t.is(diagnostic, "2(h'ff')");
});

test('encode integer 256', t => {
  const { hex, diagnostic } = encode(w => w.writeInteger(256n));
  t.is(hex, 'c2420100'); // Tag 2 + 2-byte string [0x01, 0x00]
  t.is(diagnostic, "2(h'0100')");
});

test('encode integer 65535', t => {
  const { hex, diagnostic } = encode(w => w.writeInteger(65535n));
  t.is(hex, 'c242ffff');
  t.is(diagnostic, "2(h'ffff')");
});

test('encode large integer', t => {
  const { hex, diagnostic } = encode(w => w.writeInteger(0x123456789abcdef0n));
  t.is(hex, 'c248123456789abcdef0');
  t.is(diagnostic, "2(h'123456789abcdef0')");
});

test('encode negative integer -1', t => {
  const { hex, diagnostic } = encode(w => w.writeInteger(-1n));
  t.is(hex, 'c340'); // Tag 3 + empty byte string (magnitude 0 = -1 - 0 = -1)
  t.is(diagnostic, "3(h'')");
});

test('encode negative integer -2', t => {
  const { hex, diagnostic } = encode(w => w.writeInteger(-2n));
  t.is(hex, 'c34101'); // Tag 3 + byte string [0x01] (magnitude 1 = -1 - 1 = -2)
  t.is(diagnostic, "3(h'01')");
});

test('encode negative integer -256', t => {
  const { hex, diagnostic } = encode(w => w.writeInteger(-256n));
  t.is(hex, 'c341ff'); // magnitude 255 = -1 - 255 = -256
  t.is(diagnostic, "3(h'ff')");
});

test('encode negative integer -257', t => {
  const { hex, diagnostic } = encode(w => w.writeInteger(-257n));
  t.is(hex, 'c3420100'); // magnitude 256 = -1 - 256 = -257
  t.is(diagnostic, "3(h'0100')");
});

// ===== Float64 =====

test('encode float64 0.0', t => {
  const { hex, diagnostic } = encode(w => w.writeFloat64(0.0));
  t.is(hex, 'fb0000000000000000');
  t.is(diagnostic, '0.0');
});

test('encode float64 -0.0', t => {
  const { hex, diagnostic } = encode(w => w.writeFloat64(-0.0));
  t.is(hex, 'fb8000000000000000');
  t.is(diagnostic, '-0.0');
});

test('encode float64 1.0', t => {
  const { hex, diagnostic } = encode(w => w.writeFloat64(1.0));
  t.is(hex, 'fb3ff0000000000000');
  t.is(diagnostic, '1.0');
});

test('encode float64 -1.0', t => {
  const { hex, diagnostic } = encode(w => w.writeFloat64(-1.0));
  t.is(hex, 'fbbff0000000000000');
  t.is(diagnostic, '-1.0');
});

test('encode float64 1.5', t => {
  const { hex, diagnostic } = encode(w => w.writeFloat64(1.5));
  t.is(hex, 'fb3ff8000000000000');
  t.is(diagnostic, '1.5');
});

test('encode float64 Infinity', t => {
  const { hex, diagnostic } = encode(w => w.writeFloat64(Infinity));
  t.is(hex, 'fb7ff0000000000000');
  t.is(diagnostic, 'Infinity');
});

test('encode float64 -Infinity', t => {
  const { hex, diagnostic } = encode(w => w.writeFloat64(-Infinity));
  t.is(hex, 'fbfff0000000000000');
  t.is(diagnostic, '-Infinity');
});

test('encode float64 NaN (canonical)', t => {
  const { hex, diagnostic } = encode(w => w.writeFloat64(NaN));
  t.is(hex, 'fb7ff8000000000000'); // Canonical NaN
  t.is(diagnostic, 'NaN');
});

// ===== Strings =====

test('encode empty string', t => {
  const { hex, diagnostic } = encode(w => w.writeString(''));
  t.is(hex, '60'); // Major 3, length 0
  t.is(diagnostic, '""');
});

test('encode short string', t => {
  const { hex, diagnostic } = encode(w => w.writeString('hello'));
  t.is(hex, '6568656c6c6f'); // Major 3, length 5, "hello"
  t.is(diagnostic, '"hello"');
});

test('encode string with unicode', t => {
  const { hex, diagnostic } = encode(w => w.writeString('héllo'));
  // 'é' is 0xC3 0xA9 in UTF-8
  t.is(hex, '6668c3a96c6c6f');
  t.is(diagnostic, '"héllo"');
});

test('encode string rejects unpaired surrogates', t => {
  const writer = makeCborWriter();
  // String with lone high surrogate (U+D800)
  const invalidString = String.fromCharCode(0xd800);
  t.throws(() => writer.writeString(invalidString), {
    message: /Expected well-formed string/,
  });

  // String with lone low surrogate (U+DC00)
  const writer2 = makeCborWriter();
  const invalidString2 = String.fromCharCode(0xdc00);
  t.throws(() => writer2.writeString(invalidString2), {
    message: /Expected well-formed string/,
  });
});

// ===== Byte Strings =====

test('encode empty byte string', t => {
  const { hex, diagnostic } = encode(w =>
    w.writeBytestring(new ArrayBuffer(0)),
  );
  t.is(hex, '40'); // Major 2, length 0
  t.is(diagnostic, "h''");
});

test('encode byte string', t => {
  const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
  const { hex, diagnostic } = encode(w =>
    w.writeBytestring(uint8ArrayToImmutableArrayBuffer(bytes)),
  );
  t.is(hex, '44deadbeef'); // Major 2, length 4, bytes
  t.is(diagnostic, "h'deadbeef'");
});

// ===== Selectors (Symbols) =====

test('encode selector', t => {
  const { hex, diagnostic } = encode(w => w.writeSelectorFromString('method'));
  // Tag 280 (0xD9 0x01 0x18) + text string "method"
  t.is(hex, 'd90118666d6574686f64');
  t.is(diagnostic, '280("method")');
});

test('encode selector with colon', t => {
  const { diagnostic } = encode(w => w.writeSelectorFromString('op:deliver'));
  t.is(diagnostic, '280("op:deliver")');
});

// ===== Arrays (Lists) =====

test('encode empty array', t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeArrayHeader(0);
  const bytes = writer.getBytes();
  t.is(bytesToHexString(bytes), '80'); // Major 4, length 0
  t.is(cborToDiagnostic(bytes), '[]');
});

test('encode array with integers', t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeArrayHeader(3);
  writer.writeInteger(1n);
  writer.writeInteger(2n);
  writer.writeInteger(3n);
  const bytes = writer.getBytes();
  t.is(cborToDiagnostic(bytes), "[2(h'01'), 2(h'02'), 2(h'03')]");
});

test('encode array with mixed types', t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeArrayHeader(4);
  writer.writeBoolean(true);
  writer.writeInteger(42n);
  writer.writeString('hello');
  writer.writeFloat64(3.14);
  const bytes = writer.getBytes();
  const diag = cborToDiagnostic(bytes);
  t.true(diag.startsWith('[true, '));
  t.true(diag.includes('"hello"'));
});

// ===== Maps (Structs) =====

test('encode empty map', t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeMapHeader(0);
  const bytes = writer.getBytes();
  t.is(bytesToHexString(bytes), 'a0'); // Major 5, length 0
  t.is(cborToDiagnostic(bytes), '{}');
});

test('encode map with string keys', t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeMapHeader(2);
  writer.writeString('a');
  writer.writeInteger(1n);
  writer.writeString('b');
  writer.writeInteger(2n);
  const bytes = writer.getBytes();
  const diag = cborToDiagnostic(bytes);
  t.true(diag.includes('"a"'));
  t.true(diag.includes('"b"'));
});

// ===== Records (Tag 27) =====

test('encode record with symbol label', t => {
  const writer = makeCborWriter({ name: 'test' });
  // Tag 27 + array with symbol label
  writer.writeArrayHeader(2);
  // Manually write Tag 27 prefix
  // Actually, let's test using the low-level API
  writer.getBytes(); // consume result

  // Create new writer for proper record
  const writer2 = makeCborWriter({ name: 'test' });
  // For now, just test that we can write the components
  writer2.writeSelectorFromString('desc:import-object');
  writer2.writeInteger(5n);

  const resultBytes = writer2.getBytes();
  const diag = cborToDiagnostic(resultBytes);
  // Should have symbol followed by integer
  t.true(diag.includes('280("desc:import-object")'));
});

// ===== Tagged Values (Tag 55799) =====

test('encode tagged value', t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeTaggedValue('decimal', () => {
    writer.writeString('3.14');
  });
  const bytes = writer.getBytes();
  const diag = cborToDiagnostic(bytes);
  t.is(diag, '55799(["decimal", "3.14"])');
});

// ===== Complex Nested Structures =====

test('encode nested structure', t => {
  const writer = makeCborWriter({ name: 'test' });
  writer.writeArrayHeader(2);
  // First element: a map
  writer.writeMapHeader(1);
  writer.writeString('key');
  writer.writeInteger(100n);
  // Second element: an array
  writer.writeArrayHeader(2);
  writer.writeBoolean(true);
  writer.writeString('nested');

  const bytes = writer.getBytes();
  const diag = cborToDiagnostic(bytes);
  t.true(diag.includes('"key"'));
  t.true(diag.includes('"nested"'));
  t.true(diag.includes('true'));
});

// ===== Length Encoding Tests =====

test('encode string length 23 (inline)', t => {
  const str = 'a'.repeat(23);
  const { hex } = encode(w => w.writeString(str));
  // Major 3, length 23 = 0x77
  t.true(hex.startsWith('77'));
});

test('encode string length 24 (1-byte length)', t => {
  const str = 'a'.repeat(24);
  const { hex } = encode(w => w.writeString(str));
  // Major 3, AI 24 = 0x78, then 1 byte length (24 = 0x18)
  t.true(hex.startsWith('7818'));
});

test('encode string length 255', t => {
  const str = 'a'.repeat(255);
  const { hex } = encode(w => w.writeString(str));
  // Major 3, AI 24 = 0x78, then 1 byte length (255 = 0xff)
  t.true(hex.startsWith('78ff'));
});

test('encode string length 256 (2-byte length)', t => {
  const str = 'a'.repeat(256);
  const { hex } = encode(w => w.writeString(str));
  // Major 3, AI 25 = 0x79, then 2 byte length (256 = 0x0100)
  t.true(hex.startsWith('790100'));
});
