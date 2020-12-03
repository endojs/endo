// @ts-check
/* eslint no-bitwise: ["off"] */

const privateFields = new WeakMap();

export class BufferWriter {
  /**
   * @returns {number}
   */
  get length() {
    return privateFields.get(this).length;
  }

  /**
   * @returns {number}
   */
  get index() {
    return privateFields.get(this).index;
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
    const data = new Uint8Array(capacity);
    privateFields.set(this, {
      data,
      index: 0,
      length: 0,
      capacity,
    });
  }

  /**
   * @param {number} required
   */
  ensureCanSeek(required) {
    const fields = privateFields.get(this);
    let capacity = fields.capacity;
    while (capacity < required) {
      capacity *= 2;
    }
    const data = new Uint8Array(capacity);
    data.set(fields.data.subarray(0, fields.length));
    fields.data = data;
    fields.capacity = capacity;
  }

  /**
   * @param {number} index
   */
  seek(index) {
    const fields = privateFields.get(this);
    this.ensureCanSeek(index);
    fields.index = index;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number} size
   */
  ensureCanWrite(size) {
    const fields = privateFields.get(this);
    this.ensureCanSeek(fields.index + size);
  }

  /**
   * @param {Uint8Array} bytes
   */
  write(bytes) {
    const fields = privateFields.get(this);
    this.ensureCanWrite(bytes.length);
    fields.data.set(bytes, fields.index);
    fields.index += bytes.length;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number} start
   * @param {number} end
   */
  writeCopy(start, end) {
    const fields = privateFields.get(this);
    const size = end - start;
    this.ensureCanWrite(size);
    fields.data.copyWithin(fields.index, start, end);
    fields.index += size;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number} value
   */
  writeUint8(value) {
    const fields = privateFields.get(this);
    this.ensureCanWrite(1);
    fields.data[fields.index] = value;
    fields.index += 1;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number} value
   */
  writeUint16LE(value) {
    const fields = privateFields.get(this);
    this.ensureCanWrite(2);
    const index = fields.index;
    fields.data[index + 0] = value >>> 0;
    fields.data[index + 1] = value >>> 8;
    fields.index += 2;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number} value
   */
  writeUint32LE(value) {
    const fields = privateFields.get(this);
    this.ensureCanWrite(4);
    const index = fields.index;
    fields.data[index + 0] = value >>> 0;
    fields.data[index + 1] = value >>> 8;
    fields.data[index + 2] = value >>> 16;
    fields.data[index + 3] = value >>> 24;
    fields.index += 4;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number=} begin
   * @param {number=} end
   * @returns {Uint8Array}
   */
  subarray(begin, end) {
    const fields = privateFields.get(this);
    return fields.data.subarray(0, fields.length).subarray(begin, end);
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
