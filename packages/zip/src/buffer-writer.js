// @ts-check
/* eslint no-bitwise: ["off"] */

/**
 * @type {WeakMap<BufferWriter, {
 *   length: number,
 *   index: number,
 *   bytes: Uint8Array,
 *   data: DataView,
 *   capacity: number,
 * }>}
 */
const privateFields = new WeakMap();

/**
 * @param {BufferWriter} self
 */
const getPrivateFields = self => {
  const fields = privateFields.get(self);
  if (!fields) {
    throw Error('BufferWriter fields are not initialized');
  }
  return fields;
};

const assertNatNumber = n => {
  if (Number.isSafeInteger(n) && /** @type {number} */ (n) >= 0) {
    return;
  }
  throw TypeError(`must be a non-negative integer, got ${n}`);
};

export class BufferWriter {
  /**
   * @returns {number}
   */
  get length() {
    return getPrivateFields(this).length;
  }

  /**
   * @returns {number}
   */
  get index() {
    return getPrivateFields(this).index;
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
    privateFields.set(this, {
      bytes,
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
    assertNatNumber(required);
    const fields = getPrivateFields(this);
    let capacity = fields.capacity;
    while (capacity < required) {
      capacity *= 2;
    }
    const bytes = new Uint8Array(capacity);
    const data = new DataView(bytes.buffer);
    bytes.set(fields.bytes.subarray(0, fields.length));
    fields.bytes = bytes;
    fields.data = data;
    fields.capacity = capacity;
  }

  /**
   * @param {number} index
   */
  seek(index) {
    const fields = getPrivateFields(this);
    this.ensureCanSeek(index);
    fields.index = index;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number} size
   */
  ensureCanWrite(size) {
    assertNatNumber(size);
    const fields = getPrivateFields(this);
    this.ensureCanSeek(fields.index + size);
  }

  /**
   * @param {Uint8Array} bytes
   */
  write(bytes) {
    const fields = getPrivateFields(this);
    this.ensureCanWrite(bytes.byteLength);
    fields.bytes.set(bytes, fields.index);
    fields.index += bytes.byteLength;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number} start
   * @param {number} end
   */
  writeCopy(start, end) {
    assertNatNumber(start);
    assertNatNumber(end);
    const fields = getPrivateFields(this);
    const size = end - start;
    this.ensureCanWrite(size);
    fields.bytes.copyWithin(fields.index, start, end);
    fields.index += size;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number} value
   */
  writeUint8(value) {
    const fields = getPrivateFields(this);
    this.ensureCanWrite(1);
    fields.data.setUint8(fields.index, value);
    fields.index += 1;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number} value
   * @param {boolean=} littleEndian
   */
  writeUint16(value, littleEndian) {
    const fields = getPrivateFields(this);
    this.ensureCanWrite(2);
    const index = fields.index;
    fields.data.setUint16(index, value, littleEndian);
    fields.index += 2;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number} value
   * @param {boolean=} littleEndian
   */
  writeUint32(value, littleEndian) {
    const fields = getPrivateFields(this);
    this.ensureCanWrite(4);
    const index = fields.index;
    fields.data.setUint32(index, value, littleEndian);
    fields.index += 4;
    fields.length = Math.max(fields.index, fields.length);
  }

  /**
   * @param {number=} begin
   * @param {number=} end
   * @returns {Uint8Array}
   */
  subarray(begin, end) {
    const fields = getPrivateFields(this);
    return fields.bytes.subarray(0, fields.length).subarray(begin, end);
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
