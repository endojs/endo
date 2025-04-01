// @ts-check

import { compareByteArrays } from './compare.js';
import { getSyrupSymbolName } from './symbol.js';

const { freeze } = Object;
const { ownKeys } = Reflect;

const defaultCapacity = 256;

const LIST_START = '['.charCodeAt(0);
const LIST_END = ']'.charCodeAt(0);
const DICT_START = '{'.charCodeAt(0);
const DICT_END = '}'.charCodeAt(0);
const DOUBLE = 'D'.charCodeAt(0);
const TRUE = 't'.charCodeAt(0);
const FALSE = 'f'.charCodeAt(0);

const NAN64 = freeze([0x7f, 0xf8, 0, 0, 0, 0, 0, 0]);

const textEncoder = new TextEncoder();

/**
 * @typedef {object} Buffer
 * @property {Uint8Array} bytes
 * @property {DataView} data
 * @property {number} length
 */

/**
 * @param {Buffer} buffer
 * @param {number} increaseBy
 * @returns {number} old length
 */
function grow(buffer, increaseBy) {
  const cursor = buffer.length;
  if (increaseBy === 0) {
    return cursor;
  }
  buffer.length += increaseBy;
  let capacity = buffer.bytes.length;
  // Expand backing storage, leaving headroom for another similar-size increase.
  if (buffer.length + increaseBy > capacity) {
    while (buffer.length + increaseBy > capacity) {
      capacity *= 2;
    }
    const bytes = new Uint8Array(capacity);
    const data = new DataView(bytes.buffer);
    bytes.set(buffer.bytes.subarray(0, buffer.length), 0);
    buffer.bytes = bytes;
    buffer.data = data;
  }
  return cursor;
}

/**
 * @param {Buffer} buffer
 * @param {string} value
 * @param {string} typeChar
 */
function encodeStringlike(buffer, value, typeChar) {
  const stringLength = value.length;
  const likelyPrefixLength = `${stringLength}`.length + 1;
  // buffer.length will be incorrect until we fix it before returning.
  const start = grow(buffer, likelyPrefixLength + stringLength);
  const likelyDataStart = start + likelyPrefixLength;

  for (let remaining = value, read = 0, written = 0; ; ) {
    const chunk = textEncoder.encodeInto(
      remaining,
      buffer.bytes.subarray(likelyDataStart + written),
    );
    written += chunk.written || 0;
    read += chunk.read || 0;
    if (read === stringLength) {
      const prefix = `${written}${typeChar}`; // length prefix, typeChar suffix
      const prefixLength = prefix.length;
      buffer.length = start;
      grow(buffer, prefixLength + written);
      if (prefixLength !== likelyPrefixLength) {
        buffer.bytes.copyWithin(start + prefixLength, likelyDataStart); // shift right
      }
      textEncoder.encodeInto(
        prefix,
        buffer.bytes.subarray(start, start + prefixLength),
      );
      return;
    }
    remaining = remaining.substring(chunk.read || 0);
    grow(buffer, buffer.bytes.length);
  }
}

/**
 * @param {Buffer} buffer
 * @param {string} value
 */
function encodeString(buffer, value) {
  encodeStringlike(buffer, value, '"');
}

/**
 * @param {Buffer} buffer
 * @param {string} value
 */
function encodeSymbol(buffer, value) {
  encodeStringlike(buffer, value, '\'');
}

/**
 * @param {Buffer} buffer
 * @param {Record<string | symbol, any>} record
 * @param {Array<string | symbol | number>} path
 */
