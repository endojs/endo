// @ts-check

import { BufferReader } from './buffer-reader.js';
import { compareByteArrays } from './compare.js';
import { SyrupSymbolFor } from './symbol.js';

const MINUS = '-'.charCodeAt(0);
const PLUS = '+'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);
const ONE = '1'.charCodeAt(0);
const NINE = '9'.charCodeAt(0);
const LIST_START = '['.charCodeAt(0);
const LIST_END = ']'.charCodeAt(0);
const DICT_START = '{'.charCodeAt(0);
const DICT_END = '}'.charCodeAt(0);
const SET_START = '#'.charCodeAt(0);
const SET_END = '$'.charCodeAt(0);
const BYTES_START = ':'.charCodeAt(0);
const STRING_START = '"'.charCodeAt(0);
const SYMBOL_START = "'".charCodeAt(0);
const RECORD_START = '<'.charCodeAt(0);
const RECORD_END = '>'.charCodeAt(0);
const TRUE = 't'.charCodeAt(0);
const FALSE = 'f'.charCodeAt(0);
// const SINGLE = 'F'.charCodeAt(0);
const DOUBLE = 'D'.charCodeAt(0);

const textDecoder = new TextDecoder();

const { defineProperty, freeze } = Object;

const quote = o => JSON.stringify(o);
const toChar = code => String.fromCharCode(code);

const canonicalNaN64 = freeze([0x7f, 0xf8, 0, 0, 0, 0, 0, 0]);
const canonicalZero64 = freeze([0, 0, 0, 0, 0, 0, 0, 0]);

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {boolean}
 */
function readBoolean(bufferReader, name) {
  const cc = bufferReader.readByte();
  if (cc === TRUE) {
    return true;
  }
  if (cc === FALSE) {
    return false;
  }
  throw Error(
    `Unexpected byte ${quote(toChar(cc))}, Syrup booleans must start with ${quote(toChar(TRUE))} or ${quote(toChar(FALSE))} at index ${bufferReader.index} of ${name}`,
  );
}

// Structure types, no value provided
/** @typedef {'list' | 'set' | 'dictionary' | 'record'} StructuredType */
/** @typedef {{type: StructuredType, value: null}} ReadTypeStructuredResult */
// Simple Atom types, value is read
/** @typedef {{type: 'boolean', value: boolean}} ReadTypeBooleanResult */
/** @typedef {{type: 'float64', value: number}} ReadTypeFloat64Result */
// Number-prefixed types, value is read
/** @typedef {{type: 'integer', value: bigint}} ReadTypeIntegerResult */
/** @typedef {{type: 'bytestring', value: Uint8Array}} ReadTypeBytestringResult */
/** @typedef {{type: 'string', value: string}} ReadTypeStringResult */
/** @typedef {{type: 'symbol', value: string}} ReadTypeSymbolResult */
/** @typedef {ReadTypeBooleanResult | ReadTypeFloat64Result | ReadTypeIntegerResult | ReadTypeBytestringResult | ReadTypeStringResult | ReadTypeSymbolResult} ReadTypeAtomResult */
/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {ReadTypeStructuredResult | ReadTypeAtomResult}
 * Reads until it can determine the type of the next value.
 */
function readTypeAndMaybeValue(bufferReader, name) {
  const start = bufferReader.index;
  const cc = bufferReader.readByte();
  // Structure types, don't read value
  if (cc === LIST_START) {
    return { type: 'list', value: null };
  }
  if (cc === SET_START) {
    return { type: 'set', value: null };
  }
  if (cc === DICT_START) {
    return { type: 'dictionary', value: null };
  }
  if (cc === RECORD_START) {
    return { type: 'record', value: null };
  }
  // Atom types, read value
  if (cc === TRUE) {
    return { type: 'boolean', value: true };
  }
  if (cc === FALSE) {
    return { type: 'boolean', value: false };
  }
  if (cc === DOUBLE) {
    const value = readFloat64Body(bufferReader, name);
    return { type: 'float64', value };
  }
  // Number-prefixed types, read value
  if (cc < ZERO || cc > NINE) {
    throw Error(
      `Unexpected character ${quote(toChar(cc))}, at index ${bufferReader.index} of ${name}`,
    );
  }
  // Parse number-prefix
  let end;
  let byte;
  for (;;) {
    byte = bufferReader.readByte();
    if (byte < ZERO || byte > NINE) {
      end = bufferReader.index - 1;
      break;
    }
  }
  const typeByte = byte;
  const numberBuffer = bufferReader.bytesAt(start, end - start);
  const numberString = textDecoder.decode(numberBuffer);
  if (typeByte === PLUS) {
    const integer = BigInt(numberString);
    return { type: 'integer', value: integer };
  }
  if (typeByte === MINUS) {
    const integer = BigInt(numberString);
    return { type: 'integer', value: -integer };
  }
  if (typeByte === BYTES_START) {
    const number = Number.parseInt(numberString, 10);
    const valueBytes = bufferReader.read(number);
    return { type: 'bytestring', value: valueBytes };
  }
  if (typeByte === STRING_START) {
    const number = Number.parseInt(numberString, 10);
    const valueBytes = bufferReader.read(number);
    return { type: 'string', value: textDecoder.decode(valueBytes) };
  }
  if (typeByte === SYMBOL_START) {
    const number = Number.parseInt(numberString, 10);
    const valueBytes = bufferReader.read(number);
    return { type: 'symbol', value: textDecoder.decode(valueBytes) };
  }
  throw Error(
    `Unexpected character ${quote(toChar(typeByte))}, at index ${bufferReader.index} of ${name}`,
  );
}

