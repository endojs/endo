// @ts-check

import net from 'node:net';
import { chmod, unlink } from 'node:fs/promises';

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

import { serveConnection } from './server.js';

const BridgeInterface = M.interface('FsBridge9p', {
  start: M.call().returns(M.promise()),
  stop: M.call().returns(M.promise()),
});

/**
 * Bridge an `@endo/endo-fs` `Filesystem` capability to a 9P2000.L
 * UDS endpoint. Anyone speaking 9P over a Unix domain socket — QEMU
 * with `-chardev socket,server=off`, Linux v9fs with `mount -t 9p`,
 * `diod`, etc. — can connect and traverse the FS the cap projects.
 *
 * The bridge consumes the typed `Directory` / `File` surface of
 * endo-fs, which gives it pipelinable lookup chains (the kernel's
 * `Twalk` for an N-segment path dispatches as one batch of `lookup`
 * messages through CapTP's eventual-send queue) and stream-based
 * byte I/O via `@endo/exo-stream`'s `PassableBytesReader` /
 * `PassableBytesWriter`. Each node's `qid` is pipelined alongside
 * the `lookup` that produced its parent cap so the discovery
 * shares the walk's round-trip — `getQid()` is sync on the
 * responder but costs one RTT across CapTP if issued separately
 * (`@endo/endo-fs/DESIGN.md` §4.10). `src/server.js` has the 9P
 * message → cap call mapping.
 *
 * @param {{
 *   fs: import('@endo/eventual-send').ERef<any>,
 *   socketPath: string,
 * }} opts
 */
export const makeFsBridge9p = ({ fs, socketPath }) => {
  /** @type {import('node:net').Server | null} */
  let server = null;
  /** @type {Set<import('node:net').Socket>} */
  const sockets = new Set();
  let started = false;
  let stopped = false;
  // One AbortController per bridge instance: `stop()` aborts it,
  // and every active `serveConnection` listens for the abort to
  // short-circuit any in-flight dispatch. Without this signal, a
  // long-running awaited op inside a dispatcher would have to
  // wait for the socket-close cascade before halting.
  const cancel = new AbortController();

  return makeExo('FsBridge9p', BridgeInterface, {
    async start() {
      if (started) return;
      started = true;
      await unlink(socketPath).catch(() => {});
      server = net.createServer({ allowHalfOpen: false }, sock => {
        sockets.add(sock);
        sock.on('close', () => sockets.delete(sock));
        serveConnection({ fs, socket: sock, signal: cancel.signal });
      });
      // Install a startup-only error listener that we explicitly
      // remove on success — otherwise its `once` registration sits
      // around resolved-promise-already, swallowing every later
      // server-level error event with no observable effect.
      const startupError = /** @type {(e: Error) => void} */ (
        reject => err => reject(err)
      );
      await new Promise((resolve, reject) => {
        const onStartupError = startupError(reject);
        const srv = /** @type {import('node:net').Server} */ (server);
        srv.once('error', onStartupError);
        srv.listen(socketPath, () => {
          srv.removeListener('error', onStartupError);
          resolve(undefined);
        });
      });
      // After listen() resolved, install a long-lived error handler
      // so post-startup `'error'` events surface (and don't crash
      // the process via Node's default unhandled-error throw).
      server?.on('error', err => {
        // eslint-disable-next-line no-console
        console.error('[9p] fs-bridge server error', err);
      });
      // 0600: the 9P bridge exposes the full authority of the FS
      // capability projected through it. Anyone who can connect can
      // exercise that authority; restrict to the owning UID only.
      await chmod(socketPath, 0o600);
    },

    async stop() {
      if (stopped) return;
      stopped = true;
      // Signal every active connection first so dispatches in
      // flight see `closed = true` on the next await, *before*
      // we tear the sockets out from under them.
      cancel.abort();
      for (const sock of sockets) sock.destroy();
      sockets.clear();
      if (server) {
        await new Promise(resolve => server?.close(() => resolve(undefined)));
        server = null;
      }
      await unlink(socketPath).catch(() => {});
    },
  });
};
harden(makeFsBridge9p);
