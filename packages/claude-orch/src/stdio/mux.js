// @ts-check
/* global Buffer, setTimeout */
//
// Stdio multiplexer for the per-session attach channel.
//
// Wire format (DESIGN.md §6.3):
//   <streamId:8 bytes><len:4 bytes big-endian><payload:len bytes>
//
// The orchestrator's role:
//   - Bind a UDS at attachSocketPath (server) the caller connects to.
//   - Connect to stdioSocketPath (the QEMU stdio chardev, server=on).
//   - Bridge bytes between them. Caller bytes are wrapped in a frame with
//     streamId="default0" and forwarded to the guest. Guest frames are
//     demuxed by streamId; the "default0" stream goes to the caller, any
//     other streams are routed to per-stream handlers (Exec future work).
//
// 8-byte streamId is a fixed-width ASCII string. v1 uses "default0" (one
// stream); future Exec RPCs allocate "exec-NNNN" style ids.

import net from 'node:net';
import { unlink } from 'node:fs/promises';

const STREAM_ID_LEN = 8;
const HEADER_LEN = STREAM_ID_LEN + 4;
export const DEFAULT_STREAM_ID = 'default0';

/**
 * Pad/truncate to exactly 8 ASCII bytes.
 *
 * @param {string} id
 * @returns {Buffer}
 */
export const encodeStreamId = id => {
  const bytes = Buffer.alloc(STREAM_ID_LEN, 0);
  Buffer.from(id, 'ascii').copy(
    bytes,
    0,
    0,
    Math.min(id.length, STREAM_ID_LEN),
  );
  return bytes;
};
harden(encodeStreamId);

/**
 * @param {Buffer} buf
 * @returns {string}
 */
export const decodeStreamId = buf => {
  // Strip trailing NUL padding.
  let end = STREAM_ID_LEN;
  while (end > 0 && buf[end - 1] === 0) end -= 1;
  return buf.subarray(0, end).toString('ascii');
};
harden(decodeStreamId);

/**
 * Build one frame.
 *
 * @param {string} streamId
 * @param {Buffer} payload
 * @returns {Buffer}
 */
export const buildFrame = (streamId, payload) => {
  const out = Buffer.alloc(HEADER_LEN + payload.length);
  encodeStreamId(streamId).copy(out, 0);
  out.writeUInt32BE(payload.length, STREAM_ID_LEN);
  payload.copy(out, HEADER_LEN);
  return out;
};
harden(buildFrame);

/**
 * Pull as many complete frames as possible off the head of `buf` and call
 * `onFrame` for each. Returns the unconsumed tail.
 *
 * @param {Buffer} buf
 * @param {(streamId: string, payload: Buffer) => void} onFrame
 * @returns {Buffer}
 */
export const consumeFrames = (buf, onFrame) => {
  let off = 0;
  while (buf.length - off >= HEADER_LEN) {
    const len = buf.readUInt32BE(off + STREAM_ID_LEN);
    if (buf.length - off < HEADER_LEN + len) break;
    const streamId = decodeStreamId(buf.subarray(off, off + STREAM_ID_LEN));
    const payload = buf.subarray(off + HEADER_LEN, off + HEADER_LEN + len);
    onFrame(streamId, payload);
    off += HEADER_LEN + len;
  }
  return buf.subarray(off);
};
harden(consumeFrames);

/**
 * Start the stdio multiplexer for one session.
 *
 *   guest stdio chardev ←→ multiplexer ←→ caller attach UDS
 *
 *   caller writes → wrap as DEFAULT_STREAM_ID frame → guest
 *   guest emits frames → demux by streamId → DEFAULT goes to caller
 *
 * @param {{
 *   stdioSocketPath: string,
 *   attachSocketPath: string,
 *   onError?: (err: Error) => void,
 * }} opts
 */
export const makeStdioMux = ({
  stdioSocketPath,
  attachSocketPath,
  onError,
}) => {
  /** @type {net.Socket | null} */
  let stdioSocket = null;
  /** @type {net.Server | null} */
  let attachServer = null;
  /** @type {net.Socket | null} */
  let attachConn = null;
  let stdioBuf = Buffer.alloc(0);
  let stopped = false;

  const handleError = (/** @type {Error} */ e) => {
    if (onError) onError(e);
  };

  const start = async () => {
    // Caller side: bind attach UDS.
    await unlink(attachSocketPath).catch(() => {});
    attachServer = net.createServer({ allowHalfOpen: false }, conn => {
      if (attachConn) {
        conn.destroy(new Error('attach already connected'));
        return;
      }
      attachConn = conn;
      conn.on('data', chunk => {
        if (!stdioSocket) return;
        stdioSocket.write(buildFrame(DEFAULT_STREAM_ID, chunk));
      });
      conn.on('close', () => {
        attachConn = null;
      });
      conn.on('error', handleError);
    });
    await new Promise((resolve, reject) => {
      attachServer?.once('error', reject);
      attachServer?.listen(attachSocketPath, () => resolve(undefined));
    });

    // Guest side: connect to QEMU stdio chardev (server=on means QEMU is
    // listening). Retry briefly because QEMU may not have created the
    // socket yet at the moment markReady fires.
    stdioSocket = await connectWithRetry(stdioSocketPath, 5000);
    stdioSocket.on('data', chunk => {
      stdioBuf = consumeFrames(
        Buffer.concat([stdioBuf, chunk]),
        (streamId, payload) => {
          if (streamId === DEFAULT_STREAM_ID && attachConn) {
            attachConn.write(payload);
          }
          // Other streamIds (exec-*) are dropped in v1; future work.
        },
      );
    });
    stdioSocket.on('error', handleError);
    stdioSocket.on('close', () => {
      stdioSocket = null;
    });
  };

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (attachConn) attachConn.destroy();
    if (stdioSocket) stdioSocket.destroy();
    if (attachServer) {
      await new Promise(resolve =>
        attachServer?.close(() => resolve(undefined)),
      );
    }
    await unlink(attachSocketPath).catch(() => {});
  };

  return harden({ start, stop });
};
harden(makeStdioMux);

/**
 * @param {string} socketPath
 * @param {number} deadlineMs
 * @returns {Promise<net.Socket>}
 */
const connectWithRetry = (socketPath, deadlineMs) => {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.createConnection(socketPath);
      const onError = (/** @type {Error} */ err) => {
        sock.destroy();
        if (Date.now() - start > deadlineMs) {
          reject(err);
        } else {
          setTimeout(attempt, 50);
        }
      };
      sock.once('error', onError);
      sock.once('connect', () => {
        sock.off('error', onError);
        resolve(sock);
      });
    };
    attempt();
  });
};
