// @ts-check

/**
 * @file CBOR encoder for OCapN messages.
 *
 * Implements the OCapN CBOR encoding specification with canonical output
 * suitable for signature verification.
 *
 * See docs/cbor-encoding.md for the specification.
 */

import { isWellFormedString } from '@endo/pass-style';

import { BufferWriter } from '../syrup/buffer-writer.js';

/**
 * @import { OcapnWriter } from '../codec-interface.js'
 */

const textEncoder = new TextEncoder();

// CBOR Major Types (3 most significant bits)
const MAJOR_UNSIGNED = 0; // 0b000
const MAJOR_NEGATIVE = 1; // 0b001
const MAJOR_BYTESTRING = 2; // 0b010
const MAJOR_TEXTSTRING = 3; // 0b011
const MAJOR_ARRAY = 4; // 0b100
const MAJOR_MAP = 5; // 0b101
const MAJOR_TAG = 6; // 0b110
const MAJOR_FLOAT_SIMPLE = 7; // 0b111

// CBOR Additional Info values
const AI_1BYTE = 24;
const AI_2BYTE = 25;
const AI_4BYTE = 26;
const AI_8BYTE = 27;

// CBOR Simple Values (Major 7)
const SIMPLE_FALSE = 20;
const SIMPLE_TRUE = 21;
const SIMPLE_NULL = 22;
const SIMPLE_UNDEFINED = 23;

// CBOR Tags used in OCapN
const TAG_UNSIGNED_BIGNUM = 2n;
const TAG_NEGATIVE_BIGNUM = 3n;
const TAG_RECORD = 27n; // Generic record/structure
const TAG_SYMBOL = 280n; // OCapN symbol (selector)
const TAG_TAGGED_VALUE = 55799n; // Self-described CBOR / OCapN tagged

// Canonical NaN representation (IEEE 754 quiet NaN)
const CANONICAL_NAN = new Uint8Array([0x7f, 0xf8, 0, 0, 0, 0, 0, 0]);

const quote = JSON.stringify;

/**
 * Write CBOR type byte (major type + additional info)
 * @param {BufferWriter} writer
 * @param {number} major - Major type (0-7)
 * @param {number} info - Additional info (0-31)
 */
function writeTypeByte(writer, major, info) {
  // eslint-disable-next-line no-bitwise
  writer.writeByte((major << 5) | info);
}

/**
 * Write CBOR length/value encoding for a number.
 * Uses minimal encoding per CBOR canonicalization rules.
 *
 * @param {BufferWriter} writer
 * @param {number} major - Major type
 * @param {number | bigint} value - Non-negative value to encode
 */
function writeTypeAndLength(writer, major, value) {
  const n = typeof value === 'bigint' ? value : BigInt(value);
  if (n < 0n) {
    throw new Error(`CBOR length must be non-negative, got ${n}`);
  }
  if (n < 24n) {
    writeTypeByte(writer, major, Number(n));
  } else if (n < 256n) {
    writeTypeByte(writer, major, AI_1BYTE);
    writer.writeUint8(Number(n));
  } else if (n < 65536n) {
    writeTypeByte(writer, major, AI_2BYTE);
    writer.writeUint16(Number(n), false); // big-endian
  } else if (n < 4294967296n) {
    writeTypeByte(writer, major, AI_4BYTE);
    writer.writeUint32(Number(n), false); // big-endian
  } else {
    // For lengths > 32 bits, we'd need 8-byte encoding
    // This exceeds our 65535 message size limit anyway
    throw new Error(`CBOR length ${n} exceeds supported range`);
  }
}

/**
 * Write a CBOR tag
 * @param {BufferWriter} writer
 * @param {bigint} tagNumber
 */
function writeTag(writer, tagNumber) {
  writeTypeAndLength(writer, MAJOR_TAG, tagNumber);
}

/**
 * Convert a bigint to minimal big-endian byte representation.
 * Returns empty array for zero.
 *
 * @param {bigint} value - Non-negative value
 * @returns {Uint8Array}
 */