function encodeDictionary(buffer, record, path) {
  const restart = buffer.length;
  const indexes = [];
  const keys = [];
  const keyBytes = [];

  const encodeKey = (key) => {
    if (typeof key === 'string') {
      encodeString(buffer, key);
      return;
    }
    if (typeof key === 'symbol') {
      const syrupSymbol = getSyrupSymbolName(key);
      encodeSymbol(buffer, syrupSymbol);
      return;
    }
    throw TypeError(`Dictionary keys must be strings or symbols, got ${typeof key} at ${path.join('/')}`);
  };

  for (const key of ownKeys(record)) {
    const start = buffer.length;
    encodeKey(key);
    const end = buffer.length;

    keys.push(key);
    keyBytes.push(buffer.bytes.subarray(start, end));
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

  buffer.length = restart;

  let cursor = grow(buffer, 1);
  buffer.bytes[cursor] = DICT_START;

  for (const index of indexes) {
    const key = keys[index];
    const value = record[key];

    encodeKey(key);
    // Recursion, it's a thing!
    // eslint-disable-next-line no-use-before-define
    encodeAny(buffer, value, path, key);
  }

  cursor = grow(buffer, 1);
  buffer.bytes[cursor] = DICT_END;
}

/**
 * @param {Buffer} buffer
 * @param {Array<any>} array
 * @param {Array<string | symbol | number>} path
 */
function encodeArray(buffer, array, path) {
  let cursor = grow(buffer, 2 + array.length);
  buffer.length = cursor + 1;
  buffer.bytes[cursor] = LIST_START;

  let index = 0;
  for (const value of array) {
    // Recursion, it's a thing!
    // eslint-disable-next-line no-use-before-define
    encodeAny(buffer, value, path, index);
    index += 1;
  }

  cursor = grow(buffer, 1);
  buffer.bytes[cursor] = LIST_END;
}

/**
 * @param {Buffer} buffer
 * @param {any} value
 * @param {Array<string | symbol | number>} path
 * @param {string | symbol | number} pathSuffix
 */
function encodeAny(buffer, value, path, pathSuffix) {
  if (typeof value === 'symbol') {
    encodeSymbol(buffer, getSyrupSymbolName(value));
    return;
  }

  if (typeof value === 'string') {
    encodeString(buffer, value);
    return;
  }

  if (typeof value === 'number') {
    const cursor = grow(buffer, 9);
    buffer.bytes[cursor] = DOUBLE;
    if (value === 0) {
      // no-op
    } else if (Number.isNaN(value)) {
      // Canonicalize NaN
      buffer.bytes.set(NAN64, cursor + 1);
    } else {
      buffer.data.setFloat64(cursor + 1, value, false); // big end
    }
    return;
  }

  if (typeof value === 'bigint') {
    const string = value >= 0 ? `${value}+` : `${-value}-`;
    const cursor = grow(buffer, string.length);
    textEncoder.encodeInto(string, buffer.bytes.subarray(cursor));
    return;
  }

  if (value instanceof Uint8Array) {
    const prefix = `${value.length}:`; // decimal and colon suffix
    const cursor = grow(buffer, prefix.length + value.length);
    textEncoder.encodeInto(prefix, buffer.bytes.subarray(cursor));
    buffer.bytes.set(value, cursor + prefix.length);
    return;
  }

  if (Array.isArray(value)) {
    path.push(pathSuffix);
    encodeArray(buffer, value, path);
    path.pop();
    return;
  }

  if (Object(value) === value) {
    path.push(pathSuffix);
    encodeDictionary(buffer, value, path);
    path.pop();
    return;
  }

  if (value === false) {
    const cursor = grow(buffer, 1);
    buffer.bytes[cursor] = FALSE;
    return;
  }

  if (value === true) {
    const cursor = grow(buffer, 1);
    buffer.bytes[cursor] = TRUE;
    return;
  }

  path.push(pathSuffix);
  throw TypeError(`Cannot encode value ${value} at ${path.join('/')}`);
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
  const bytes = new Uint8Array(capacity);
  const data = new DataView(bytes.buffer);
  const length = 0;
  const buffer = { bytes, data, length };
  encodeAny(buffer, value, [], '/');
  return buffer.bytes.subarray(0, buffer.length);
}
