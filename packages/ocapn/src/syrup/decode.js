// @ts-check

import { BufferReader } from './buffer-reader.js';

const MINUS = '-'.charCodeAt(0);
const PLUS = '+'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);
// const ONE = '1'.charCodeAt(0);
const NINE = '9'.charCodeAt(0);
const LIST_START = '['.charCodeAt(0);
const LIST_END = ']'.charCodeAt(0);
const DICT_START = '{'.charCodeAt(0);
const DICT_END = '}'.charCodeAt(0);
const SET_START = '#'.charCodeAt(0);
const SET_END = '$'.charCodeAt(0);
const BYTES_START = ':'.charCodeAt(0);
const STRING_START = '"'.charCodeAt(0);
const SELECTOR_START = "'".charCodeAt(0);
const RECORD_START = '<'.charCodeAt(0);
const RECORD_END = '>'.charCodeAt(0);
const TRUE = 't'.charCodeAt(0);
const FALSE = 'f'.charCodeAt(0);
// const SINGLE = 'F'.charCodeAt(0);
const FLOAT64 = 'D'.charCodeAt(0);

const textDecoder = new TextDecoder('utf-8', { fatal: true });

const { freeze } = Object;

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

/** @typedef {'boolean' | 'float64' | 'integer' | 'bytestring' | 'string' | 'selector'} SyrupAtomType */
/** @typedef {'list' | 'set' | 'dictionary' | 'record'} SyrupStructuredType */
/** @typedef {SyrupAtomType | SyrupStructuredType} SyrupType */

// Structure types, no value provided
/** @typedef {{type: SyrupStructuredType, value: null}} ReadTypeStructuredResult */
// Simple Atom types, value is read
/** @typedef {{type: 'boolean', value: boolean}} ReadTypeBooleanResult */
/** @typedef {{type: 'float64', value: number}} ReadTypeFloat64Result */
// Number-prefixed types, value is read
/** @typedef {{type: 'integer', value: bigint}} ReadTypeIntegerResult */
/** @typedef {{type: 'bytestring', value: Uint8Array}} ReadTypeBytestringResult */
/** @typedef {{type: 'string', value: string}} ReadTypeStringResult */
/** @typedef {{type: 'selector', value: string}} ReadTypeSelectorResult */
/** @typedef {ReadTypeBooleanResult | ReadTypeFloat64Result | ReadTypeIntegerResult | ReadTypeBytestringResult | ReadTypeStringResult | ReadTypeSelectorResult} ReadTypeAtomResult */
/** @typedef {ReadTypeStructuredResult | ReadTypeAtomResult} ReadTypeAndMaybeValueResult */
/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {ReadTypeAndMaybeValueResult}
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
  if (cc === FLOAT64) {
    // eslint-disable-next-line no-use-before-define
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
    // TextDecoder does not interpret surrogate pairs,
    // so we don't need to check for invalid characters.
    return { type: 'string', value: textDecoder.decode(valueBytes) };
  }
  if (typeByte === SELECTOR_START) {
    const number = Number.parseInt(numberString, 10);
    const valueBytes = bufferReader.read(number);
    return { type: 'selector', value: textDecoder.decode(valueBytes) };
  }
  throw Error(
    `Unexpected character ${quote(toChar(typeByte))}, at index ${bufferReader.index} of ${name}`,
  );
}

/**
 * @param {BufferReader} bufferReader
 * @param {'boolean' | 'integer' | 'float64' | 'string' | 'selector' | 'bytestring'} expectedType
 * @param {string} name
 * @returns {any}
 */
function readAndAssertType(bufferReader, expectedType, name) {
  const start = bufferReader.index;
  const { value, type } = readTypeAndMaybeValue(bufferReader, name);
  if (type !== expectedType) {
    throw Error(
      `Unexpected type ${quote(type)}, expected ${quote(expectedType)} at index ${start} of ${name}`,
    );
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
function readSelectorAsString(bufferReader, name) {
  return readAndAssertType(bufferReader, 'selector', name);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {Uint8Array}
 */
function readBytestring(bufferReader, name) {
  return readAndAssertType(bufferReader, 'bytestring', name);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {{value: string, type: 'selector'} | {value: Uint8Array, type: 'bytestring'} | {value: string, type: 'string'}}
 * see https://github.com/ocapn/syrup/issues/22
 */
function readRecordLabel(bufferReader, name) {
  const start = bufferReader.index;
  const { value, type } = readTypeAndMaybeValue(bufferReader, name);
  if (type === 'selector' || type === 'string' || type === 'bytestring') {
    // @ts-expect-error type system is not smart enough
    return { value, type };
  }
  throw Error(
    `Unexpected type ${quote(type)}, Syrup record labels must be strings, selectors, or bytestrings at index ${start} of ${name}`,
  );
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
  if (cc !== FLOAT64) {
    throw Error(
      `Unexpected character ${quote(toChar(cc))}, at index ${bufferReader.index} of ${name}`,
    );
  }
  return readFloat64Body(bufferReader, name);
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
  if (cc === FLOAT64) {
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

/** @typedef {{type: string, start: number}} SyrupReaderStackEntry */

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

  get index() {
    return this.bufferReader.index;
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
    this.state.stack.push({ type, start: this.bufferReader.index });
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

  /**
   * @returns {boolean}
   */
  peekRecordEnd() {
    const cc = this.bufferReader.peekByte();
    return cc === RECORD_END;
  }

  /**
   * @returns {{value: string, type: 'selector'} | {value: Uint8Array, type: 'bytestring'} | {value: string, type: 'string'}}
   */
  readRecordLabel() {
    return readRecordLabel(this.bufferReader, this.name);
  }

  enterDictionary() {
    this.#readAndAssertByte(DICT_START);
    this.#pushStackEntry('dictionary');
  }

  exitDictionary() {
    this.#readAndAssertByte(DICT_END);
    this.#popStackEntry('dictionary');
  }

  /**
   * @returns {boolean}
   */
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

  /**
   * @returns {boolean}
   */
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

  /**
   * @returns {boolean}
   */
  peekSetEnd() {
    const cc = this.bufferReader.peekByte();
    return cc === SET_END;
  }

  /**
   * @returns {boolean}
   */
  readBoolean() {
    return readBoolean(this.bufferReader, this.name);
  }

  /**
   * @returns {bigint}
   */
  readInteger() {
    return readInteger(this.bufferReader, this.name);
  }

  /**
   * @returns {number}
   */
  readFloat64() {
    return readFloat64(this.bufferReader, this.name);
  }

  /**
   * @returns {string}
   */
  readString() {
    return readString(this.bufferReader, this.name);
  }

  /**
   * @returns {Uint8Array}
   */
  readBytestring() {
    return readBytestring(this.bufferReader, this.name);
  }

  /**
   * @returns {string}
   */
  readSelectorAsString() {
    return readSelectorAsString(this.bufferReader, this.name);
  }

  /**
   * @returns {TypeHintTypes}
   */
  peekTypeHint() {
    return peekTypeHint(this.bufferReader, this.name);
  }

  /**
   * @returns {ReadTypeAndMaybeValueResult}
   */
  readTypeAndMaybeValue() {
    return readTypeAndMaybeValue(this.bufferReader, this.name);
  }
}

export const makeSyrupReader = (bytes, options = {}) => {
  const bufferReader = BufferReader.fromBytes(bytes);
  const syrupReader = new SyrupReader(bufferReader, options);
  return syrupReader;
};
