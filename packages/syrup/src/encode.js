// @ts-check

import { BufferWriter } from './buffer-writer.js';
import { compareByteArrays } from './compare.js';
import { getSyrupSymbolName } from './symbol.js';

const { freeze } = Object;
const { ownKeys } = Reflect;

const defaultCapacity = 256;

const LIST_START = '['.charCodeAt(0);
const LIST_END = ']'.charCodeAt(0);
const DICT_START = '{'.charCodeAt(0);
const DICT_END = '}'.charCodeAt(0);
const RECORD_START = '<'.charCodeAt(0);
const RECORD_END = '>'.charCodeAt(0);
const DOUBLE = 'D'.charCodeAt(0);
const TRUE = 't'.charCodeAt(0);
const FALSE = 'f'.charCodeAt(0);

const NAN64 = freeze([0x7f, 0xf8, 0, 0, 0, 0, 0, 0]);

const textEncoder = new TextEncoder();

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
function writeSymbol(bufferWriter, value) {
  const bytes = textEncoder.encode(value);
  writeStringlike(bufferWriter, bytes, '\'');
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
 * @param {Record<string | symbol, any>} record
 * @param {Array<string | symbol | number>} path
 */
function writeDictionary(bufferWriter, record, path) {
  const indexes = [];
  const keys = [];
  const keyBytes = [];

  const writeKey = (bufferWriter, key) => {
    if (typeof key === 'string') {
      writeString(bufferWriter, key);
      return;
    }
    if (typeof key === 'symbol') {
      const syrupSymbol = getSyrupSymbolName(key);
      writeSymbol(bufferWriter, syrupSymbol);
      return;
    }
    throw TypeError(`Dictionary keys must be strings or symbols, got ${typeof key} at ${path.join('/')}`);
  };

  // We need to sort the keys, so we write them to a scratch buffer first
  const scratchWriter = new BufferWriter();
  for (const key of ownKeys(record)) {
    const start = scratchWriter.length;
    writeKey(scratchWriter, key);
    const end = scratchWriter.length;

    keys.push(key);
    keyBytes.push(scratchWriter.subarray(start, end));
    indexes.push(indexes.length);
  }
  indexes.sort((i, j) =>
    compareByteArrays(
      keyBytes[i],
      keyBytes[j],
      0,
      keyBytes[i].length,
      0,
      keyBytes[j].length,
    ),
  );

  // Now we write the dictionary
  bufferWriter.writeByte(DICT_START);
  for (const index of indexes) {
    const key = keys[index];
    const value = record[key];
    const bytes = keyBytes[index];

    bufferWriter.write(bytes);
    // Recursion, it's a thing!
    // eslint-disable-next-line no-use-before-define
    writeAny(bufferWriter, value, path, key);
  }
  bufferWriter.writeByte(DICT_END);
}

/**
 * @param {import('./buffer-writer.js').BufferWriter} bufferWriter
 * @param {Array<any>} array
 * @param {Array<string | symbol | number>} path
 */
function writeList(bufferWriter, array, path) {
  bufferWriter.writeByte(LIST_START);

  let index = 0;
  for (const value of array) {
    // Recursion, it's a thing!
    // eslint-disable-next-line no-use-before-define
    writeAny(bufferWriter, value, path, index);
    index += 1;
  }

  bufferWriter.writeByte(LIST_END);
}

/**
 * @param {import('./buffer-writer.js').BufferWriter} bufferWriter
 * @param {number} value
 */
function writeDouble(bufferWriter, value) {
  bufferWriter.writeByte(DOUBLE);
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

/**
 * @param {import('./buffer-writer.js').BufferWriter} bufferWriter
 * @param {any} value
 * @param {Array<string | symbol | number>} path
 * @param {string | symbol | number} pathSuffix
 */
function writeAny(bufferWriter, value, path, pathSuffix) {
  if (typeof value === 'symbol') {
    writeSymbol(bufferWriter, getSyrupSymbolName(value));
    return;
  }

  if (typeof value === 'string') {
    writeString(bufferWriter, value);
    return;
  }

  if (typeof value === 'number') {
    writeDouble(bufferWriter, value);
    return;
  }

  if (typeof value === 'bigint') {
    writeInteger(bufferWriter, value);
    return;
  }

  if (value instanceof Uint8Array) {
    writeBytestring(bufferWriter, value);
    return;
  }

  if (Array.isArray(value)) {
    writeList(bufferWriter, value, path);
    return;
  }

  if (Object(value) === value) {
    path.push(pathSuffix);
    writeDictionary(bufferWriter, value, path);
    path.pop();
    return;
  }

  if (value === true || value === false) {
    writeBoolean(bufferWriter, value);
    return;
  }

  path.push(pathSuffix);
  throw TypeError(`Cannot encode value ${value} at ${path.join('/')}`);
}

export class SyrupWriter {
  constructor(bufferWriter) {
    this.bufferWriter = bufferWriter;
  }
  writeSymbol(value) {
    writeSymbol(this.bufferWriter, value);
  }
  writeString(value) {
    writeString(this.bufferWriter, value);
  }
  writeBytestring(value) {
    writeBytestring(this.bufferWriter, value);
  }
  writeBoolean(value) {
    writeBoolean(this.bufferWriter, value);
  }
  writeInteger(value) {
    writeInteger(this.bufferWriter, value);
  }
  writeDouble(value) {
    writeDouble(this.bufferWriter, value);
  }
  // writeList(value) {
  //   writeList(this.bufferWriter, value, []);
  // }
  // writeDictionary(value) {
  //   writeDictionary(this.bufferWriter, value, []);
  // }
  // writeRecord(value) {
  //   throw Error('writeRecord is not implemented');
  // }
  enterRecord() {
    this.bufferWriter.writeByte(RECORD_START);
  }
  exitRecord() {
    this.bufferWriter.writeByte(RECORD_END);
  }
  /**
   * @param {'boolean' | 'integer' | 'float64' | 'string' | 'bytestring' | 'symbol'} type
   * @param {any} value
   */
  writeOfType(type, value) {
    switch (type) {
      case 'symbol':
        this.writeSymbol(value);
        break;
      case 'bytestring':
        this.writeBytestring(value);
        break;
      case 'string':
        this.writeString(value);
        break;
      case 'float64':
        this.writeDouble(value);
        break;
      case 'integer':
        this.writeInteger(value);
        break;
      case 'boolean':
        this.writeBoolean(value);
        break;
      default:
        throw Error(`writeTypeOf: unknown type ${typeof value}`);
    }
  }
}

/**
 * @param {any} value
 * @param {object} [options]
 * @param {number} [options.length] A guess at the length. If provided, must be
 * greater than zero.
 * @returns {Uint8Array}
 */
export function encodeSyrup(value, options = {}) {
  const { length: capacity = defaultCapacity } = options;
  const bufferWriter = new BufferWriter(capacity);
  writeAny(bufferWriter, value, [], '/');
  return bufferWriter.subarray(0, bufferWriter.length);
}

export function makeSyrupWriter(options = {}) {
  const { length: capacity = defaultCapacity } = options;
  const bufferWriter = new BufferWriter(capacity);
  return new SyrupWriter(bufferWriter);
}
