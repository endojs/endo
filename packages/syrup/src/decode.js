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

const quote = (o) => JSON.stringify(o);
const toChar = (code) => String.fromCharCode(code);

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
  throw Error(`Unexpected byte ${quote(toChar(cc))}, Syrup booleans must start with ${quote(toChar(TRUE))} or ${quote(toChar(FALSE))} at index ${bufferReader.index} of ${name}`);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {{value: any, type: 'integer' | 'bytestring' | 'string' | 'symbol'}}
 */
function readNumberPrefixed(bufferReader, name) {
  let start = bufferReader.index;
  let end;
  let byte;
  let nextToken;

  // eslint-disable-next-line no-empty
  for (;;) {
    byte = bufferReader.readByte();

    if (byte < ZERO || byte > NINE) {
      end = bufferReader.index - 1;
      if (start === end) {
        throw Error(`Unexpected character ${quote(toChar(byte))}, expected a number at index ${bufferReader.index} of ${name}`);
      }
      nextToken = byte;
      break;
    }
  }
  const numberBuffer = bufferReader.bytesAt(start, end - start);
  const numberString = textDecoder.decode(numberBuffer);

  if (nextToken === PLUS) {
    const integer = BigInt(numberString);
    return { value: integer, type: 'integer' };
  }
  if (nextToken === MINUS) {
    const integer = BigInt(numberString);
    return { value: -integer, type: 'integer' };
  }
  
  const number = Number.parseInt(numberString, 10);
  const valueBytes = bufferReader.read(number);
  if (nextToken === BYTES_START) {
    return { value: valueBytes, type: 'bytestring' };
  }
  if (nextToken === STRING_START) {
    return { value: textDecoder.decode(valueBytes), type: 'string' };
  }
  if (nextToken === SYMBOL_START) {
    return { value: textDecoder.decode(valueBytes), type: 'symbol' };
  }
  throw Error(
    `Unexpected character ${quote(toChar(nextToken))}, at index ${bufferReader.index} of ${name}`,
  );
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {bigint}
 */
function readInteger(bufferReader, name) {
  const { value, type } = readNumberPrefixed(bufferReader, name);
  if (type !== 'integer') {
    throw Error(`Unexpected type ${quote(type)}, Syrup integers must start with ${quote(toChar(PLUS))} or ${quote(toChar(MINUS))} at index ${bufferReader.index} of ${name}`);
  }
  return value;
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} expectedType
 * @param {string} name
 * @returns {string}
 */
function readStringlikeAndAssertType(bufferReader, expectedType, name) {
  const start = bufferReader.index;
  const { value, type } = readNumberPrefixed(bufferReader, name);
  if (type !== expectedType) {
    throw Error(`Unexpected type ${quote(type)}, Syrup ${expectedType} must start with ${quote(toChar(expectedType))} at index ${start} of ${name}`);
  }
  return value;
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {string}
 */
function readString(bufferReader, name) {
  return readStringlikeAndAssertType(bufferReader, 'string', name);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {string}
 */
function readSymbolAsString(bufferReader, name) {
  return readStringlikeAndAssertType(bufferReader, 'symbol', name);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {string}
 */
function readBytestring(bufferReader, name) {
  return readStringlikeAndAssertType(bufferReader, 'bytestring', name);
}


/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 */
function readFloat64(bufferReader, name) {
  const cc = bufferReader.readByte();
  if (cc !== DOUBLE) {
    throw Error(`Unexpected character ${quote(toChar(cc))}, at index ${bufferReader.index} of ${name}`,
    );
  }
  const floatStart = bufferReader.index;
  const value = bufferReader.readFloat64(false); // big end

  if (value === 0) {
    // @ts-expect-error canonicalZero64 is a frozen array, not a Uint8Array
    if (!bufferReader.matchAt(floatStart, canonicalZero64)) {
      throw Error(`Non-canonical zero at index ${floatStart} of Syrup ${name}`);
    }
  }
  if (Number.isNaN(value)) {
    // @ts-expect-error canonicalNaN64 is a frozen array, not a Uint8Array
    if (!bufferReader.matchAt(floatStart, canonicalNaN64)) {
      throw Error(`Non-canonical NaN at index ${floatStart} of Syrup ${name}`);
    } 
  }

  return value;
}


/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {any[]}
 */
function readList(bufferReader, name) {
  let cc = bufferReader.readByte();
  if (cc !== LIST_START) {
    throw Error(`Unexpected byte ${quote(toChar(cc))}, Syrup lists must start with ${quote(toChar(LIST_START))} at index ${bufferReader.index} of ${name}`);
  }
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
 * @returns {{value: any, type: 'string' | 'symbol', bytes: Uint8Array}}
 */
function readDictionaryKey(bufferReader, name) {
  const start = bufferReader.index;
  const { value, type } = readNumberPrefixed(bufferReader, name);
  if (type === 'string' || type === 'symbol') {
    const end = bufferReader.index;
    const bytes = bufferReader.bytesAt(start, end - start);
    if (type === 'symbol') {
      return { value: SyrupSymbolFor(value), type, bytes };
    }
    return { value, type, bytes };
  }
  throw Error(`Unexpected type ${quote(type)}, Syrup dictionary keys must be strings or symbols at index ${start} of ${name}`);
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 */
function readDictionary(bufferReader, name) {
  let cc = bufferReader.readByte();
  if (cc !== DICT_START) {
    throw Error(`Unexpected character ${quote(toChar(cc))}, Syrup dictionaries must start with ${quote(toChar(DICT_START))} at index ${bufferReader.index} of ${name}`);
  }
  const record = {};
  let priorKey = undefined;
  let priorKeyBytes = undefined;
  for (;;) {
    if (bufferReader.peekByte() === DICT_END) {
      bufferReader.skip(1);
      return freeze(record);
    }
    const start = bufferReader.index;
    const { value: newKey, bytes: newKeyBytes } = readDictionaryKey(bufferReader, name);

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

    const value = readAny(bufferReader, name);

    defineProperty(record, newKey, {
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
 * @returns {'float64' | 'number-prefix' | 'list' | 'set' | 'dictionary' | 'record' | 'boolean'}
 */
export function peekTypeHint(bufferReader, name) {
  const cc = bufferReader.peekByte();
  if (cc >= ZERO && cc <= NINE) {
    return 'number-prefix'
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
  const typeHint = peekTypeHint(bufferReader, name);

  if (typeHint === 'number-prefix') {
    const { value, type } = readNumberPrefixed(bufferReader, name);
    if (type === 'symbol') {
      return SyrupSymbolFor(value);
    }
    return value;
  }
  if (typeHint === 'boolean') {
    return readBoolean(bufferReader, name);
  }
  if (typeHint === 'float64') {
    return readFloat64(bufferReader, name);
  }
  if (typeHint === 'list') {
    return readList(bufferReader, name);
  }
  if (typeHint === 'dictionary') {
    return readDictionary(bufferReader, name);
  }
  if (typeHint === 'set') {
    throw Error(
      `decode Sets are not yet supported.`,
    );
  }
  if (typeHint === 'record') {
    throw Error(
      `decode Records are not yet supported.`,
    );
  }
  const index = bufferReader.index;
  const cc = bufferReader.readByte();
  throw Error(
    `Unexpected character ${quote(toChar(cc))}, at index ${index} of ${name}`,
  );
}

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
      const err2 = Error(`Unexpected end of Syrup at index ${bufferReader.length} of ${name}`)
      err2.cause = err;
      throw err2;
    }
    throw err;
  }
}

class SyrupReaderStackEntry {
  constructor(type, start) {
    this.type = type;
    this.start = start;
  }
}


class SyrupReader {
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
  #_readAndAssertByte(expectedByte) {
    const start = this.bufferReader.index;
    const cc = this.bufferReader.readByte();
    if (cc !== expectedByte) {
      throw Error(`Unexpected character ${quote(toChar(cc))}, expected ${quote(toChar(expectedByte))} at index ${start} of ${this.name}`);
    }
  }
  /**
   * @param {string} type
   */
  #_pushStackEntry(type) {
    this.state.stack.push(new SyrupReaderStackEntry(type, this.bufferReader.index));
  }
  /**
   * @param {string} expectedType
   */
  #_popStackEntry(expectedType) {
    const start = this.bufferReader.index;
    const stackEntry = this.state.stack.pop();
    if (!stackEntry) {
      throw Error(`Attempted to exit ${expectedType} without entering it at index ${start} of ${this.name}`);
    }
    if (stackEntry.type !== expectedType) {
      throw Error(`Attempted to exit ${expectedType} while in a ${stackEntry.type} at index ${start} of ${this.name}`);
    }
  }

  enterRecord() {
    this.#_readAndAssertByte(RECORD_START);
    this.#_pushStackEntry('record');
  }
  exitRecord() {
    this.#_readAndAssertByte(RECORD_END);
    this.#_popStackEntry('record');
  }
  peekRecordEnd() {
    const cc = this.bufferReader.peekByte();
    return cc === RECORD_END;
  }

  enterDictionary() {
    this.#_readAndAssertByte(DICT_START);
    this.#_pushStackEntry('dictionary');
  }
  exitDictionary() {
    this.#_readAndAssertByte(DICT_END);
    this.#_popStackEntry('dictionary');
  }
  peekDictionaryEnd() {
    const cc = this.bufferReader.peekByte();
    return cc === DICT_END;
  }

  enterList() {
    this.#_readAndAssertByte(LIST_START);
    this.#_pushStackEntry('list');
  }
  exitList() {
    this.#_readAndAssertByte(LIST_END);
    this.#_popStackEntry('list');
  }
  peekListEnd() {
    const cc = this.bufferReader.peekByte();
    return cc === LIST_END;
  }

  enterSet() {
    this.#_readAndAssertByte(SET_START);
    this.#_pushStackEntry('set');
  }
  exitSet() {
    this.#_readAndAssertByte(SET_END);
    this.#_popStackEntry('set');
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

}

export const makeSyrupReader = (bytes, options = {}) => {
  const bufferReader = BufferReader.fromBytes(bytes);
  const syrupReader = new SyrupReader(bufferReader, options);
  return syrupReader;
};
