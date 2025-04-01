// @ts-check

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
    throw Error(`Unexpected end of Syrup, expected integer suffix in ${name}`);
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
      throw Error(`Unexpected non-canonical -0`);
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
      throw Error(
        `Unexpected end of Syrup, expected ${integer} bytes after Syrup bytestring starting at index ${subStart} in ${name}`,
      );
    }
    const value = bytes.subarray(subStart, start);
    return { start, value };
  }
  if (cc === STRING_START) {
    start += 1;
    const subStart = start;
    start += Number(integer);
    if (start > end) {
      throw Error(
        `Unexpected end of Syrup, expected ${integer} bytes after string starting at index ${subStart} in ${name}`,
      );
    }
    const value = textDecoder.decode(bytes.subarray(subStart, start));
    return { start, value };
  }
  if (cc === SYMBOL_START) {
    start += 1;
    const subStart = start;
    start += Number(integer);
    if (start > end) {
      throw Error(
        `Unexpected end of Syrup, expected ${integer} bytes after symbol starting at index ${subStart} in ${name}`,
      );
    }
    const value = textDecoder.decode(bytes.subarray(subStart, start));
    return { start, value: SyrupSymbolFor(value) };
  }
  throw Error(
    `Unexpected character ${JSON.stringify(
      String.fromCharCode(cc),
    )} at Syrup index ${start} of ${name}`,
  );
}

