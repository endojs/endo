// MessagePort transport for Cap'n Web.  One postMessage per RPC message.
//
// Works with browser MessageChannel ports, Web Workers, and node:
// worker_threads ports.

import harden from '@endo/harden';

/**
 * @param {any} port
 * @returns {import('../types.js').RpcTransport}
 */
export const makeMessagePortTransport = port => {
  /** @type {string[]} */
  const buf = [];
  /** @type {Array<(s: string | null) => void>} */
  const waiters = [];
  let closed = false;

  const closeAndWake = () => {
    if (closed) return;
    closed = true;
    for (const w of waiters.splice(0)) w(null);
  };

  const handler = ev => {
    const data = typeof ev?.data === 'string' ? ev.data : String(ev?.data);
    const w = waiters.shift();
    if (w) {
      w(data);
      return;
    }
    buf.push(data);
  };

  if (typeof port.addEventListener === 'function') {
    // Browser-style MessagePort / Web Worker.
    port.addEventListener('message', handler);
    port.addEventListener('messageerror', closeAndWake);
    port.addEventListener('close', closeAndWake);
    if (typeof port.start === 'function') port.start();
  } else if (typeof port.on === 'function') {
    // Node worker_threads MessagePort.
    port.on('message', data => handler({ data }));
    port.on('messageerror', closeAndWake);
    port.on('close', closeAndWake);
  }

  return harden({
    send: m => {
      if (closed) return;
      // postMessage may throw synchronously if the port is closed; treat
      // any failure as a transport close so the session can recover.
      try {
        port.postMessage(m);
      } catch (_e) {
        closeAndWake();
      }
    },
    receive: () => {
      if (buf.length > 0) return Promise.resolve(buf.shift());
      if (closed) return Promise.resolve(null);
      return new Promise(resolve => waiters.push(resolve));
    },
    abort: () => {
      closeAndWake();
      try {
        if (typeof port.close === 'function') port.close();
      } catch (_e) {
        /* ignore */
      }
    },
  });
};
