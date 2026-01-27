// @ts-check

/**
 * @file CBOR Diagnostic Notation encoder.
 *
 * Converts CBOR bytes to human-readable diagnostic notation
 * as specified in RFC 8949 Appendix G.
 */

import { BufferReader } from '../../syrup/buffer-reader.js';

const textDecoder = new TextDecoder('utf-8', { fatal: false });

// CBOR Major Types
const MAJOR_UNSIGNED = 0;
const MAJOR_NEGATIVE = 1;
const MAJOR_BYTESTRING = 2;
const MAJOR_TEXTSTRING = 3;
const MAJOR_ARRAY = 4;
const MAJOR_MAP = 5;
const MAJOR_TAG = 6;
const MAJOR_FLOAT_SIMPLE = 7;

// Additional Info
const AI_1BYTE = 24;
const AI_2BYTE = 25;
const AI_4BYTE = 26;
const AI_8BYTE = 27;

// Simple values
const SIMPLE_FALSE = 20;
const SIMPLE_TRUE = 21;
const SIMPLE_NULL = 22;
const SIMPLE_UNDEFINED = 23;

/**
 * Parse type byte
 * @param {number} byte
 */
function parseTypeByte(byte) {
  return {
    // eslint-disable-next-line no-bitwise
    major: byte >> 5,
    // eslint-disable-next-line no-bitwise
    info: byte & 0x1f,
  };
}

/**
 * Read argument value from additional info
 * @param {BufferReader} reader
 * @param {number} info
 * @returns {bigint}
 */
function readArgument(reader, info) {
  if (info < 24) {
    return BigInt(info);
  }
  if (info === AI_1BYTE) {
    return BigInt(reader.readUint8());
  }
  if (info === AI_2BYTE) {
    return BigInt(reader.readUint16(false));
  }
  if (info === AI_4BYTE) {
    return BigInt(reader.readUint32(false));
  }
  if (info === AI_8BYTE) {
    const high = BigInt(reader.readUint32(false));
    const low = BigInt(reader.readUint32(false));
    // eslint-disable-next-line no-bitwise
    return (high << 32n) | low;
  }
  throw new Error(`Unsupported additional info: ${info}`);
}

/**
 * Convert bytes to hex string
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Escape a string for diagnostic notation
 * @param {string} str
 * @returns {string}
 */
function escapeString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Read a single CBOR value and convert to diagnostic notation
 * @param {BufferReader} reader
 * @returns {string}
 */
function readValue(reader) {
  const byte = reader.readByte();
  const { major, info } = parseTypeByte(byte);

  switch (major) {
    case MAJOR_UNSIGNED: {
      const value = readArgument(reader, info);
      return value.toString();
    }

    case MAJOR_NEGATIVE: {
      const magnitude = readArgument(reader, info);
      const value = -1n - magnitude;
      return value.toString();
    }

    case MAJOR_BYTESTRING: {
      const length = Number(readArgument(reader, info));
      const bytes = reader.read(length);
      return `h'${bytesToHex(bytes)}'`;
    }

    case MAJOR_TEXTSTRING: {
      const length = Number(readArgument(reader, info));
      const bytes = reader.read(length);
      const str = textDecoder.decode(bytes);
      return `"${escapeString(str)}"`;
    }

    case MAJOR_ARRAY: {
      const length = Number(readArgument(reader, info));
      const elements = [];
      for (let i = 0; i < length; i += 1) {
        elements.push(readValue(reader));
      }
      return `[${elements.join(', ')}]`;
    }

    case MAJOR_MAP: {
      const length = Number(readArgument(reader, info));
      const pairs = [];
      for (let i = 0; i < length; i += 1) {
        const key = readValue(reader);
        const value = readValue(reader);
        pairs.push(`${key}: ${value}`);
      }
      return `{${pairs.join(', ')}}`;
    }

    case MAJOR_TAG: {
      const tag = readArgument(reader, info);
      const content = readValue(reader);
      return `${tag}(${content})`;
    }

    case MAJOR_FLOAT_SIMPLE: {
      if (info === SIMPLE_FALSE) {
        return 'false';
      }
      if (info === SIMPLE_TRUE) {
        return 'true';
      }
      if (info === SIMPLE_NULL) {
        return 'null';
      }
      if (info === SIMPLE_UNDEFINED) {
        return 'undefined';
      }
      if (info === AI_8BYTE) {
        // Float64
        const floatBytes = reader.read(8);
        const view = new DataView(floatBytes.buffer, floatBytes.byteOffset, 8);
        const value = view.getFloat64(0, false); // big-endian

        if (Number.isNaN(value)) {
          return 'NaN';
        }
        if (!Number.isFinite(value)) {
          return value > 0 ? 'Infinity' : '-Infinity';
        }
        if (Object.is(value, -0)) {
          return '-0.0';
        }
        // Format as float (ensure decimal point)
        const str = value.toString();
        if (!str.includes('.') && !str.includes('e')) {
          return `${str}.0`;
        }
        return str;
      }
      if (info < 24) {
        return `simple(${info})`;
      }
      throw new Error(`Unsupported simple value: ${info}`);
    }

    default:
      throw new Error(`Unknown major type: ${major}`);
  }
}

/**
 * Encode CBOR bytes to diagnostic notation string.
 *
 * @param {Uint8Array} bytes - CBOR encoded data
 * @returns {string} Diagnostic notation
 */
export function encode(bytes) {
  const reader = BufferReader.fromBytes(bytes);
  return readValue(reader);
}

/**
 * Alias for backwards compatibility
 * @deprecated Use `encode` instead
 */
export const cborToDiagnostic = encode;
