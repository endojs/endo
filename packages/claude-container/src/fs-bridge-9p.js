// @ts-check

import net from 'node:net';
import { chmod, unlink } from 'node:fs/promises';

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

import { serveConnection } from './9p/server.js';

const BridgeInterface = M.interface('FsBridge9p', {
  start: M.call().returns(M.promise()),
  stop: M.call().returns(M.promise()),
});

/**
 * Bridge a remote-fs `Filesystem` capability to a 9P2000.L UDS endpoint
 * (DESIGN.md §5.7). QEMU's `-chardev socket,server=off` connects from
 * the host side; this bridge accept()s and serves the resulting stream.
 *
 * As of F14 (the R1 milestone in ENDO-INTEGRATION.md §9), the FS
 * surface this bridge speaks to is `@endo/remote-fs`'s `Filesystem`.
 * That gives the bridge pipelinable lookup chains, stream-based byte
 * I/O via `@endo/exo-stream`, and a typed `Directory`/`File`
 * distinction at `lookup` time. See `src/9p/server.js` for the
 * 9P message → cap call mapping.
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

  return makeExo('FsBridge9p', BridgeInterface, {
    async start() {
      if (started) return;
      started = true;
      await unlink(socketPath).catch(() => {});
      server = net.createServer({ allowHalfOpen: false }, sock => {
        sockets.add(sock);
        sock.on('close', () => sockets.delete(sock));
        serveConnection({ fs, socket: sock });
      });
      await new Promise((resolve, reject) => {
        server?.once('error', reject);
        server?.listen(socketPath, () => resolve(undefined));
      });
      // 0600: the 9P bridge exposes the full authority of the FS
      // capability projected through it. Anyone who can connect can
      // exercise that authority; restrict to the owning UID only.
      await chmod(socketPath, 0o600);
    },

    async stop() {
      if (stopped) return;
      stopped = true;
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
