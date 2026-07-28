import 'ses';
import { readFileSync } from 'node:fs';

import test from 'ava';

import {
  assertConsumed,
  cborWriterBytes,
  makeCborReader,
  makeCborWriter,
  peekHead,
  readArrayHeader,
  readBignum,
  readBoolean,
  readByteString,
  readFloat64,
  readHead,
  readInt,
  readMapHeader,
  readNull,
  readOptionalNull,
  readOptionalUndefined,
  readTag,
  readTextString,
  readUint,
  writeArrayHeader,
  writeBignum,
  writeBoolean,
  writeByteString,
  writeFloat64,
  writeHead,
  writeInt,
  writeMapHeader,
  writeNull,
  writeTag,
  writeTextString,
  writeUint,
  writeUndefined,
} from '../index.js';

/** @import { CborReader, CborWriter } from '../index.js' */

/**
 * An entry of the checked-in fixture: the single source of truth for this
 * package's canonical encoding, language-neutral so the Rust twin
 * (rust/endo/slots/src/wire/codec.rs) can assert byte identity from its side.
 * Fifty entries are published in RFC 8949 Appendix A, so the fixture is anchored
 * to an external authority rather than to this implementation.
 *
 * @typedef {object} GoldenVector
 * @property {string} diagnostic
 * @property {object} value the language-neutral item spec; see ../README.md
 * @property {string} hex the exact canonical encoding
 * @property {boolean} [rfc8949] published in RFC 8949 Appendix A
 */

/** @type {{ vectors: GoldenVector[] }} */
const { vectors } = JSON.parse(
  readFileSync(new URL('./golden-vectors.json', import.meta.url), 'utf-8'),
);

