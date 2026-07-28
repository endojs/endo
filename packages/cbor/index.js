// @ts-check
/* eslint-disable no-bitwise */

import { bytesEqual } from '@endo/bytes/equals.js';
import { bytesFromText } from '@endo/bytes/from-string.js';
import { bytesToText } from '@endo/bytes/to-string.js';
import { b, Fail, makeError, q } from '@endo/errors';
import harden from '@endo/harden';
import { isWellFormedString } from '@endo/is-well-formed-string';

/**
 * Exclusive upper bound of a CBOR head argument. A head carries at most eight
 * argument bytes, so the domain is the full unsigned 64-bit range — wider than
 * `Number.MAX_SAFE_INTEGER`, which is why head arguments are `bigint` rather
 * than `number`.
 */
const UINT64_BOUND = 2n ** 64n;

/**
 * Exclusive upper bound of a *count*: a byte-string or text-string byte length,
 * an array or map element count, or a tag number. Bounding all four here is this
 * codec's own profile choice, not a limit the language imposes: JavaScript caps
 * only array lengths at `2**32 - 1`, typed-array lengths are spec-bounded at
 * `2**53 - 1`, and a CBOR tag number is not a JavaScript quantity at all (RFC
 * 8949 section 3.4 permits it up to `2**64 - 1`). Within this bound counts stay
 * in the `number` domain, where the arithmetic is exact and the type is honest.
 */
const UINT32_BOUND = 2 ** 32;

/**
 * The one NaN bit pattern this codec writes and the only one it accepts.
 *
 * Deliberately NOT `harden`ed. `harden` only prevents extensions on a typed
 * array: a typed array's integer-indexed properties are permanently writable by
 * specification, and `Object.freeze` on a non-empty one throws outright. So a
 * `harden` here would read as a guarantee of byte-constancy that it does not
 * deliver, on the very constant this codec's NaN-canonicality invariant rests
 * on. What actually keeps it constant is that the binding never escapes this
 * module: `appendBytes` and `bytesEqual` only read it. Do not export it.
 */
const CANONICAL_NAN = new Uint8Array([0x7f, 0xf8, 0, 0, 0, 0, 0, 0]);

/**
 * Mutable byte-accumulating state threaded through the `write*` functions.
 *
 * @typedef {object} CborWriter
 * @property {Uint8Array} buffer Backing store, grown geometrically.
 * @property {number} length Bytes written so far; `buffer` beyond this is slack.
 */

/**
 * Mutable cursor state threaded through the `read*` functions.
 *
 * @typedef {object} CborReader
 * @property {Uint8Array} bytes The complete input.
 * @property {number} index Offset of the next unread byte.
 * @property {string} name Diagnostic label reported in error messages.
 */

/**
 * Asserts that `value` is a CBOR head argument.
 *
 * @param {bigint} value in `[0, 2**64)`
 * @returns {void}
 */
const assertHeadArgument = value => {
  (typeof value === 'bigint' && value >= 0n && value < UINT64_BOUND) ||
    Fail`CBOR argument must be a bigint in [0, 2**64), got ${q(value)}`;
};

/**
 * Asserts that `value` is a count: a length, element count, or tag number.
 *
 * @param {number} value in `[0, 2**32)`
 * @param {string} label
 * @returns {void}
 */
const assertCount = (value, label) => {
  (Number.isInteger(value) && value >= 0 && value < UINT32_BOUND) ||
    Fail`${b(label)} must be an integer in [0, 2**32), got ${q(value)}`;
};

/**
 * Asserts that `major` is a CBOR major type.
 *
 * @param {number} major in `[0, 7]`
 * @returns {void}
 */
const assertMajor = major => {
  (Number.isInteger(major) && major >= 0 && major <= 7) ||
    Fail`major type must be an integer in [0, 7], got ${q(major)}`;
};

/**
 * @param {CborWriter} writer
 * @param {number} byte in `[0, 255]`
 * @returns {void}
 */
