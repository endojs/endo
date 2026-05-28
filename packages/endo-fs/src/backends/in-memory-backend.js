// @ts-check
/**
 * In-memory `FsBackend` — stores files and directories in a Map
 * keyed by joined path. Implements all 6 required methods plus
 * `setStat`, `fsync` (no-op), `rename` (Map swap), and `watch`
 * (in-process event bus). Skips `hash` (let wrapBackend synthesize).
 *
 * Maps to `wrapBackend(makeInMemoryBackend())` to produce a
 * Filesystem cap.
 */

import { makeError, X, q } from '@endo/errors';

/**
 * @import { FsBackend, NodeKind, DirEntry, NodeStat, WatchEvent } from '../backend-types.js'
 */

const SEP = '\0';
const keyOf = path => path.join(SEP);

/**
 * @returns {FsBackend}
 */
export const makeInMemoryBackend = () => {
  /**
   * Each record:
   *   { kind: 'directory' }                        — directory
   *   { kind: 'file', bytes: Uint8Array, mtime, atime }   — file
   *
   * @type {Map<string, any>}
   */
  const records = new Map();
  // Root directory exists immediately at the empty path.
  records.set(keyOf([]), { kind: 'directory' });

  // Watcher: per-path subscriber sets.
  /** @type {Map<string, Set<(event: WatchEvent) => void>>} */
  const watchersByPath = new Map();

  const fire = (path, event) => {
    const set = watchersByPath.get(keyOf(path));
    if (!set) return;
    for (const sub of set) {
      try {
        sub(harden(event));
      } catch (_e) {
        // ignore handler errors
      }
    }
  };

  // Verify the parent directory of `path` exists. Throws ENOENT/ENOTDIR.
  const requireParentDir = path => {
    if (path.length === 0) return;
    const parent = path.slice(0, -1);
    const rec = records.get(keyOf(parent));
    if (!rec) throw makeError(X`ENOENT: parent directory missing`);
    if (rec.kind !== 'directory') {
      throw makeError(X`ENOTDIR: parent is not a directory`);
    }
  };

  const requireFile = path => {
    const rec = records.get(keyOf(path));
    if (!rec) throw makeError(X`ENOENT: ${q(path.join('/'))}`);
    if (rec.kind !== 'file') {
      throw makeError(X`EISDIR: ${q(path.join('/'))} is a directory`);
    }
    return rec;
  };

  return harden({
    async kind(path) {
      const rec = records.get(keyOf(path));
      if (!rec) return undefined;
      return /** @type {NodeKind} */ (rec.kind);
    },

    async *list(dirPath) {
      const rec = records.get(keyOf(dirPath));
      if (!rec) throw makeError(X`ENOENT: ${q(dirPath.join('/'))}`);
      if (rec.kind !== 'directory') {
        throw makeError(X`ENOTDIR: ${q(dirPath.join('/'))}`);
      }
      const selfKey = keyOf(dirPath);
      const prefix = dirPath.length === 0 ? '' : `${selfKey}${SEP}`;
      for (const [key, r] of records) {
        // Filter to direct children of `dirPath`: skip the
        // directory itself, anything outside the prefix, and any
        // entry whose remainder contains further separators.
        if (
          key !== selfKey &&
          key.startsWith(prefix) &&
          key.length > prefix.length
        ) {
          const rest = key.slice(prefix.length);
          if (!rest.includes(SEP)) {
            yield /** @type {DirEntry} */ ({
              name: rest,
              kind: r.kind,
            });
          }
        }
      }
    },

    async read(path, offset, length) {
      const rec = requireFile(path);
      const off = offset === undefined ? 0 : Number(offset);
      if (length === undefined) {
        return rec.bytes.slice(off);
      }
      const end = off + Number(length);
      return rec.bytes.slice(off, end);
    },

    /**
     * @param {string[]} path
     * @param {Uint8Array} bytes
     * @param {bigint} [offset]
     */
    async write(path, bytes, offset) {
      requireParentDir(path);
      const off = offset === undefined ? 0 : Number(offset);
      let rec = records.get(keyOf(path));
      const now = BigInt(Date.now()) * 1_000_000n;
      if (!rec) {
        // Create file.
        const out = new Uint8Array(off + bytes.length);
        out.set(bytes, off);
        rec = { kind: 'file', bytes: out, mtime: now, atime: now };
        records.set(keyOf(path), rec);
        // Fire on parent (child-added) and on the file itself
        // (created), matching the legacy in-memory event vocabulary.
        if (path.length !== 0) {
          fire(path.slice(0, -1), {
            kind: 'child-added',
            name: path[path.length - 1],
          });
        }
        fire(path, { kind: 'created' });
        return;
      }
      if (rec.kind !== 'file') {
        throw makeError(X`EISDIR: ${q(path.join('/'))} is a directory`);
      }
      // Resize buffer if needed.
      const needed = off + bytes.length;
      let buf = /** @type {Uint8Array} */ (rec.bytes);
      if (needed > buf.length) {
        const grown = new Uint8Array(needed);
        grown.set(buf, 0);
        buf = grown;
      }
      buf.set(bytes, off);
      rec.bytes = buf;
      rec.mtime = now;
      fire(path, { kind: 'changed' });
    },

    async makeDirectory(path) {
      requireParentDir(path);
      const existing = records.get(keyOf(path));
      if (existing) {
        if (existing.kind !== 'directory') {
          throw makeError(X`EEXIST: ${q(path.join('/'))} is a file`);
        }
        return;
      }
      records.set(keyOf(path), { kind: 'directory' });
      if (path.length !== 0) {
        fire(path.slice(0, -1), {
          kind: 'child-added',
          name: path[path.length - 1],
        });
      }
      fire(path, { kind: 'created' });
    },

    async remove(path) {
      if (path.length === 0) {
        throw makeError(X`EINVAL: cannot remove root`);
      }
      const rec = records.get(keyOf(path));
      if (!rec) throw makeError(X`ENOENT: ${q(path.join('/'))}`);
      if (rec.kind === 'directory') {
        // Must be empty.
        const prefix = `${keyOf(path)}${SEP}`;
        for (const key of records.keys()) {
          if (key.startsWith(prefix)) {
            throw makeError(X`ENOTEMPTY: ${q(path.join('/'))}`);
          }
        }
      }
      records.delete(keyOf(path));
      fire(path.slice(0, -1), {
        kind: 'child-removed',
        name: path[path.length - 1],
      });
      fire(path, { kind: 'removed' });
    },

    async setStat(path, patch) {
      const rec = requireFile(path);
      const bytes = /** @type {Uint8Array} */ (rec.bytes);
      if (patch.size !== undefined) {
        const newSize = Number(patch.size);
        if (newSize < bytes.length) {
          rec.bytes = bytes.slice(0, newSize);
        } else if (newSize > bytes.length) {
          const grown = new Uint8Array(newSize);
          grown.set(bytes, 0);
          rec.bytes = grown;
        }
      }
      if (patch.mtime !== undefined) rec.mtime = BigInt(patch.mtime);
      if (patch.atime !== undefined) rec.atime = BigInt(patch.atime);
      fire(path, { kind: 'changed' });
    },

    async fsync(_path) {
      // No-op — in-memory has no durability barrier.
    },

    async rename(src, dst) {
      const rec = records.get(keyOf(src));
      if (!rec) throw makeError(X`ENOENT: ${q(src.join('/'))}`);
      const dstExisting = records.get(keyOf(dst));
      if (dstExisting) {
        if (rec.kind === 'directory' && dstExisting.kind === 'directory') {
          // Allow over-write of empty target dir.
          const prefix = `${keyOf(dst)}${SEP}`;
          for (const key of records.keys()) {
            if (key.startsWith(prefix)) {
              throw makeError(X`ENOTEMPTY: ${q(dst.join('/'))}`);
            }
          }
        } else if (rec.kind === 'file' && dstExisting.kind === 'file') {
          // Replace file is fine.
        } else {
          throw makeError(X`ENOTDIR or EISDIR: rename target type mismatch`);
        }
      }
      // Move the record (and any subtree under it for directory).
      const srcKey = keyOf(src);
      const dstKey = keyOf(dst);
      const srcPrefix = `${srcKey}${SEP}`;
      const dstPrefix = `${dstKey}${SEP}`;
      /** @type {Array<[string, any]>} */
      const toMove = [];
      for (const [key, r] of records) {
        if (key === srcKey || key.startsWith(srcPrefix)) {
          toMove.push([key, r]);
        }
      }
      for (const [key, r] of toMove) {
        records.delete(key);
        const newKey = key === srcKey ? dstKey : dstPrefix + key.slice(srcPrefix.length);
        records.set(newKey, r);
      }
      fire(src.slice(0, -1), {
        kind: 'child-removed',
        name: src[src.length - 1],
      });
      fire(dst.slice(0, -1), {
        kind: 'child-added',
        name: dst[dst.length - 1],
      });
    },

    async statfs() {
      // Compute live counts. Block size is a convention (1024).
      let fileBytes = 0n;
      let fileCount = 0n;
      let dirCount = 0n;
      for (const r of records.values()) {
        if (r.kind === 'file') {
          fileCount += 1n;
          fileBytes += BigInt(r.bytes.length);
        } else {
          dirCount += 1n;
        }
      }
      // `freeBytes` is effectively unbounded for in-memory; we
      // report a generous large constant rather than 0 so consumers
      // distinguishing "out of space" from "in-memory" see signal.
      const freeBytes = 1099511627776n; // 1 TiB headroom (1 << 40 bytes)
      return harden({
        blockSize: 1024n,
        totalBlocks: (fileBytes + 1023n) / 1024n,
        freeBlocks: freeBytes / 1024n,
        totalBytes: fileBytes,
        freeBytes,
        files: fileCount,
        directories: dirCount,
      });
    },

    watch(path) {
      const key = keyOf(path);
      let set = watchersByPath.get(key);
      if (!set) {
        set = new Set();
        watchersByPath.set(key, set);
      }
      /** @type {Array<WatchEvent>} */
      const buffer = [];
      /** @type {Array<(r: IteratorResult<WatchEvent>) => void>} */
      const waiters = [];
      let closed = false;
      const handler = event => {
        if (closed) return;
        if (waiters.length !== 0) {
          const w = /** @type {(r: IteratorResult<WatchEvent>) => void} */ (
            waiters.shift()
          );
          w({ done: false, value: event });
        } else {
          buffer.push(event);
        }
      };
      set.add(handler);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        set.delete(handler);
        if (set.size === 0) watchersByPath.delete(key);
        // Resolve any pending waiters with done so consumers can
        // unblock cleanly.
        while (waiters.length !== 0) {
          const w = /** @type {(r: IteratorResult<WatchEvent>) => void} */ (
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
harden(makeInMemoryBackend);
