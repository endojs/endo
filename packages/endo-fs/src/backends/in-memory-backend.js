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
 * @returns {FsBackend & {
 *   _dump: () => Map<string, any>,
 * }}
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
      const prefix = dirPath.length === 0 ? '' : `${keyOf(dirPath)}${SEP}`;
      for (const [key, r] of records) {
        if (key === keyOf(dirPath)) continue;
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        // Only direct children (no further separators).
        if (rest.length === 0 || rest.includes(SEP)) continue;
        yield /** @type {DirEntry} */ ({
          name: rest,
          kind: r.kind,
        });
      }
    },

    async read(path, offset = 0n, length) {
      const rec = requireFile(path);
      const off = Number(offset);
      if (length === undefined) {
        return rec.bytes.slice(off);
      }
      const end = off + Number(length);
      return rec.bytes.slice(off, end);
    },

    async write(path, bytes, offset = 0n) {
      requireParentDir(path);
      const off = Number(offset);
      let rec = records.get(keyOf(path));
      const now = BigInt(Date.now()) * 1_000_000n;
      if (!rec) {
        // Create file.
        const out = new Uint8Array(off + bytes.length);
        out.set(bytes, off);
        rec = { kind: 'file', bytes: out, mtime: now, atime: now };
        records.set(keyOf(path), rec);
        fire(path.slice(0, -1), { kind: 'add', name: path[path.length - 1] });
        return;
      }
      if (rec.kind !== 'file') {
        throw makeError(X`EISDIR: ${q(path.join('/'))} is a directory`);
      }
      // Resize buffer if needed.
      const needed = off + bytes.length;
      let buf = rec.bytes;
      if (needed > buf.length) {
        const grown = new Uint8Array(needed);
        grown.set(buf, 0);
        buf = grown;
      }
      buf.set(bytes, off);
      rec.bytes = buf;
      rec.mtime = now;
      fire(path.slice(0, -1), { kind: 'change', name: path[path.length - 1] });
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
      if (path.length > 0) {
        fire(path.slice(0, -1), { kind: 'add', name: path[path.length - 1] });
      }
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
      fire(path.slice(0, -1), { kind: 'remove', name: path[path.length - 1] });
    },

    async setStat(path, patch) {
      const rec = requireFile(path);
      if (patch.size !== undefined) {
        const newSize = Number(patch.size);
        if (newSize < rec.bytes.length) {
          rec.bytes = rec.bytes.slice(0, newSize);
        } else if (newSize > rec.bytes.length) {
          const grown = new Uint8Array(newSize);
          grown.set(rec.bytes, 0);
          rec.bytes = grown;
        }
      }
      if (patch.mtime !== undefined) rec.mtime = BigInt(patch.mtime);
      if (patch.atime !== undefined) rec.atime = BigInt(patch.atime);
      fire(path.slice(0, -1), { kind: 'change', name: path[path.length - 1] });
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
        kind: 'remove',
        name: src[src.length - 1],
      });
      fire(dst.slice(0, -1), { kind: 'add', name: dst[dst.length - 1] });
    },

    async *watch(path) {
      const key = keyOf(path);
      let set = watchersByPath.get(key);
      if (!set) {
        set = new Set();
        watchersByPath.set(key, set);
      }
      /** @type {Array<WatchEvent>} */
      const buffer = [];
      /** @type {Array<(e: IteratorResult<WatchEvent>) => void>} */
      const waiters = [];
      let closed = false;
      const handler = event => {
        if (closed) return;
        if (waiters.length > 0) {
          const w = /** @type {(e: IteratorResult<WatchEvent>) => void} */ (waiters.shift());
          w({ done: false, value: event });
        } else {
          buffer.push(event);
        }
      };
      set.add(handler);
      try {
        for (;;) {
          if (closed) return;
          if (buffer.length > 0) {
            yield /** @type {WatchEvent} */ (buffer.shift());
            // eslint-disable-next-line no-continue
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          const step = await new Promise(resolve => {
            waiters.push(resolve);
          });
          if (step.done) return;
          yield step.value;
        }
      } finally {
        closed = true;
        set.delete(handler);
        if (set.size === 0) watchersByPath.delete(key);
      }
    },

    // Dev/test escape hatch — returns the records Map. Not part of
    // FsBackend; consumers shouldn't rely on it.
    _dump() {
      return records;
    },
  });
};
harden(makeInMemoryBackend);