const append = (writer, byte) => {
  if (writer.length === writer.buffer.length) {
    const next = new Uint8Array(Math.max(1, writer.buffer.length * 2));
    next.set(writer.buffer);
    writer.buffer = next;
  }
  writer.buffer[writer.length] = byte;
  writer.length += 1;
};

/**
 * @param {CborWriter} writer
 * @param {Uint8Array} bytes
 * @returns {void}
 */
const appendBytes = (writer, bytes) => {
  while (writer.length + bytes.length > writer.buffer.length) {
    const next = new Uint8Array(Math.max(1, writer.buffer.length * 2));
    next.set(writer.buffer);
    writer.buffer = next;
  }
  writer.buffer.set(bytes, writer.length);
  writer.length += bytes.length;
};

/**
 * Appends `byteCount` big-endian bytes of `value`.
 *
 * @param {CborWriter} writer
 * @param {bigint} value in `[0, 256**byteCount)`
 * @param {number} byteCount one of 1, 2, 4, or 8
 * @returns {void}
 */
const appendBigEndian = (writer, value, byteCount) => {
  for (let shift = BigInt(byteCount - 1) * 8n; shift >= 0n; shift -= 8n) {
    append(writer, Number((value >> shift) & 0xffn));
  }
};

/**
 * The RFC 8949 additional-information nibble of the *minimal-length* head that
 * can carry `value`: the value itself when it fits in five bits, otherwise
 * 24, 25, 26, or 27 for a one-, two-, four-, or eight-byte argument.
 *
 * @param {bigint} value in `[0, 2**64)`
 * @returns {number} in `[0, 27]`
 */
const canonicalInfo = value => {
  if (value < 24n) return Number(value);
  if (value < 0x100n) return 24;
  if (value < 0x1_0000n) return 25;
  if (value < 0x1_0000_0000n) return 26;
  return 27;
};

/**
 * @param {CborReader} reader
 * @param {number} index byte offset the failure is attributed to
 * @param {string} message
 * @returns {never}
 */
const readerError = (reader, index, message) => {
  throw makeError(`${message} at index ${index} of ${reader.name}`, Error);
};

/**
 * Consumes and returns the next `count` bytes as a view over the input.
 *
 * @param {CborReader} reader
 * @param {number} count in `[0, 2**32)`
 * @returns {Uint8Array}
 */
const take = (reader, count) => {
  const start = reader.index;
  if (count > reader.bytes.length - start) {
    readerError(reader, start, 'Unexpected end of CBOR input');
  }
  reader.index += count;
  return reader.bytes.subarray(start, start + count);
};

/**
 * @param {object} [options]
 * @param {number} [options.capacity] initial buffer size, in `[0, 2**32)`
 * @returns {CborWriter}
 */
export const makeCborWriter = (options = {}) => {
  const capacity = options.capacity === undefined ? 256 : options.capacity;
  assertCount(capacity, 'capacity');
  return { buffer: new Uint8Array(capacity), length: 0 };
};
harden(makeCborWriter);

/**
 * @param {CborWriter} writer
 * @returns {Uint8Array} a copy of exactly the bytes written
 */
export const cborWriterBytes = writer => writer.buffer.slice(0, writer.length);
harden(cborWriterBytes);

/**
 * Writes a CBOR head: the initial byte carrying the major type and the
 * additional-information nibble, followed by the minimal-length big-endian
 * argument. Always canonical; there is no way to request a wider head.
 *
 * @param {CborWriter} writer
 * @param {number} major in `[0, 7]`
 * @param {bigint} value in `[0, 2**64)`
 * @returns {void}
 */
export const writeHead = (writer, major, value) => {
  assertMajor(major);
  assertHeadArgument(value);
  // Major 7 carries no integer argument: its nibble selects a simple value
  // (below 24) or a float width. Emitting the two-byte simple-value form here
  // would produce `f818`-`f81f`, which RFC 8949 section 3.3 declares not
  // well-formed, and the float forms belong to `writeFloat64`.
  major !== 7 ||
    value < 24n ||
    Fail`major 7 head argument must be a simple value in [0, 24), got ${q(value)}`;
  const info = canonicalInfo(value);
  append(writer, (major << 5) | info);
  if (info >= 24) {
    appendBigEndian(writer, value, 1 << (info - 24));
  }
};
harden(writeHead);

