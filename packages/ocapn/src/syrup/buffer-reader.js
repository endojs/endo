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

export class BufferReader {
  /** @type {BufferReaderState} */
  #state;

  /**
   * @param {ArrayBuffer} buffer
   */
  constructor(buffer) {
    const bytes = new Uint8Array(buffer);
    const data = new DataView(bytes.buffer);
    this.#state = {
      bytes,
      data,
      length: bytes.length,
      index: 0,
      offset: 0,
    };
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {BufferReader}
   */
  static fromBytes(bytes) {
    const empty = new ArrayBuffer(0);
    const reader = new BufferReader(empty);
    const state = reader.#state;
    state.bytes = bytes;
    state.data = new DataView(bytes.buffer);
    state.length = bytes.length;
    state.index = 0;
    state.offset = bytes.byteOffset;
    // Temporary check until we can handle non-zero byteOffset
    if (state.offset !== 0) {
      throw Error(
        'Cannot create BufferReader from Uint8Array with a non-zero byteOffset',
      );
    }
    return reader;
  }

  /**
   * @returns {number}
   */
  get length() {
    return this.#state.length;
  }

  /**
   * @returns {number}
   */
  get index() {
    return this.#state.index;
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
    const state = this.#state;
    if (offset > state.data.byteLength) {
      throw Error('Cannot set offset beyond length of underlying data');
    }
    if (offset < 0) {
      throw Error('Cannot set negative offset');
    }
    state.offset = offset;
    state.length = state.data.byteLength - state.offset;
  }

  /**
   * @param {number} index
   * @returns {boolean} whether the read head can move to the given absolute
   * index.
   */
  canSeek(index) {
    const state = this.#state;
    return index >= 0 && state.offset + index <= state.length;
  }

  /**
   * @param {number} index the index to check.
   * @throws {Error} an Error if the index is out of bounds.
   */
  assertCanSeek(index) {
    const state = this.#state;
    if (!this.canSeek(index)) {
      const err = Error(
        `End of data reached (data length = ${state.length}, asked index ${index})`,
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
    const state = this.#state;
    const restore = state.index;
    this.assertCanSeek(index);
    state.index = index;
    return restore;
  }

  /**
   * @param {number} size
   * @returns {Uint8Array}
   */
  peek(size) {
    const state = this.#state;
    // Clamp size.
    size = Math.max(0, Math.min(state.length - state.index, size));
    if (size === 0) {
      // in IE10, when using subarray(idx, idx), we get the array [0x00] instead of [].
      return new Uint8Array(0);
    }
    const result = state.bytes.subarray(
      state.offset + state.index,
      state.offset + state.index + size,
    );
    return result;
  }

  peekByte() {
    const state = this.#state;
    this.assertCanRead(1);
    return state.bytes[state.offset + state.index];
  }

  /**
   * @param {number} offset
   */
  canRead(offset) {
    const state = this.#state;
    return this.canSeek(state.index + offset);
  }

  /**
   * Check that the offset will not go too far.
   *
   * @param {number} offset the additional offset to check.
   * @throws {Error} an Error if the offset is out of bounds.
   */
  assertCanRead(offset) {
    const state = this.#state;
    this.assertCanSeek(state.index + offset);
  }

  /**
   * Get raw data without conversion, <size> bytes.
   *
   * @param {number} size the number of bytes to read.
   * @returns {Uint8Array} the raw data.
   */
  read(size) {
    const state = this.#state;
    this.assertCanRead(size);
    const result = this.peek(size);
    state.index += size;
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
    const state = this.#state;
    this.assertCanRead(1);
    const index = state.offset + state.index;
    const value = state.data.getUint8(index);
    state.index += 1;
    return value;
  }

  /**
   * @returns {number}
   * @param {boolean=} littleEndian
   */
  readUint16(littleEndian) {
    const state = this.#state;
    this.assertCanRead(2);
    const index = state.offset + state.index;
    const value = state.data.getUint16(index, littleEndian);
    state.index += 2;
    return value;
  }

  /**
   * @returns {number}
   * @param {boolean=} littleEndian
   */
  readUint32(littleEndian) {
    const state = this.#state;
    this.assertCanRead(4);
    const index = state.offset + state.index;
    const value = state.data.getUint32(index, littleEndian);
    state.index += 4;
    return value;
  }

  /**
   * @param {boolean=} littleEndian
   * @returns {number}
   */
  readFloat64(littleEndian = false) {
    const state = this.#state;
    this.assertCanRead(8);
    const index = state.offset + state.index;
    const value = state.data.getFloat64(index, littleEndian);
    state.index += 8;
    return value;
  }

  /**
   * @param {number} index
   * @returns {number}
   */
  byteAt(index) {
    const state = this.#state;
    return state.bytes[state.offset + index];
  }

  /**
   * @param {number} index
   * @param {number} size
   * @returns {Uint8Array}
   */
  bytesAt(index, size) {
    this.assertCanSeek(index + size);
    const state = this.#state;
    return state.bytes.subarray(
      state.offset + index,
      state.offset + index + size,
    );
  }

  /**
   * @param {number} offset
   */
  skip(offset) {
    const state = this.#state;
    this.seek(state.index + offset);
  }

  /**
   * @param {Uint8Array} expected
   * @returns {boolean}
   */
  expect(expected) {
    const state = this.#state;
    if (!this.matchAt(state.index, expected)) {
      return false;
    }
    state.index += expected.length;
    return true;
  }

  /**
   * @param {number} index
   * @param {Uint8Array} expected
   * @returns {boolean}
   */
  matchAt(index, expected) {
    const state = this.#state;
    if (index + expected.length > state.length || index < 0) {
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
    const state = this.#state;
    if (!this.expect(expected)) {
      throw Error(
        `Expected ${q(expected)} at ${state.index}, got ${this.peek(
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
    const state = this.#state;
    let index = state.length - expected.length;
    while (index >= 0 && !this.matchAt(index, expected)) {
      index -= 1;
    }
    return index;
  }
}
