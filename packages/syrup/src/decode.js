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
    const value = textDecoder.decode(valueBytes);
    return { value: SyrupSymbolFor(value), type: 'symbol' };
  }
  throw Error(
    `Unexpected character ${quote(toChar(nextToken))}, at index ${bufferReader.index} of ${name}`,
  );
}

/**
 * @param {BufferReader} bufferReader
 * @param {string} name
 * @returns {any}
 */
function readAny(bufferReader, name) {
  const type = peekTypeHint(bufferReader, name);

  if (type === 'number-prefix') {
    return readNumberPrefixed(bufferReader, name).value;
  }
  if (type === 'boolean') {
    return readBoolean(bufferReader, name);
  }
  if (type === 'float64') {
    return readFloat64(bufferReader, name);
  }
  if (type === 'list') {
    return readList(bufferReader, name);
  }
  if (type === 'dictionary') {
    return readDictionary(bufferReader, name);
  }
  if (type === 'set') {
    throw Error(
      `decode Sets are not yet supported.`,
    );
  }
  if (type === 'record') {
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

// class SyrupReader {
//   constructor(bytes, options) {
//     this.bytes = bytes;
//     this.state = {
//       start: options.start ?? 0,
//       end: options.end ?? bytes.byteLength,
//       name: options.name ?? '<unknown>',
//     };
//   }
//   next() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const { start: next, value } = decodeAny(this.bytes, start, end, name);
//     this.state.start = next;
//     return value;
//   }
//   skip() {
//     const { start, end, name } = this.state;
//     const { start: next } = seekAny(this.bytes, start, end, name);
//     this.state.start = next;
//   }
//   peekType() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const { type, start: next } = peekType(this.bytes, start, end, name);
//     return { type, start: next };
//   }
//   nextType() {
//     const { start, end, name } = this.state;
//     const { type, start: next } = peekType(this.bytes, start, end, name);
//     this.state.start = next;
//     return { type, start: next };
//   }
//   enterRecord() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const cc = this.bytes[start];
//     if (cc !== RECORD_START) {
//       throw Error(
//         `Unexpected character ${JSON.stringify(
//           String.fromCharCode(cc),
//         )} at index ${start} of ${name}`,
//       );
//     }
//     this.state.start = start + 1;
//   }
//   exitRecord() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const cc = this.bytes[start];
//     if (cc !== RECORD_END) {
//       throw Error(
//         `Unexpected character ${quote(toChar(cc))}, Syrup records must end with "}", got ${quote(toChar(cc))} at index ${start} of ${name}`,
//       );
//     }
//     this.state.start = start + 1;
//   }
//   nextRecordLabel() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const { start: next, value } = decodeSymbol(this.bytes, start, end, name);
//     this.state.start = next;
//     return value;
//   }
//   enterDictionary() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const cc = this.bytes[start];
//     if (cc !== DICT_START) {
//       throw Error(
//         `Unexpected character ${JSON.stringify(
//           String.fromCharCode(cc),
//         )} at index ${start} of ${name}`,
//       );
//     }
//     this.state.start = start + 1;
//   }
//   exitDictionary() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const cc = this.bytes[start];
//     if (cc !== DICT_END) {
//       throw Error(
//         `Unexpected character ${JSON.stringify(
//           String.fromCharCode(cc),
//         )} at index ${start} of ${name}`,
//       );
//     }
//     this.state.start = start + 1;
//   }
//   nextDictionaryKey() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const { start: next, value } = decodeDictionaryKey(this.bytes, start, end, name);
//     this.state.start = next;
//     return value;
//   }
//   nextDictionaryValue() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const { start: next, value } = decodeAny(this.bytes, start, end, name);
//     this.state.start = next;
//     return value;
//   }
//   *iterateDictionaryEntries() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     let next = start;
//     while (next < end) {
//       const cc = this.bytes[next];
//       if (cc === DICT_END) {
//         break;
//       }
//       const key = this.nextDictionaryKey();
//       const value = this.nextDictionaryValue();
//       yield { key, value };
//     }
//   }
//   *seekDictionaryEntries() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     let next = start;
//     while (next < end) {
//       const cc = this.bytes[next];
//       if (cc === DICT_END) {
//         this.state.start = next + 1;
//         break;
//       }
//       const { start: afterKey } = seekDictionaryKey(this.bytes, next, end, name);
//       const { start: afterValue } = seekAny(this.bytes, afterKey, end, name);
//       yield { key: next, value: afterKey, start: afterValue };
//       next = afterValue;
//       this.state.start = next;
//     }
//   }
//   enterList() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const cc = this.bytes[start];
//     if (cc !== LIST_START) {
//       throw Error(
//         `Unexpected character ${quote(toChar(cc))}, Syrup lists must start with "[", got ${quote(toChar(cc))} at index ${start} of ${name}`,
//       );
//     }
//     this.state.start = start + 1;
//   }
//   exitList() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const cc = this.bytes[start];
//     if (cc !== LIST_END) {
//       throw Error(
//         `Unexpected character ${quote(toChar(cc))}, Syrup lists must end with "]", got ${quote(toChar(cc))} at index ${start} of ${name}`,
//       );
//     }
//     this.state.start = start + 1;
//   }
//   nextListValue() {
//     const { start, end, name } = this.state;
//     const { start: next, value } = decodeAny(this.bytes, start, end, name);
//     this.state.start = next;
//     return value;
//   }
//   enterSet() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const cc = this.bytes[start];
//     if (cc !== SET_START) {
//       throw Error(
//         `Unexpected character ${quote(toChar(cc))}, Syrup sets must start with "#", got ${quote(toChar(cc))} at index ${start} of ${name}`,
//       );
//     }
//     this.state.start = start + 1;
//   }
//   exitSet() {
//     const { start, end, name } = this.state;
//     if (end > this.bytes.byteLength) {
//       throw Error(
//         `Cannot decode Syrup with with "end" beyond "bytes.byteLength", got ${end}, byteLength ${this.bytes.byteLength}`,
//       );
//     }
//     const cc = this.bytes[start];
//     if (cc !== SET_END) {
//       throw Error(
//         `Unexpected character ${quote(toChar(cc))}, Syrup sets must end with "$", got ${quote(toChar(cc))} at index ${start} of ${name}`,
//       );
//     }
//     this.state.start = start + 1;
//   }
//   nextSetValue() {
//     const { start, end, name } = this.state;
//     const { start: next, value } = decodeAny(this.bytes, start, end, name);
//     this.state.start = next;
//     return value;
//   }

//   readString() {
//     const { start, end, name } = this.state;
//     const { start: next, value, typeCode } = decodeStringlike(this.bytes, start, end, name);
//     if (typeCode !== STRING_START) {
//       throw Error(`Unexpected type ${quote(typeCode)}, Syrup strings must start with ${quote(toChar(STRING_START))} at index ${start} of ${name}`);
//     }
//     this.state.start = next;
//     return value;
//   }
//   readInteger() {
//     const { start, end, name } = this.state;
//     const { start: next, value } = decodeInteger(this.bytes, start, end, name);
//     this.state.start = next;
//     return value;
//   }
//   readBytestring() {
//     const { start, end, name } = this.state;
//     const { start: next, value } = decodeBytestring(this.bytes, start, end, name);
//     this.state.start = next;
//     return value;
//   }
//   readBoolean() {
//     const { start, end, name } = this.state;
//     const { start: next, value } = decodeBoolean(this.bytes, start, end, name);
//     this.state.start = next;
//     return value;
//   }
//   readSymbolAsString() {
//     const { start, end, name } = this.state;
//     const { start: next, value, typeCode } = decodeStringlike(this.bytes, start, end, name);
//     if (typeCode !== SYMBOL_START) {
//       throw Error(`Unexpected type ${quote(typeCode)}, Syrup symbols must start with ${quote(toChar(SYMBOL_START))} at index ${start} of ${name}`);
//     }
//     this.state.start = next;
//     return value;
//   }
//   readOfType(typeString, opts = {}) {
//     switch (typeString) {
//       case 'symbol':
//         return this.readSymbolAsString();
//       case 'string':
//         return this.readString();
//       case 'integer':
//         return this.readInteger();
//       case 'bytestring':
//         return this.readBytestring();
//       case 'boolean':
//         return this.readBoolean();
//       default:
//         throw Error(`Unknown field type: ${JSON.stringify(typeString)}`);
//     }
//   }
// }

// export const makeSyrupReader = (bytes, options) => new SyrupReader(bytes, options);