// @ts-check

import { compareByteArrays } from './compare.js';

const MINUS = '-'.charCodeAt(0);
const PLUS = '+'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);
const ONE = '1'.charCodeAt(0);
const NINE = '9'.charCodeAt(0);
const LIST_START = '['.charCodeAt(0);
const LIST_END = ']'.charCodeAt(0);
const DICT_START = '{'.charCodeAt(0);
const DICT_END = '}'.charCodeAt(0);
// const SET_START = '#'.charCodeAt(0);
// const SET_END = '$'.charCodeAt(0);
const BYTES_START = ':'.charCodeAt(0);
const STRING_START = '"'.charCodeAt(0);
// const SYMBOL_START = "'".charCodeAt(0);
// const RECORD_START = '<'.charCodeAt(0);
// const RECORD_END = '>'.charCodeAt(0);
const TRUE = 't'.charCodeAt(0);
const FALSE = 'f'.charCodeAt(0);
// const SINGLE = 'F'.charCodeAt(0);
const DOUBLE = 'D'.charCodeAt(0);

const textDecoder = new TextDecoder();

const scratch = new ArrayBuffer(8);
const scratchBytes = new Uint8Array(scratch);
const scratchData = new DataView(scratch);

const { defineProperty, freeze } = Object;

/**
 * @param {Uint8Array} bytes
 */
function isCanonicalNaN64(bytes) {
  const [a, b, c, d, e, f, g, h] = bytes;
  return (
    a === 0x7f &&
    b === 0xf8 &&
    c === 0 &&
    d === 0 &&
    e === 0 &&
    f === 0 &&
    g === 0 &&
    h === 0
  );
}

/**
 * @param {Uint8Array} bytes
 */
function isCanonicalZero64(bytes) {
  const [a, b, c, d, e, f, g, h] = bytes;
  return (
    a === 0 &&
    b === 0 &&
    c === 0 &&
    d === 0 &&
    e === 0 &&
    f === 0 &&
    g === 0 &&
    h === 0
  );
}
/**
 * @param {Uint8Array} bytes
 * @param {bigint} integer
 * @param {number} start
 * @param {number} end
 * @param {string} name
 */
