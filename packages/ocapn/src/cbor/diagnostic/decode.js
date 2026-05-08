// @ts-check

/**
 * @file CBOR Diagnostic Notation decoder.
 *
 * Parses human-readable diagnostic notation (RFC 8949 Appendix G)
 * into JavaScript values.
 */

import { hexToBytes } from './util.js';

/**
 * Parse array elements from diagnostic notation
 * @param {string} inner
 * @param {function(string): any} decodeValue
 * @returns {any[]}
 */
function parseArrayElements(inner, decodeValue) {
  const elements = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (char === '[' || char === '{' || char === '(') {
      depth += 1;
      current += char;
    } else if (char === ']' || char === '}' || char === ')') {
      depth -= 1;
      current += char;
    } else if (char === ',' && depth === 0) {
      elements.push(decodeValue(current.trim()));
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    elements.push(decodeValue(current.trim()));
  }

  return elements;
}

/**
 * Parse map pairs from diagnostic notation
 * @param {string} inner
 * @param {function(string): any} decodeValue
 * @returns {Record<string, any>}
 */
function parseMapPairs(inner, decodeValue) {
  const result = {};
  let depth = 0;
  let current = '';
  let key = null;
  let expectingValue = false;

  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (char === '[' || char === '{' || char === '(') {
      depth += 1;
      current += char;
    } else if (char === ']' || char === '}' || char === ')') {
      depth -= 1;
      current += char;
    } else if (char === ':' && depth === 0 && !expectingValue) {
      key = decodeValue(current.trim());
      current = '';
      expectingValue = true;
    } else if (char === ',' && depth === 0) {
      if (key !== null) {
        result[String(key)] = decodeValue(current.trim());
      }
      key = null;
      current = '';
      expectingValue = false;
    } else {
      current += char;
    }
  }

  if (key !== null && current.trim()) {
    result[String(key)] = decodeValue(current.trim());
  }

  return result;
}

/**
 * Decode diagnostic notation to JavaScript values.
 *
 * This is a simplified parser suitable for test validation.
 * It produces JavaScript approximations of CBOR values.
 *
 * @param {string} diagnostic - Diagnostic notation string
 * @returns {any} Parsed value
 */
export function decode(diagnostic) {
  const trimmed = diagnostic.trim();

  // Simple values
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;
  if (trimmed === 'NaN') return NaN;
  if (trimmed === 'Infinity') return Infinity;
  if (trimmed === '-Infinity') return -Infinity;

  // Hex byte string: h'...'
  const hexMatch = trimmed.match(/^h'([0-9a-fA-F]*)'$/);
  if (hexMatch) {
    return hexToBytes(hexMatch[1]);
  }

  // Text string: "..."
  const stringMatch = trimmed.match(/^"(.*)"$/s);
  if (stringMatch) {
    return stringMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  // Integer (possibly negative, possibly bigint)
  if (/^-?\d+$/.test(trimmed)) {
    return BigInt(trimmed);
  }

  // Float
  if (/^-?\d+\.\d+$/.test(trimmed) || /^-?\d+[eE][+-]?\d+$/.test(trimmed)) {
    return parseFloat(trimmed);
  }
  if (trimmed === '-0.0') {
    return -0;
  }

  // Tagged value: tag(content)
  const tagMatch = trimmed.match(/^(\d+)\((.+)\)$/s);
  if (tagMatch) {
    const tag = BigInt(tagMatch[1]);
    const content = decode(tagMatch[2]);
    return { tag, content };
  }

  // Array: [...]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return [];
    return parseArrayElements(inner, decode);
  }

  // Map: {...}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return {};
    return parseMapPairs(inner, decode);
  }

  throw new Error(`Cannot parse diagnostic: ${trimmed}`);
}

/**
 * Alias for backwards compatibility
 * @deprecated Use `decode` instead
 */
export const parseDiagnostic = decode;
