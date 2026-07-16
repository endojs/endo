// @ts-check
/* eslint-disable @endo/restrict-comparison-operands, no-bitwise, no-nested-ternary, unicorn/numeric-separators-style, consistent-return */

import { makeError, q } from '@endo/errors';
import harden from '@endo/harden';
import { isWellFormedString } from '@endo/is-well-formed-string';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const CANONICAL_NAN = harden(new Uint8Array([0x7f, 0xf8, 0, 0, 0, 0, 0, 0]));

const insistNatural = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw Error(`${label} must be a non-negative safe integer, got ${value}`);
  }
};

const append = (writer, byte) => {
  if (writer.length === writer.buffer.length) {
    const next = new Uint8Array(Math.max(1, writer.buffer.length * 2));
    next.set(writer.buffer);
    writer.buffer = next;
  }
  writer.buffer[writer.length] = byte;
  writer.length += 1;
};

const appendBytes = (writer, bytes) => {
  while (writer.length + bytes.length > writer.buffer.length) {
    const next = new Uint8Array(Math.max(1, writer.buffer.length * 2));
    next.set(writer.buffer);
    writer.buffer = next;
  }
  writer.buffer.set(bytes, writer.length);
  writer.length += bytes.length;
};

const readerError = (reader, index, message) => {
  throw makeError(`${message} at index ${index} of ${reader.name}`, Error);
};

const take = (reader, count) => {
  const start = reader.index;
  if (count > reader.bytes.length - start) {
    readerError(reader, start, 'Unexpected end of CBOR input');
  }
  reader.index += count;
  return reader.bytes.subarray(start, start + count);
};

const canonicalInfo = value =>
  value < 24
    ? value
    : value < 0x100
      ? 24
      : value < 0x10000
        ? 25
        : value < 0x100000000
          ? 26
          : 27;

export const makeCborWriter = harden((opts = {}) => {
  const capacity = opts.capacity === undefined ? 256 : opts.capacity;
  insistNatural(capacity, 'capacity');
  return { buffer: new Uint8Array(capacity), length: 0 };
});

export const cborWriterBytes = harden(writer =>
  writer.buffer.slice(0, writer.length),
);

export const writeHead = harden((writer, major, value) => {
  insistNatural(major, 'major type');
  if (major > 7) throw Error(`major type must be in [0, 7], got ${major}`);
  insistNatural(value, 'CBOR argument');
  const info = canonicalInfo(value);
  append(writer, (major << 5) | info);
  if (info === 24) append(writer, value);
  if (info === 25) {
    append(writer, value >>> 8);
    append(writer, value);
  }
  if (info === 26) {
    append(writer, Math.floor(value / 0x1000000));
    append(writer, Math.floor(value / 0x10000));
    append(writer, Math.floor(value / 0x100));
    append(writer, value);
  }
  if (info === 27) {
    const high = Math.floor(value / 0x100000000);
    const low = value % 0x100000000;
    append(writer, Math.floor(high / 0x1000000));
    append(writer, Math.floor(high / 0x10000));
    append(writer, Math.floor(high / 0x100));
    append(writer, high);
    append(writer, Math.floor(low / 0x1000000));
    append(writer, Math.floor(low / 0x10000));
    append(writer, Math.floor(low / 0x100));
    append(writer, low);
  }
});

export const writeUint = harden((writer, value) => writeHead(writer, 0, value));
export const writeInt = harden((writer, value) => {
  if (!Number.isSafeInteger(value))
    throw Error(`integer must be a safe integer, got ${value}`);
  writeHead(writer, value >= 0 ? 0 : 1, value >= 0 ? value : -1 - value);
});
export const writeByteString = harden((writer, value) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  writeHead(writer, 2, bytes.length);
  appendBytes(writer, bytes);
});
export const writeTextString = harden((writer, value) => {
  // isWellFormedString checks typeof and returns false for lone surrogates.
  if (!isWellFormedString(value)) {
    throw Error(
      `writeTextString: expected a well-formed string, got ${q(value)}`,
    );
  }
  const bytes = textEncoder.encode(value);
  writeHead(writer, 3, bytes.length);
  appendBytes(writer, bytes);
});
export const writeArrayHeader = harden((writer, length) =>
  writeHead(writer, 4, length),
);
export const writeMapHeader = harden((writer, length) =>
  writeHead(writer, 5, length),
);
export const writeTag = harden((writer, tag) => writeHead(writer, 6, tag));
export const writeBoolean = harden((writer, value) => {
  if (typeof value !== 'boolean')
    throw Error(`boolean expected, got ${typeof value}`);
  append(writer, value ? 0xf5 : 0xf4);
});
export const writeNull = harden(writer => append(writer, 0xf6));
export const writeUndefined = harden(writer => append(writer, 0xf7));
export const writeFloat64 = harden((writer, value) => {
  if (typeof value !== 'number')
    throw Error(`number expected, got ${typeof value}`);
  append(writer, 0xfb);
  if (Number.isNaN(value)) {
    appendBytes(writer, CANONICAL_NAN);
  } else {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, false);
    appendBytes(writer, bytes);
  }
});
export const writeBignum = harden((writer, value) => {
  if (typeof value !== 'bigint')
    throw Error(`bigint expected, got ${typeof value}`);
  const magnitude = value >= 0n ? value : -1n - value;
  let hex = magnitude.toString(16);
  if (magnitude === 0n) hex = '';
  if (hex.length % 2) hex = `0${hex}`;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  writeTag(writer, value >= 0n ? 2 : 3);
  writeByteString(writer, bytes);
});

