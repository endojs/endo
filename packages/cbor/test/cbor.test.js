/* eslint-disable unicorn/numeric-separators-style */
import 'ses';
import test from 'ava';
import {
  assertConsumed,
  cborWriterBytes,
  makeCborReader,
  makeCborWriter,
  readArrayHeader,
  readBignum,
  readBoolean,
  readByteString,
  readFloat64,
  readHead,
  readInt,
  readMapHeader,
  readOptionalNull,
  readTag,
  readTextString,
  readUint,
  writeArrayHeader,
  writeBignum,
  writeBoolean,
  writeByteString,
  writeFloat64,
  writeInt,
  writeMapHeader,
  writeNull,
  writeTag,
  writeTextString,
  writeUint,
  writeUndefined,
} from '../index.js';
import { goldenVectors } from './vectors.js';

const hex = bytes =>
  [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
const unhex = value =>
  new Uint8Array(value.match(/../g).map(pair => Number.parseInt(pair, 16)));

// A generic single-item reader used to prove every golden vector is canonical
// and fully consumable by a strict reader. It inspects the raw leading byte
// (rather than peekHead, which would misinterpret a float64 head's 8 payload
// bytes as an integer argument) to route to the typed reader.
const readItem = reader => {
  const initial = reader.bytes[reader.index];
  const major = Math.floor(initial / 32);
  const info = initial % 32;
  switch (major) {
    case 0:
      return readUint(reader);
    case 1:
      return readInt(reader);
    case 2:
      return readByteString(reader);
    case 3:
      return readTextString(reader);
    case 4: {
      const length = readArrayHeader(reader);
      const items = [];
      for (let index = 0; index < length; index += 1)
        items.push(readItem(reader));
      return items;
    }
    case 5: {
      const length = readMapHeader(reader);
      const entries = [];
      for (let index = 0; index < length; index += 1)
        entries.push([readItem(reader), readItem(reader)]);
      return entries;
    }
    case 6:
      // Bignums are tags 2/3 with a byte-string payload; a bare tag in the
      // fixture carries no content.
      return info === 2 || info === 3 ? readBignum(reader) : readTag(reader);
    case 7:
      // info 27 is a float64; the smaller simple values (false/true/null/
      // undefined) read back through the generic head.
      return info === 27 ? readFloat64(reader) : readHead(reader);
    default:
      throw Error(`unexpected major ${major}`);
  }
};

test('canonical argument-width boundaries round-trip', t => {
  /** @type {Array<[number, string]>} */
  const cases = [
    [0, '00'],
    [23, '17'],
    [24, '1818'],
    [255, '18ff'],
    [256, '190100'],
    [65535, '19ffff'],
    [65536, '1a00010000'],
    [0xffffffff, '1affffffff'],
    [0x100000000, '1b0000000100000000'],
    [Number.MAX_SAFE_INTEGER, '1b001fffffffffffff'],
  ];
  for (const [value, expected] of cases) {
    const writer = makeCborWriter();
    writeUint(writer, value);
    t.is(hex(cborWriterBytes(writer)), expected, `write ${value}`);
    const reader = makeCborReader(unhex(expected), { name: 'boundary' });
    t.is(readUint(reader), value, `read ${value}`);
    assertConsumed(reader);
  }
});

test('all in-scope primitive major types round-trip', t => {
  const writer = makeCborWriter();
  writeInt(writer, -2);
  writeByteString(writer, new Uint8Array([1, 2]));
  writeTextString(writer, 'hi');
  writeArrayHeader(writer, 0);
  writeMapHeader(writer, 0);
  writeTag(writer, 280);
  writeBoolean(writer, false);
  writeBoolean(writer, true);
  writeNull(writer);
  writeUndefined(writer);
  const reader = makeCborReader(cborWriterBytes(writer), { name: 'all' });
  t.is(readInt(reader), -2);
  t.deepEqual(readByteString(reader), new Uint8Array([1, 2]));
  t.is(readTextString(reader), 'hi');
  t.is(readArrayHeader(reader), 0);
  t.is(readMapHeader(reader), 0);
  t.is(readTag(reader), 280);
  t.false(readBoolean(reader));
  t.true(readBoolean(reader));
  t.true(readOptionalNull(reader));
  t.false(readOptionalNull(reader));
  t.deepEqual(readHead(reader), { major: 7, value: 23 });
  assertConsumed(reader);
});

test('float64 canonical NaN and bignum edges', t => {
  const writer = makeCborWriter();
  writeFloat64(writer, NaN);
  writeBignum(writer, 0n);
  writeBignum(writer, -1n);
  writeBignum(writer, 256n);
  t.is(hex(cborWriterBytes(writer)), 'fb7ff8000000000000c240c340c2420100');
  const reader = makeCborReader(cborWriterBytes(writer), { name: 'numbers' });
  t.true(Number.isNaN(readFloat64(reader)));
  t.is(readBignum(reader), 0n);
  t.is(readBignum(reader), -1n);
  t.is(readBignum(reader), 256n);
  assertConsumed(reader);
});

test('every golden vector is canonical and strictly consumable', t => {
  for (const { diagnostic, hex: expected } of goldenVectors) {
    // A strict (default) reader accepts and fully consumes each canonical vector.
    const reader = makeCborReader(unhex(expected), { name: diagnostic });
    t.notThrows(() => readItem(reader), `read ${diagnostic}`);
    t.notThrows(() => assertConsumed(reader), `consume ${diagnostic}`);
  }
});

test('reader is strict by default and lenient only when opted in', t => {
  // Non-minimal head: 0x1817 encodes uint 23 in two bytes (minimal is 0x17).
  t.throws(
    () => readUint(makeCborReader(unhex('1817'), { name: 'strict' })),
    { message: /Non-minimal CBOR head.*index 0 of strict/ },
    'strict-by-default rejects a non-minimal head',
  );
  t.is(
    readUint(makeCborReader(unhex('1817'), { lenient: true })),
    23,
    'lenient accepts a non-minimal head',
  );

  // Non-minimal bignum payload: c24100 has a leading zero byte.
  t.throws(
    () => readBignum(makeCborReader(unhex('c24100'), { name: 'strict' })),
    { message: /Non-minimal bignum payload/ },
    'strict-by-default rejects a non-minimal bignum payload',
  );
  t.is(
    readBignum(makeCborReader(unhex('c24100'), { lenient: true })),
    0n,
    'lenient accepts a non-minimal bignum payload',
  );
});

test('non-canonical NaN is rejected in every mode', t => {
  for (const opts of [{ name: 'nan' }, { name: 'nan', lenient: true }]) {
    t.throws(
      () => readFloat64(makeCborReader(unhex('fb7ff0000000000001'), opts)),
      { message: /Non-canonical NaN.*index 1 of nan/ },
      `lenient=${!!opts.lenient}`,
    );
  }
});

test('indefinite-length and reserved additional-info are rejected', t => {
  // additional info 31 (indefinite) and 28..30 (reserved) are never valid.
  for (const value of ['5f', '9f', 'bf', '1c', '1d', '1e']) {
    t.throws(
      () => readHead(makeCborReader(unhex(value), { name: 'bad' })),
      { message: /Invalid CBOR additional info|index .* of bad/ },
      `reject ${value}`,
    );
    // Lenient mode does not relax structural validity either.
    t.throws(
      () =>
        readHead(makeCborReader(unhex(value), { name: 'bad', lenient: true })),
      { message: /Invalid CBOR additional info|index .* of bad/ },
      `reject ${value} (lenient)`,
    );
  }
});

test('truncation and trailing bytes are rejected', t => {
  // Truncated head (4-byte argument, only 2 bytes present); the read fails at
  // the extension bytes, one past the initial byte.
  t.throws(() => readUint(makeCborReader(unhex('1a0000'), { name: 'head' })), {
    message: /Unexpected end of CBOR input.*index 1 of head/,
  });
  // Truncated payload (byte string claims 3 bytes, only 1 present).
  t.throws(
    () => readByteString(makeCborReader(unhex('4301'), { name: 'payload' })),
    { message: /index 1 of payload/ },
  );
  // Trailing bytes after a complete item.
  t.throws(
    () => assertConsumed(makeCborReader(unhex('0001'), { name: 'trailing' })),
    { message: /Unexpected trailing CBOR bytes.*index 0 of trailing/ },
  );
});

test('rejections identify reader offsets', t => {
  for (const value of ['1f', '1c', '1a0000', '4301'])
    t.throws(() => readUint(makeCborReader(unhex(value), { name: 'bad' })), {
      message: /index .* of bad/,
    });
});

test('writeTextString rejects non-well-formed strings', t => {
  t.throws(() => writeTextString(makeCborWriter(), '\ud800'), {
    message: /well-formed/,
  });
  // A non-string is also rejected (the ponyfill returns false for non-strings).
  t.throws(() => writeTextString(makeCborWriter(), 42), {
    message: /well-formed/,
  });
});

test('writer emits argument-width boundaries at minimal length', t => {
  // Reader strictness pairs with writer canonicality: a canonical write is
  // exactly what a strict read accepts.
  for (const { diagnostic, hex: expected } of goldenVectors.filter(v =>
    v.diagnostic.startsWith('uint'),
  )) {
    const match = /uint (.+)/.exec(diagnostic);
    if (match === null) {
      throw Error(`unexpected uint diagnostic: ${diagnostic}`);
    }
    const value =
      match[1] === '2^32-1'
        ? 0xffffffff
        : match[1] === '2^32'
          ? 0x100000000
          : match[1] === 'max safe'
            ? Number.MAX_SAFE_INTEGER
            : Number(match[1]);
    const writer = makeCborWriter();
    writeUint(writer, value);
    t.is(hex(cborWriterBytes(writer)), expected, diagnostic);
  }
});
