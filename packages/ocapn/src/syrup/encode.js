// @ts-check

import { isWellFormedString } from '@endo/pass-style';

import { BufferWriter } from './buffer-writer.js';

const quote = JSON.stringify;
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

const NAN64 = new Uint8Array([0x7f, 0xf8, 0, 0, 0, 0, 0, 0]);

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
  // Reject strings with unpaired surrogates - these can't be encoded in UTF-8.
  // isWellFormedString checks typeof and returns false for lone surrogates.
  if (!isWellFormedString(value)) {
    throw Error(
      `writeString: Expected well-formed string, got ${quote(value)} at index ${bufferWriter.index}`,
    );
  }
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
 * @param {ArrayBufferLike} value
 */
function writeBytestring(bufferWriter, value) {
  // Convert ArrayBuffer to Uint8Array for internal operations
  // Immutable ArrayBuffers need to be sliced first
  const mutableBuffer = value.slice();
  const bytes = new Uint8Array(mutableBuffer);
  writeStringlike(bufferWriter, bytes, ':');
}

/**
 * @param {import('./buffer-writer.js').BufferWriter} bufferWriter
 * @param {number} value
 */
function writeFloat64(bufferWriter, value) {
  bufferWriter.writeByte(FLOAT64);
  if (value === 0) {
    // Canonicalize 0
    bufferWriter.writeFloat64(0, false); // big end
  } else if (Number.isNaN(value)) {
    // Canonicalize NaN
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
  if (typeof value !== 'bigint') {
    throw Error(`writeInteger: Expected bigint, got ${typeof value}`);
  }
  const string = value >= 0n ? `${value}+` : `${-value}-`;
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
   * @param {object} options
   * @param {string} [options.name]
   */
  constructor(bufferWriter, options = {}) {
    const { name = '<unknown>' } = options;
    this.name = name;
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
   * @param {ArrayBufferLike} value
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

  /**
   * Enter a record structure.
   * @param {number} [_elementCount] - Ignored (Syrup uses delimiters, not counts)
   */
  enterRecord(_elementCount) {
    this.#bufferWriter.writeByte(RECORD_START);
  }

  exitRecord() {
    this.#bufferWriter.writeByte(RECORD_END);
  }

  /**
   * Enter a list structure.
   * @param {number} [_elementCount] - Ignored (Syrup uses delimiters, not counts)
   */
  enterList(_elementCount) {
    this.#bufferWriter.writeByte(LIST_START);
  }

  exitList() {
    this.#bufferWriter.writeByte(LIST_END);
  }

  /**
   * Enter a dictionary structure.
   * @param {number} [_pairCount] - Ignored (Syrup uses delimiters, not counts)
   */
  enterDictionary(_pairCount) {
    this.#bufferWriter.writeByte(DICT_START);
  }

  exitDictionary() {
    this.#bufferWriter.writeByte(DICT_END);
  }

  /**
   * Enter a set structure.
   * @param {number} [_elementCount] - Ignored (Syrup uses delimiters, not counts)
   */
  enterSet(_elementCount) {
    this.#bufferWriter.writeByte(SET_START);
  }

  exitSet() {
    this.#bufferWriter.writeByte(SET_END);
  }

  getBytes() {
    return this.#bufferWriter.subarray(0, this.#bufferWriter.index);
  }
}

export function makeSyrupWriter(options = {}) {
  const { length: capacity = defaultCapacity, ...writerOptions } = options;
  const bufferWriter = new BufferWriter(capacity);
  return new SyrupWriter(bufferWriter, writerOptions);
}
