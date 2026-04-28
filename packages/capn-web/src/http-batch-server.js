// Server-side HTTP batch helper for Cap'n Web.
//
// Processes one HTTP-batch round trip:
//   - parses the request body (\n-joined RPC messages)
//   - feeds those messages into a fresh session against `localMain`
//   - waits for the session to drain (no outstanding answers / settles)
//   - returns the captured outgoing messages joined with \n
//
// Two flavours are exported:
//
//   processHttpBatchBody(bodyText, opts)
//     The protocol-only kernel: takes a body string, returns a body string.
//     Use this if your host gives you the request body as a string and you
//     need full control over the HTTP response.
//
//   handleHttpBatchRequest(request, opts)
//     A thin Fetch-API wrapper: takes a `Request`, returns a `Response`.
//     Suitable for Cloudflare Workers, Bun, and any environment with the
//     standard `fetch` types.

/* global Response */
import harden from '@endo/harden';

import { makeCapnWebSession } from './session.js';

/**
 * @typedef {object} ServerBatchOptions
 * @property {unknown} localMain
 *   The local "main" interface the client reaches as `getRemoteMain()`.
 * @property {boolean} [gcImports]
 *   Whether the per-request session uses weak imports.  Default false —
 *   batch sessions are short-lived and don't need GC.
 * @property {(reason?: unknown) => void} [onAbort]
 */

/**
 * Make an in-memory transport that feeds preset input lines and collects
 * outgoing lines.  Used by both helpers below.
 *
 * @param {string[]} inputLines
 */
const makeBatchTransport = inputLines => {
  /** @type {string[]} */
  const outputLines = [];
  /** @type {Array<(s: string | null) => void>} */
  const waiters = [];
  let closed = false;
  const transport = harden({
    send: m => {
      if (closed) return;
      outputLines.push(m);
    },
    receive: () => {
      if (inputLines.length > 0) return Promise.resolve(inputLines.shift());
      if (closed) return Promise.resolve(null);
      return new Promise(resolve => waiters.push(resolve));
    },
    abort: () => {
      closed = true;
      for (const w of waiters.splice(0)) w(null);
    },
  });
  const close = () => transport.abort();
  return { transport, outputLines, close };
};

/**
 * Run one HTTP-batch round trip.  Resolves to the response body (the
 * \n-joined outgoing RPC messages).
 *
 * @param {string} bodyText
 * @param {ServerBatchOptions} opts
 * @returns {Promise<string>}
 */
export const processHttpBatchBody = async (bodyText, opts) => {
  const { localMain, gcImports = false, onAbort } = opts;
  // Empty body = zero messages.  Filter empty trailing lines defensively.
  const inputLines =
    bodyText && bodyText.length > 0
      ? bodyText.split('\n').filter(line => line.length > 0)
      : [];
  const { transport, outputLines, close } = makeBatchTransport(inputLines);
  const session = makeCapnWebSession(transport, {
    localMain,
    gcImports,
    onAbort,
  });
  try {
    await session.drain();
  } finally {
    close();
    session.abort();
  }
  return outputLines.join('\n');
};
harden(processHttpBatchBody);

/**
 * Fetch-API wrapper: take a `Request`, return a `Response`.  The response
 * has Content-Type `text/plain; charset=utf-8` and the same \n-joined
 * format the client transport expects.
 *
 * @param {Request} request
 * @param {ServerBatchOptions} opts
 * @returns {Promise<Response>}
 */
export const handleHttpBatchRequest = async (request, opts) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { allow: 'POST' },
    });
  }
  const body = await request.text();
  const respBody = await processHttpBatchBody(body, opts);
  return new Response(respBody, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
harden(handleHttpBatchRequest);
