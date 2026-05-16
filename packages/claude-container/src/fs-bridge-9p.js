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
 * Bridge an Endo filesystem capability to a 9P2000.L UDS endpoint
 * (DESIGN.md §5.7). QEMU's `-chardev socket,server=off` connects from
 * the host side; this bridge accept()s and serves the resulting stream.
 *
 * v1 implements only the operations needed to mount and read the
 * workspace from inside the guest. Mutating ops are best-effort against
 * the FS capability's `writeFile/mkdir/unlink/rename` surface, and
 * unsupported operations return Rlerror(ENOSYS) so the guest VFS
 * surfaces a clean errno.
 *
 * The FS capability is expected to expose (subset of):
 *   stat(path) → { isDirectory: boolean, size: number, mtimeMs: number }
 *   readDir(path) → string[]
 *   readFile(path) → Uint8Array | Buffer
 *   writeFile(path, bytes) → void
 *   mkdir(path) → void
 *   unlink(path) → void
 *   rename(from, to) → void
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
