// @ts-check

import { compareByteArrays } from './compare.js';

const { freeze } = Object;

const LIST_START = '['.charCodeAt(0);
const LIST_END = ']'.charCodeAt(0);
const DICT_START = '{'.charCodeAt(0);
const DICT_END = '}'.charCodeAt(0);
const DOUBLE = 'D'.charCodeAt(0);
const TRUE = new Uint8Array(['t'.charCodeAt(0)]);
const FALSE = new Uint8Array(['f'.charCodeAt(0)]);

const NAN64 = freeze([0x7f, 0xf8, 0, 0, 0, 0, 0, 0]);

const scratch = new ArrayBuffer(16);
const scratchBytes = new Uint8Array(scratch);
const scratchData = new DataView(scratch);

const textEncoder = new TextEncoder();

/**
 * @param {Record<string, any>} object
 */
function encodeDict(object) {
  let byteLength = 2;
  let index = 0;
  const indexes = [];
  const keys = [];
  const values = [];

  for (const [key, value] of Object.entries(object)) {
    // Recursion, it's a thing!
    // eslint-disable-next-line no-use-before-define
    const keyBytes = encodeSyrup(key);
    // eslint-disable-next-line no-use-before-define
    const valueBytes = encodeSyrup(value);
    byteLength += keyBytes.byteLength + valueBytes.byteLength;
    indexes.push(index);
    keys.push(keyBytes);
    values.push(valueBytes);
    index += 1;
  }

  indexes.sort((i, j) =>
    compareByteArrays(
      keys[i],
      keys[j],
      0,
      keys[i].byteLength,
      0,
      keys[j].byteLength,
    ),
  );

  const bytes = new Uint8Array(byteLength);
  bytes[0] = DICT_START;
  bytes[byteLength - 1] = DICT_END;
  let cursor = 1;

  for (index of indexes) {
    const key = keys[index];
    const value = values[index];

    bytes.set(key, cursor);
    cursor += key.byteLength;

    bytes.set(value, cursor);
    cursor += value.byteLength;
  }
  return bytes;
}

/**
 * @param {Array<any>} array
 */
function encodeArray(array) {
  let byteLength = 2;
  const parts = [];
  for (const value of array) {
    // Recursion, it's a thing!
    // eslint-disable-next-line no-use-before-define
    const part = encodeSyrup(value);
    byteLength += part.byteLength;
    parts.push(part);
  }
  const bytes = new Uint8Array(byteLength);
  bytes[0] = LIST_START;
  bytes[byteLength - 1] = LIST_END;
  let cursor = 1;
  for (const part of parts) {
    bytes.set(part, cursor);
    cursor += part.byteLength;
  }
  return bytes;
}

/**
 * @param {any} value
 * @returns {Uint8Array}
 */
export function encodeSyrup(value) {
  if (typeof value === 'string') {
    const suffix = textEncoder.encode(value);
    const prefix = textEncoder.encode(`${suffix.byteLength}"`);
    const bytes = new Uint8Array(prefix.byteLength + suffix.byteLength);
    bytes.set(prefix, 0);
    bytes.set(suffix, prefix.byteLength);
    return bytes;
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      // Canonicalize NaN
      return new Uint8Array(NAN64);
    } else if (value === 0) {
      // Canonicalize negative zero
      return new Uint8Array(8);
    } else {
      scratchData.setFloat64(1, value, false); // big end
      scratchBytes[0] = DOUBLE;
      return scratchBytes.slice(0, 9);
    }
  }

  if (typeof value === 'bigint') {
    if (value >= 0) {
      return textEncoder.encode(`${value}+`);
    } else {
      return textEncoder.encode(`${-value}-`);
    }
  }

  if (value instanceof Uint8Array) {
    const prefix = textEncoder.encode(`${value.byteLength}:`);
    const bytes = new Uint8Array(prefix.byteLength + value.byteLength);
    bytes.set(prefix, 0);
    bytes.set(value, prefix.byteLength);
    return bytes;
  }

  if (Array.isArray(value)) {
    return encodeArray(value);
  }

  if (Object(value) === value) {
    return encodeDict(value);
  }

  if (value === false) {
    return FALSE.slice();
  }

  if (value === true) {
    return TRUE.slice();
  }

  throw new TypeError(`Cannot syrialize value ${value}`);
}
