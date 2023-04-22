// @ts-check

import { compareByteArrays } from './compare.js';

const { freeze, keys } = Object;

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
 * @param {number} length
 * @returns {number} cursor (old length)
 */
function grow(buffer, length) {
  const cursor = buffer.length;
  if (length === 0) {
    return cursor;
  }
  buffer.length += length;
  let newLength = buffer.bytes.length;
  if (buffer.length + length > newLength) {
    while (buffer.length + length > newLength) {
      newLength *= 2;
    }
    const bytes = new Uint8Array(newLength);
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
 */
function encodeString(buffer, value) {
  const start = buffer.length;
  for (;;) {
    const { read = 0, written = 0 } = textEncoder.encodeInto(
      value,
      buffer.bytes.subarray(start),
    );
    if (read === value.length) {
      const prefix = `${written}"`; // length prefix quote suffix
      buffer.length = start;
      grow(buffer, prefix.length + written);
      buffer.bytes.copyWithin(start + prefix.length, start); // shift right
      textEncoder.encodeInto(
        prefix,
        buffer.bytes.subarray(start, start + prefix.length),
      );
      buffer.length = start + prefix.length + written;
      return;
    }
    grow(buffer, buffer.bytes.length);
  }
}

/**
 * @param {Buffer} buffer
 * @param {Record<string, any>} record
 * @param {string} path
 */
function encodeRecord(buffer, record, path) {
  const restart = buffer.length;
  const indexes = [];
  const keyStrings = [];
  const keyBytes = [];

  for (const key of keys(record)) {
    const start = buffer.length;
    encodeString(buffer, key);
    const end = buffer.length;

    keyStrings.push(key);
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
    const key = keyStrings[index];
    const value = record[key];

    encodeString(buffer, key);
    // Recursion, it's a thing!
    // eslint-disable-next-line no-use-before-define
    encodeAny(buffer, value, `${path}/${key}`);
  }

  cursor = grow(buffer, 1);
  buffer.bytes[cursor] = DICT_END;
}

/**
 * @param {Buffer} buffer
 * @param {Array<any>} array
 * @param {string} path
 */
function encodeArray(buffer, array, path) {
  let cursor = grow(buffer, 1);
  buffer.bytes[cursor] = LIST_START;

  let index = 0;
  for (const value of array) {
    // Recursion, it's a thing!
    // eslint-disable-next-line no-use-before-define
    encodeAny(buffer, value, `${path}/${index}`);
    index += 1;
  }

  cursor = grow(buffer, 1);
  buffer.bytes[cursor] = LIST_END;
}

/**
 * @param {Buffer} buffer
 * @param {any} value
 * @param {string} path
 */
function encodeAny(buffer, value, path) {
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
    encodeArray(buffer, value, path);
    return;
  }

  if (Object(value) === value) {
    encodeRecord(buffer, value, path);
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

  throw TypeError(`Cannot encode value ${value} at ${path}`);
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
  encodeAny(buffer, value, '/');
  return buffer.bytes.subarray(0, buffer.length);
}