function decodeAfterInteger(bytes, integer, start, end, name) {
  if (start >= end) {
    throw new Error(
      `Unexpected end of Syrup, expected integer suffix in ${name}`,
    );
  }
  const cc = bytes[start];
  if (cc === PLUS) {
    return {
      start: start + 1,
      value: integer,
    };
  }
  if (cc === MINUS) {
    if (integer === 0n) {
      throw new Error(`Unexpected non-canonical -0`);
    }
    return {
      start: start + 1,
      value: -integer,
    };
  }
  if (cc === BYTES_START) {
    start += 1;
    const subStart = start;
    start += Number(integer);
    if (start > end) {
      throw new Error(
        `Unexpected end of Syrup, expected ${integer} bytes after Syrup bytestring starting at index ${subStart} in ${name}`,
      );
    }
    const value = bytes.subarray(subStart, start);
    return harden({ start, value });
  }
  if (cc === STRING_START) {
    start += 1;
    const subStart = start;
    start += Number(integer);
    if (start > end) {
      throw new Error(
        `Unexpected end of Syrup, expected ${integer} bytes after string starting at index ${subStart} in ${name}`,
      );
    }
    const value = textDecoder.decode(bytes.subarray(subStart, start));
    return harden({ start, value });
  }
  throw new Error(
    `Unexpected character ${JSON.stringify(
      String.fromCharCode(cc),
    )} at Syrup index ${start} of ${name}`,
  );
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 */
function decodeInteger(bytes, start, end) {
  let at = start + 1;
  // eslint-disable-next-line no-empty
  for (; at < end && bytes[at] >= ZERO && bytes[at] <= NINE; at += 1) {}
  return {
    start: at,
    integer: BigInt(textDecoder.decode(bytes.subarray(start, at))),
  };
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 */
function decodeArray(bytes, start, end, name) {
  const list = [];
  for (;;) {
    if (start >= end) {
      throw new Error(
        `Unexpected end of Syrup, expected Syrup value or end of Syrup list marker "]" at index ${start} in ${name}`,
      );
    }
    const cc = bytes[start];
    if (cc === LIST_END) {
      return {
        start: start + 1,
        value: list,
      };
    }
    let value;
    // eslint-disable-next-line no-use-before-define
    ({ start, value } = decodeAny(bytes, start, end, name));
    list.push(value);
  }
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 */
function decodeString(bytes, start, end, name) {
  if (start >= end) {
    throw new Error(
      `Unexpected end of Syrup, expected Syrup string at end of ${name}`,
    );
  }
  let length;
  ({ start, integer: length } = decodeInteger(bytes, start, end));

  const cc = bytes[start];
  if (cc !== STRING_START) {
    throw new Error(
      `Unexpected byte ${JSON.stringify(
        String.fromCharCode(cc),
      )}, Syrup dictionary keys must be strings or symbols at index ${start} of ${name}`,
    );
  }
  start += 1;

  const subStart = start;
  start += Number(length);
  if (start > end) {
    throw new Error(
      `Unexpected end of Syrup, expected ${length} bytes after index ${subStart} of ${name}`,
    );
  }
  const value = textDecoder.decode(bytes.subarray(subStart, start));
  return harden({ start, value });
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 */
function decodeRecord(bytes, start, end, name) {
  const record = {};
  let priorKey = '';
  let priorKeyStart = -1;
  let priorKeyEnd = -1;
  for (;;) {
    if (start >= end) {
      throw new Error(
        `Unexpected end of Syrup, expected Syrup string or end of Syrup dictionary marker "}" at ${start} of ${name}`,
      );
    }
    const cc = bytes[start];
    if (cc === DICT_END) {
      return {
        start: start + 1,
        value: freeze(record),
      };
    }
    const keyStart = start;
    let key;
    ({ start, value: key } = decodeString(bytes, start, end, name));
    const keyEnd = start;

    // Validate strictly non-descending keys.
    if (priorKeyStart !== -1) {
      const order = compareByteArrays(
        bytes,
        bytes,
        priorKeyStart,
        priorKeyEnd,
        keyStart,
        keyEnd,
      );
      if (order === 0) {
        throw new Error(
          `Syrup dictionary keys must be unique, got repeated ${JSON.stringify(
            key,
          )} at index ${start} of ${name}`,
        );
      } else if (order > 0) {
        throw new Error(
          `Syrup dictionary keys must be in bytewise sorted order, got ${JSON.stringify(
            key,
          )} immediately after ${JSON.stringify(
            priorKey,
          )} at index ${start} of ${name}`,
        );
      }
    }
    priorKey = key;
    priorKeyStart = keyStart;
    priorKeyEnd = keyEnd;

    let value;
    // eslint-disable-next-line no-use-before-define
    ({ start, value } = decodeAny(bytes, start, end, name));

    defineProperty(record, key, {
      value,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 */
function decodeFloat64(bytes, start, end, name) {
  const floatStart = start;
  start += 8;
  if (start > end) {
    throw new Error(
      `Unexpected end of Syrup, expected 8 bytes of a 64 bit floating point number at index ${floatStart} of ${name}`,
    );
  }
  const subarray = bytes.subarray(floatStart, start);
  scratchBytes.set(subarray);
  const value = scratchData.getFloat64(0, false); // big end

  if (value === 0) {
    if (!isCanonicalZero64(subarray)) {
      throw new Error(
        `Non-canonical zero at index ${floatStart} of Syrup ${name}`,
      );
    }
  }
  if (Number.isNaN(value)) {
    if (!isCanonicalNaN64(subarray)) {
      throw new Error(
        `Non-canonical NaN at index ${floatStart} of Syrup ${name}`,
      );
    }
  }

  return harden({ start, value });
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 * @returns {{start: number, value: any}}
 */
function decodeAny(bytes, start, end, name) {
  if (start >= end) {
    throw new Error(
      `Unexpected end of Syrup, expected any value at index ${start} of ${name}`,
    );
  }
  const cc = bytes[start];
  if (cc === DOUBLE) {
    return decodeFloat64(bytes, start + 1, end, name);
  }
  if (cc >= ONE && cc <= NINE) {
    let integer;
    ({ start, integer } = decodeInteger(bytes, start, end));
    return decodeAfterInteger(bytes, integer, start, end, name);
  }
  if (cc === ZERO) {
    return decodeAfterInteger(bytes, 0n, start + 1, end, name);
  }
  if (cc === LIST_START) {
    return decodeArray(bytes, start + 1, end, name);
  }
  if (cc === DICT_START) {
    return decodeRecord(bytes, start + 1, end, name);
  }
  if (cc === TRUE) {
    return harden({ start: start + 1, value: true });
  }
  if (cc === FALSE) {
    return harden({ start: start + 1, value: false });
  }
  throw new Error(
    `Unexpected character ${JSON.stringify(
      String.fromCharCode(cc),
    )} at index ${start} of ${name}`,
  );
}

/**
 * @param {Uint8Array} bytes
 * @param {Object} options
 * @param {string} [options.name]
 * @param {number} [options.start]
 * @param {number} [options.end]
 */
export function decodeSyrup(bytes, options = {}) {
  const { start = 0, end = bytes.byteLength, name = '<unknown>' } = options;
  if (end > bytes.byteLength) {
    throw new Error(
      `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${bytes.byteLength}`,
    );
  }
  const { start: next, value } = decodeAny(bytes, start, end, name);
  if (next !== end) {
    throw new Error(
      `Unexpected trailing bytes after Syrup, length = ${end - next}`,
    );
  }
  return value;
}