/**
 * Writes a head whose argument is a count rather than an arbitrary integer.
 *
 * @param {CborWriter} writer
 * @param {number} major in `[0, 7]`
 * @param {number} count in `[0, 2**32)`
 * @param {string} label
 * @returns {void}
 */
const writeCountHead = (writer, major, count, label) => {
  assertCount(count, label);
  writeHead(writer, major, BigInt(count));
};

/**
 * @param {CborWriter} writer
 * @param {bigint} value in `[0, 2**64)`
 * @returns {void}
 */
export const writeUint = (writer, value) => writeHead(writer, 0, value);
harden(writeUint);

/**
 * Writes a major-0 or major-1 integer. Values outside `[-2**64, 2**64)` do not
 * fit a CBOR head and belong in a bignum; see {@link writeBignum}.
 *
 * @param {CborWriter} writer
 * @param {bigint} value in `[-2**64, 2**64)`
 * @returns {void}
 */
export const writeInt = (writer, value) => {
  typeof value === 'bigint' || Fail`integer must be a bigint, got ${q(value)}`;
  if (value >= 0n) {
    writeHead(writer, 0, value);
  } else {
    writeHead(writer, 1, -1n - value);
  }
};
harden(writeInt);

/**
 * @param {CborWriter} writer
 * @param {Uint8Array} value
 * @returns {void}
 */
export const writeByteString = (writer, value) => {
  value instanceof Uint8Array ||
    Fail`byte string must be a Uint8Array, got ${q(value)}`;
  writeCountHead(writer, 2, value.length, 'byte string length');
  appendBytes(writer, value);
};
harden(writeByteString);

/**
 * @param {CborWriter} writer
 * @param {string} value a well-formed string: no lone surrogates
 * @returns {void}
 */
export const writeTextString = (writer, value) => {
  // isWellFormedString checks typeof and returns false for lone surrogates.
  isWellFormedString(value) ||
    Fail`writeTextString: expected a well-formed string, got ${q(value)}`;
  const bytes = bytesFromText(value);
  writeCountHead(writer, 3, bytes.length, 'text string length');
  appendBytes(writer, bytes);
};
harden(writeTextString);

/**
 * @param {CborWriter} writer
 * @param {number} length element count, in `[0, 2**32)`
 * @returns {void}
 */
export const writeArrayHeader = (writer, length) =>
  writeCountHead(writer, 4, length, 'array length');
harden(writeArrayHeader);

/**
 * @param {CborWriter} writer
 * @param {number} entryCount number of key/value pairs, in `[0, 2**32)`
 * @returns {void}
 */
export const writeMapHeader = (writer, entryCount) =>
  writeCountHead(writer, 5, entryCount, 'map entry count');
harden(writeMapHeader);

/**
 * @param {CborWriter} writer
 * @param {number} tag tag number, in `[0, 2**32)`
 * @returns {void}
 */
export const writeTag = (writer, tag) =>
  writeCountHead(writer, 6, tag, 'tag number');
harden(writeTag);

/**
 * @param {CborWriter} writer
 * @param {boolean} value
 * @returns {void}
 */
export const writeBoolean = (writer, value) => {
  typeof value === 'boolean' || Fail`boolean expected, got ${q(value)}`;
  append(writer, value ? 0xf5 : 0xf4);
};
harden(writeBoolean);

/**
 * @param {CborWriter} writer
 * @returns {void}
 */
export const writeNull = writer => append(writer, 0xf6);
harden(writeNull);

/**
 * @param {CborWriter} writer
 * @returns {void}
 */
export const writeUndefined = writer => append(writer, 0xf7);
harden(writeUndefined);

/**
 * Writes a float64. Every NaN is written as the one canonical bit pattern.
 *
 * @param {CborWriter} writer
 * @param {number} value
 * @returns {void}
 */
