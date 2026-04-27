/* global globalThis */
// Fetch types: Headers, Request, Response.  Per the Cap'n Web protocol:
//
//   ["headers", [[name, value], …]]
//   ["request",  url,  init]   // init = { method?, headers?, body?, ... }
//   ["response", body, init]   // init = { status?, statusText?, headers? }
//
// Body in init / response is itself an expression — null, string, Uint8Array,
// or a stream (we don't implement streams in this revision; a body that's a
// ReadableStream throws at devaluate time).
//
// We keep these codecs as helpers that the devaluator/evaluator delegate to;
// they're factored out so they can be tested independently.

import harden from '@endo/harden';

const G = /** @type {any} */ (globalThis);

/**
 * @param {unknown} v
 */
export const isHeaders = v => G.Headers !== undefined && v instanceof G.Headers;

/**
 * @param {unknown} v
 */
export const isRequest = v => G.Request !== undefined && v instanceof G.Request;

/**
 * @param {unknown} v
 */
export const isResponse = v =>
  G.Response !== undefined && v instanceof G.Response;

/**
 * Try to iterate Headers and return the entries.  Some host Headers
 * implementations (notably undici's, which backs Node's fetch) maintain a
 * sort-cache on a Symbol-keyed slot of an internal object that's frozen
 * under SES — both for Headers attached to a Request/Response (Node 20+)
 * AND for standalone Headers (Node 18).  In that case we return null and
 * the caller may opt to fall back to an empty entry list.
 *
 * @param {Headers} h
 * @returns {[string, string][] | null}
 */
const tryReadHeaders = h => {
  try {
    /** @type {[string, string][]} */
    const pairs = [];
    h.forEach((value, name) => {
      pairs.push([name, value]);
    });
    return pairs;
  } catch (_e) {
    return null;
  }
};

/**
 * Encode Headers as an array-of-pairs.  If iteration throws (Node + SES +
 * undici interaction), we degrade gracefully to an empty headers array
 * rather than failing the whole serialisation — the caller can detect a
 * stripped Headers via `back.get(name) === null`.
 *
 * @param {Headers} h
 */
export const encodeHeaders = h => {
  const pairs = tryReadHeaders(h) || [];
  return ['headers', pairs];
};

/**
 * @param {unknown[]} expr  ["headers", [[k, v], …]]
 */
export const decodeHeaders = expr => {
  const [, pairs] = expr;
  if (!Array.isArray(pairs)) {
    throw new TypeError('headers expression must contain an array of pairs');
  }
  const h = new G.Headers();
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new TypeError('header entry must be [name, value]');
    }
    h.append(String(pair[0]), String(pair[1]));
  }
  return h;
};

/**
 * Encode a Request as ["request", url, init].  We harvest method, headers,
 * and (in future) body — all of which we leave as wire expressions
 * directly so the receiver's `evaluate()` walk sees the right shapes.
 *
 * Crucially we do NOT pass `init` through `devaluate()` here: doing so
 * would treat the already-tagged `["headers", pairs]` expression as a
 * data array and re-escape it as `[["headers", pairs]]`, breaking the
 * receiver's tag-dispatch.  `init` is built directly as a wire-shaped
 * plain object whose values are either JSON-safe primitives (method,
 * status) or already-tagged expressions (headers).
 *
 * @param {Request} r
 * @param {(v: unknown) => unknown} _devaluate  Unused; kept for
 *   forward-compat when body support is added.
 */
export const encodeRequest = (r, _devaluate) => {
  const init = {};
  if (r.method && r.method !== 'GET') init.method = r.method;
  if (r.headers) {
    const pairs = tryReadHeaders(r.headers);
    if (pairs && pairs.length > 0) init.headers = ['headers', pairs];
  }
  // r.body is a ReadableStream and can't be read sync.  We document this
  // as unsupported here: callers wanting to send a body should do so via
  // init.body in a freshly-constructed Request, OR send the body payload
  // alongside the URL/headers.
  return ['request', r.url, init];
};

/**
 * @param {unknown[]} expr
 * @param {(v: unknown) => unknown} evaluate
 */
export const decodeRequest = (expr, evaluate) => {
  const [, url, initExpr] = expr;
  if (typeof url !== 'string') {
    throw new TypeError('request url must be a string');
  }
  // The receiver's `evaluate` recurses into the plain init object and
  // dispatches on tagged sub-expressions (so `["headers", pairs]` becomes
  // a real Headers via decodeHeaders).
  const init = /** @type {any} */ (evaluate(initExpr)) || {};
  return new G.Request(url, init);
};

/**
 * Encode a Response.  Same shape as Request: a plain init object with
 * already-tagged sub-expressions.  Body is currently sent as null; a
 * caller wanting to send a buffered body should pass the body explicitly
 * as a separate argument rather than relying on this codec.
 *
 * @param {Response} r
 * @param {(v: unknown) => unknown} _devaluate  Unused; reserved.
 */
export const encodeResponse = (r, _devaluate) => {
  const init = {};
  if (r.status !== 200) init.status = r.status;
  if (r.statusText) init.statusText = r.statusText;
  if (r.headers) {
    const pairs = tryReadHeaders(r.headers);
    if (pairs && pairs.length > 0) init.headers = ['headers', pairs];
  }
  return ['response', null, init];
};

/**
 * @param {unknown[]} expr
 * @param {(v: unknown) => unknown} evaluate
 */
export const decodeResponse = (expr, evaluate) => {
  const [, body, initExpr] = expr;
  const init = /** @type {any} */ (evaluate(initExpr)) || {};
  const decodedBody =
    body === null ? null : /** @type {any} */ (evaluate(body));
  return new G.Response(decodedBody, init);
};

harden(encodeHeaders);
harden(decodeHeaders);
harden(encodeRequest);
harden(decodeRequest);
harden(encodeResponse);
harden(decodeResponse);