const bytesToHex = bytes =>
  [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

const bytesFromHex = value =>
  new Uint8Array((value.match(/../g) || []).map(pair => parseInt(pair, 16)));

/**
 * The fixture spells a float64 by the shortest string that round-trips, with
 * `NaN`, `Infinity`, `-Infinity`, and `-0` spelled out, since JSON can express
 * none of them.
 *
 * @param {number} value
 * @returns {string}
 */
const float64ToText = value => {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  if (Object.is(value, -0)) return '-0';
  return String(value);
};

const float64FromText = text => {
  if (text === 'NaN') return NaN;
  if (text === 'Infinity') return Infinity;
  if (text === '-Infinity') return -Infinity;
  return Number(text);
};

/**
 * Writes the item a fixture `value` spec names. The spec grammar is documented
 * in ../README.md; each entry is a single-key object naming the CBOR kind.
 *
 * @param {CborWriter} writer
 * @param {object} spec
 * @returns {void}
 */
const writeValue = (writer, spec) => {
  const [kind] = Object.keys(spec);
  const value = spec[kind];
  switch (kind) {
    case 'uint':
      return writeUint(writer, BigInt(value));
    case 'int':
      return writeInt(writer, BigInt(value));
    case 'bytes':
      return writeByteString(writer, bytesFromHex(value));
    case 'text':
      return writeTextString(writer, value);
    case 'array': {
      writeArrayHeader(writer, value.length);
      for (const item of value) writeValue(writer, item);
      return undefined;
    }
    case 'map': {
      writeMapHeader(writer, value.length);
      for (const [key, entry] of value) {
        writeValue(writer, key);
        writeValue(writer, entry);
      }
      return undefined;
    }
    case 'tag':
      return writeTag(writer, value);
    case 'tagged': {
      writeTag(writer, value[0]);
      return writeValue(writer, value[1]);
    }
    case 'bool':
      return writeBoolean(writer, value);
    case 'simple':
      return value === 'null' ? writeNull(writer) : writeUndefined(writer);
    case 'float64':
      return writeFloat64(writer, float64FromText(value));
    case 'bignum':
      return writeBignum(writer, BigInt(value));
    default:
      throw Error(`unknown vector kind ${kind}`);
  }
};

/**
 * Reads the item a fixture `value` spec names and returns a spec of what was
 * actually read, so a round-trip is a single `deepEqual`. Reading is directed by
 * the expected kind because this package is a set of typed primitives, not a
 * reflective decoder: a real consumer likewise knows the shape it expects.
 *
 * @param {CborReader} reader
 * @param {object} spec
 * @returns {object}
 */
const readValue = (reader, spec) => {
  const [kind] = Object.keys(spec);
  const value = spec[kind];
  switch (kind) {
    case 'uint':
      return { uint: String(readUint(reader)) };
    case 'int':
      return { int: String(readInt(reader)) };
    case 'bytes':
      return { bytes: bytesToHex(readByteString(reader)) };
    case 'text':
      return { text: readTextString(reader) };
    case 'array': {
      const length = readArrayHeader(reader);
      const items = [];
      for (let index = 0; index < length; index += 1) {
        items.push(readValue(reader, value[index]));
      }
      return { array: items };
    }
    case 'map': {
      const length = readMapHeader(reader);
      const entries = [];
      for (let index = 0; index < length; index += 1) {
        const [key, entry] = value[index];
        entries.push([readValue(reader, key), readValue(reader, entry)]);
      }
      return { map: entries };
    }
    case 'tag':
      return { tag: readTag(reader) };
    case 'tagged':
      return { tagged: [readTag(reader), readValue(reader, value[1])] };
    case 'bool':
      return { bool: readBoolean(reader) };
    case 'simple': {
      // Both simple values this subset carries are now recognizable through the
      // public reader surface, so the fixture driver no longer reaches past it
      // to raw `readHead` and a magic `23n`.
      if (readOptionalNull(reader)) return { simple: 'null' };
      if (readOptionalUndefined(reader)) return { simple: 'undefined' };
      return { simple: 'other' };
    }
    case 'float64':
      return { float64: float64ToText(readFloat64(reader)) };
    case 'bignum':
      return { bignum: String(readBignum(reader)) };
    default:
      throw Error(`unknown vector kind ${kind}`);
  }
};

test('the golden fixture is anchored to RFC 8949 Appendix A', t => {
  t.true(vectors.length >= 100, 'the fixture covers the expressible grammar');
  t.true(
    vectors.filter(vector => vector.rfc8949).length >= 50,
    'a majority of entries are published test vectors',
  );
});

test('every golden vector writes to exactly its canonical bytes', t => {
  for (const { diagnostic, value, hex: expected } of vectors) {
    const writer = makeCborWriter();
    writeValue(writer, value);
    t.is(bytesToHex(cborWriterBytes(writer)), expected, diagnostic);
  }
});

test('every golden vector reads back and is fully consumed', t => {
  for (const { diagnostic, value, hex: encoded } of vectors) {
    const reader = makeCborReader(bytesFromHex(encoded), { name: diagnostic });
    t.deepEqual(readValue(reader, value), value, diagnostic);
    t.notThrows(() => assertConsumed(reader), `consume ${diagnostic}`);
  }
});

test('head arguments span the full unsigned 64-bit range', t => {
  // The head argument domain is 2**64, not the int53 range: a value above
  // Number.MAX_SAFE_INTEGER is ordinary, not exceptional.
  const writer = makeCborWriter();
  writeUint(writer, 2n ** 64n - 1n);
  t.is(bytesToHex(cborWriterBytes(writer)), '1bffffffffffffffff');
  const reader = makeCborReader(bytesFromHex('1bffffffffffffffff'), {
    name: 'max',
  });
  t.is(readUint(reader), 2n ** 64n - 1n);
  assertConsumed(reader);

  t.throws(() => writeUint(makeCborWriter(), 2n ** 64n), {
    message: /CBOR argument must be a bigint in \[0, 2\*\*64\)/,
  });
  t.throws(() => writeUint(makeCborWriter(), -1n), {
    message: /CBOR argument must be a bigint in \[0, 2\*\*64\)/,
  });
  t.throws(() => writeInt(makeCborWriter(), -(2n ** 64n) - 1n), {
    message: /CBOR argument must be a bigint in \[0, 2\*\*64\)/,
  });
});

test('integer writers reject numbers, which cannot express the domain', t => {
  // A number silently loses precision past 2**53, so the API takes bigints.
  for (const write of [writeUint, writeInt]) {
    // @ts-expect-error deliberately passing the wrong type: the runtime guard is
    // what a plain-JavaScript consumer gets, and this pins it.
    t.throws(() => write(makeCborWriter(), 1), {
      message: /must be a bigint/,
    });
  }
  // @ts-expect-error deliberately passing the wrong type; see above.
  t.throws(() => writeHead(makeCborWriter(), 0, 1), {
    message: /CBOR argument must be a bigint/,
  });
});

test('counts are bounded to four bytes on write and on read', t => {
  // Lengths, element counts, and tag numbers are numbers because JavaScript
  // itself bounds every one of them to four bytes.
  t.throws(() => writeArrayHeader(makeCborWriter(), 2 ** 32), {
    message: /array length must be an integer in \[0, 2\*\*32\)/,
  });
  t.throws(() => writeTag(makeCborWriter(), -1), {
    message: /tag number must be an integer in \[0, 2\*\*32\)/,
  });
  t.throws(() => writeMapHeader(makeCborWriter(), 1.5), {
    message: /map entry count must be an integer in \[0, 2\*\*32\)/,
  });
  // An eight-byte length head is well-formed CBOR but cannot index memory here.
  t.throws(
    () =>
      readArrayHeader(
        makeCborReader(bytesFromHex('9b0000000100000000'), { name: 'wide' }),
      ),
    { message: /array length exceeds 2\*\*32-1.*index 0 of wide/ },
  );
});

test('all in-scope primitive major types round-trip', t => {
  const writer = makeCborWriter();
  writeInt(writer, -2n);
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
  t.is(readInt(reader), -2n);
  t.deepEqual(readByteString(reader), new Uint8Array([1, 2]));
  t.is(readTextString(reader), 'hi');
  t.is(readArrayHeader(reader), 0);
  t.is(readMapHeader(reader), 0);
  t.is(readTag(reader), 280);
  t.false(readBoolean(reader));
  t.true(readBoolean(reader));
  t.true(readOptionalNull(reader));
  t.false(readOptionalNull(reader));
  t.deepEqual(readHead(reader), { major: 7, value: 23n });
  assertConsumed(reader);
});

test('readers are strict, with no lenient mode to opt into', t => {
  // Every implementation of this subset is required to emit the canonical
  // encoding, so a non-canonical encoding is a peer bug, never an interop mode.

  // Non-minimal head: 0x1817 encodes uint 23 in two bytes (minimal is 0x17).
  t.throws(
    () => readUint(makeCborReader(bytesFromHex('1817'), { name: 'strict' })),
    { message: /Non-minimal CBOR head.*index 0 of strict/ },
    'a non-minimal head is rejected',
  );
  // Non-minimal bignum payload: c24100 has a leading zero byte.
  t.throws(
    () =>
      readBignum(makeCborReader(bytesFromHex('c24100'), { name: 'strict' })),
    { message: /Non-minimal bignum payload/ },
    'a non-minimal bignum payload is rejected',
  );
  // A `lenient` option is not merely default-off; it does not exist, so a
  // caller cannot re-enable the tolerant behavior by passing one.
  t.throws(
    () =>
      readUint(
        // @ts-expect-error `lenient` is not in the options type: its absence is
        // the point of this assertion.
        makeCborReader(bytesFromHex('1817'), { name: 'strict', lenient: true }),
      ),
    { message: /Non-minimal CBOR head/ },
    'an unrecognized lenient option does not relax the reader',
  );
});

test('non-canonical NaN is rejected', t => {
  t.throws(
    () =>
      readFloat64(
        makeCborReader(bytesFromHex('fb7ff0000000000001'), { name: 'nan' }),
      ),
    { message: /Non-canonical NaN.*index 1 of nan/ },
  );
  // Every NaN a caller writes comes back as the one canonical pattern.
  const writer = makeCborWriter();
  writeFloat64(writer, NaN);
  t.is(bytesToHex(cborWriterBytes(writer)), 'fb7ff8000000000000');
});

test('indefinite-length and reserved additional-info are rejected', t => {
  // additional info 31 (indefinite) and 28..30 (reserved) are never valid.
  for (const value of ['5f', '9f', 'bf', '1c', '1d', '1e']) {
    t.throws(
      () => readHead(makeCborReader(bytesFromHex(value), { name: 'bad' })),
      { message: /Invalid CBOR additional info|index .* of bad/ },
      `reject ${value}`,
    );
  }
});

test('truncation and trailing bytes are rejected', t => {
  // Truncated head (4-byte argument, only 2 bytes present); the read fails at
  // the extension bytes, one past the initial byte.
  t.throws(
    () => readUint(makeCborReader(bytesFromHex('1a0000'), { name: 'head' })),
    {
      message: /Unexpected end of CBOR input.*index 1 of head/,
    },
  );
  // Truncated payload (byte string claims 3 bytes, only 1 present).
  t.throws(
    () =>
      readByteString(makeCborReader(bytesFromHex('4301'), { name: 'payload' })),
    { message: /index 1 of payload/ },
  );
  // Trailing bytes after a complete item.
  t.throws(
    () =>
      assertConsumed(
        makeCborReader(bytesFromHex('0001'), { name: 'trailing' }),
      ),
    { message: /Unexpected trailing CBOR bytes.*index 0 of trailing/ },
  );
});

test('rejections identify reader offsets', t => {
  for (const value of ['1f', '1c', '1a0000', '4301'])
    t.throws(
      () => readUint(makeCborReader(bytesFromHex(value), { name: 'bad' })),
      {
        message: /index .* of bad/,
      },
    );
});

test('writeTextString rejects non-well-formed strings', t => {
  t.throws(() => writeTextString(makeCborWriter(), '\ud800'), {
    message: /well-formed/,
  });
  // A non-string is also rejected (the ponyfill returns false for non-strings).
  // @ts-expect-error deliberately passing the wrong type; see above.
  t.throws(() => writeTextString(makeCborWriter(), 42), {
    message: /well-formed/,
  });
});

test('readTextString rejects invalid UTF-8', t => {
  // 0x61 0xff: a one-byte length head over a byte that starts no UTF-8 sequence.
  t.throws(
    () =>
      readTextString(makeCborReader(bytesFromHex('61ff'), { name: 'utf8' })),
    { message: /Invalid UTF-8 text string.*index 0 of utf8/ },
  );
});

// The three tests below pin the major-7 head grammar. RFC 8949 section 3.3
// makes the major-7 additional-information nibble a TYPE SELECTOR rather than
// an integer argument, so the minimal-length rule that governs majors 0-6 does
// not apply to it. Applying it there rejected every float64 whose bit pattern
// is under 2**32 -- including `fb0000000000000000`, the canonical zero this
// package's own writer emits and which the fixture already carried as valid.
// The fixture-driven tests above could not catch it because `readValue`
// dispatches on each vector's DECLARED kind, sending float64 entries straight
// to `readFloat64` and never through the shared head path.

test('peekHead accepts every golden vector without advancing the cursor', t => {
  for (const { diagnostic, hex: encoded } of vectors) {
    const reader = makeCborReader(bytesFromHex(encoded), { name: diagnostic });
    t.notThrows(() => peekHead(reader), diagnostic);
    t.is(reader.index, 0, `${diagnostic}: peek must not consume`);
  }
});

test('readOptionalNull reports false on every non-null golden vector', t => {
  for (const { diagnostic, hex: encoded } of vectors) {
    const reader = makeCborReader(bytesFromHex(encoded), { name: diagnostic });
    // `f6` is the only encoding of null; every other vector must report a
    // plain false rather than throwing, since this is the probe a caller uses
    // to decide whether an optional field is present.
    const expected = encoded === 'f6';
    t.is(readOptionalNull(reader), expected, diagnostic);
  }
});

test('readHead rejects major-7 heads outside the canonical subset', t => {
  // f818-f81f: the two-byte simple-value form below 32, which RFC 8949
  // section 3.3 declares not well-formed.
  for (const encoded of ['f818', 'f81f']) {
    t.throws(
      () => readHead(makeCborReader(bytesFromHex(encoded), { name: 'simple' })),
      { message: /Ill-formed two-byte simple value/ },
      encoded,
    );
  }
  // f820: a well-formed but unassigned simple value, still outside this subset.
  t.throws(
    () => readHead(makeCborReader(bytesFromHex('f820'), { name: 'simple' })),
    {
      message: /Unassigned simple value 32/,
    },
  );
  // float16 and float32 heads: well-formed CBOR, but this subset is
  // float64-only, and the head layer must agree with `readFloat64` about that.
  t.throws(
    () => readHead(makeCborReader(bytesFromHex('f97e00'), { name: 'f16' })),
    {
      message: /Unsupported float16/,
    },
  );
  t.throws(
    () => readHead(makeCborReader(bytesFromHex('fa7fc00000'), { name: 'f32' })),
    { message: /Unsupported float32/ },
  );
});

test('writeHead refuses a major-7 argument that is not a simple value', t => {
  // Permitted at the boundary: 23 is the last one-byte simple value.
  t.notThrows(() => writeHead(makeCborWriter(), 7, 23n));
  // 24 would emit `f818`, which the reader above rejects as ill-formed; a
  // canonical writer must not be able to produce bytes its own reader refuses.
  t.throws(() => writeHead(makeCborWriter(), 7, 24n), {
    message: /major 7 head argument must be a simple value/,
  });
});

test('a failed peek leaves the cursor exactly where it found it', t => {
  // `1f` is an invalid additional-info nibble, so the head is rejected only
  // after the initial byte has been taken -- the case a success-path-only
  // restore misses.
  const reader = makeCborReader(bytesFromHex('1f00'), { name: 'peek' });
  t.throws(() => peekHead(reader));
  t.is(reader.index, 0);
  // The reader is still usable for a different parse after the caught failure.
  t.is(reader.bytes.length - reader.index, 2);
});

test('readBoolean names the construct that actually arrived', t => {
  t.throws(
    () => readBoolean(makeCborReader(bytesFromHex('f6'), { name: 'b' })),
    {
      message: /Expected boolean, got simple value 22/,
    },
  );
  // A float64 head reaching the boolean fallthrough must not be reported as a
  // "simple value" carrying its 64-bit payload.
  t.throws(
    () =>
      readBoolean(
        makeCborReader(bytesFromHex('fb3ff0000000000000'), { name: 'b' }),
      ),
    { message: /Expected boolean, got float64/ },
  );
});

test('every writer has a reader counterpart on the public surface', t => {
  // `writeUndefined` and `writeNull` previously emitted bytes that could only be
  // recognized by reaching past the exported readers to a raw head plus a magic
  // constant, which is the signal that a codec's surface is incomplete.
  const writer = makeCborWriter();
  writeUndefined(writer);
  writeNull(writer);
  const reader = makeCborReader(cborWriterBytes(writer), { name: 'pair' });
  t.true(readOptionalUndefined(reader));
  t.notThrows(() => readNull(reader));
  assertConsumed(reader);
});

test('the optional probes report absence at end of input', t => {
  // A trailing optional that is simply not there is the ordinary case; it must
  // stay distinguishable from a malformed head, which throws.
  for (const probe of [readOptionalNull, readOptionalUndefined]) {
    t.false(probe(makeCborReader(new Uint8Array(0), { name: 'empty' })));
  }
});

test('readNull rejects anything that is not null', t => {
  t.throws(() => readNull(makeCborReader(bytesFromHex('f7'), { name: 'u' })), {
    message: /Expected null.*index 0 of u/,
  });
});

test('a zero-capacity writer grows to hold a payload larger than its buffer', t => {
  // `makeCborWriter({ capacity: 0 })` is the only path that reaches the
  // `Math.max(1, ...)` floor in `append`/`appendBytes` and the `while` (rather
  // than `if`) growth loop; with a default-capacity writer both are unreachable,
  // so neither was pinned by any test.
  const writer = makeCborWriter({ capacity: 0 });
  const payload = new Uint8Array(600).fill(0xab);
  writeByteString(writer, payload);
  const reader = makeCborReader(cborWriterBytes(writer), { name: 'grown' });
  t.deepEqual(readByteString(reader), payload);
  assertConsumed(reader);
});

test('argument guards are contract, not decoration', t => {
  // These guards were each a no-op away from surviving the whole suite. They
  // state the callable contract of a public function, so they are pinned like
  // the bigint and well-formedness guards already were.
  t.throws(() => writeHead(makeCborWriter(), 8, 0n), {
    message: /major type must be an integer in \[0, 7\]/,
  });
  t.throws(() => makeCborWriter({ capacity: -1 }), {
    message: /capacity must be an integer in \[0, 2\*\*32\)/,
  });
  // @ts-expect-error deliberately passing the wrong type
  t.throws(() => writeByteString(makeCborWriter(), 'nope'), {
    message: /Uint8Array/,
  });
  // @ts-expect-error deliberately passing the wrong type
  t.throws(() => writeBoolean(makeCborWriter(), 'nope'), {
    message: /boolean expected/,
  });
  // @ts-expect-error deliberately passing the wrong type
  t.throws(() => writeFloat64(makeCborWriter(), 'nope'), {
    message: /number expected/,
  });
  // @ts-expect-error deliberately passing the wrong type
  t.throws(() => writeBignum(makeCborWriter(), 'nope'), {
    message: /bigint expected/,
  });
  // @ts-expect-error deliberately passing the wrong type
  t.throws(() => makeCborReader('nope'), {
    message: /CBOR input must be a Uint8Array/,
  });
});
