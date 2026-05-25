// Evaluator: turn a Cap'n Web wire expression into a live JS value.
//
// This is the dual of `devaluate.js`.  Reference forms (["import", id],
// ["pipeline", id], ["export", id], ["promise", id]) consult the session's
// stub tables and either reuse an existing entry or allocate a new stub.

import harden from '@endo/harden';

import { decodeSpecial, isSpecialTag, isRefTag } from './special-values.js';
import { decodeHeaders, decodeRequest, decodeResponse } from './fetch-codec.js';
import { importWritableStream, importReadableStream } from './streams.js';
import { isForbiddenKey } from './path-keys.js';

/**
 * @typedef {object} EvaluatorContext
 * @property {(id: number) => object} getOrMakePresence
 *   Return the presence stub at the given id, creating one if needed.
 * @property {(id: number) => Promise<unknown>} getOrMakePromise
 *   Return the promise stub at the given id, creating one if needed.
 * @property {(id: number) => unknown} getExportValue
 *   Return the locally-hosted value at the given (positive or negative) id.
 *   Used for ["import", id] / ["pipeline", id] referring to OUR exports
 *   (sender's imports = our exports).
 * @property {(id: number) => object | undefined} [consumePipeReadable]
 *   For pipe-style stream exports (allocated via an incoming `["pipe"]`),
 *   return and clear the readable side.  Returns undefined if the export
 *   isn't a pipe — the caller falls back to the stub-based readable.
 */

/**
 * @param {EvaluatorContext} ctx
 */
export const makeEvaluator = ctx => {
  /**
   * @param {string} tag
   * @param {unknown[]} rest
   */
  const evaluateRef = (tag, rest) => {
    if (tag === 'import' || tag === 'pipeline') {
      const [id, path, args] = rest;
      if (typeof id !== 'number') {
        throw new TypeError(`${tag} id must be a number`);
      }
      // Sender's perspective: ["import", id] refers to id in the sender's
      // imports table, which is OUR exports table — regardless of sign.
      // (The sign tells us which side allocated the id; for lookup, both
      // signs land in our exports.)
      if (path === undefined && args === undefined) {
        return ctx.getExportValue(id);
      }
      // import/pipeline can carry path/args — meaning "the value of calling
      // path(args) on the referenced target".  Only the push/stream
      // dispatcher handles this form at top level (see executePushExpression
      // in session.js); seeing it inline (e.g. nested in args) is not
      // supported.
      throw new TypeError(
        `evaluating inline pipelined ${tag} is not supported`,
      );
    }
    if (tag === 'export' || tag === 'promise') {
      const [id] = rest;
      if (typeof id !== 'number') {
        throw new TypeError(`${tag} id must be a number`);
      }
      if (tag === 'promise') return ctx.getOrMakePromise(id);
      return ctx.getOrMakePresence(id);
    }
    if (tag === 'writable' || tag === 'readable') {
      const [id] = rest;
      if (typeof id !== 'number') {
        throw new TypeError(`${tag} id must be a number`);
      }
      // Capnweb-style pipe path: a recent `["pipe"]` allocated an export
      // entry whose readable side is parked under `pipeReadable` until
      // somebody references the export.  If we have one, hand it back
      // directly — the bytes will arrive via `["push"]` chunk dispatch
      // into the export's writable hook.
      if (tag === 'readable' && ctx.consumePipeReadable) {
        const pr = ctx.consumePipeReadable(id);
        if (pr !== undefined) return pr;
      }
      // Fall back to the stub-based form: install a presence stub at the
      // id and wrap it in a real `WritableStream` / `ReadableStream` that
      // proxies write/read calls back to the peer.  In environments
      // without the WHATWG Streams classes, the wrapper falls through to
      // the bare stub.
      const stub = ctx.getOrMakePresence(id);
      if (tag === 'writable') return importWritableStream(stub);
      return importReadableStream(stub);
    }
    if (tag === 'remap') {
      throw new TypeError('remap evaluation handled separately');
    }
    throw new TypeError(`unknown ref tag: ${tag}`);
  };

  /**
   * @param {unknown} expr
   * @returns {unknown}
   */
  const evaluate = expr => {
    if (expr === null) return null;
    if (typeof expr === 'string') return expr;
    if (typeof expr === 'boolean') return expr;
    if (typeof expr === 'number') return expr;

    if (Array.isArray(expr)) {
      // Escaped array literal: [[<inner>]]
      if (expr.length === 1 && Array.isArray(expr[0])) {
        return expr[0].map(v => evaluate(v));
      }
      const [tag, ...rest] = expr;
      if (typeof tag !== 'string') {
        throw new TypeError('expression array must begin with a string tag');
      }
      if (tag === 'headers') return decodeHeaders(expr);
      if (tag === 'request') return decodeRequest(expr, evaluate);
      if (tag === 'response') return decodeResponse(expr, evaluate);
      if (isSpecialTag(tag)) {
        return decodeSpecial(expr);
      }
      if (isRefTag(tag)) {
        return evaluateRef(tag, rest);
      }
      throw new TypeError(`unknown expression tag: ${tag}`);
    }

    if (typeof expr === 'object') {
      // Plain object: recurse on values.  Skip prototype-affecting keys
      // defensively — assigning to `out["__proto__"]` walks through
      // Object.prototype's __proto__ setter and would mutate out's
      // prototype.  We use Object.defineProperty with an own-data
      // descriptor for the same reason: bracket-assignment to
      // accessor-named keys would dispatch to setters, even though
      // copyRecord-style values are normally clean.
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const [k, v] of Object.entries(/** @type {object} */ (expr))) {
        if (!isForbiddenKey(k)) {
          Object.defineProperty(out, k, {
            value: evaluate(v),
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
      }
      return out;
    }

    throw new TypeError(`unsupported expression type: ${typeof expr}`);
  };

  return harden({ evaluate });
};
