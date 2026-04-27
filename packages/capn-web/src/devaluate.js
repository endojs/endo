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

import harden from '@endo/harden';
import { isPromise } from '@endo/promise-kit';
import { getInterfaceOf } from '@endo/pass-style';

import { tryEncodeSpecial } from './special-values.js';
import { RpcTarget } from './rpc-target.js';
import {
  isHeaders,
  isRequest,
  isResponse,
  encodeHeaders,
  encodeRequest,
  encodeResponse,
} from './fetch-codec.js';

/**
 * @param {unknown} v
 */
const isPlainObject = v => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * @param {unknown} v
 */
const isReferenceTarget = v => {
  if (v === null) return false;
  if (typeof v === 'function') return true;
  if (typeof v !== 'object') return false;
  if (v instanceof RpcTarget) return true;
  if (getInterfaceOf(v) !== undefined) return true;
  return false;
};

/**
 * @typedef {object} DevaluatorContext
 * @property {(value: object) => number | undefined} importIdOf
 *   If `value` is a remote stub from this session, returns its positive (or
 *   peer-allocated negative) id; otherwise undefined.
 * @property {(value: Promise<unknown>) => number | undefined} promiseImportIdOf
 *   Same for a promise stub.
 * @property {(value: unknown, isPromise: boolean) => number} exportValue
 *   Allocate (or reuse) a negative export id and register `value` as our
 *   export.  Returns the id.
 * @property {(promiseId: number, p: Promise<unknown>) => void} attachPromise
 *   Called when we just allocated a fresh export id for a promise.  The
 *   session will attach `.then` to send resolve/reject when settled.
 */

/**
 * @param {DevaluatorContext} ctx
 */
export const makeDevaluator = ctx => {
  /**
   * @param {unknown} value
   * @returns {unknown} a JSON-serialisable expression
   */
  const devaluate = value => {
    // 1. JSON-safe primitives pass through.
    if (value === null) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      const special = tryEncodeSpecial(value);
      return special !== undefined ? special : value;
    }

    // 2. Special atomic values that need tagging.
    const special = tryEncodeSpecial(value);
    if (special !== undefined) return special;

    // 3. Round-trip identity: if value is a presence/promise from this
    // session's imports, encode as ["import", id] / ["pipeline", id] so the
    // peer recognises it as their export.
    if (
      value !== null &&
      (typeof value === 'object' || typeof value === 'function')
    ) {
      const importId = ctx.importIdOf(/** @type {object} */ (value));
      if (importId !== undefined) {
        return [isPromise(value) ? 'pipeline' : 'import', importId];
      }
    }

    // 4. Promises: introduce a new export id with isPromise=true.
    if (isPromise(value)) {
      const id = ctx.exportValue(value, true);
      ctx.attachPromise(id, /** @type {Promise<unknown>} */ (value));
      return ['promise', id];
    }

    // 5a. Streams: WritableStream / ReadableStream are exported by reference,
    // tagged so the receiver may interpret them as streams.
    if (
      typeof globalThis !== 'undefined' &&
      /** @type {any} */ (globalThis).WritableStream &&
      value instanceof /** @type {any} */ (globalThis).WritableStream
    ) {
      const id = ctx.exportValue(value, false);
      return ['writable', id];
    }
    if (
      typeof globalThis !== 'undefined' &&
      /** @type {any} */ (globalThis).ReadableStream &&
      value instanceof /** @type {any} */ (globalThis).ReadableStream
    ) {
      const id = ctx.exportValue(value, false);
      return ['readable', id];
    }

    // 5. Reference targets: capabilities (Far/RpcTarget/function).
    if (isReferenceTarget(value)) {
      const id = ctx.exportValue(value, false);
      return ['export', id];
    }

    // 5b. Fetch types: Headers, Request, Response.
    if (isHeaders(value)) return encodeHeaders(/** @type {Headers} */ (value));
    if (isRequest(value)) {
      return encodeRequest(/** @type {Request} */ (value), devaluate);
    }
    if (isResponse(value)) {
      return encodeResponse(/** @type {Response} */ (value), devaluate);
    }

    // 6. Arrays: escape with [[…]].
    if (Array.isArray(value)) {
      const inner = value.map(v => devaluate(v));
      return [inner];
    }

    // 7. Plain objects: recurse on values.
    if (isPlainObject(value)) {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const [k, v] of Object.entries(/** @type {object} */ (value))) {
        out[k] = devaluate(v);
      }
      return out;
    }

    throw new TypeError(
      `Cannot serialize value of type ${Object.prototype.toString.call(value)}`,
    );
  };

  return harden({ devaluate });
};
