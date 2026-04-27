// WebSocket transport for Cap'n Web.  One text frame per RPC message.
//
// `socket` must implement the standard browser WebSocket interface:
//   - send(string): void
//   - addEventListener('message', listener): listener receives { data }
//   - addEventListener('close', listener): close event
//   - addEventListener('error', listener): error event
//   - close(code?, reason?): void
//
// Works with the browser's native WebSocket, with `ws` library on Node, and
// Cloudflare Workers' WebSocket.

import harden from '@endo/harden';

/**
 * @param {any} socket
 * @returns {import('../types.js').RpcTransport}
 */
export const makeWebSocketTransport = socket => {
  /** @type {string[]} */
  const buf = [];
  /** @type {Array<(s: string | null) => void>} */
  const waiters = [];
  let closed = false;
  /** @type {unknown} */
  let closeReason;

  const onMessage = ev => {
    const data = typeof ev.data === 'string' ? ev.data : String(ev.data);
    const w = waiters.shift();
    if (w) {
      w(data);
      return;
    }
    buf.push(data);
  };

  const onClose = () => {
    closed = true;
    for (const w of waiters.splice(0)) w(null);
  };

  const onError = ev => {
    closeReason = ev?.error || new Error('websocket error');
  };

  socket.addEventListener('message', onMessage);
  socket.addEventListener('close', onClose);
  socket.addEventListener('error', onError);

  // If the socket isn't open yet, queue sends until it is.
  /** @type {string[]} */
  const pendingSends = [];
  const READY_OPEN = 1;
  const trySend = m => {
    if (socket.readyState === READY_OPEN) {
      socket.send(m);
    } else {
      pendingSends.push(m);
    }
  };
  if (socket.readyState !== READY_OPEN && socket.addEventListener) {
    socket.addEventListener('open', () => {
      while (pendingSends.length) {
        const m = pendingSends.shift();
        if (m !== undefined) socket.send(m);
      }
    });
  }

  return harden({
    send: m => {
      if (closed) return;
      trySend(m);
    },
    receive: () => {
      if (buf.length > 0) return Promise.resolve(buf.shift());
      if (closed) return Promise.resolve(null);
      return new Promise(resolve => waiters.push(resolve));
    },
    abort: reason => {
      if (closed) return;
      closed = true;
      try {
        socket.close(3000, typeof reason === 'string' ? reason : 'abort');
      } catch (_e) {
        /* ignore */
      }
      // closeReason captured for diagnostics; not currently surfaced.
      closeReason = closeReason || reason;
    },
  });
};