function seekEndOfInteger(bytes, start, end) {
  let at = start + 1;
  // eslint-disable-next-line no-empty
  for (; at < end && bytes[at] >= ZERO && bytes[at] <= NINE; at += 1) {}
  return at;
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 */
function decodeInteger(bytes, start, end) {
  const at = seekEndOfInteger(bytes, start, end);
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
function decodeList(bytes, start, end, name) {
  const list = [];
  for (;;) {
    if (start >= end) {
      throw Error(
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

function seekList(bytes, start, end, name) {
  for (;;) {
    if (start >= end) {
      throw Error(
        `Unexpected end of Syrup, expected Syrup value or end of Syrup list marker "]" at index ${start} in ${name}`,
      );
    }
    const cc = bytes[start];
    if (cc === LIST_END) {
      return {
        start: start + 1,
      };
    }
    ({ start } = seekAny(bytes, start, end, name));
  }
}

function seekSet(bytes, start, end, name) {
  for (;;) {
    if (start >= end) {
      throw Error(
        `Unexpected end of Syrup, expected Syrup value or end of Syrup set marker "$" at index ${start} in ${name}`,
      );
    }
    const cc = bytes[start];
    if (cc === SET_END) {
      return {
        start: start + 1,
      };
    }
    ({ start } = seekAny(bytes, start, end, name));
  }
}

export function decodeSymbolName(bytes, start, end, name) {
  const { value } = decodeStringlike(bytes, start, end, name);
  return value;
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 */
function decodeStringlike(bytes, start, end, name) {
  if (start >= end) {
    throw Error(
      `Unexpected end of Syrup, expected Syrup string at end of ${name}`,
    );
  }
  let length;
  ({ start, integer: length } = decodeInteger(bytes, start, end));

  const typeCode = bytes[start];
  if (typeCode !== STRING_START && typeCode !== SYMBOL_START) {
    // TODO: error message implies this is only for dictionaries, but it's not
    throw Error(
      `Unexpected byte ${JSON.stringify(
        String.fromCharCode(typeCode),
      )}, Syrup dictionary keys must be strings or symbols at index ${start} of ${name}`,
    );
  }
  start += 1;

  const subStart = start;
  start += Number(length);
  if (start > end) {
    throw Error(
      `Unexpected end of Syrup, expected ${length} bytes after index ${subStart} of ${name}`,
    );
  }
  const value = textDecoder.decode(bytes.subarray(subStart, start));
  return { start, value, typeCode };
}

function decodeSymbol(bytes, start, end, name) {
  const { start: next, value, typeCode } = decodeStringlike(bytes, start, end, name);
  if (typeCode === SYMBOL_START) {
    return { start: next, value: SyrupSymbolFor(value) };
  }
  throw Error(`Unexpected type ${typeCode}, Syrup symbols must start with ${SYMBOL_START} at index ${start} of ${name}`);
}

function decodeString(bytes, start, end, name) {
  const { start: next, value, typeCode } = decodeStringlike(bytes, start, end, name);
  if (typeCode === STRING_START) {
    return { start: next, value };
  }
  throw Error(`Unexpected type ${typeCode}, Syrup strings must start with ${STRING_START} at index ${start} of ${name}`);
}

function decodeDictionaryKey(bytes, start, end, name) {
  const { start: next, value, typeCode } = decodeStringlike(bytes, start, end, name);
  if (typeCode === SYMBOL_START) {
    return { start: next, value: SyrupSymbolFor(value), typeCode };
  }
  if (typeCode === STRING_START) {
    return { start: next, value, typeCode };
  }
  throw Error(`Unexpected type ${typeCode}, Syrup dictionary keys must be strings or symbols at index ${start} of ${name}`);
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 * @param {number} typeCode
 * @param {string} typeName
 */
function seekStringOfType(bytes, start, end, name, typeCode, typeName) {
  if (start >= end) {
    throw Error(
      `Unexpected end of Syrup, expected Syrup ${typeName} at end of ${name}`,
    );
  }
  let length;
  ({ start, integer: length } = decodeInteger(bytes, start, end));
  
  const cc = bytes[start];
  if (cc !== typeCode) {
    throw Error(
      `Unexpected character ${JSON.stringify(String.fromCharCode(cc))}, Syrup ${typeName} must start with ${JSON.stringify(String.fromCharCode(typeCode))}, got ${JSON.stringify(String.fromCharCode(cc))} at index ${start} of ${name}`,
    );
  }
  start += 1;
  const subStart = start;
  start += Number(length);
  if (start > end) {
    throw Error(
      `Unexpected end of Syrup, expected ${length} bytes after index ${subStart} of ${name}`,
    );
  }
  return { start };
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 */
function seekString(bytes, start, end, name) {
  return seekStringOfType(bytes, start, end, name, STRING_START, 'string');
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 */
function seekSymbol(bytes, start, end, name) {
  return seekStringOfType(bytes, start, end, name, SYMBOL_START, 'symbol');
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 */
function seekBytestring(bytes, start, end, name) {
  return seekStringOfType(bytes, start, end, name, BYTES_START, 'bytestring');
}

function seekDictionaryKey(bytes, start, end, name) {
  const typeInfo = peekType(bytes, start, end, name);
  if (typeInfo.type === 'string') {
    return seekString(bytes, start, end, name);
  }
  if (typeInfo.type === 'symbol') {
    return seekSymbol(bytes, start, end, name);
  }
  throw Error(
    `Unexpected type ${typeInfo.type}, Syrup dictionary keys must be strings or symbols at index ${start} of ${name}`,
  );
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 */
function decodeDictionary(bytes, start, end, name) {
  const record = {};
  let priorKey = undefined;
  let priorKeyStart = -1;
  let priorKeyEnd = -1;
  for (;;) {
    if (start >= end) {
      throw Error(
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
    ({ start, value: key } = decodeDictionaryKey(bytes, start, end, name));
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
        throw Error(
          `Syrup dictionary keys must be unique, got repeated ${JSON.stringify(
            key,
          )} at index ${start} of ${name}`,
        );
      } else if (order > 0) {
        throw Error(
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

function seekDictionary(bytes, start, end, name) {
  let priorKey = undefined;
  let priorKeyStart = -1;
  let priorKeyEnd = -1;
  for (;;) {
    if (start >= end) {
      throw Error(
        `Unexpected end of Syrup, expected Syrup string or end of Syrup dictionary marker "}" at ${start} of ${name}`,
      );
    }
    const cc = bytes[start];
    if (cc === DICT_END) {
      return {
        start: start + 1,
      };
    }
    const keyStart = start;
    let key;
    ({ start, value: key } = decodeDictionaryKey(bytes, start, end, name));
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
        throw Error(
          `Syrup dictionary keys must be unique, got repeated ${JSON.stringify(
            key,
          )} at index ${start} of ${name}`,
        );
      } else if (order > 0) {
        throw Error(
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

    ({ start } = seekAny(bytes, start, end, name));
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
    throw Error(
      `Unexpected end of Syrup, expected 8 bytes of a 64 bit floating point number at index ${floatStart} of ${name}`,
    );
  }
  const subarray = bytes.subarray(floatStart, start);
  scratchBytes.set(subarray);
  const value = scratchData.getFloat64(0, false); // big end

  if (value === 0) {
    if (!isCanonicalZero64(subarray)) {
      throw Error(`Non-canonical zero at index ${floatStart} of Syrup ${name}`);
    }
  }
  if (Number.isNaN(value)) {
    if (!isCanonicalNaN64(subarray)) {
      throw Error(`Non-canonical NaN at index ${floatStart} of Syrup ${name}`);
    }
  }

  return { start, value };
}

function peekTypeWithNumberPrefix(bytes, start, end, name) {
  const at = seekEndOfInteger(bytes, start, end);
  const typePostfix = bytes[at];
  if (typePostfix === PLUS) {
    return { type: 'integer', start: at + 1 };
  }
  if (typePostfix === MINUS) {
    return { type: 'integer', start: at + 1 };
  }
  // TODO: these start values are not correct bc they dont include the actual string length (?)
  // we need to clarify what the string parser/seeker wants
  if (typePostfix === BYTES_START) {
    const { start: next } = seekBytestring(bytes, start, end, name);
    return { type: 'bytestring', start: next };
  }
  if (typePostfix === STRING_START) {
    const { start: next } = seekString(bytes, start, end, name);
    return { type: 'string', start: next };
  }
  if (typePostfix === SYMBOL_START) {
    const { start: next } = seekSymbol(bytes, start, end, name);
    return { type: 'symbol', start: next };
  }
  throw Error(
    `Unexpected character ${JSON.stringify(
      String.fromCharCode(typePostfix),
    )} at index ${start} of ${name}`,
  );
}

/**
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end
 * @param {string} name
 * @returns {{type: string, start: number}}
 */
export function peekType(bytes, start, end, name) {
  if (start >= end) {
    throw Error(
      `Unexpected end of Syrup, expected any value at index ${start} of ${name}`,
    );
  }
  const cc = bytes[start];
  if (cc === DOUBLE) {
    return { type: 'float64', start: start + 1 };
  }
  if (cc >= ONE && cc <= NINE) {
    return peekTypeWithNumberPrefix(bytes, start, end, name);
  }
  if (cc === ZERO) {
    return { type: 'integer', start: start + 1 };
  }
  if (cc === LIST_START) {
    return { type: 'list', start: start + 1 };
  }
  if (cc === SET_START) {
    return { type: 'set', start: start + 1 };
  }
  if (cc === DICT_START) {
    return { type: 'dictionary', start: start + 1 };
  }
  if (cc === RECORD_START) {
    return { type: 'record', start: start + 1 };
  }
  if (cc === TRUE) {
    return { type: 'boolean', start: start + 1 };
  }
  if (cc === FALSE) {
    return { type: 'boolean', start: start + 1 };
  }
  throw Error(
    `Unexpected character ${JSON.stringify(
      String.fromCharCode(cc),
    )} at index ${start} of ${name}`,
  );
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
    throw Error(
      `Unexpected end of Syrup, expected any value at index ${start} of ${name}`,
    );
  }
  const cc = bytes[start];
  if (cc >= ONE && cc <= NINE) {
    let integer;
    ({ start, integer } = decodeInteger(bytes, start, end));
    return decodeAfterInteger(bytes, integer, start, end, name);
  }
  if (cc === ZERO) {
    return decodeAfterInteger(bytes, 0n, start + 1, end, name);
  }
  if (cc === TRUE) {
    return { start: start + 1, value: true };
  }
  if (cc === FALSE) {
    return { start: start + 1, value: false };
  }
  const { type, start: next } = peekType(bytes, start, end, name);
  if (type === 'float64') {
    return decodeFloat64(bytes, next, end, name);
  }
  if (type === 'string') {
    return decodeString(bytes, next, end, name);
  }
  if (type === 'bytestring') {
    throw Error(
      `decode Bytestrings are not yet supported.`,
    );
  }
  if (type === 'symbol') {
    return decodeSymbol(bytes, next, end, name);
  }
  if (type === 'list') {
    return decodeList(bytes, next, end, name);
  }
  if (type === 'set') {
    throw Error(
      `decode Sets are not yet supported.`,
    );
  }
  if (type === 'dictionary') {
    return decodeDictionary(bytes, next, end, name);
  }
  if (type === 'record') {
    throw Error(
      `decode Records are not yet supported.`,
    );
  }
  throw Error(
    `Unexpected character ${JSON.stringify(
      String.fromCharCode(cc),
    )} at index ${start} of ${name}`,
  );
}

function seekAny(bytes, start, end, name) {
  const { type, start: next } = peekType(bytes, start, end, name);
  // String-likes operate on the start index
  if (type === 'symbol') {
    return seekSymbol(bytes, start, end, name);
  }
  if (type === 'bytestring') {
    return seekBytestring(bytes, start, end, name);
  }
  // Non-string-likes operate on the next index
  if (type === 'list') {
    return seekList(bytes, next, end, name);
  }
  if (type === 'set') {
    return seekSet(bytes, next, end, name);
  }
  if (type === 'dictionary') {
    return seekDictionary(bytes, next, end, name);
  }
  // TODO: We want to seek to the end of the value, not decode it.
  // Decode any provided as a fallback.
  return decodeAny(bytes, start, end, name);
}

/**
 * @param {Uint8Array} bytes
 * @param {object} options
 * @param {string} [options.name]
 * @param {number} [options.start]
 * @param {number} [options.end]
 */
export function decodeSyrup(bytes, options = {}) {
  const { start = 0, end = bytes.byteLength, name = '<unknown>' } = options;
  if (end > bytes.byteLength) {
    throw Error(
      `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${bytes.byteLength}`,
    );
  }
  const { start: next, value } = decodeAny(bytes, start, end, name);
  if (next !== end) {
    throw Error(
      `Unexpected trailing bytes after Syrup, length = ${end - next}`,
    );
  }
  return value;
}

class SyrupParser {
  constructor(bytes, options) {
    this.bytes = bytes;
    this.state = {
      start: options.start ?? 0,
      end: options.end ?? bytes.byteLength,
      name: options.name ?? '<unknown>',
    };
  }
  next() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const { start: next, value } = decodeAny(this.bytes, start, end, name);
    this.state.start = next;
    return value;
  }
  skip() {
    const { start, end, name } = this.state;
    const { start: next } = seekAny(this.bytes, start, end, name);
    this.state.start = next;
  }
  peekType() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const { type, start: next } = peekType(this.bytes, start, end, name);
    return { type, start: next };
  }
  nextType() {
    const { start, end, name } = this.state;
    const { type, start: next } = peekType(this.bytes, start, end, name);
    this.state.start = next;
    return { type, start: next };
  }
  enterRecord() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const cc = this.bytes[start];
    if (cc !== RECORD_START) {
      throw Error(
        `Unexpected character ${JSON.stringify(
          String.fromCharCode(cc),
        )} at index ${start} of ${name}`,
      );
    }
    this.state.start = start + 1;
  }
  exitRecord() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const cc = this.bytes[start];
    if (cc !== RECORD_END) {
      throw Error(
        `Unexpected character ${JSON.stringify(String.fromCharCode(cc))}, Syrup records must end with "}", got ${JSON.stringify(String.fromCharCode(cc))} at index ${start} of ${name}`,
      );
    }
    this.state.start = start + 1;
  }
  nextRecordLabel() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const { start: next, value } = decodeSymbol(this.bytes, start, end, name);
    this.state.start = next;
    return value;
  }
  enterDictionary() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const cc = this.bytes[start];
    if (cc !== DICT_START) {
      throw Error(
        `Unexpected character ${JSON.stringify(
          String.fromCharCode(cc),
        )} at index ${start} of ${name}`,
      );
    }
    this.state.start = start + 1;
  }
  exitDictionary() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const cc = this.bytes[start];
    if (cc !== DICT_END) {
      throw Error(
        `Unexpected character ${JSON.stringify(
          String.fromCharCode(cc),
        )} at index ${start} of ${name}`,
      );
    }
    this.state.start = start + 1;
  }
  nextDictionaryKey() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const { start: next, value } = decodeDictionaryKey(this.bytes, start, end, name);
    this.state.start = next;
    return value;
  }
  nextDictionaryValue() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const { start: next, value } = decodeAny(this.bytes, start, end, name);
    this.state.start = next;
    return value;
  }
  *iterateDictionaryEntries() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    let next = start;
    while (next < end) {
      const cc = this.bytes[next];
      if (cc === DICT_END) {
        break;
      }
      const key = this.nextDictionaryKey();
      const value = this.nextDictionaryValue();
      yield { key, value };
    }
  }
  *seekDictionaryEntries() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    let next = start;
    while (next < end) {
      const cc = this.bytes[next];
      if (cc === DICT_END) {
        this.state.start = next + 1;
        break;
      }
      const { start: afterKey } = seekDictionaryKey(this.bytes, next, end, name);
      const { start: afterValue } = seekAny(this.bytes, afterKey, end, name);
      yield { key: next, value: afterKey, start: afterValue };
      next = afterValue;
      this.state.start = next;
    }
  }
  enterList() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const cc = this.bytes[start];
    if (cc !== LIST_START) {
      throw Error(
        `Unexpected character ${JSON.stringify(String.fromCharCode(cc))}, Syrup lists must start with "[", got ${JSON.stringify(String.fromCharCode(cc))} at index ${start} of ${name}`,
      );
    }
    this.state.start = start + 1;
  }
  exitList() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const cc = this.bytes[start];
    if (cc !== LIST_END) {
      throw Error(
        `Unexpected character ${JSON.stringify(String.fromCharCode(cc))}, Syrup lists must end with "]", got ${JSON.stringify(String.fromCharCode(cc))} at index ${start} of ${name}`,
      );
    }
    this.state.start = start + 1;
  }
  nextListValue() {
    const { start, end, name } = this.state;
    const { start: next, value } = decodeAny(this.bytes, start, end, name);
    this.state.start = next;
    return value;
  }
  enterSet() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const cc = this.bytes[start];
    if (cc !== SET_START) {
      throw Error(
        `Unexpected character ${JSON.stringify(String.fromCharCode(cc))}, Syrup sets must start with "#", got ${JSON.stringify(String.fromCharCode(cc))} at index ${start} of ${name}`,
      );
    }
    this.state.start = start + 1;
  }
  exitSet() {
    const { start, end, name } = this.state;
    if (end > this.bytes.byteLength) {
      throw Error(
        `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
      );
    }
    const cc = this.bytes[start];
    if (cc !== SET_END) {
      throw Error(
        `Unexpected character ${JSON.stringify(String.fromCharCode(cc))}, Syrup sets must end with "$", got ${JSON.stringify(String.fromCharCode(cc))} at index ${start} of ${name}`,
      );
    }
    this.state.start = start + 1;
  }
  nextSetValue() {
    const { start, end, name } = this.state;
    const { start: next, value } = decodeAny(this.bytes, start, end, name);
    this.state.start = next;
    return value;
  }
}

export function parseSyrup(bytes, options = {}) {
  const { start = 0, end = bytes.byteLength, name = '<unknown>' } = options;
  if (end > bytes.byteLength) {
    throw Error(
      `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${bytes.byteLength}`,
    );
  }
  return new SyrupParser(bytes, options);
}
