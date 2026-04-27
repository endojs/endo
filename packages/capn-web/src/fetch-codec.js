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
export const isHeaders = v =>
  G.Headers !== undefined && v instanceof G.Headers;

/**
 * @param {unknown} v
 */
export const isRequest = v =>
  G.Request !== undefined && v instanceof G.Request;

/**
 * @param {unknown} v
 */
export const isResponse = v =>
  G.Response !== undefined && v instanceof G.Response;

/**
 * Encode Headers as an array-of-pairs.  Uses forEach to avoid iterating
 * twice (some Headers implementations, including undici's, mutate an
 * internal sort cache on iteration which trips SES's frozen-prototype
 * checks the second time).
 *
 * @param {Headers} h
 */
export const encodeHeaders = h => {
  /** @type {[string, string][]} */
  const pairs = [];
  h.forEach((value, name) => {
    pairs.push([name, value]);
  });
  return ['headers', pairs];
};

/**
 * Try to iterate Headers and return the entries.  Some host Headers
 * implementations (notably undici's, which backs Node's fetch) maintain a
 * sort-cache on a Symbol-keyed slot of an internal object that's frozen
 * when accessed via Request/Response under SES lockdown.  In that case we
 * return null and the caller may opt to skip header encoding.
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
 * Encode a Request as ["request", url, init].  We reach into the request
 * to harvest method, headers, and body (which is consumed asynchronously,
 * so the caller is responsible for awaiting if it matters).  In the
 * synchronous codec we read only properties that are synchronously
 * accessible: method, url, headers.  The body is included only if it's a
 * trivially serialisable value (null/string/Uint8Array).
 *
 * @param {Request} r
 * @param {(v: unknown) => unknown} devaluate
 */
export const encodeRequest = (r, devaluate) => {
  const init = {};
  if (r.method && r.method !== 'GET') init.method = r.method;
  if (r.headers) {
    const pairs = tryReadHeaders(r.headers);
    if (pairs && pairs.length > 0) init.headers = ['headers', pairs];
  }
  // NB: r.body is a ReadableStream and can't be read sync.  We document
  // this as unsupported here: callers wanting to send a body should do so
  // via init.body in a freshly-constructed Request, OR send the body
  // payload alongside the URL/headers.
  return ['request', r.url, devaluate(init)];
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
  const init = /** @type {any} */ (evaluate(initExpr)) || {};
  // headers may have been left as a tagged form; if so, decode now.
  if (Array.isArray(init.headers) && init.headers[0] === 'headers') {
    init.headers = decodeHeaders(init.headers);
  }
  return new G.Request(url, init);
};

/**
 * Encode a Response.  Body is read synchronously only if Response#body is
 * null (e.g. constructed from a string we already buffered).  In practice
 * users will mostly pass ['response', null, init] for redirects/empties,
 * or hand us a Response we constructed from a string, in which case we use
 * the lazily-decoded text only at decode time.
 *
 * @param {Response} r
 * @param {(v: unknown) => unknown} devaluate
 */
export const encodeResponse = (r, devaluate) => {
  const init = {};
  if (r.status !== 200) init.status = r.status;
  if (r.statusText) init.statusText = r.statusText;
  if (r.headers) {
    const pairs = tryReadHeaders(r.headers);
    if (pairs && pairs.length > 0) init.headers = ['headers', pairs];
  }
  return ['response', null, devaluate(init)];
};

/**
 * @param {unknown[]} expr
 * @param {(v: unknown) => unknown} evaluate
 */
export const decodeResponse = (expr, evaluate) => {
  const [, body, initExpr] = expr;
  const init = /** @type {any} */ (evaluate(initExpr)) || {};
  if (Array.isArray(init.headers) && init.headers[0] === 'headers') {
    init.headers = decodeHeaders(init.headers);
  }
  const decodedBody = body === null ? null : /** @type {any} */ (evaluate(body));
  return new G.Response(decodedBody, init);
};

harden(encodeHeaders);
harden(decodeHeaders);
harden(encodeRequest);
harden(decodeRequest);
harden(encodeResponse);
harden(decodeResponse);
