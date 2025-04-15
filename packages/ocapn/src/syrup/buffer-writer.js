// @ts-check
/* eslint no-bitwise: ["off"] */

const textEncoder = new TextEncoder();

/**
 * @typedef {{
 *   length: number,
 *   index: number,
 *   bytes: Uint8Array,
 *   data: DataView,
 *   capacity: number,
 * }} BufferWriterState
 */

const assertNatNumber = n => {
  if (Number.isSafeInteger(n) && /** @type {number} */ (n) >= 0) {
    return;
  }
  throw TypeError(`must be a non-negative integer, got ${n}`);
};

export class BufferWriter {
  /** @type {BufferWriterState} */
  #state;

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
   * @param {number=} capacity
   */
  constructor(capacity = 16) {
    const bytes = new Uint8Array(capacity);
    const data = new DataView(bytes.buffer);
    this.#state = {
      bytes,
      data,
      index: 0,
      length: 0,
      capacity,
    };
  }

  /**
   * @param {number} required
   */
  ensureCanSeek(required) {
    assertNatNumber(required);
    const state = this.#state;
    let capacity = state.capacity;
    if (capacity >= required) {
      return;
    }
    while (capacity < required) {
      capacity *= 2;
    }
    const bytes = new Uint8Array(capacity);
    const data = new DataView(bytes.buffer);
    bytes.set(state.bytes.subarray(0, state.length));
    state.bytes = bytes;
    state.data = data;
    state.capacity = capacity;
  }

  /**
   * @param {number} index
   */
  seek(index) {
    const state = this.#state;
    this.ensureCanSeek(index);
    state.index = index;
    state.length = Math.max(state.index, state.length);
  }

  /**
   * @param {number} size
   */
  ensureCanWrite(size) {
    assertNatNumber(size);
    const state = this.#state;
    this.ensureCanSeek(state.index + size);
  }

  /**
   * @param {Uint8Array} bytes
   */
  write(bytes) {
    const state = this.#state;
    this.ensureCanWrite(bytes.byteLength);
    state.bytes.set(bytes, state.index);
    state.index += bytes.byteLength;
    state.length = Math.max(state.index, state.length);
  }

  /**
   * @param {number} byte
   */
  writeByte(byte) {
    assertNatNumber(byte);
    if (byte > 0xff) {
      throw RangeError(`byte must be in range 0..255, got ${byte}`);
    }
    this.writeUint8(byte);
  }

  /**
   * @param {number} start
   * @param {number} end
   */
  writeCopy(start, end) {
    assertNatNumber(start);
    assertNatNumber(end);
    const state = this.#state;
    const size = end - start;
    this.ensureCanWrite(size);
    state.bytes.copyWithin(state.index, start, end);
    state.index += size;
    state.length = Math.max(state.index, state.length);
  }

  /**
   * @param {number} value
   */
  writeUint8(value) {
    const state = this.#state;
    this.ensureCanWrite(1);
    state.data.setUint8(state.index, value);
    state.index += 1;
    state.length = Math.max(state.index, state.length);
  }

  /**
   * @param {number} value
   * @param {boolean=} littleEndian
   */
  writeUint16(value, littleEndian) {
    const state = this.#state;
    this.ensureCanWrite(2);
    state.data.setUint16(state.index, value, littleEndian);
    state.index += 2;
    state.length = Math.max(state.index, state.length);
  }

  /**
   * @param {number} value
   * @param {boolean=} littleEndian
   */
  writeUint32(value, littleEndian) {
    const state = this.#state;
    this.ensureCanWrite(4);
    state.data.setUint32(state.index, value, littleEndian);
    state.index += 4;
    state.length = Math.max(state.index, state.length);
  }

  /**
   * @param {number} value
   * @param {boolean=} littleEndian
   */
  writeFloat64(value, littleEndian) {
    const state = this.#state;
    this.ensureCanWrite(8);
    state.data.setFloat64(state.index, value, littleEndian);
    state.index += 8;
    state.length = Math.max(state.index, state.length);
  }

  /**
   * @param {string} string
   */
  writeString(string) {
    const bytes = textEncoder.encode(string);
    this.write(bytes);
  }

  /**
   * @param {number=} begin
   * @param {number=} end
   * @returns {Uint8Array}
   */
  subarray(begin, end) {
    const state = this.#state;
    return state.bytes.subarray(0, state.length).subarray(begin, end);
  }

  /**
   * @param {number=} begin
   * @param {number=} end
   * @returns {Uint8Array}
   */
  slice(begin, end) {
    return this.subarray(begin, end).slice();
  }
}
