// @ts-check

/**
 * @file CBOR decoder for OCapN messages.
 *
 * Implements the OCapN CBOR encoding specification, validating canonical
 * encoding for signature verification.
 *
 * See docs/cbor-encoding.md for the specification.
 */

import { uint8ArrayToImmutableArrayBuffer } from '../buffer-utils.js';
import { BufferReader } from '../syrup/buffer-reader.js';

/**
 * @import { OcapnReader, TypeHint, RecordLabelInfo, TypeAndMaybeValue } from '../codec-interface.js'
 */

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const { freeze } = Object;

// CBOR Major Types (3 most significant bits)
// Major types 0 and 1 (unsigned/negative) are not used directly
// because OCapN uses bignums (tags 2/3) for all integers.
const MAJOR_BYTESTRING = 2;
const MAJOR_TEXTSTRING = 3;
const MAJOR_ARRAY = 4;
const MAJOR_MAP = 5;
const MAJOR_TAG = 6;
const MAJOR_FLOAT_SIMPLE = 7;

// CBOR Additional Info values
const AI_1BYTE = 24;
const AI_2BYTE = 25;
const AI_4BYTE = 26;
const AI_8BYTE = 27;
const AI_INDEFINITE = 31;

// CBOR Simple Values (Major 7)
const SIMPLE_FALSE = 20;
const SIMPLE_TRUE = 21;
const SIMPLE_NULL = 22;
const SIMPLE_UNDEFINED = 23;

// CBOR Tags used in OCapN
const TAG_UNSIGNED_BIGNUM = 2n;
const TAG_NEGATIVE_BIGNUM = 3n;
const TAG_RECORD = 27n;
const TAG_SYMBOL = 280n;
const TAG_TAGGED_VALUE = 55799n;

// Canonical NaN representation
const CANONICAL_NAN = freeze([0x7f, 0xf8, 0, 0, 0, 0, 0, 0]);

/**
 * Parse the major type and additional info from a type byte
 * @param {number} byte
 * @returns {{major: number, info: number}}
 */
function parseTypeByte(byte) {
  return {
    // eslint-disable-next-line no-bitwise
    major: byte >> 5,
    // eslint-disable-next-line no-bitwise
    info: byte & 0x1f,
  };
}

/**
 * Read the "argument" (length/value) from additional info
 * @param {BufferReader} reader
 * @param {number} info - Additional info from type byte
 * @param {string} name - Reader name for errors
 * @returns {bigint}
 */
function readArgument(reader, info, name) {
  if (info < 24) {
    return BigInt(info);
  }
  if (info === AI_1BYTE) {
    return BigInt(reader.readUint8());
  }
  if (info === AI_2BYTE) {
    return BigInt(reader.readUint16(false)); // big-endian
  }
  if (info === AI_4BYTE) {
    return BigInt(reader.readUint32(false)); // big-endian
  }
  if (info === AI_8BYTE) {
    // Read 8 bytes as bigint
    const high = BigInt(reader.readUint32(false));
    const low = BigInt(reader.readUint32(false));
    // eslint-disable-next-line no-bitwise
    return (high << 32n) | low;
  }
  if (info === AI_INDEFINITE) {
    throw new Error(
      `Indefinite length not supported in OCapN CBOR at index ${reader.index} of ${name}`,
    );
  }
  throw new Error(
    `Invalid additional info ${info} at index ${reader.index} of ${name}`,
  );
}

/**
 * Read a CBOR byte string
 * @param {BufferReader} reader
 * @param {string} name
 * @returns {ArrayBufferLike}
 */
function readBytestring(reader, name) {
  const byte = reader.readByte();
  const { major, info } = parseTypeByte(byte);
  if (major !== MAJOR_BYTESTRING) {
    throw new Error(
      `Expected byte string (major 2), got major ${major} at index ${reader.index - 1} of ${name}`,
    );
  }
  const length = Number(readArgument(reader, info, name));
  const bytes = reader.read(length);
  return uint8ArrayToImmutableArrayBuffer(bytes);
}

/**
 * Read a CBOR text string
 * @param {BufferReader} reader
 * @param {string} name
 * @returns {string}
 */
function readString(reader, name) {
  const byte = reader.readByte();
  const { major, info } = parseTypeByte(byte);
  if (major !== MAJOR_TEXTSTRING) {
    throw new Error(
      `Expected text string (major 3), got major ${major} at index ${reader.index - 1} of ${name}`,
    );
  }
  const length = Number(readArgument(reader, info, name));
  const bytes = reader.read(length);
  return textDecoder.decode(bytes);
}