/**
 * @param {BufferReader} bufferReader
 * @param {'boolean' | 'integer' | 'float64' | 'string' | 'symbol' | 'bytestring'} expectedType
 * @param {string} name
 * @returns {any}
 */
function readAndAssertType(bufferReader, expectedType, name) {
  const start = bufferReader.index;
  const { value, type } = readTypeAndMaybeValue(bufferReader, name);
  if (type !== expectedType) {
    throw Error(`Unexpected type ${quote(type)} at index ${start} of ${name}`);
  }
  return value;
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {bigint}
 */
function readInteger(bufferReader, name) {
  return readAndAssertType(bufferReader, 'integer', name);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {string}
 */
function readString(bufferReader, name) {
  return readAndAssertType(bufferReader, 'string', name);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {string}
 */
function readSymbolAsString(bufferReader, name) {
  return readAndAssertType(bufferReader, 'symbol', name);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {string}
 */
function readBytestring(bufferReader, name) {
  return readAndAssertType(bufferReader, 'bytestring', name);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 */
function readFloat64Body(bufferReader, name) {
  const start = bufferReader.index;
  const value = bufferReader.readFloat64(false); // big end

  if (value === 0) {
    // @ts-expect-error canonicalZero64 is a frozen array, not a Uint8Array
    if (!bufferReader.matchAt(start, canonicalZero64)) {
      throw Error(`Non-canonical zero at index ${start} of Syrup ${name}`);
    }
  }
  if (Number.isNaN(value)) {
    // @ts-expect-error canonicalNaN64 is a frozen array, not a Uint8Array
    if (!bufferReader.matchAt(start, canonicalNaN64)) {
      throw Error(`Non-canonical NaN at index ${start} of Syrup ${name}`);
    }
  }

  return value;
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 */
function readFloat64(bufferReader, name) {
  const cc = bufferReader.readByte();
  if (cc !== DOUBLE) {
    throw Error(
      `Unexpected character ${quote(toChar(cc))}, at index ${bufferReader.index} of ${name}`,
    );
  }
  return readFloat64Body(bufferReader, name);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {any[]}
 */
function readListBody(bufferReader, name) {
  const list = [];
  for (;;) {
    if (bufferReader.peekByte() === LIST_END) {
      bufferReader.skip(1);
      return list;
    }

    list.push(readAny(bufferReader, name));
  }
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {any[]}
 */
function readList(bufferReader, name) {
  const cc = bufferReader.readByte();
  if (cc !== LIST_START) {
    throw Error(
      `Unexpected byte ${quote(toChar(cc))}, Syrup lists must start with ${quote(toChar(LIST_START))} at index ${bufferReader.index} of ${name}`,
    );
  }
  return readListBody(bufferReader, name);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {{value: any, type: 'string' | 'symbol', bytes: Uint8Array}}
 */
function readDictionaryKey(bufferReader, name) {
  const start = bufferReader.index;
  const { value, type } = readTypeAndMaybeValue(bufferReader, name);
  if (type === 'string' || type === 'symbol') {
    const end = bufferReader.index;
    const bytes = bufferReader.bytesAt(start, end - start);
    if (type === 'symbol') {
      return { value: SyrupSymbolFor(value), type, bytes };
    }
    return { value, type, bytes };
  }
  throw Error(
    `Unexpected type ${quote(type)}, Syrup dictionary keys must be strings or symbols at index ${start} of ${name}`,
  );
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 */
function readDictionaryBody(bufferReader, name) {
  const dict = {};
  let priorKey;
  let priorKeyBytes;
  for (;;) {
    // Check for end of dictionary
    if (bufferReader.peekByte() === DICT_END) {
      bufferReader.skip(1);
      return freeze(dict);
    }
    // Read key
    const start = bufferReader.index;
    const { value: newKey, bytes: newKeyBytes } = readDictionaryKey(
      bufferReader,
      name,
    );

    // Validate strictly non-descending keys.
    if (priorKeyBytes !== undefined) {
      const order = compareByteArrays(
        priorKeyBytes,
        newKeyBytes,
        0,
        priorKeyBytes.length,
        0,
        newKeyBytes.length,
      );
      if (order === 0) {
        throw Error(
          `Syrup dictionary keys must be unique, got repeated ${JSON.stringify(
            newKey,
          )} at index ${start} of ${name}`,
        );
      } else if (order > 0) {
        throw Error(
          `Syrup dictionary keys must be in bytewise sorted order, got ${JSON.stringify(
            newKey,
          )} immediately after ${JSON.stringify(
            priorKey,
          )} at index ${start} of ${name}`,
        );
      }
    }
    priorKey = newKey;
    priorKeyBytes = newKeyBytes;

    // Read value and add to dictionary
    const value = readAny(bufferReader, name);
    defineProperty(dict, newKey, {
      value,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 */
function readDictionary(bufferReader, name) {
  const start = bufferReader.index;
  const cc = bufferReader.readByte();
  if (cc !== DICT_START) {
    throw Error(
      `Unexpected character ${quote(toChar(cc))}, Syrup dictionaries must start with ${quote(toChar(DICT_START))} at index ${start} of ${name}`,
    );
  }
  return readDictionaryBody(bufferReader, name);
}

/** @typedef {'float64' | 'number-prefix' | 'list' | 'set' | 'dictionary' | 'record' | 'boolean'} TypeHintTypes */

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {TypeHintTypes}
 */
export function peekTypeHint(bufferReader, name) {
  const cc = bufferReader.peekByte();
  if (cc >= ZERO && cc <= NINE) {
    return 'number-prefix';
  }
  if (cc === TRUE || cc === FALSE) {
    return 'boolean';
  }
  if (cc === DOUBLE) {
    return 'float64';
  }
  if (cc === LIST_START) {
    return 'list';
  }
  if (cc === SET_START) {
    return 'set';
  }
  if (cc === DICT_START) {
    return 'dictionary';
  }
  if (cc === RECORD_START) {
    return 'record';
  }
  const index = bufferReader.index;
  throw Error(
    `Unexpected character ${quote(toChar(cc))}, at index ${index} of ${name}`,
  );
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {any}
 */
function readAny(bufferReader, name) {
  const { type, value } = readTypeAndMaybeValue(bufferReader, name);
  // Structure types, value has not been read
  if (type === 'list') {
    return readListBody(bufferReader, name);
  }
  if (type === 'set') {
    throw Error(`readAny for Sets is not yet supported.`);
  }
  if (type === 'dictionary') {
    return readDictionaryBody(bufferReader, name);
  }
  if (type === 'record') {
    throw Error(`readAny for Records is not yet supported.`);
  }
  // Atom types, value is already read
  // For symbols, we need to convert the string to a symbol
  if (type === 'symbol') {
    return SyrupSymbolFor(value);
  }

  return value;
}

class SyrupReaderStackEntry {
  constructor(type, start) {
    this.type = type;
    this.start = start;
  }
}

export class SyrupReader {
  /**
   * @param {BufferReader} bufferReader
   * @param {object} options
   * @param {string} [options.name]
   */
  constructor(bufferReader, options = {}) {
    const { name = '<unknown>' } = options;
    this.name = name;
    this.bufferReader = bufferReader;
    this.state = {
      /** @type {SyrupReaderStackEntry[]} */
      stack: [],
    };
  }

  /**
   * @param {number} expectedByte
   */
  #readAndAssertByte(expectedByte) {
    const start = this.bufferReader.index;
    const cc = this.bufferReader.readByte();
    if (cc !== expectedByte) {
      throw Error(
        `Unexpected character ${quote(toChar(cc))}, expected ${quote(toChar(expectedByte))} at index ${start} of ${this.name}`,
      );
    }
  }

  /**
   * @param {string} type
   */
  #pushStackEntry(type) {
    this.state.stack.push(
      new SyrupReaderStackEntry(type, this.bufferReader.index),
    );
  }

  /**
   * @param {string} expectedType
   */
  #popStackEntry(expectedType) {
    const start = this.bufferReader.index;
    const stackEntry = this.state.stack.pop();
    if (!stackEntry) {
      throw Error(
        `Attempted to exit ${expectedType} without entering it at index ${start} of ${this.name}`,
      );
    }
    if (stackEntry.type !== expectedType) {
      throw Error(
        `Attempted to exit ${expectedType} while in a ${stackEntry.type} at index ${start} of ${this.name}`,
      );
    }
  }

  enterRecord() {
    this.#readAndAssertByte(RECORD_START);
    this.#pushStackEntry('record');
  }

  exitRecord() {
    this.#readAndAssertByte(RECORD_END);
    this.#popStackEntry('record');
  }

  peekRecordEnd() {
    const cc = this.bufferReader.peekByte();
    return cc === RECORD_END;
  }

  enterDictionary() {
    this.#readAndAssertByte(DICT_START);
    this.#pushStackEntry('dictionary');
  }

  exitDictionary() {
    this.#readAndAssertByte(DICT_END);
    this.#popStackEntry('dictionary');
  }

  peekDictionaryEnd() {
    const cc = this.bufferReader.peekByte();
    return cc === DICT_END;
  }

  enterList() {
    this.#readAndAssertByte(LIST_START);
    this.#pushStackEntry('list');
  }

  exitList() {
    this.#readAndAssertByte(LIST_END);
    this.#popStackEntry('list');
  }

  peekListEnd() {
    const cc = this.bufferReader.peekByte();
    return cc === LIST_END;
  }

  enterSet() {
    this.#readAndAssertByte(SET_START);
    this.#pushStackEntry('set');
  }

  exitSet() {
    this.#readAndAssertByte(SET_END);
    this.#popStackEntry('set');
  }

  peekSetEnd() {
    const cc = this.bufferReader.peekByte();
    return cc === SET_END;
  }

  readBoolean() {
    return readBoolean(this.bufferReader, this.name);
  }

  readInteger() {
    return readInteger(this.bufferReader, this.name);
  }

  readFloat64() {
    return readFloat64(this.bufferReader, this.name);
  }

  readString() {
    return readString(this.bufferReader, this.name);
  }

  readBytestring() {
    return readBytestring(this.bufferReader, this.name);
  }

  readSymbolAsString() {
    return readSymbolAsString(this.bufferReader, this.name);
  }

  readAny() {
    return readAny(this.bufferReader, this.name);
  }

  /**
   * @param {'boolean' | 'integer' | 'float64' | 'string' | 'bytestring' | 'symbol'} type
   * @returns {any}
   */
  readOfType(type) {
    switch (type) {
      case 'boolean':
        return this.readBoolean();
      case 'integer':
        return this.readInteger();
      case 'float64':
        return this.readFloat64();
      case 'string':
        return this.readString();
      case 'bytestring':
        return this.readBytestring();
      case 'symbol':
        return this.readSymbolAsString();
      default:
        throw Error(`Unexpected type ${type}`);
    }
  }

  peekTypeHint() {
    return peekTypeHint(this.bufferReader, this.name);
  }
}

export const makeSyrupReader = (bytes, options = {}) => {
  const bufferReader = BufferReader.fromBytes(bytes);
  const syrupReader = new SyrupReader(bufferReader, options);
  return syrupReader;
};

/**
 * @param {Uint8Array} bytes
 * @param {object} options
 * @param {string} [options.name]
 * @param {number} [options.start]
 * @param {number} [options.end]
 */
export function decodeSyrup(bytes, options = {}) {
  const { start = 0, name = '<unknown>' } = options;
  const bufferReader = BufferReader.fromBytes(bytes);
  if (start !== 0) {
    bufferReader.seek(start);
  }
  try {
    return readAny(bufferReader, name);
  } catch (err) {
    if (err.code === 'EOD') {
      const err2 = Error(
        `Unexpected end of Syrup at index ${bufferReader.length} of ${name}`,
      );
      err2.cause = err;
      throw err2;
    }
    throw err;
  }
}
