// @ts-check
/* eslint no-bitwise: ["off"] */

const q = JSON.stringify;

// This is a mask of all the bits of the high 32 bits of a 64 bit integer that
// indicate a number that cannot be stored in the 53 bits of integer precision
// in a double precision floating point number.
const bitsTooHigh = (-1 << (53 - 32)) >> 0;

export class BufferReader {
  /**
   * @param {ArrayBuffer} data
   */
  constructor(data) {
    this.data = new Uint8Array(data);
    this.length = this.data.length;
    this.index = 0;
    this.offset = 0;
  }

  /**
   * @param {number} index
   * @return {boolean} whether the read head can move to the given absolute
   * index.
   */
  canSeek(index) {
    return index >= 0 && this.offset + index <= this.length;
  }

  /**
   * @param {number} index the index to check.
   * @throws {Error} an Error if the index is out of bounds.
   */
  assertCanSeek(index) {
    if (!this.canSeek(index)) {
      throw new Error(
        `End of data reached (data length = ${this.length}, asked index ${index}`
      );
    }
  }

  /**
   * @param {number} index
   * @return {number} prior index
   */
  seek(index) {
    const restore = this.index;
    this.assertCanSeek(index);
    this.index = index;
    return restore;
  }

  /**
   * @param {number} size
   * @returns {Uint8Array}
   */
  peek(size) {
    // Clamp size.
    size = Math.min(this.length - this.index, size);
    if (size === 0) {
      // in IE10, when using subarray(idx, idx), we get the array [0x00] instead of [].
      return new Uint8Array(0);
    }
    const result = this.data.subarray(
      this.offset + this.index,
      this.offset + this.index + size
    );
    return result;
  }

  /**
   * @param {number} offset
   */
  canRead(offset) {
    return this.canSeek(this.index + offset);
  }

  /**
   * Check that the offset will not go too far.
   * @param {number} offset the additional offset to check.
   * @throws {Error} an Error if the offset is out of bounds.
   */
  assertCanRead(offset) {
    this.assertCanSeek(this.index + offset);
  }

  /**
   * Get raw data without conversion, <size> bytes.
   * @param {number} size the number of bytes to read.
   * @return {Uint8Array} the raw data.
   */
  read(size) {
    this.assertCanRead(size);
    const result = this.peek(size);
    this.index += size;
    return result;
  }

  /**
   * @returns {number}
   */
  readUint8() {
    this.assertCanRead(1);
    const value = this.data[this.offset + this.index];
    this.index += 1;
    return value;
  }

  /**
   * @returns {number}
   */
  readUint16LE() {
    this.assertCanRead(2);
    const index = this.offset + this.index;
    const a = this.data[index + 0];
    const b = this.data[index + 1];
    const value = (b << 8) | a;
    this.index += 2;
    return value;
  }

  /**
   * @returns {number}
   */
  readUint32LE() {
    this.assertCanRead(4);
    const index = this.offset + this.index;
    const a = this.data[index + 0];
    const b = this.data[index + 1];
    const c = this.data[index + 2];
    const d = this.data[index + 3];
    const value = ((d << 24) >>> 0) + ((c << 16) | (b << 8) | a);
    this.index += 4;
    return value;
  }

  /**
   * @returns {number}
   */
  readUint64LE() {
    this.assertCanRead(8);
    const lo = this.readUint32LE();
    const hi = this.readUint32LE();
    if ((hi & bitsTooHigh) !== 0) {
      throw new Error(
        `Cannot read 8 byte integers with more than 53 bits of precision, got high bits 0x${hi.toString(
          16
        )} and low bits 0x${lo.toString(16)} at position ${this.offset +
          this.index}`
      );
    }
    this.index += 8;
    return hi << (32 + lo);
  }

  /**
   * @param {number} index
   * @returns {number}
   */
  byteAt(index) {
    return this.data[this.offset + index];
  }

  /**
   * @param {number} offset
   */
  skip(offset) {
    this.seek(this.index + offset);
  }

  /**
   * @param {Uint8Array} expected
   * @returns {boolean}
   */
  expect(expected) {
    if (!this.matchAt(this.index, expected)) {
      return false;
    }
    this.index += expected.length;
    return true;
  }

  /**
   * @param {number} index
   * @param {Uint8Array} expected
   * @returns {boolean}
   */
  matchAt(index, expected) {
    if (index + expected.length > this.length || index < 0) {
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
    if (!this.expect(expected)) {
      throw new Error(
        `Expected ${q(expected)} at ${this.index}, got ${this.peek(
          expected.length
        )}`
      );
    }
  }

  /**
   * @param {Uint8Array} expected
   * @returns {number}
   */
  findLast(expected) {
    let index = this.length - expected.length;
    while (index >= 0 && !this.matchAt(index, expected)) {
      index -= 1;
    }
    return index;
  }
}