/**
 * Read a CBOR boolean
 * @param {BufferReader} reader
 * @param {string} name
 * @returns {boolean}
 */
function readBoolean(reader, name) {
  const byte = reader.readByte();
  const { major, info } = parseTypeByte(byte);
  if (major !== MAJOR_FLOAT_SIMPLE) {
    throw new Error(
      `Expected boolean (major 7), got major ${major} at index ${reader.index - 1} of ${name}`,
    );
  }
  if (info === SIMPLE_TRUE) {
    return true;
  }
  if (info === SIMPLE_FALSE) {
    return false;
  }
  throw new Error(
    `Expected boolean (20 or 21), got simple value ${info} at index ${reader.index - 1} of ${name}`,
  );
}

/**
 * Convert big-endian bytes to bigint
 * @param {Uint8Array} bytes
 * @returns {bigint}
 */
function bytesToBigint(bytes) {
  if (bytes.length === 0) {
    return 0n;
  }
  let result = 0n;
  for (const byte of bytes) {
    // eslint-disable-next-line no-bitwise
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/**
 * Read a CBOR tag
 * @param {BufferReader} reader
 * @param {string} name
 * @returns {bigint}
 */
function readTag(reader, name) {
  const byte = reader.readByte();
  const { major, info } = parseTypeByte(byte);
  if (major !== MAJOR_TAG) {
    throw new Error(
      `Expected tag (major 6), got major ${major} at index ${reader.index - 1} of ${name}`,
    );
  }
  return readArgument(reader, info, name);
}

/**
 * Read a CBOR integer (as bignum with Tag 2 or 3)
 * @param {BufferReader} reader
 * @param {string} name
 * @returns {bigint}
 */
function readInteger(reader, name) {
  const start = reader.index;
  const tag = readTag(reader, name);

  if (tag === TAG_UNSIGNED_BIGNUM) {
    const bytes = readBytestring(reader, name);
    const uint8 = new Uint8Array(bytes.slice());
    return bytesToBigint(uint8);
  }

  if (tag === TAG_NEGATIVE_BIGNUM) {
    const bytes = readBytestring(reader, name);
    const uint8 = new Uint8Array(bytes.slice());
    const magnitude = bytesToBigint(uint8);
    return -1n - magnitude;
  }

  throw new Error(
    `Expected bignum tag (2 or 3), got tag ${tag} at index ${start} of ${name}`,
  );
}

/**
 * Read a float64 value, validating canonical NaN
 * @param {BufferReader} reader
 * @param {string} name
 * @returns {number}
 */
function readFloat64(reader, name) {
  const start = reader.index;
  const byte = reader.readByte();
  const { major, info } = parseTypeByte(byte);

  if (major !== MAJOR_FLOAT_SIMPLE || info !== AI_8BYTE) {
    throw new Error(
      `Expected float64 (major 7, info 27), got major ${major}, info ${info} at index ${start} of ${name}`,
    );
  }

  const floatStart = reader.index;
  const value = reader.readFloat64(false); // big-endian

  // Validate canonical zero
  if (value === 0) {
    // Check it's not negative zero encoded non-canonically
    // Both +0 and -0 have specific bit patterns that are allowed
  }

  // Validate canonical NaN
  if (Number.isNaN(value)) {
    // @ts-expect-error CANONICAL_NAN is a frozen array
    if (!reader.matchAt(floatStart, CANONICAL_NAN)) {
      throw new Error(`Non-canonical NaN at index ${floatStart} of ${name}`);
    }
  }

  return value;
}

/**
 * Read a symbol (Tag 280 + text string)
 * @param {BufferReader} reader
 * @param {string} name
 * @returns {string}
 */
function readSelectorAsString(reader, name) {
  const start = reader.index;
  const tag = readTag(reader, name);

  if (tag !== TAG_SYMBOL) {
    throw new Error(
      `Expected symbol tag (280), got tag ${tag} at index ${start} of ${name}`,
    );
  }

  return readString(reader, name);
}

/**
 * Peek at the type byte without consuming it
 * @param {BufferReader} reader
 * @returns {{major: number, info: number}}
 */
function peekType(reader) {
  const byte = reader.peekByte();
  return parseTypeByte(byte);
}

/**
 * Peek at a tag value without consuming it
 * @param {BufferReader} reader
 * @param {string} name
 * @returns {bigint | null} The tag number, or null if not a tag
 */
function peekTag(reader, name) {
  const { major, info } = peekType(reader);
  if (major !== MAJOR_TAG) {
    return null;
  }

  // Save position
  const savedIndex = reader.index;

  // Read the tag
  reader.readByte(); // consume type byte
  const tagValue = readArgument(reader, info, name);

  // Restore position
  reader.index = savedIndex;

  return tagValue;
}

/**
 * @typedef {object} CborReaderStackEntry
 * @property {'record' | 'list' | 'dictionary' | 'set'} type
 * @property {number} remaining - Elements remaining (for definite length)
 * @property {number} start - Start position
 */

/**
 * CBOR Reader implementing the OcapnReader interface.
 *
 * @implements {OcapnReader}
 */
export class CborReader {
  /** @type {BufferReader} */
  #bufferReader;

  /** @type {string} */
  name;

  /**
   * Record label type preference for this codec.
   * CBOR uses plain strings for record labels (not symbols).
   * @type {'string'}
   */
  recordLabelType = 'string';

  /** @type {CborReaderStackEntry[]} */
  #stack = [];

  /**
   * @param {BufferReader} bufferReader
   * @param {object} options
   * @param {string} [options.name]
   */
  constructor(bufferReader, options = {}) {
    const { name = '<unknown>' } = options;
    this.name = name;
    this.#bufferReader = bufferReader;
  }

  get index() {
    return this.#bufferReader.index;
  }

  /**
   * @returns {boolean}
   */
  readBoolean() {
    this.#decrementRemaining();
    return readBoolean(this.#bufferReader, this.name);
  }

  /**
   * @returns {bigint}
   */
  readInteger() {
    this.#decrementRemaining();
    return readInteger(this.#bufferReader, this.name);
  }

  /**
   * @returns {number}
   */
  readFloat64() {
    this.#decrementRemaining();
    return readFloat64(this.#bufferReader, this.name);
  }

  /**
   * @returns {string}
   */
  readString() {
    this.#decrementRemaining();
    return readString(this.#bufferReader, this.name);
  }

  /**
   * @returns {ArrayBufferLike}
   */
  readBytestring() {
    this.#decrementRemaining();
    return readBytestring(this.#bufferReader, this.name);
  }

  /**
   * @returns {string}
   */
  readSelectorAsString() {
    this.#decrementRemaining();
    return readSelectorAsString(this.#bufferReader, this.name);
  }

  /**
   * Peek at the type category without consuming the value.
   * @returns {TypeHint}
   */
  peekTypeHint() {
    const { major, info } = peekType(this.#bufferReader);

    // Check for tag first
    if (major === MAJOR_TAG) {
      const tag = peekTag(this.#bufferReader, this.name);
      if (tag === TAG_UNSIGNED_BIGNUM || tag === TAG_NEGATIVE_BIGNUM) {
        return 'number-prefix'; // Integer encoded as bignum
      }
      if (tag === TAG_SYMBOL) {
        return 'number-prefix'; // Symbol (selector)
      }
      if (tag === TAG_RECORD) {
        return 'record';
      }
      // Other tags fall through to their content type
    }

    switch (major) {
      case MAJOR_FLOAT_SIMPLE:
        if (info === SIMPLE_TRUE || info === SIMPLE_FALSE) {
          return 'boolean';
        }
        if (info === AI_8BYTE) {
          return 'float64';
        }
        // null, undefined are also float/simple but need special handling
        return 'number-prefix'; // Will be handled by readTypeAndMaybeValue
      case MAJOR_BYTESTRING:
      case MAJOR_TEXTSTRING:
        return 'number-prefix';
      case MAJOR_ARRAY:
        return 'list';
      case MAJOR_MAP:
        return 'dictionary';
      default:
        throw new Error(
          `Unexpected CBOR major type ${major} at index ${this.#bufferReader.index} of ${this.name}`,
        );
    }
  }

  /**
   * Read type and possibly value.
   * For structured types, returns type with null value.
   * For atomic types, reads and returns the value.
   *
   * @returns {TypeAndMaybeValue}
   */
  readTypeAndMaybeValue() {
    const start = this.#bufferReader.index;
    const { major, info } = peekType(this.#bufferReader);

    // Handle tags
    if (major === MAJOR_TAG) {
      const tag = peekTag(this.#bufferReader, this.name);

      if (tag === TAG_UNSIGNED_BIGNUM || tag === TAG_NEGATIVE_BIGNUM) {
        const value = this.readInteger();
        return { type: 'integer', value };
      }

      if (tag === TAG_SYMBOL) {
        const value = this.readSelectorAsString();
        return { type: 'selector', value };
      }

      if (tag === TAG_RECORD) {
        // Don't consume, let enterRecord handle it
        this.#bufferReader.readByte(); // consume tag type byte
        readArgument(this.#bufferReader, info, this.name); // consume tag value
        return { type: 'record', value: null };
      }

      throw new Error(
        `Unexpected tag ${tag} at index ${start} of ${this.name}`,
      );
    }

    switch (major) {
      case MAJOR_FLOAT_SIMPLE:
        if (info === SIMPLE_TRUE) {
          this.#bufferReader.readByte();
          return { type: 'boolean', value: true };
        }
        if (info === SIMPLE_FALSE) {
          this.#bufferReader.readByte();
          return { type: 'boolean', value: false };
        }
        if (info === SIMPLE_NULL) {
          this.#bufferReader.readByte();
          return { type: 'null', value: null };
        }
        if (info === SIMPLE_UNDEFINED) {
          this.#bufferReader.readByte();
          return { type: 'undefined', value: undefined };
        }
        if (info === AI_8BYTE) {
          const value = this.readFloat64();
          return { type: 'float64', value };
        }
        throw new Error(
          `Unexpected simple value ${info} at index ${start} of ${this.name}`,
        );

      case MAJOR_BYTESTRING: {
        const value = this.readBytestring();
        return { type: 'bytestring', value };
      }

      case MAJOR_TEXTSTRING: {
        const value = this.readString();
        return { type: 'string', value };
      }

      case MAJOR_ARRAY:
        // Don't consume, let enterList handle it
        return { type: 'list', value: null };

      case MAJOR_MAP:
        // Don't consume, let enterDictionary handle it
        return { type: 'dictionary', value: null };

      default:
        throw new Error(
          `Unexpected CBOR major type ${major} at index ${start} of ${this.name}`,
        );
    }
  }

  /**
   * Enter a record structure (Tag 27 + array).
   */
  enterRecord() {
    // Entering a record counts as one element of the parent structure
    this.#decrementRemaining();

    const start = this.#bufferReader.index;
    const byte = this.#bufferReader.peekByte();
    const { major } = parseTypeByte(byte);

    // The tag might already be consumed by readTypeAndMaybeValue
    if (major === MAJOR_TAG) {
      const tag = readTag(this.#bufferReader, this.name);
      if (tag !== TAG_RECORD) {
        throw new Error(
          `Expected record tag (27), got tag ${tag} at index ${start} of ${this.name}`,
        );
      }
    }

    // Now read the array header
    const arrayByte = this.#bufferReader.readByte();
    const { major: arrayMajor, info } = parseTypeByte(arrayByte);

    if (arrayMajor !== MAJOR_ARRAY) {
      throw new Error(
        `Expected array after record tag, got major ${arrayMajor} at index ${this.#bufferReader.index - 1} of ${this.name}`,
      );
    }

    const length = Number(readArgument(this.#bufferReader, info, this.name));
    this.#stack.push({ type: 'record', remaining: length, start });
  }

  exitRecord() {
    const entry = this.#stack.pop();
    if (!entry || entry.type !== 'record') {
      throw new Error(
        `Cannot exit record: not inside a record at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
    if (entry.remaining !== 0) {
      throw new Error(
        `Record has ${entry.remaining} remaining elements at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
  }

  peekRecordEnd() {
    const entry = this.#stack[this.#stack.length - 1];
    if (!entry || entry.type !== 'record') {
      throw new Error(
        `Cannot peek record end: not inside a record at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
    return entry.remaining === 0;
  }

  /**
   * Read the record's label.
   * Uses raw read functions to avoid double-decrementing (since this
   * method already decrements).
   * @returns {RecordLabelInfo}
   */
  readRecordLabel() {
    this.#decrementRemaining();

    // In CBOR, record labels are typically symbols (Tag 280)
    const tag = peekTag(this.#bufferReader, this.name);

    if (tag === TAG_SYMBOL) {
      // Use raw function to avoid double-decrement
      const value = readSelectorAsString(this.#bufferReader, this.name);
      return { type: 'selector', value };
    }

    // Could also be a plain string
    const { major } = peekType(this.#bufferReader);
    if (major === MAJOR_TEXTSTRING) {
      // Use raw function to avoid double-decrement
      const value = readString(this.#bufferReader, this.name);
      return { type: 'string', value };
    }

    if (major === MAJOR_BYTESTRING) {
      // Use raw function to avoid double-decrement
      const value = readBytestring(this.#bufferReader, this.name);
      return { type: 'bytestring', value };
    }

    throw new Error(
      `Expected record label (symbol, string, or bytestring) at index ${this.#bufferReader.index} of ${this.name}`,
    );
  }

  enterList() {
    // Entering a list counts as one element of the parent structure
    this.#decrementRemaining();

    const start = this.#bufferReader.index;
    const byte = this.#bufferReader.readByte();
    const { major, info } = parseTypeByte(byte);

    if (major !== MAJOR_ARRAY) {
      throw new Error(
        `Expected array (major 4), got major ${major} at index ${start} of ${this.name}`,
      );
    }

    const length = Number(readArgument(this.#bufferReader, info, this.name));
    this.#stack.push({ type: 'list', remaining: length, start });
  }

  exitList() {
    const entry = this.#stack.pop();
    if (!entry || entry.type !== 'list') {
      throw new Error(
        `Cannot exit list: not inside a list at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
    if (entry.remaining !== 0) {
      throw new Error(
        `List has ${entry.remaining} remaining elements at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
  }

  peekListEnd() {
    const entry = this.#stack[this.#stack.length - 1];
    if (!entry || entry.type !== 'list') {
      throw new Error(
        `Cannot peek list end: not inside a list at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
    return entry.remaining === 0;
  }

  enterDictionary() {
    // Entering a dictionary counts as one element of the parent structure
    this.#decrementRemaining();

    const start = this.#bufferReader.index;
    const byte = this.#bufferReader.readByte();
    const { major, info } = parseTypeByte(byte);

    if (major !== MAJOR_MAP) {
      throw new Error(
        `Expected map (major 5), got major ${major} at index ${start} of ${this.name}`,
      );
    }

    const length = Number(readArgument(this.#bufferReader, info, this.name));
    // For maps, length is number of pairs, so remaining is 2x
    this.#stack.push({ type: 'dictionary', remaining: length * 2, start });
  }

  exitDictionary() {
    const entry = this.#stack.pop();
    if (!entry || entry.type !== 'dictionary') {
      throw new Error(
        `Cannot exit dictionary: not inside a dictionary at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
    if (entry.remaining !== 0) {
      throw new Error(
        `Dictionary has ${entry.remaining / 2} remaining pairs at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
  }

  peekDictionaryEnd() {
    const entry = this.#stack[this.#stack.length - 1];
    if (!entry || entry.type !== 'dictionary') {
      throw new Error(
        `Cannot peek dictionary end: not inside a dictionary at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
    return entry.remaining === 0;
  }

  enterSet() {
    // CBOR doesn't have a native set type; we could use a tagged array
    // For now, treat as array
    this.enterList();
    const entry = this.#stack[this.#stack.length - 1];
    entry.type = 'set';
  }

  exitSet() {
    const entry = this.#stack.pop();
    if (!entry || entry.type !== 'set') {
      throw new Error(
        `Cannot exit set: not inside a set at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
    if (entry.remaining !== 0) {
      throw new Error(
        `Set has ${entry.remaining} remaining elements at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
  }

  peekSetEnd() {
    const entry = this.#stack[this.#stack.length - 1];
    if (!entry || entry.type !== 'set') {
      throw new Error(
        `Cannot peek set end: not inside a set at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
    return entry.remaining === 0;
  }

  /**
   * Decrement the remaining count for the current structure.
   * Called automatically when reading values.
   */
  #decrementRemaining() {
    const entry = this.#stack[this.#stack.length - 1];
    if (!entry) {
      return; // Not tracking
    }
    if (entry.remaining <= 0) {
      throw new Error(
        `No more elements in ${entry.type} at index ${this.#bufferReader.index} of ${this.name}`,
      );
    }
    entry.remaining -= 1;
  }
}

/**
 * Create a CborReader from bytes.
 *
 * @param {Uint8Array} bytes - The CBOR bytes to read
 * @param {object} [options]
 * @param {string} [options.name] - Name for error messages
 * @returns {CborReader}
 */
export function makeCborReader(bytes, options = {}) {
  const bufferReader = BufferReader.fromBytes(bytes);
  return new CborReader(bufferReader, options);
}

// Export tag constants for use by codec layer
export {
  TAG_UNSIGNED_BIGNUM,
  TAG_NEGATIVE_BIGNUM,
  TAG_RECORD,
  TAG_SYMBOL,
  TAG_TAGGED_VALUE,
};
