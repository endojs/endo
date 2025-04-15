// @ts-check

import { BufferWriter } from './buffer-writer.js';

const { freeze } = Object;
const textEncoder = new TextEncoder();

const defaultCapacity = 256;

// const MINUS = '-'.charCodeAt(0);
// const PLUS = '+'.charCodeAt(0);
// const ZERO = '0'.charCodeAt(0);
// const ONE = '1'.charCodeAt(0);
// const NINE = '9'.charCodeAt(0);
const LIST_START = '['.charCodeAt(0);
const LIST_END = ']'.charCodeAt(0);
const DICT_START = '{'.charCodeAt(0);
const DICT_END = '}'.charCodeAt(0);
const SET_START = '#'.charCodeAt(0);
const SET_END = '$'.charCodeAt(0);
// const BYTES_START = ':'.charCodeAt(0);
// const STRING_START = '"'.charCodeAt(0);
// const SELECTOR_START = "'".charCodeAt(0);
const RECORD_START = '<'.charCodeAt(0);
const RECORD_END = '>'.charCodeAt(0);
const TRUE = 't'.charCodeAt(0);
const FALSE = 'f'.charCodeAt(0);
// const SINGLE = 'F'.charCodeAt(0);
const FLOAT64 = 'D'.charCodeAt(0);

const NAN64 = freeze([0x7f, 0xf8, 0, 0, 0, 0, 0, 0]);

/**
 * @param {import('./buffer-writer.js').BufferWriter} bufferWriter
 * @param {Uint8Array} bytes
 * @param {string} typeChar
 */
function writeStringlike(bufferWriter, bytes, typeChar) {
  // write length prefix as ascii string
  const length = bytes.byteLength;
  const lengthPrefix = `${length}`;
  bufferWriter.writeString(lengthPrefix);
  bufferWriter.writeString(typeChar);
  bufferWriter.write(bytes);
}

/**
 * @param {import('./buffer-writer.js').BufferWriter} bufferWriter
 * @param {string} value
 */
function writeString(bufferWriter, value) {
  const bytes = textEncoder.encode(value);
  writeStringlike(bufferWriter, bytes, '"');
}

/**
 * @param {import('./buffer-writer.js').BufferWriter} bufferWriter
 * @param {string} value
 */
function writeSelectorFromString(bufferWriter, value) {
  const bytes = textEncoder.encode(value);
  writeStringlike(bufferWriter, bytes, "'");
}

/**
 * @param {import('./buffer-writer.js').BufferWriter} bufferWriter
 * @param {Uint8Array} value
 */
function writeBytestring(bufferWriter, value) {
  writeStringlike(bufferWriter, value, ':');
}

/**
 * @param {import('./buffer-writer.js').BufferWriter} bufferWriter
 * @param {number} value
 */
function writeFloat64(bufferWriter, value) {
  bufferWriter.writeByte(FLOAT64);
  if (value === 0) {
    // no-op
  } else if (Number.isNaN(value)) {
    // Canonicalize NaN
    // @ts-expect-error using frozen array as Uint8Array
    bufferWriter.write(NAN64);
  } else {
    bufferWriter.writeFloat64(value, false); // big end
  }
}

/**
 * @param {import('./buffer-writer.js').BufferWriter} bufferWriter
 * @param {bigint} value
 */
function writeInteger(bufferWriter, value) {
  const string = value >= 0 ? `${value}+` : `${-value}-`;
  bufferWriter.writeString(string);
}

/**
 * @param {import('./buffer-writer.js').BufferWriter} bufferWriter
 * @param {boolean} value
 */
function writeBoolean(bufferWriter, value) {
  bufferWriter.writeByte(value ? TRUE : FALSE);
}

export class SyrupWriter {
  /** @type {BufferWriter} */
  #bufferWriter;

  /**
   * @param {BufferWriter} bufferWriter
   */
  constructor(bufferWriter) {
    this.#bufferWriter = bufferWriter;
  }

  get index() {
    return this.#bufferWriter.index;
  }

  /**
   * @param {string} value
   */
  writeSelectorFromString(value) {
    writeSelectorFromString(this.#bufferWriter, value);
  }

  /**
   * @param {string} value
   */
  writeString(value) {
    writeString(this.#bufferWriter, value);
  }

  /**
   * @param {Uint8Array} value
   */
  writeBytestring(value) {
    writeBytestring(this.#bufferWriter, value);
  }

  /**
   * @param {boolean} value
   */
  writeBoolean(value) {
    writeBoolean(this.#bufferWriter, value);
  }

  /**
   * @param {bigint} value
   */
  writeInteger(value) {
    writeInteger(this.#bufferWriter, value);
  }

  /**
   * @param {number} value
   */
  writeFloat64(value) {
    writeFloat64(this.#bufferWriter, value);
  }

  enterRecord() {
    this.#bufferWriter.writeByte(RECORD_START);
  }

  exitRecord() {
    this.#bufferWriter.writeByte(RECORD_END);
  }

  enterList() {
    this.#bufferWriter.writeByte(LIST_START);
  }

  exitList() {
    this.#bufferWriter.writeByte(LIST_END);
  }

  enterDictionary() {
    this.#bufferWriter.writeByte(DICT_START);
  }

  exitDictionary() {
    this.#bufferWriter.writeByte(DICT_END);
  }

  enterSet() {
    this.#bufferWriter.writeByte(SET_START);
  }

  exitSet() {
    this.#bufferWriter.writeByte(SET_END);
  }

  getBytes() {
    return this.#bufferWriter.subarray(0, this.#bufferWriter.length);
  }
}

export function makeSyrupWriter(options = {}) {
  const { length: capacity = defaultCapacity } = options;
  const bufferWriter = new BufferWriter(capacity);
  return new SyrupWriter(bufferWriter);
}
