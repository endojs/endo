/* global Buffer */
// Special-value codecs for the Cap'n Web wire format.
//
// Atomic values that cannot be represented directly in JSON are wrapped in a
// type-tagged array, e.g. ["bigint", "1234"], ["date", 1700000000000].
// See https://github.com/cloudflare/capnweb/blob/main/protocol.md

import harden from '@endo/harden';

const { isNaN, isFinite } = Number;

const ERROR_TYPES = harden({
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
  AggregateError,
});

const ERROR_TYPE_NAMES = harden(Object.keys(ERROR_TYPES));

/**
 * @param {unknown} v
 * @returns {boolean}
 */
export const isSpecialNumber = v =>
  typeof v === 'number' && (isNaN(v) || !isFinite(v));

/**
 * Encode a Uint8Array to base64.  Works in both browsers (btoa) and Node.
 *
 * @param {Uint8Array} bytes
 */
export const bytesToBase64 = bytes => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  // eslint-disable-next-line no-undef
  return btoa(binary);
};

/**
 * Decode a base64 string (with or without padding) into a Uint8Array.
 *
 * @param {string} b64
 */
export const base64ToBytes = b64 => {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  // eslint-disable-next-line no-undef
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

/**
 * Try to encode a primitive/atomic value as a Cap'n Web special-value
 * expression.  Returns undefined if the value is not a special.
 *
 * @param {unknown} value
 * @returns {unknown[] | undefined}
 */
export const tryEncodeSpecial = value => {
  if (value === undefined) return ['undefined'];
  if (typeof value === 'number') {
    if (isNaN(value)) return ['nan'];
    if (value === Infinity) return ['inf'];
    if (value === -Infinity) return ['-inf'];
    return undefined;
  }
  if (typeof value === 'bigint') return ['bigint', value.toString()];
  if (value instanceof Date) return ['date', value.getTime()];
  if (value instanceof Uint8Array) return ['bytes', bytesToBase64(value)];
  if (value instanceof Error) {
    const typeName = ERROR_TYPE_NAMES.includes(value.constructor.name)
      ? value.constructor.name
      : 'Error';
    return ['error', typeName, value.message];
  }
  return undefined;
};

/**
 * Decode a special-value tagged array into a JS value.  Throws if the tag is
 * unknown.  The caller has already determined the array is a tagged value
 * (i.e. it begins with a string tag we recognise).
 *
 * @param {unknown[]} expr
 */
export const decodeSpecial = expr => {
  const [tag, ...rest] = expr;
  switch (tag) {
    case 'undefined':
      return undefined;
    case 'nan':
      return NaN;
    case 'inf':
      return Infinity;
    case '-inf':
      return -Infinity;
    case 'bigint': {
      const [s] = rest;
      if (typeof s !== 'string') throw new TypeError('bigint must be a string');
      return BigInt(s);
    }
    case 'date': {
      const [ms] = rest;
      if (typeof ms !== 'number') throw new TypeError('date must be a number');
      return new Date(ms);
    }
    case 'bytes': {
      const [s] = rest;
      if (typeof s !== 'string') throw new TypeError('bytes must be a string');
      return base64ToBytes(s);
    }
    case 'error': {
      const [typeName, message, stack] = rest;
      const Cls = /** @type {ErrorConstructor} */ (
        ERROR_TYPES[/** @type {keyof typeof ERROR_TYPES} */ (typeName)] || Error
      );
      const err = new Cls(typeof message === 'string' ? message : '');
      if (typeof stack === 'string') {
        try {
          err.stack = stack;
        } catch (_e) {
          /* ignore */
        }
      }
      return err;
    }
    default:
      throw new TypeError(`unknown special-value tag: ${String(tag)}`);
  }
};

// Tags handled by `decodeSpecial`/`tryEncodeSpecial` (atomic, leaf values).
// Compound/structural fetch tags (`headers`, `request`, `response`) are
// handled separately in `evaluate.js`/`devaluate.js` via `fetch-codec.js`,
// because they need recursive (de)valuation.  Including them here would be a
// lie that would route them through `decodeSpecial`, which doesn't know
// about them.
const SPECIAL_TAGS = harden(
  new Set([
    'undefined',
    'nan',
    'inf',
    '-inf',
    'bigint',
    'date',
    'bytes',
    'error',
  ]),
);

/**
 * @param {unknown} tag
 */
export const isSpecialTag = tag =>
  typeof tag === 'string' && SPECIAL_TAGS.has(tag);

/**
 * Tags that name reference-introducing expressions.
 *
 * - import / pipeline: reference to sender's imports = our exports.
 * - export / promise: a fresh capability the sender introduces (= our import).
 * - remap: a recorded mapper to be replayed on the peer.
 * - writable / readable: stream halves.  At the protocol level these are
 *   exactly like export / promise (positive vs negative id allocation,
 *   refcount semantics) but the receiver may interpret them as streams.
 */
const REF_TAGS = harden(
  new Set([
    'import',
    'pipeline',
    'export',
    'promise',
    'remap',
    'writable',
    'readable',
  ]),
);

/**
 * @param {unknown} tag
 */
export const isRefTag = tag => typeof tag === 'string' && REF_TAGS.has(tag);