export const writeFloat64 = (writer, value) => {
  typeof value === 'number' || Fail`number expected, got ${q(value)}`;
  append(writer, 0xfb);
  if (Number.isNaN(value)) {
    appendBytes(writer, CANONICAL_NAN);
  } else {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, false);
    appendBytes(writer, bytes);
  }
};
harden(writeFloat64);

/**
 * The minimal-length big-endian byte string of a non-negative bigint: no
 * leading zero byte, and empty for zero.
 *
 * @param {bigint} magnitude non-negative
 * @returns {Uint8Array}
 */
const minimalBignumBytes = magnitude => {
  /** @type {number[]} */
  const digits = [];
  let rest = magnitude;
  while (rest > 0n) {
    digits.push(Number(rest & 0xffn));
    rest >>= 8n;
  }
  digits.reverse();
  return new Uint8Array(digits);
};

/**
 * Writes an arbitrary-precision integer as a tag-2 (non-negative) or tag-3
 * (negative) bignum over a minimal-length byte string.
 *
 * @param {CborWriter} writer
 * @param {bigint} value unbounded
 * @returns {void}
 */
export const writeBignum = (writer, value) => {
  typeof value === 'bigint' || Fail`bigint expected, got ${q(value)}`;
  const magnitude = value >= 0n ? value : -1n - value;
  writeTag(writer, value >= 0n ? 2 : 3);
  writeByteString(writer, minimalBignumBytes(magnitude));
};
harden(writeBignum);

/**
 * Readers are strict: they reject non-minimal heads and non-minimal bignum
 * payloads, so no two byte-different encodings of a value both decode. There is
 * no lenient mode — every implementation of this subset is required to emit the
 * canonical encoding, so accepting a non-canonical one would only launder a
 * peer's bug into this side's byte-identity contract.
 *
 * @param {Uint8Array} bytes
 * @param {object} [options]
 * @param {string} [options.name] diagnostic label reported in error messages
 * @returns {CborReader}
 */
export const makeCborReader = (bytes, options = {}) => {
  bytes instanceof Uint8Array || Fail`CBOR input must be a Uint8Array`;
  const name = options.name === undefined ? '<anonymous>' : options.name;
  return { bytes, index: 0, name };
};
harden(makeCborReader);

/**
 * @param {CborReader} reader
 * @returns {{ major: number, value: bigint, start: number }}
 */
const readHeadInternal = reader => {
  const start = reader.index;
  const initial = take(reader, 1)[0];
  const major = initial >> 5;
  const info = initial & 0x1f;
  if (info >= 28) {
    readerError(reader, start, `Invalid CBOR additional info ${info}`);
  }
  const extension = take(reader, info < 24 ? 0 : 1 << (info - 24));
  let value = info < 24 ? BigInt(info) : 0n;
  for (const byte of extension) {
    value = (value << 8n) | BigInt(byte);
  }
  if (major === 7) {
    // Major 7's additional information is a TYPE SELECTOR, not an integer
    // argument: 24 introduces a second simple-value byte and 25/26/27 select
    // float16/float32/float64 (RFC 8949 section 3.3). Minimal-length
    // encoding is meaningless here — an IEEE-754 bit pattern has no shorter
    // form — so the check below is gated to majors 0-6. Applying it across
    // the whole head space rejected every float64 whose bit pattern is under
    // `2**32`, including `fb0000000000000000`, the canonical zero this
    // package's own `writeFloat64` emits.
    if (info === 24) {
      // RFC 8949 section 3.3 makes `0xf8` followed by a byte below 32 not
      // well-formed; simple values from 32 up are unassigned and outside this
      // canonical subset either way, so no two-byte simple value is readable.
      readerError(
        reader,
        start,
        value < 32n
          ? `Ill-formed two-byte simple value ${value}`
          : `Unassigned simple value ${value}`,
      );
    }
    if (info === 25 || info === 26) {
      readerError(
        reader,
        start,
        `Unsupported float${info === 25 ? 16 : 32}; this subset is float64-only`,
      );
    }
  } else if (canonicalInfo(value) !== info) {
    readerError(reader, start, 'Non-minimal CBOR head');
  }
  return { major, value, start };
};

