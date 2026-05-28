// @ts-check
/* eslint-disable no-await-in-loop */
/**
 * `FsBackend` over `node:fs/promises`.
 *
 * Path-keyed: every method takes `string[]` segments. The backend
 * joins them onto an absolute `rootPath` and rejects any access whose
 * `realpath` would escape the root (the same containment check the
 * legacy node-fs.js applies via `assertConfined`).
 *
 * Implements the 6 required methods + optional `setStat`, `fsync`,
 * `rename`, `watch`. Skips `hash` (wrap-backend synthesizes by reading
 * the whole file).
 */

import nodePath from 'node:path';
import * as fsp from 'node:fs/promises';
import { watch as fsWatch } from 'node:fs';

import { makeError, X, q } from '@endo/errors';

/**
 * @import { FsBackend, NodeKind, DirEntry } from '../backend-types.js'
 */

/**
 * @param {{ rootPath: string }} opts
 * @returns {FsBackend}
 */
export const makeNodeFsBackend = ({ rootPath }) => {
  if (typeof rootPath !== 'string' || !nodePath.isAbsolute(rootPath)) {
    throw makeError(X`rootPath must be an absolute path, got ${q(rootPath)}`);
  }
  const canonicalRoot = nodePath.normalize(rootPath);

  /** @type {string | null} */
  let cachedRootRealPath = null;
  const getRootRealPath = async () => {
    if (cachedRootRealPath !== null) return cachedRootRealPath;
    cachedRootRealPath = await fsp.realpath(canonicalRoot);
    return cachedRootRealPath;
  };

  const absOf = path => nodePath.join(canonicalRoot, ...path);

  /**
   * Verify that `absPath`'s realpath stays inside the root. For paths
   * that don't yet exist (create / mkdir cases), walk up to the
   * deepest existing ancestor and check its realpath — mirroring the
   * legacy `assertConfinedOrAncestor`.
   *
   * @param {string} absPath
   */
  const assertConfined = async absPath => {
    const rootResolved = await getRootRealPath();
    let check = absPath;
    let resolved;
    // Walk up from `check` until we find an existing ancestor; then
    // check its realpath. The loop terminates because each iteration
    // either resolves or steps up one directory (and the root has
    // no parent).
    for (;;) {
      try {
        resolved = await fsp.realpath(check);
        break;
      } catch (_e) {
        const parent = nodePath.dirname(check);
        if (parent === check) {
          throw makeError(
            X`EACCES: path escapes filesystem root: ${q(absPath)}`,
          );
        }
        check = parent;
      }
    }
    if (
      resolved !== rootResolved &&
      !resolved.startsWith(`${rootResolved}${nodePath.sep}`)
    ) {
      throw makeError(X`EACCES: path escapes filesystem root: ${q(absPath)}`);
    }
  };

  return harden({
    async kind(path) {
      const abs = absOf(path);
      try {
        await assertConfined(abs);
        const st = await fsp.stat(abs);
        if (st.isFile()) return /** @type {NodeKind} */ ('file');
        if (st.isDirectory()) return /** @type {NodeKind} */ ('directory');
        return undefined;
      } catch (e) {
        const msg = /** @type {Error} */ (e).message;
        // ENOENT and ELOOP map naturally to "no such node."
        // EACCES is also suppressed: assertConfined raises EACCES
        // when a symlink target escapes the rooted tree, and
        // suppressing it here avoids leaking out-of-sandbox path
        // existence to the holder of the Filesystem cap. (A real
        // permission error inside the sandbox is also hidden, which
        // is a less precise behavior than ideal — the trade-off
        // favors security over diagnostic clarity.)
        if (/ENOENT|EACCES|ELOOP/.test(msg)) return undefined;
        throw e;
      }
    },

    async *list(dirPath) {
      const abs = absOf(dirPath);
      await assertConfined(abs);
      let entries;
      try {
        entries = await fsp.readdir(abs, { withFileTypes: true });
      } catch (e) {
        const msg = /** @type {Error} */ (e).message;
        if (/ENOENT/.test(msg)) {
          throw makeError(X`ENOENT: ${q(dirPath.join('/'))}`);
        }
        if (/ENOTDIR/.test(msg)) {
          throw makeError(X`ENOTDIR: ${q(dirPath.join('/'))}`);
        }
        throw e;
      }
      for (const ent of entries) {
        // Skip symlinks, devices, sockets, etc. — only files and
        // directories surface through the base seam.
        let kind;
        if (ent.isFile()) kind = /** @type {NodeKind} */ ('file');
        else if (ent.isDirectory())
          kind = /** @type {NodeKind} */ ('directory');
        if (kind !== undefined) {
          yield /** @type {DirEntry} */ (harden({ name: ent.name, kind }));
        }
      }
    },

    async read(path, offset, length) {
      const abs = absOf(path);
      await assertConfined(abs);
      const reqOff = offset === undefined ? 0n : offset;
      if (reqOff === 0n && length === undefined) {
        return new Uint8Array(await fsp.readFile(abs));
      }
      // Partial read via FileHandle.read.
      const fh = await fsp.open(abs, 'r');
      try {
        const off = Number(reqOff);
        // If length is undefined, read to EOF.
        if (length === undefined) {
          const stat = await fh.stat();
          const remaining = Math.max(0, Number(stat.size) - off);
          const buf = new Uint8Array(remaining);
          if (remaining !== 0) {
            await fh.read(buf, 0, remaining, off);
          }
          return buf;
        }
        const len = Number(length);
        const buf = new Uint8Array(len);
        const { bytesRead } = await fh.read(buf, 0, len, off);
        return buf.subarray(0, bytesRead);
      } finally {
        await fh.close().catch(() => {});
      }
    },

    async write(path, bytes, offset) {
      const abs = absOf(path);
      await assertConfined(abs);
      const off = offset === undefined ? 0 : Number(offset);
      // Open r+ (existing); on ENOENT, try wx (atomic create);
      // on the EEXIST race (a parallel writer created the file
      // between our two open() calls), retry r+. pwrite semantics
      // require 'r+' — 'a' always appends and 'w' truncates, both
      // of which would corrupt the existing tail.
      let fh;
      try {
        fh = await fsp.open(abs, 'r+');
      } catch (e) {
        const msg = /** @type {Error} */ (e).message;
        if (/ENOENT/.test(msg)) {
          fh = await fsp.open(abs, 'wx').catch(async err => {
            const m = /** @type {Error} */ (err).message;
            if (/EEXIST/.test(m)) return fsp.open(abs, 'r+');
            throw err;
          });
        } else {
          throw e;
        }
      }
      try {
        if (bytes.length !== 0) {
          await fh.write(bytes, 0, bytes.length, off);
        }
      } finally {
        await fh.close().catch(() => {});
      }
    },

    async makeDirectory(path) {
      const abs = absOf(path);
      await assertConfined(abs);
      try {
        await fsp.mkdir(abs);
      } catch (e) {
        const msg = /** @type {Error} */ (e).message;
        if (/EEXIST/.test(msg)) {
          throw makeError(X`EEXIST: ${q(path.join('/'))}`);
        }
        if (/ENOENT/.test(msg)) {
          throw makeError(X`ENOENT: parent ${q(path.slice(0, -1).join('/'))}`);
        }
        throw e;
      }
    },

    async remove(path) {
      if (path.length === 0) {
        throw makeError(X`EINVAL: cannot remove root`);
      }
      const abs = absOf(path);
      await assertConfined(abs);
      let st;
      try {
        st = await fsp.lstat(abs);
      } catch (e) {
        const msg = /** @type {Error} */ (e).message;
        if (/ENOENT/.test(msg)) {
          throw makeError(X`ENOENT: ${q(path.join('/'))}`);
        }
        throw e;
      }
      if (st.isDirectory()) {
        try {
          await fsp.rmdir(abs);
        } catch (e) {
          const msg = /** @type {Error} */ (e).message;
          if (/ENOTEMPTY/.test(msg)) {
            throw makeError(X`ENOTEMPTY: ${q(path.join('/'))}`);
          }
          throw e;
        }
      } else {
        await fsp.unlink(abs);
      }
    },

    async getStat(path) {
      const abs = absOf(path);
      await assertConfined(abs);
      const st = await fsp.stat(abs);
      // Node's `Stats.mtimeMs` is a JS number; convert to ns-bigint
      // so the rest of the system sees the portable shape. `size`
      // is an integer in bytes; coerce to bigint for consistency
      // with the rest of the protocol.
      const toNs = ms => BigInt(Math.trunc(ms)) * 1_000_000n;
      return harden({
        size: BigInt(st.size),
        mtime: toNs(st.mtimeMs),
        atime: toNs(st.atimeMs),
      });
    },

    async setStat(path, patch) {
      const abs = absOf(path);
      await assertConfined(abs);
      if (patch.size !== undefined) {
        await fsp.truncate(abs, Number(patch.size));
      }
      if (patch.mtime !== undefined || patch.atime !== undefined) {
        const st = await fsp.stat(abs);
        // utimes accepts seconds (number) or Date.
        const toDate = ns => new Date(Number(ns / 1_000_000n));
        const atime =
          patch.atime !== undefined ? toDate(BigInt(patch.atime)) : st.atime;
        const mtime =
          patch.mtime !== undefined ? toDate(BigInt(patch.mtime)) : st.mtime;
        await fsp.utimes(abs, atime, mtime);
      }
    },

    async fsync(path) {
      const abs = absOf(path);
      await assertConfined(abs);
      const fh = await fsp.open(abs, 'r+').catch(async err => {
        // ENOENT on a directory path: open it read-only.
        const msg = /** @type {Error} */ (err).message;
        if (/EISDIR/.test(msg)) {
          return fsp.open(abs, 'r');
        }
        throw err;
      });
      try {
        await fh.sync();
      } finally {
        await fh.close().catch(() => {});
      }
    },

    async rename(src, dst) {
      const absSrc = absOf(src);
      const absDst = absOf(dst);
      await assertConfined(absSrc);
      await assertConfined(absDst);
      await fsp.rename(absSrc, absDst);
    },

    watch(path) {
      const abs = absOf(path);
      /** @type {Array<any>} */
      const buffer = [];
      /** @type {Array<(r: IteratorResult<any>) => void>} */
      const waiters = [];
      let closed = false;

      const fire = event => {
        if (closed) return;
        if (waiters.length !== 0) {
          const w = /** @type {(r: IteratorResult<any>) => void} */ (
            waiters.shift()
          );
          w({ done: false, value: event });
        } else {
          buffer.push(event);
        }
      };

      // Synchronously start watching so events emitted between
      // setup and the first .next() are buffered.
      const watcher = fsWatch(
        abs,
        { persistent: false },
        (eventType, filename) => {
          // Map node fs events to wrap-backend's vocabulary:
          // 'rename' on directory = a child was added or removed
          // 'change' on a file = its content changed
          if (eventType === 'rename') {
            fire({ kind: 'child-added', name: filename || undefined });
          } else if (eventType === 'change') {
            fire({ kind: 'changed', name: filename || undefined });
          }
        },
      );
      watcher.on('error', () => {
        closed = true;
        while (waiters.length !== 0) {
          const w = /** @type {(r: IteratorResult<any>) => void} */ (
            waiters.shift()
          );
          w({ done: true, value: undefined });
        }
      });

      const cleanup = () => {
        if (closed) return;
        closed = true;
        try {
          watcher.close();
        } catch (_e) {
          // ignore
        }
        while (waiters.length !== 0) {
          const w = /** @type {(r: IteratorResult<any>) => void} */ (
            waiters.shift()
          );
          w({ done: true, value: undefined });
        }
      };

      const iter = {
        async next() {
          if (closed) return { done: true, value: undefined };
          if (buffer.length !== 0) {
            return { done: false, value: buffer.shift() };
          }
          return new Promise(resolve => {
            waiters.push(resolve);
          });
        },
        async return(value) {
          cleanup();
          return { done: true, value };
        },
        [Symbol.asyncIterator]() {
          return iter;
        },
      };
      return iter;
    },
  });
};
harden(makeNodeFsBackend);
