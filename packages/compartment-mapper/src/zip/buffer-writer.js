// @ts-check
/* eslint no-bitwise: ["off"] */

export class BufferWriter {
  /**
   * @param {number=} capacity
   */
  constructor(capacity = 16) {
    this.data = new Uint8Array(capacity);
    this.index = 0;
    this.length = 0;
    this.capacity = capacity;
  }

  /**
   * @param {number} required
   */
  ensureCanSeek(required) {
    let capacity = this.capacity;
    while (capacity < required) {
      capacity *= 2;
    }
    const data = new Uint8Array(capacity);
    data.set(this.data.subarray(0, this.length));
    this.data = data;
    this.capacity = capacity;
  }

  /**
   * @param {number} index
   */
  seek(index) {
    this.ensureCanSeek(index);
    this.index = index;
    this.length = Math.max(this.index, this.length);
  }

  /**
   * @param {number} size
   */
  ensureCanWrite(size) {
    this.ensureCanSeek(this.index + size);
  }

  /**
   * @param {Uint8Array} bytes
   */
  write(bytes) {
    this.ensureCanWrite(bytes.length);
    this.data.set(bytes, this.index);
    this.index += bytes.length;
    this.length = Math.max(this.index, this.length);
  }

  /**
   * @param {number} start
   * @param {number} end
   */
  writeCopy(start, end) {
    const size = end - start;
    this.ensureCanWrite(size);
    this.data.copyWithin(this.index, start, end);
    this.index += size;
    this.length = Math.max(this.index, this.length);
  }

  /**
   * @param {number} value
   */
  writeUint8(value) {
    this.ensureCanWrite(1);
    this.data[this.index] = value;
    this.index += 1;
    this.length = Math.max(this.index, this.length);
  }

  /**
   * @param {number} value
   */
  writeUint16LE(value) {
    this.ensureCanWrite(2);
    const index = this.index;
    this.data[index + 0] = value >>> 0;
    this.data[index + 1] = value >>> 8;
    this.index += 2;
    this.length = Math.max(this.index, this.length);
  }

  /**
   * @param {number} value
   */
  writeUint32LE(value) {
    this.ensureCanWrite(4);
    const index = this.index;
    this.data[index + 0] = value >>> 0;
    this.data[index + 1] = value >>> 8;
    this.data[index + 2] = value >>> 16;
    this.data[index + 3] = value >>> 24;
    this.index += 4;
    this.length = Math.max(this.index, this.length);
  }

  /**
   * @param {number} value
   */
  writeUint64LE(value) {
    this.ensureCanWrite(8);
    this.writeUint32LE(value);
    this.writeUint32LE(value >>> 32);
  }

  subarray() {
    return this.data.subarray(0, this.length);
  }

  slice() {
    return this.subarray().slice();
  }
}