// Readers are strict by default: they reject non-minimal heads and non-minimal
// bignum payloads so no two byte-different encodings of a value both decode.
// `{ lenient: true }` restores the old tolerant behavior for interop with a peer
// that emits non-canonical heads; non-canonical NaN is rejected in every mode.
export const makeCborReader = harden((bytes, opts = {}) => {
  if (!(bytes instanceof Uint8Array))
    throw Error('CBOR input must be a Uint8Array');
  return {
    bytes,
    index: 0,
    name: opts.name || '<anonymous>',
    lenient: !!opts.lenient,
  };
});

const readHeadInternal = reader => {
  const start = reader.index;
  const initial = take(reader, 1)[0];
  const major = initial >> 5;
  const info = initial & 0x1f;
  if (info >= 28)
    readerError(reader, start, `Invalid CBOR additional info ${info}`);
  const count = info < 24 ? 0 : 1 << (info - 24);
  const extension = take(reader, count);
  let value = info < 24 ? info : 0;
  for (const byte of extension) value = value * 256 + byte;
  if (!Number.isSafeInteger(value)) {
    readerError(reader, start, 'CBOR argument exceeds Number.MAX_SAFE_INTEGER');
  }
  if (!reader.lenient && canonicalInfo(value) !== info) {
    readerError(reader, start, 'Non-minimal CBOR head');
  }
  return { major, value, start };
};

export const readHead = harden(reader => {
  const { major, value } = readHeadInternal(reader);
  return harden({ major, value });
});
export const peekHead = harden(reader => {
  const index = reader.index;
  const head = readHead(reader);
  reader.index = index;
  return head;
});

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

export const readUint = harden(
  reader => expectHead(reader, 0, 'unsigned integer').value,
);
export const readInt = harden(reader => {
  const head = readHeadInternal(reader);
  if (head.major !== 0 && head.major !== 1)
    readerError(
      reader,
      head.start,
      `Expected integer, got major ${head.major}`,
    );
  return head.major === 0 ? head.value : -1 - head.value;
});
export const readByteString = harden(reader => {
  const { value } = expectHead(reader, 2, 'byte string');
  return take(reader, value).slice();
});
export const readTextString = harden(reader => {
  const { value, start } = expectHead(reader, 3, 'text string');
  try {
    return textDecoder.decode(take(reader, value));
  } catch {
    readerError(reader, start, 'Invalid UTF-8 text string');
  }
});
export const readArrayHeader = harden(
  reader => expectHead(reader, 4, 'array').value,
);
export const readMapHeader = harden(
  reader => expectHead(reader, 5, 'map').value,
);
export const readTag = harden(reader => expectHead(reader, 6, 'tag').value);
export const readBoolean = harden(reader => {
  const head = expectHead(reader, 7, 'boolean');
  if (head.value === 20) return false;
  if (head.value === 21) return true;
  readerError(
    reader,
    head.start,
    `Expected boolean, got simple value ${head.value}`,
  );
});
export const readFloat64 = harden(reader => {
  const start = reader.index;
  const initial = take(reader, 1)[0];
  if (initial !== 0xfb)
    readerError(reader, start, 'Expected float64 (major 7, info 27)');
  const bytes = take(reader, 8);
  const value = new DataView(bytes.buffer, bytes.byteOffset, 8).getFloat64(
    0,
    false,
  );
  if (
    Number.isNaN(value) &&
    !CANONICAL_NAN.every((byte, index) => byte === bytes[index])
  ) {
    readerError(reader, start + 1, 'Non-canonical NaN');
  }
  return value;
});
export const readBignum = harden(reader => {
  const start = reader.index;
  const tag = readTag(reader);
  if (tag !== 2 && tag !== 3)
    readerError(reader, start, `Expected bignum tag (2 or 3), got tag ${tag}`);
  const bytes = readByteString(reader);
  if (!reader.lenient && bytes.length > 0 && bytes[0] === 0) {
    readerError(reader, start, 'Non-minimal bignum payload');
  }
  let magnitude = 0n;
  for (const byte of bytes) magnitude = (magnitude << 8n) | BigInt(byte);
  return tag === 2 ? magnitude : -1n - magnitude;
});
export const readOptionalNull = harden(reader => {
  const head = peekHead(reader);
  if (head.major !== 7 || head.value !== 22) return false;
  readHead(reader);
  return true;
});
export const assertConsumed = harden(reader => {
  if (reader.index !== reader.bytes.length) {
    readerError(reader, reader.index, 'Unexpected trailing CBOR bytes');
  }
});
