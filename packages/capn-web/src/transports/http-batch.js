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
//
// The transport stays open across batches: each new outgoing message
// schedules another POST.  Call `transport.abort()` (or end the session) to
// stop the loop.

/* global setTimeout */
import harden from '@endo/harden';

/**
 * @param {string} url
 * @param {object} [opts]
 * @param {(input: any, init: any) => Promise<any>} [opts.fetch]  Fetch
 *   implementation; defaults to globalThis.fetch.
 * @param {Record<string, string>} [opts.headers]  Additional request headers.
 * @param {(reason: unknown) => void} [opts.onError]  Optional callback for
 *   transport-level errors (network failures, non-2xx responses).  By default
 *   such errors close the transport (waking pending `receive()` callers with
 *   `null`) so the session sees end-of-stream.
 * @returns {import('../types.js').RpcTransport}
 */
export const makeHttpBatchTransport = (url, opts = {}) => {
  // eslint-disable-next-line no-undef
  const fetchFn = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchFn) {
    throw new Error('makeHttpBatchTransport: no fetch available');
  }
  const baseHeaders = opts.headers || {};
  const onError = opts.onError;

  /** @type {string[]} */
  const outBuf = [];
  /** @type {string[]} */
  const inBuf = [];
  /** @type {Array<(s: string | null) => void>} */
  const waiters = [];
  let closed = false;
  let scheduled = false;

  // Forward declared so drain() can refer to it; defined just below.
  /** @type {() => void} */
  let scheduledDrain;

  const closeWith = reason => {
    if (closed) return;
    closed = true;
    for (const w of waiters.splice(0)) w(null);
    if (onError && reason !== undefined) {
      try {
        onError(reason);
      } catch (_e) {
        /* swallow */
      }
    }
  };

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
      closeWith(e);
      return;
    }
    if (!res || res.ok === false) {
      const status = res && res.status;
      const statusText = res && res.statusText;
      closeWith(
        new Error(
          `HTTP batch request failed: ${status || 'no response'} ${statusText || ''}`.trim(),
        ),
      );
      return;
    }
    let text;
    try {
      text = /** @type {string} */ (await res.text());
    } catch (e) {
      closeWith(e);
      return;
    }
    if (text.length > 0) {
      for (const line of text.split('\n')) {
        const w = waiters.shift();
        if (w) w(line);
        else inBuf.push(line);
      }
    }
    // The transport stays open: if more messages have queued during the
    // round-trip, schedule another drain.  Otherwise we just sit waiting
    // for the next send.
    if (outBuf.length > 0 && !scheduled) {
      scheduled = true;
      setTimeout(scheduledDrain, 0);
    }
  };

  // Wrap drain() so an unobserved rejection from the fetch chain can never
  // escape as an unhandled rejection.
  scheduledDrain = () => {
    drain().catch(e => closeWith(e));
  };

  return harden({
    send: m => {
      if (closed) return;
      outBuf.push(m);
      if (!scheduled) {
        scheduled = true;
        setTimeout(scheduledDrain, 0);
      }
    },
    receive: () => {
      if (inBuf.length > 0) return Promise.resolve(inBuf.shift());
      if (closed) return Promise.resolve(null);
      return new Promise(resolve => waiters.push(resolve));
    },
    abort: () => {
      closeWith(undefined);
    },
  });
};
