// HTTP batch transport for Cap'n Web.
//
// The client buffers outgoing messages until the next macrotask, then POSTs
// them as the body, joined with "\n".  The response body is split on "\n" to
// produce the receive batch.  An empty body = zero messages.
//
// This is the "client side" of the batch transport (it issues fetch).  A
// matching server-side helper would parse a request body, run a session, and
// return the captured outgoing messages — that's typically a thin wrapper
// around `makeCapnWebSession` plus a synchronous `drain()` step; we don't
// ship one in v1 because environments differ widely.

import harden from '@endo/harden';

/**
 * @param {string} url
 * @param {object} [opts]
 * @param {(input: any, init: any) => Promise<any>} [opts.fetch]  Fetch
 *   implementation; defaults to globalThis.fetch.
 * @param {Record<string, string>} [opts.headers]  Additional request headers.
 * @returns {import('../types.js').RpcTransport}
 */
export const makeHttpBatchTransport = (url, opts = {}) => {
  // eslint-disable-next-line no-undef
  const fetchFn = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchFn) {
    throw new Error('makeHttpBatchTransport: no fetch available');
  }
  const baseHeaders = opts.headers || {};

  /** @type {string[]} */
  const outBuf = [];
  /** @type {string[]} */
  const inBuf = [];
  /** @type {Array<(s: string | null) => void>} */
  const waiters = [];
  let closed = false;
  let scheduled = false;

  const drain = async () => {
    scheduled = false;
    if (closed) return;
    if (outBuf.length === 0) return;
    const body = outBuf.splice(0).join('\n');
    let res;
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          ...baseHeaders,
        },
        body,
      });
    } catch (e) {
      closed = true;
      for (const w of waiters.splice(0)) w(null);
      throw e;
    }
    const text = await res.text();
    if (text.length > 0) {
      for (const line of text.split('\n')) {
        const w = waiters.shift();
        if (w) w(line);
        else inBuf.push(line);
      }
    }
    // After a batch, the server has typically released everything; signal
    // EOS so the session can exit cleanly.  Schedule another drain in case
    // session emitted more during processing.
    if (outBuf.length > 0 && !scheduled) {
      scheduled = true;
      // eslint-disable-next-line no-undef
      setTimeout(drain, 0);
    } else {
      closed = true;
      for (const w of waiters.splice(0)) w(null);
    }
  };

  return harden({
    send: m => {
      if (closed) return;
      outBuf.push(m);
      if (!scheduled) {
        scheduled = true;
        // eslint-disable-next-line no-undef
        setTimeout(drain, 0);
      }
    },
    receive: () => {
      if (inBuf.length > 0) return Promise.resolve(inBuf.shift());
      if (closed) return Promise.resolve(null);
      return new Promise(resolve => waiters.push(resolve));
    },
    abort: () => {
      closed = true;
      for (const w of waiters.splice(0)) w(null);
    },
  });
};
