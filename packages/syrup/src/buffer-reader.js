// @ts-check
/* eslint no-bitwise: ["off"] */

const q = JSON.stringify;

/**
 * @typedef {object} BufferReaderState
 * @property {Uint8Array} bytes
 * @property {DataView} data
 * @property {number} length
 * @property {number} index
 * @property {number} offset
 */

/** @type {WeakMap<BufferReader, BufferReaderState>} */
const privateFields = new WeakMap();

/** @type {(bufferReader: BufferReader) => BufferReaderState} */
const privateFieldsGet = privateFields.get.bind(privateFields);

export class BufferReader {
  /**
   * @param {ArrayBuffer} buffer
   */
  constructor(buffer) {
    const bytes = new Uint8Array(buffer);
    const data = new DataView(bytes.buffer);
    privateFields.set(this, {
      bytes,
      data,
      length: bytes.length,
      index: 0,
      offset: 0,
    });
  }

  static fromBytes(bytes) {
    const empty = new ArrayBuffer(0);
    const reader = new BufferReader(empty);
    const fields = privateFieldsGet(reader);
    fields.bytes = bytes;
    fields.data = new DataView(bytes.buffer);
    fields.length = bytes.length;
    fields.index = 0;
    fields.offset = 0;
    return reader;
  }

  /**
   * @returns {number}
   */
  get length() {
    return privateFieldsGet(this).length;
  }

  /**
   * @returns {number}
   */
  get index() {
    return privateFieldsGet(this).index;
  }

  /**
   * @param {number} index
   */
  set index(index) {
    this.seek(index);
  }

  /**
   * @param {number} offset
   */
  set offset(offset) {
    const fields = privateFieldsGet(this);
    if (offset > fields.data.byteLength) {
      throw Error('Cannot set offset beyond length of underlying data');
    }
    if (offset < 0) {
      throw Error('Cannot set negative offset');
    }
    fields.offset = offset;
    fields.length = fields.data.byteLength - fields.offset;
  }

  /**
   * @param {number} index
   * @returns {boolean} whether the read head can move to the given absolute
   * index.
   */
  canSeek(index) {
    const fields = privateFieldsGet(this);
    return index >= 0 && fields.offset + index <= fields.length;
  }

  /**
   * @param {number} index the index to check.
   * @throws {Error} an Error if the index is out of bounds.
   */
  assertCanSeek(index) {
    const fields = privateFieldsGet(this);
    if (!this.canSeek(index)) {
      const err = Error(
        `End of data reached (data length = ${fields.length}, asked index ${index}`,
      );
      // @ts-expect-error
      err.code = 'EOD';
      // @ts-expect-error
      err.index = index;
      throw err;
    }
  }

  /**
   * @param {number} index
   * @returns {number} prior index
   */
  seek(index) {
    const fields = privateFieldsGet(this);
    const restore = fields.index;
    this.assertCanSeek(index);
    fields.index = index;
    return restore;
  }

  /**
   * @param {number} size
   * @returns {Uint8Array}
   */
  peek(size) {
    const fields = privateFieldsGet(this);
    // Clamp size.
    size = Math.max(0, Math.min(fields.length - fields.index, size));
    if (size === 0) {
      // in IE10, when using subarray(idx, idx), we get the array [0x00] instead of [].
      return new Uint8Array(0);
    }
    const result = fields.bytes.subarray(
      fields.offset + fields.index,
      fields.offset + fields.index + size,
    );
    return result;
  }

  peekByte() {
    const fields = privateFieldsGet(this);
    this.assertCanRead(1);
    return fields.bytes[fields.offset + fields.index];
  }

  /**
   * @param {number} offset
   */
  canRead(offset) {
    const fields = privateFieldsGet(this);
    return this.canSeek(fields.index + offset);
  }

  /**
   * Check that the offset will not go too far.
   *
   * @param {number} offset the additional offset to check.
   * @throws {Error} an Error if the offset is out of bounds.
   */
  assertCanRead(offset) {
    const fields = privateFieldsGet(this);
    this.assertCanSeek(fields.index + offset);
  }

  /**
   * Get raw data without conversion, <size> bytes.
   *
   * @param {number} size the number of bytes to read.
   * @returns {Uint8Array} the raw data.
   */
  read(size) {
    const fields = privateFieldsGet(this);
    this.assertCanRead(size);
    const result = this.peek(size);
    fields.index += size;
    return result;
  }

  /**
   * @returns {number}
   */
  readByte() {
    return this.readUint8();
  }

  /**
   * @returns {number}
   */
  readUint8() {
    const fields = privateFieldsGet(this);
    this.assertCanRead(1);
    const index = fields.offset + fields.index;
    const value = fields.data.getUint8(index);
    fields.index += 1;
    return value;
  }

  /**
   * @returns {number}
   * @param {boolean=} littleEndian
   */
  readUint16(littleEndian) {
    const fields = privateFieldsGet(this);
    this.assertCanRead(2);
    const index = fields.offset + fields.index;
    const value = fields.data.getUint16(index, littleEndian);
    fields.index += 2;
    return value;
  }

  /**
   * @returns {number}
   * @param {boolean=} littleEndian
   */
  readUint32(littleEndian) {
    const fields = privateFieldsGet(this);
    this.assertCanRead(4);
    const index = fields.offset + fields.index;
    const value = fields.data.getUint32(index, littleEndian);
    fields.index += 4;
    return value;
  }

  /**
   * @param {boolean=} littleEndian
   * @returns {number}
   */
  readFloat64(littleEndian = false) {
    const fields = privateFieldsGet(this);
    this.assertCanRead(8);
    const index = fields.offset + fields.index;
    const value = fields.data.getFloat64(index, littleEndian);
    fields.index += 8;
    return value;
  }

  /**
   * @param {number} index
   * @returns {number}
   */
  byteAt(index) {
    const fields = privateFieldsGet(this);
    return fields.bytes[fields.offset + index];
  }

  /**
   * @param {number} index
   * @param {number} size
   * @returns {Uint8Array}
   */
  bytesAt(index, size) {
    this.assertCanSeek(index + size);
    const fields = privateFieldsGet(this);
    return fields.bytes.subarray(fields.offset + index, fields.offset + index + size);
  }

  /**
   * @param {number} offset
   */
  skip(offset) {
    const fields = privateFieldsGet(this);
    this.seek(fields.index + offset);
  }

  /**
   * @param {Uint8Array} expected
   * @returns {boolean}
   */
  expect(expected) {
    const fields = privateFieldsGet(this);
    if (!this.matchAt(fields.index, expected)) {
      return false;
    }
    fields.index += expected.length;
    return true;
  }

  /**
   * @param {number} index
   * @param {Uint8Array} expected
   * @returns {boolean}
   */
  matchAt(index, expected) {
    const fields = privateFieldsGet(this);
    if (index + expected.length > fields.length || index < 0) {
      return false;
    }
    for (let i = 0; i < expected.length; i += 1) {
      if (expected[i] !== this.byteAt(index + i)) {
        return false;
      }
    }
    return true;
  }

  /**
   * @param {Uint8Array} expected
   */
  assert(expected) {
    const fields = privateFieldsGet(this);
    if (!this.expect(expected)) {
      throw Error(
        `Expected ${q(expected)} at ${fields.index}, got ${this.peek(
          expected.length,
        )}`,
      );
    }
  }

  /**
   * @param {Uint8Array} expected
   * @returns {number}
   */
  findLast(expected) {
    const fields = privateFieldsGet(this);
    let index = fields.length - expected.length;
    while (index >= 0 && !this.matchAt(index, expected)) {
      index -= 1;
    }
    return index;
  }
}