/**
 * Narrows a head argument to a count, rejecting one too wide to index memory.
 *
 * @param {CborReader} reader
 * @param {{ value: bigint, start: number }} head
 * @param {string} label
 * @returns {number} in `[0, 2**32)`
 */
const headCount = (reader, head, label) => {
  if (head.value >= BigInt(UINT32_BOUND)) {
    readerError(reader, head.start, `${label} exceeds 2**32-1`);
  }
  return Number(head.value);
};

/**
 * @param {CborReader} reader
 * @returns {{ major: number, value: bigint }}
 */
export const readHead = reader => {
  const { major, value } = readHeadInternal(reader);
  return harden({ major, value });
};
harden(readHead);

/**
 * Reads the next head without consuming it.
 *
 * @param {CborReader} reader
 * @returns {{ major: number, value: bigint }}
 */
export const peekHead = reader => {
  const index = reader.index;
  // `finally`, not a restore on the success path: `readHead` advances the
  // cursor past the initial byte before it validates, so a throwing peek would
  // otherwise leave the reader mid-head. A caller that catches a failed peek to
  // try another shape — which is the whole point of peeking — must find the
  // cursor exactly where it left it.
  try {
    return readHead(reader);
  } finally {
    reader.index = index;
  }
};
harden(peekHead);

/**
 * @param {CborReader} reader
 * @param {number} expected major type in `[0, 7]`
 * @param {string} label
 * @returns {{ major: number, value: bigint, start: number }}
 */
const expectHead = (reader, expected, label) => {
  const head = readHeadInternal(reader);
  if (head.major !== expected) {
    readerError(
      reader,
      head.start,
      `Expected ${label} (major ${expected}), got major ${head.major}`,
    );
  }
  return head;
};

/**
 * @param {CborReader} reader
 * @returns {bigint} in `[0, 2**64)`
 */
export const readUint = reader =>
  expectHead(reader, 0, 'unsigned integer').value;
harden(readUint);

/**
 * @param {CborReader} reader
 * @returns {bigint} in `[-2**64, 2**64)`
 */
export const readInt = reader => {
  const head = readHeadInternal(reader);
  if (head.major !== 0 && head.major !== 1) {
    readerError(
      reader,
      head.start,
      `Expected integer, got major ${head.major}`,
    );
  }
  return head.major === 0 ? head.value : -1n - head.value;
};
harden(readInt);

/**
 * @param {CborReader} reader
 * @returns {Uint8Array} a copy, safe to retain
 */
export const readByteString = reader => {
  const head = expectHead(reader, 2, 'byte string');
  return take(reader, headCount(reader, head, 'byte string length')).slice();
};
harden(readByteString);

/**
 * @param {CborReader} reader
 * @returns {string}
 */
export const readTextString = reader => {
  const head = expectHead(reader, 3, 'text string');
  const bytes = take(reader, headCount(reader, head, 'text string length'));
  try {
    return bytesToText(bytes, { fatal: true });
  } catch {
    return readerError(reader, head.start, 'Invalid UTF-8 text string');
  }
};
harden(readTextString);

/**
 * @param {CborReader} reader
 * @returns {number} element count, in `[0, 2**32)`
 */
export const readArrayHeader = reader =>
  headCount(reader, expectHead(reader, 4, 'array'), 'array length');
harden(readArrayHeader);

/**
 * @param {CborReader} reader
 * @returns {number} entry count, in `[0, 2**32)`
 */
export const readMapHeader = reader =>
  headCount(reader, expectHead(reader, 5, 'map'), 'map entry count');
harden(readMapHeader);

/**
 * @param {CborReader} reader
 * @returns {number} tag number, in `[0, 2**32)`
 */
export const readTag = reader =>
  headCount(reader, expectHead(reader, 6, 'tag'), 'tag number');
harden(readTag);

/**
 * @param {CborReader} reader
 * @returns {boolean}
 */
