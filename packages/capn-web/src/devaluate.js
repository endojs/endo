/* global globalThis */
// Devaluator: turn a live JS value into a Cap'n Web wire expression.
//
// The output is a JSON-serialisable structure whose semantics are described
// in https://github.com/cloudflare/capnweb/blob/main/protocol.md
//
// Notably:
//   - Arrays are wrapped in another array as [[...]] (escape) to disambiguate
//     them from instruction arrays.
//   - Capabilities are encoded as ["export", -id] / ["promise", -id] (when
//     freshly introduced) or ["import", id] (when round-tripping a remote
//     reference).
//   - Special atomic values (undefined, BigInt, Date, etc.) get tagged forms.
//
// Classification dispatches in this order:
//   1. atomic specials (undefined / nan / inf / bigint / Date / Uint8Array
//      / Error) via tryEncodeSpecial
//   2. JSON-safe primitives (null, string, boolean, finite number)
//   3. host objects with explicit wire forms (Headers / Request / Response,
//      WritableStream / ReadableStream)
//   4. round-trip identity for stubs we already imported
//   5. `passStyleOf` leaf classification — used to recognise remotables
//      (Far / makeExo) and bare promises in a way that respects endo's
//      pass-style discipline.  We do NOT pass the whole value tree through
//      passStyleOf, because that's recursive and would reject any nested
//      non-passable host (Date, Uint8Array, …) that we already handle
//      ourselves.
//   6. plain arrays and records — recursed locally
//   7. anything else → "cannot serialize" error.

import harden from '@endo/harden';
import { passStyleOf } from '@endo/pass-style';

import { tryEncodeSpecial } from './special-values.js';
import {
  isHeaders,
  isRequest,
  isResponse,
  encodeHeaders,
  encodeRequest,
  encodeResponse,
} from './fetch-codec.js';
import { exportWritableStream, exportReadableStream } from './streams.js';
import { isForbiddenKey } from './path-keys.js';

const G = /** @type {any} */ (globalThis);

const isPlainObject = v => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * Try `passStyleOf` on a single value but don't let it raise — we only
 * use it for leaf classification (remotable / promise / error).  Returns
 * undefined if the value isn't passable on its own terms.
 *
 * @param {unknown} value
 */
const passStyleOfOrUndefined = value => {
  try {
    return passStyleOf(/** @type {any} */ (value));
  } catch (_e) {
    return undefined;
  }
};

/**
 * @typedef {object} DevaluatorContext
 * @property {(value: object) => number | undefined} importIdOf
 *   If `value` is a remote stub (presence or promise) from this session's
 *   imports, returns its allocator-side id; otherwise undefined.
 * @property {(value: unknown, isPromise: boolean) => number} exportValue
 *   Allocate (or reuse) a negative export id and register `value` as our
 *   export.  Returns the id.
 */

/**
 * @param {DevaluatorContext} ctx
 */
export const makeDevaluator = ctx => {
  /**
   * @param {unknown} value
   * @param {WeakSet<object>} seen  Tracks containers currently on the
   *   recursion stack to detect cycles.
   * @returns {unknown}
   */
  const devaluateInner = (value, seen) => {
    // 1. Atomic specials.
    const special = tryEncodeSpecial(value);
    if (special !== undefined) return special;

    // 2. JSON-safe primitives.
    if (value === null) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value;

    // 3. Host objects with explicit wire forms.
    if (isHeaders(value)) return encodeHeaders(/** @type {Headers} */ (value));
    if (isRequest(value)) {
      return encodeRequest(/** @type {Request} */ (value), v =>
        devaluateInner(v, seen),
      );
    }
    if (isResponse(value)) {
      return encodeResponse(/** @type {Response} */ (value), v =>
        devaluateInner(v, seen),
      );
    }
    if (G.WritableStream && value instanceof G.WritableStream) {
      const writer = exportWritableStream(
        /** @type {WritableStream} */ (value),
      );
      const id = ctx.exportValue(writer, false);
      return ['writable', id];
    }
    if (G.ReadableStream && value instanceof G.ReadableStream) {
      const reader = exportReadableStream(
        /** @type {ReadableStream} */ (value),
      );
      const id = ctx.exportValue(reader, false);
      return ['readable', id];
    }

    // 4. Round-trip identity.
    if (
      value !== null &&
      (typeof value === 'object' || typeof value === 'function')
    ) {
      const importId = ctx.importIdOf(/** @type {object} */ (value));
      if (importId !== undefined) {
        const isPromiseStub =
          typeof (/** @type {any} */ (value).then) === 'function';
        return [isPromiseStub ? 'pipeline' : 'import', importId];
      }
    }

    // 5. Pass-style leaf classification — remotable / promise / error.
    const style = passStyleOfOrUndefined(value);
    if (style === 'remotable') {
      const id = ctx.exportValue(value, false);
      return ['export', id];
    }
    if (style === 'promise') {
      const id = ctx.exportValue(value, true);
      return ['promise', id];
    }
    if (style === 'error') {
      return [
        'error',
        /** @type {any} */ (value).name || 'Error',
        /** @type {any} */ (value).message || '',
      ];
    }

    // 6. Plain shapes — locally recursed.  Detect cycles up-front: a
    //    structure that contains itself can't be serialised, and a naive
    //    recursion would never return.
    if (Array.isArray(value)) {
      if (seen.has(/** @type {object} */ (value))) {
        throw new TypeError('Cannot serialize circular reference');
      }
      seen.add(/** @type {object} */ (value));
      try {
        return [value.map(v => devaluateInner(v, seen))];
      } finally {
        seen.delete(/** @type {object} */ (value));
      }
    }
    if (isPlainObject(value)) {
      if (seen.has(/** @type {object} */ (value))) {
        throw new TypeError('Cannot serialize circular reference');
      }
      seen.add(/** @type {object} */ (value));
      try {
        /** @type {Record<string, unknown>} */
        const out = {};
        for (const [k, v] of Object.entries(/** @type {object} */ (value))) {
          if (!isForbiddenKey(k)) {
            out[k] = devaluateInner(v, seen);
          }
        }
        return out;
      } finally {
        seen.delete(/** @type {object} */ (value));
      }
    }

    // 7. Functions that aren't marked as remotables, exotic class
    //    instances, etc.  Reject with a clear message.
    if (typeof value === 'function') {
      throw new TypeError(
        `Cannot serialize bare function; wrap with Far / makeExo to expose it as a remotable.`,
      );
    }
    throw new TypeError(
      `Cannot serialize value of type ${Object.prototype.toString.call(value)}`,
    );
  };

  /**
   * @param {unknown} value
   * @returns {unknown} a JSON-serialisable expression
   */
  const devaluate = value => devaluateInner(value, new WeakSet());

  return harden({ devaluate });
};