function bigintToMinimalBytes(value) {
  if (value < 0n) {
    throw new Error('bigintToMinimalBytes requires non-negative value');
  }
  if (value === 0n) {
    return new Uint8Array(0);
  }

  // Convert to hex, pad to even length, then to bytes
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Write a byte string
 * @param {BufferWriter} writer
 * @param {Uint8Array | ArrayBufferLike} value
 */
function writeBytestring(writer, value) {
  // Handle both Uint8Array and ArrayBuffer
  const bytes =
    value instanceof Uint8Array ? value : new Uint8Array(value.slice());
  writeTypeAndLength(writer, MAJOR_BYTESTRING, bytes.length);
  writer.write(bytes);
}

/**
 * Write a text string, validating it can be encoded as UTF-8.
 * Unpaired surrogates (U+D800-U+DFFF) are not valid Unicode scalar values
 * and cannot be represented in UTF-8.
 *
 * @param {BufferWriter} writer
 * @param {string} value
 */
function writeString(writer, value) {
  // Reject strings with unpaired surrogates - these can't be encoded in UTF-8.
  // isWellFormedString checks typeof and returns false for lone surrogates.
  if (!isWellFormedString(value)) {
    throw new Error(
      `writeString: Expected well-formed string, got ${quote(value)}`,
    );
  }

  const bytes = textEncoder.encode(value);
  writeTypeAndLength(writer, MAJOR_TEXTSTRING, bytes.length);
  writer.write(bytes);
}

/**
 * Write a boolean value
 * @param {BufferWriter} writer
 * @param {boolean} value
 */
function writeBoolean(writer, value) {
  writeTypeByte(writer, MAJOR_FLOAT_SIMPLE, value ? SIMPLE_TRUE : SIMPLE_FALSE);
}

/**
 * Write an integer as CBOR bignum (Tag 2 or 3).
 * OCapN always uses bignum encoding for integers.
 *
 * @param {BufferWriter} writer
 * @param {bigint} value
 */
function writeInteger(writer, value) {
  if (typeof value !== 'bigint') {
    throw new Error(`writeInteger: Expected bigint, got ${typeof value}`);
  }

  if (value >= 0n) {
    // Positive: Tag 2 + byte string of value
    writeTag(writer, TAG_UNSIGNED_BIGNUM);
    const bytes = bigintToMinimalBytes(value);
    writeBytestring(writer, bytes);
  } else {
    // Negative: Tag 3 + byte string of (-1 - value)
    writeTag(writer, TAG_NEGATIVE_BIGNUM);
    const magnitude = -1n - value;
    const bytes = bigintToMinimalBytes(magnitude);
    writeBytestring(writer, bytes);
  }
}

/**
 * Write a float64 value with canonical NaN
 * @param {BufferWriter} writer
 * @param {number} value
 */
function writeFloat64(writer, value) {
  writeTypeByte(writer, MAJOR_FLOAT_SIMPLE, AI_8BYTE);
  if (Number.isNaN(value)) {
    writer.write(CANONICAL_NAN);
  } else {
    writer.writeFloat64(value, false); // big-endian
  }
}

/**
 * Write a selector (symbol) as Tag 280 + text string
 * @param {BufferWriter} writer
 * @param {string} value - The symbol name
 */
function writeSelectorFromString(writer, value) {
  writeTag(writer, TAG_SYMBOL);
  writeString(writer, value);
}

const defaultCapacity = 256;

/**
 * CBOR Writer implementing the OcapnWriter interface.
 *
 * @implements {OcapnWriter}
 */
export class CborWriter {
  /** @type {BufferWriter} */
  #bufferWriter;

  /** @type {string} */
  name;

  /**
   * Record label type preference for this codec.
   * CBOR uses plain strings for record labels (not symbols).
   * @type {'string'}
   */
  recordLabelType = 'string';

  /**
   * Stack tracking nested structures for validation.
   * Each entry is the type of structure we're inside.
   * @type {Array<'record' | 'list' | 'dictionary' | 'set'>}
   */
  #stack = [];

  /**
   * Deferred length positions for structures.
   * Maps stack depth to the position where length was written.
   * @type {Map<number, {startIndex: number, countIndex: number, count: number}>}
   */
  #structureInfo = new Map();

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
    this.#incrementCount();
  }

  /**
   * @param {string} value
   */
  writeString(value) {
    writeString(this.#bufferWriter, value);
    this.#incrementCount();
  }

  /**
   * @param {ArrayBufferLike} value
   */
  writeBytestring(value) {
    // Convert to Uint8Array for internal operations
    // Immutable ArrayBuffers need to be sliced first
    const bytes = new Uint8Array(value.slice());
    writeBytestring(this.#bufferWriter, bytes);
    this.#incrementCount();
  }

  /**
   * @param {boolean} value
   */
  writeBoolean(value) {
    writeBoolean(this.#bufferWriter, value);
    this.#incrementCount();
  }

  /**
   * @param {bigint} value
   */
  writeInteger(value) {
    writeInteger(this.#bufferWriter, value);
    this.#incrementCount();
  }

  /**
   * @param {number} value
   */
  writeFloat64(value) {
    writeFloat64(this.#bufferWriter, value);
    this.#incrementCount();
  }

  /**
   * Write undefined
   */
  writeUndefined() {
    writeTypeByte(this.#bufferWriter, MAJOR_FLOAT_SIMPLE, SIMPLE_UNDEFINED);
    this.#incrementCount();
  }

  /**
   * Write null
   */
  writeNull() {
    writeTypeByte(this.#bufferWriter, MAJOR_FLOAT_SIMPLE, SIMPLE_NULL);
    this.#incrementCount();
  }

  /**
   * Increment the element count for the current structure
   */
  #incrementCount() {
    if (this.#stack.length > 0) {
      const info = this.#structureInfo.get(this.#stack.length - 1);
      if (info) {
        info.count += 1;
      }
    }
  }

  /**
   * Begin tracking a structure's elements
   * @param {'record' | 'list' | 'dictionary' | 'set'} type
   */
  #beginStructure(type) {
    this.#stack.push(type);
    this.#structureInfo.set(this.#stack.length - 1, {
      startIndex: this.#bufferWriter.index,
      countIndex: this.#bufferWriter.index,
      count: 0,
    });
  }

  /**
   * End tracking a structure and return element count
   * @param {'record' | 'list' | 'dictionary' | 'set'} expectedType
   * @returns {number} Element count
   */
  #endStructure(expectedType) {
    if (this.#stack.length === 0) {
      throw new Error(`Cannot exit ${expectedType}: not inside any structure`);
    }
    const actualType = this.#stack[this.#stack.length - 1];
    if (actualType !== expectedType) {
      throw new Error(
        `Cannot exit ${expectedType}: currently inside ${actualType}`,
      );
    }

    const info = this.#structureInfo.get(this.#stack.length - 1);
    this.#structureInfo.delete(this.#stack.length - 1);
    this.#stack.pop();

    // Increment parent's count
    this.#incrementCount();

    return info ? info.count : 0;
  }

  /**
   * Enter a record (Tag 27 + array).
   * The label should be written first using writeSelectorFromString.
   * @param {number} elementCount - Total elements including the label
   */
  enterRecord(elementCount) {
    writeTag(this.#bufferWriter, TAG_RECORD);
    writeTypeAndLength(this.#bufferWriter, MAJOR_ARRAY, elementCount);
    this.#beginStructure('record');
  }

  exitRecord() {
    this.#endStructure('record');
  }

  /**
   * Enter a list/array.
   * @param {number} elementCount - Number of elements in the list
   */
  enterList(elementCount) {
    writeTypeAndLength(this.#bufferWriter, MAJOR_ARRAY, elementCount);
    this.#beginStructure('list');
  }

  exitList() {
    this.#endStructure('list');
  }

  /**
   * Enter a dictionary/map.
   * @param {number} pairCount - Number of key-value pairs
   */
  enterDictionary(pairCount) {
    writeTypeAndLength(this.#bufferWriter, MAJOR_MAP, pairCount);
    this.#beginStructure('dictionary');
  }

  exitDictionary() {
    this.#endStructure('dictionary');
  }

  /**
   * Enter a set.
   * @param {number} elementCount - Number of elements in the set
   */
  enterSet(elementCount) {
    // Sets are encoded as arrays in CBOR
    writeTypeAndLength(this.#bufferWriter, MAJOR_ARRAY, elementCount);
    this.#beginStructure('set');
  }

  exitSet() {
    this.#endStructure('set');
  }

  getBytes() {
    return this.#bufferWriter.subarray(0, this.#bufferWriter.index);
  }
}

/**
 * Create a CborWriter that buffers content for later length encoding.
 *
 * This implementation uses a simpler approach: write array/map headers
 * with the length inline. The caller must know the length in advance
 * or use the streaming API.
 *
 * @param {object} [options]
 * @param {number} [options.length] - Initial capacity
 * @param {string} [options.name] - Name for error messages
 * @returns {CborWriter & {
 *   writeArrayHeader: (length: number) => void,
 *   writeMapHeader: (pairs: number) => void,
 *   writeTaggedValue: (tagName: string, payload: () => void) => void
 * }}
 */
export function makeCborWriter(options = {}) {
  const { length: capacity = defaultCapacity, ...writerOptions } = options;
  const bufferWriter = new BufferWriter(capacity);
  const writer = /** @type {any} */ (
    new CborWriter(bufferWriter, writerOptions)
  );

  // Add convenience methods for definite-length structures
  writer.writeArrayHeader = (/** @type {number} */ length) => {
    writeTypeAndLength(bufferWriter, MAJOR_ARRAY, length);
  };

  writer.writeMapHeader = (/** @type {number} */ pairs) => {
    writeTypeAndLength(bufferWriter, MAJOR_MAP, pairs);
  };

  // Helper for OCapN Tagged values (Tag 55799)
  writer.writeTaggedValue = (
    /** @type {string} */ tagName,
    /** @type {() => void} */ writePayload,
  ) => {
    writeTag(bufferWriter, TAG_TAGGED_VALUE);
    writeTypeAndLength(bufferWriter, MAJOR_ARRAY, 2);
    writeString(bufferWriter, tagName);
    writePayload();
  };

  return writer;
}

// Re-export constants for use by codec layer
export {
  TAG_UNSIGNED_BIGNUM,
  TAG_NEGATIVE_BIGNUM,
  TAG_RECORD,
  TAG_SYMBOL,
  TAG_TAGGED_VALUE,
  MAJOR_UNSIGNED,
  MAJOR_NEGATIVE,
  MAJOR_BYTESTRING,
  MAJOR_TEXTSTRING,
  MAJOR_ARRAY,
  MAJOR_MAP,
  MAJOR_TAG,
  MAJOR_FLOAT_SIMPLE,
};
