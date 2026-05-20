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
 * Bridge an `@endo/remote-fs` `Filesystem` capability to a 9P2000.L
 * UDS endpoint. Anyone speaking 9P over a Unix domain socket — QEMU
 * with `-chardev socket,server=off`, Linux v9fs with `mount -t 9p`,
 * `diod`, etc. — can connect and traverse the FS the cap projects.
 *
 * The bridge consumes the typed `Directory` / `File` surface of
 * remote-fs, which gives it pipelinable lookup chains (the kernel's
 * `Twalk` for an N-segment path lands as ONE batch of `lookup`
 * calls), stream-based byte I/O via `@endo/exo-stream`'s
 * `PassableBytesReader`/`PassableBytesWriter`, and eager `qid`
 * carrying. See `src/server.js` for the 9P message → cap call
 * mapping.
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
