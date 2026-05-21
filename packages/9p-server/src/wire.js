// @ts-check
/* global Buffer */
//
// 9P2000.L wire-format helpers. All integers little-endian, strings prefixed
// with a u16 length and encoded as UTF-8 with no null terminator.
//
// Reference: https://github.com/chaos/diod/blob/master/protocol.md

/**
 * Streaming writer that grows the underlying buffer as needed.
 *
 * @param {number} [initialSize]
 */
export const makeWriter = (initialSize = 256) => {
  let buf = Buffer.alloc(initialSize);
  let off = 0;

  /** @param {number} n */
  const ensure = n => {
    while (off + n > buf.length) {
      const grown = Buffer.alloc(buf.length * 2);
      buf.copy(grown);
      buf = grown;
    }
  };

  return {
    /** @param {number} v */
    u8(v) {
      ensure(1);
      buf.writeUInt8(v, off);
      off += 1;
    },
    /** @param {number} v */
    u16(v) {
      ensure(2);
      buf.writeUInt16LE(v, off);
      off += 2;
    },
    /** @param {number} v */
    u32(v) {
      ensure(4);
      buf.writeUInt32LE(v, off);
      off += 4;
    },
    /** @param {bigint | number} v */
    u64(v) {
      ensure(8);
      buf.writeBigUInt64LE(typeof v === 'bigint' ? v : BigInt(v), off);
      off += 8;
    },
    /** @param {string} s */
    str(s) {
      const bytes = Buffer.from(s, 'utf8');
      ensure(2 + bytes.length);
      buf.writeUInt16LE(bytes.length, off);
      off += 2;
      bytes.copy(buf, off);
      off += bytes.length;
    },
    /** @param {Buffer | Uint8Array} b */
    bytes(b) {
      ensure(b.length);
      Buffer.from(b.buffer, b.byteOffset, b.byteLength).copy(buf, off);
      off += b.length;
    },
    finish() {
      return buf.subarray(0, off);
    },
  };
};
harden(makeWriter);

/**
 * Reader for an in-message slice (without the leading size).
 *
 * @param {Buffer} src
 */
export const makeReader = src => {
  let off = 0;
  return {
    u8() {
      const v = src.readUInt8(off);
      off += 1;
      return v;
    },
    u16() {
      const v = src.readUInt16LE(off);
      off += 2;
      return v;
    },
    u32() {
      const v = src.readUInt32LE(off);
      off += 4;
      return v;
    },
    u64() {
      const v = src.readBigUInt64LE(off);
      off += 8;
      return v;
    },
    str() {
      const len = src.readUInt16LE(off);
      off += 2;
      const s = src.toString('utf8', off, off + len);
      off += len;
      return s;
    },
    /** @param {number} n */
    take(n) {
      const slice = src.subarray(off, off + n);
      off += n;
      return slice;
    },
    remaining() {
      return src.length - off;
    },
  };
};
harden(makeReader);

/**
 * Wrap a payload buffer in the 9P message envelope:
 *   size[4] type[1] tag[2] payload...
 * size includes the envelope.
 *
 * @param {number} type
 * @param {number} tag
 * @param {Buffer} payload
 * @returns {Buffer}
 */
export const wrapMessage = (type, tag, payload) => {
  const total = 7 + payload.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(total, 0);
  out.writeUInt8(type, 4);
  out.writeUInt16LE(tag, 5);
  payload.copy(out, 7);
  return out;
};
harden(wrapMessage);

/**
 * Parse the message envelope. Returns null if the buffer doesn't contain
 * one full message yet; otherwise { msg, rest } where msg has
 * { type, tag, payload } and rest is the remaining bytes.
 *
 * `maxSize`, when provided, caps the declared frame size: a peer
 * sending a header with size > maxSize is rejected immediately,
 * before the connection buffers `size` bytes of payload. Without
 * the cap, a local client could declare an arbitrary size and
 * force unbounded `Buffer.concat` growth.
 *
 * @param {Buffer} buf
 * @param {number} [maxSize]
 */
export const tryParseMessage = (buf, maxSize) => {
  if (buf.length < 4) return null;
  const size = buf.readUInt32LE(0);
  if (size < 7) {
    throw new Error(`9P message size ${size} smaller than envelope`);
  }
  if (maxSize !== undefined && size > maxSize) {
    throw new Error(`9P message size ${size} exceeds max ${maxSize}`);
  }
  if (buf.length < size) return null;
  const type = buf.readUInt8(4);
  const tag = buf.readUInt16LE(5);
  const payload = buf.subarray(7, size);
  return harden({
    msg: harden({ type, tag, payload }),
    rest: buf.subarray(size),
  });
};
harden(tryParseMessage);