export const readBoolean = reader => {
  const head = expectHead(reader, 7, 'boolean');
  if (head.value === 20n) return false;
  if (head.value === 21n) return true;
  // A major-7 head is either a simple value in `[0, 24)` or a float64, so name
  // whichever actually arrived rather than reporting a float64's 64-bit pattern
  // as if it were a simple value.
  return readerError(
    reader,
    head.start,
    head.value < 24n
      ? `Expected boolean, got simple value ${head.value}`
      : 'Expected boolean, got float64',
  );
};
harden(readBoolean);

/**
 * Reads a float64. Only the canonical NaN bit pattern is accepted.
 *
 * @param {CborReader} reader
 * @returns {number}
 */
export const readFloat64 = reader => {
  const start = reader.index;
  const initial = take(reader, 1)[0];
  if (initial !== 0xfb) {
    readerError(reader, start, 'Expected float64 (major 7, info 27)');
  }
  const bytes = take(reader, 8);
  const value = new DataView(bytes.buffer, bytes.byteOffset, 8).getFloat64(
    0,
    false,
  );
  if (Number.isNaN(value) && !bytesEqual(CANONICAL_NAN, bytes)) {
    readerError(reader, start + 1, 'Non-canonical NaN');
  }
  return value;
};
harden(readFloat64);

/**
 * @param {CborReader} reader
 * @returns {bigint} unbounded
 */
export const readBignum = reader => {
  const start = reader.index;
  const tag = readTag(reader);
  if (tag !== 2 && tag !== 3) {
    readerError(reader, start, `Expected bignum tag (2 or 3), got tag ${tag}`);
  }
  const bytes = readByteString(reader);
  if (bytes.length > 0 && bytes[0] === 0) {
    readerError(reader, start, 'Non-minimal bignum payload');
  }
  let magnitude = 0n;
  for (const byte of bytes) {
    magnitude = (magnitude << 8n) | BigInt(byte);
  }
  return tag === 2 ? magnitude : -1n - magnitude;
};
harden(readBignum);

/**
 * Consumes an `undefined` if that is what comes next, and reports whether it
 * did. The counterpart of `writeUndefined`, so a caller need not reach past this
 * surface to raw `readHead` to recognize a value this package can write.
 *
 * Reports `false` rather than throwing at end of input: absence and malformation
 * stay distinguishable, which is the point of a probe.
 *
 * @param {CborReader} reader
 * @returns {boolean}
 */
export const readOptionalUndefined = reader => {
  if (reader.index >= reader.bytes.length) return false;
  const head = peekHead(reader);
  if (head.major !== 7 || head.value !== 23n) return false;
  readHead(reader);
  return true;
};
harden(readOptionalUndefined);

/**
 * Consumes a `null`, failing if that is not what comes next. The unconditional
 * counterpart of `writeNull`, for a position where `null` is required rather
 * than optional.
 *
 * @param {CborReader} reader
 * @returns {void}
 */
export const readNull = reader => {
  const head = readHeadInternal(reader);
  if (head.major !== 7 || head.value !== 22n) {
    readerError(reader, head.start, 'Expected null');
  }
};
harden(readNull);

/**
 * Consumes a `null` if that is what comes next, and reports whether it did.
 *
 * Reports `false` rather than throwing at end of input: a trailing optional
 * that is simply absent is the ordinary case, and keeping it distinct from a
 * malformed head is the point of a probe.
 *
 * @param {CborReader} reader
 * @returns {boolean}
 */
export const readOptionalNull = reader => {
  if (reader.index >= reader.bytes.length) return false;
  const head = peekHead(reader);
  if (head.major !== 7 || head.value !== 22n) return false;
  readHead(reader);
  return true;
};
harden(readOptionalNull);

/**
 * @param {CborReader} reader
 * @returns {void}
 */
export const assertConsumed = reader => {
  if (reader.index !== reader.bytes.length) {
    readerError(reader, reader.index, 'Unexpected trailing CBOR bytes');
  }
};
harden(assertConsumed);
