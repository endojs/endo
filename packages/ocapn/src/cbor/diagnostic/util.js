// @ts-check

/**
 * @file Utility functions for CBOR Diagnostic Notation.
 *
 * Hex conversion and value comparison helpers.
 */

/**
 * Convert hex string to Uint8Array
 * @param {string} hex - Hex string (with or without spaces)
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  // Remove spaces and ensure even length
  const cleanHex = hex.replace(/\s+/g, '');
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string with optional formatting
 * @param {Uint8Array} bytes
 * @param {object} [options]
 * @param {boolean} [options.uppercase] - Use uppercase hex
 * @param {boolean} [options.spaces] - Add spaces between bytes
 * @returns {string}
 */
export function bytesToHexString(bytes, options = {}) {
  const { uppercase = false, spaces = false } = options;
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .map(s => (uppercase ? s.toUpperCase() : s));
  return spaces ? hex.join(' ') : hex.join('');
}

/**
 * Compare two values for structural equality.
 * Handles bigints, ArrayBuffers, tagged values, and nested structures.
 *
 * Useful for comparing parsed diagnostic notation values.
 *
 * @param {any} actual
 * @param {any} expected
 * @returns {boolean}
 */
export function equals(actual, expected) {
  // Handle null/undefined
  if (actual === null || actual === undefined) {
    return actual === expected;
  }

  // Handle NaN
  if (typeof actual === 'number' && Number.isNaN(actual)) {
    return typeof expected === 'number' && Number.isNaN(expected);
  }

  // Handle bigint
  if (typeof actual === 'bigint') {
    return typeof expected === 'bigint' && actual === expected;
  }

  // Handle ArrayBuffer/Uint8Array
  if (actual instanceof ArrayBuffer || actual instanceof Uint8Array) {
    const actualBytes =
      actual instanceof Uint8Array ? actual : new Uint8Array(actual);
    const expectedBytes =
      expected instanceof Uint8Array ? expected : new Uint8Array(expected);

    if (actualBytes.length !== expectedBytes.length) return false;
    for (let i = 0; i < actualBytes.length; i += 1) {
      if (actualBytes[i] !== expectedBytes[i]) return false;
    }
    return true;
  }

  // Handle arrays
  if (Array.isArray(actual)) {
    if (!Array.isArray(expected)) return false;
    if (actual.length !== expected.length) return false;
    for (let i = 0; i < actual.length; i += 1) {
      if (!equals(actual[i], expected[i])) return false;
    }
    return true;
  }

  // Handle tagged values (from parsed diagnostic notation)
  if (actual && actual.tag !== undefined) {
    return (
      expected &&
      expected.tag === actual.tag &&
      equals(actual.content, expected.content)
    );
  }

  // Handle objects
  if (typeof actual === 'object') {
    if (typeof expected !== 'object') return false;
    const actualKeys = Object.keys(actual);
    const expectedKeys = Object.keys(expected);
    if (actualKeys.length !== expectedKeys.length) return false;
    for (const key of actualKeys) {
      if (!equals(actual[key], expected[key])) return false;
    }
    return true;
  }

  // Primitives
  return Object.is(actual, expected);
}

/**
 * Alias for backwards compatibility
 * @deprecated Use `equals` instead
 */
export const diagnosticEquals = equals;
