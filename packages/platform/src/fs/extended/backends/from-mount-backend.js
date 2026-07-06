// @ts-check
/* eslint-disable no-await-in-loop */
/**
 * `FsBackend` adapter for an `@endo/daemon` `Mount` cap.
 *
 * Mount has a different interface (whole-file `text()`/`writeBytes()`,
 * `list()` of names, `lookup(segments)` for path-array access). This
 * adapter projects it into the `FsBackend` protocol.
 *
 * - No partial-range I/O: `read(path, offset, length)` fetches the
 *   whole file via `streamBase64()` and slices. `write`/`setStat`
 *   likewise read-modify-write the whole file, since Mount has no
 *   partial-range write. Cost is O(filesize) on the wire (≈1.33×, base64)
 *   and in memory; the write side sends the file as a *single* base64
 *   chunk via `makeBytesBlob` (no back-pressure). Acceptable for the
 *   config/source-tree files this adapter targets; large-blob streaming
 *   would need a chunked `makeBytesBlob`.
 * - No xattrs / locks / events surface (left absent so wrapBackend
 *   uses its vat-local lock table and synthesizes empty watchers).
 * - `kind` returns 'file' | 'directory' | undefined based on
 *   CapTP method introspection of the lookup result. `list` pipelines
 *   each entry's introspection probe onto its lookup (one round-trip per
 *   entry, all entries concurrent) rather than two serial sends each.
 *
 * Bytes streaming uses the `@endo/exo-stream` wire protocol on both
 * sides: reads drain a file's `streamBase64` via `iterateBytesReader`,
 * and the write-blob is produced by `bytesReaderFromIterator` (which
 * `Mount.write` drains the same way).
 */

import { E } from '@endo/eventual-send';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { makeError, X, q } from '@endo/errors';

import { toSafeNumber } from '../shared/helpers.js';

/**
 * @import { FsBackend, NodeKind, DirEntry, NodeStat } from '../backend-types.js'
 */

/**
 * Recognize a Mount lookup failure that should collapse to "no such node."
 *
 * ENOENT is a genuine miss. EACCES / ELOOP are how the daemon Mount reports a
 * symlink (or path) that escapes the confinement root; folding them into the
 * same not-found bucket — matching the node-fs backend's policy — keeps a cap
 * holder from distinguishing "escapes to an existing host path" from "does not
 * exist," which would otherwise be an out-of-sandbox existence oracle. The
 * trade-off (a real in-sandbox permission error is also hidden) favors
 * confinement over diagnostic precision.
 *
 * @param {string} message
 */
const isNotFoundMessage = message => /ENOENT|EACCES|ELOOP/.test(message);
harden(isNotFoundMessage);

/**
 * Wrap a `Uint8Array` as a `PassableBytesReader` that `Mount.write`
 * accepts. `Mount.write` introspects for a `streamBase64` method and
 * drains it through `iterateBytesReader` (the `@endo/exo-stream`
 * protocol), so the producer must speak that protocol too. A raw
 * `Uint8Array` cannot cross CapTP (byte arrays are not yet passable),
 * which is why writes must hand over a reader reference rather than the
 * bytes themselves.
 *
 * @param {Uint8Array} bytes
 */
const makeBytesBlob = bytes => {
  async function* singleChunk() {
    yield bytes;
  }
  return bytesReaderFromIterator(singleChunk());
};
harden(makeBytesBlob);

/**
 * Drain a Mount/MountFile `streamBase64` reader into a `Uint8Array`
 * using the `@endo/exo-stream` consumer protocol.
 *
 * @param {any} fileCap - a remotable exposing `streamBase64`
 */
const drainBytesReader = async fileCap => {
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for await (const chunk of iterateBytesReader(fileCap)) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
};

/**
 * Map a Mount child's CapTP method names to a node kind. A sub-Mount
 * (directory) advertises `lookup`; a MountFile advertises `text` /
 * `streamBase64`.
 *
 * @param {string[]} methods
 * @returns {NodeKind | undefined}
 */
const kindFromMethods = methods => {
  if (methods.includes('lookup')) return 'directory';
  if (methods.includes('text') || methods.includes('streamBase64')) {
    return 'file';
  }
  return undefined;
};
harden(kindFromMethods);

/**
 * Probe a Mount.lookup() result and determine whether it's a
 * sub-Mount (directory) or a MountFile (file).
 *
 * @param {any} cap
 * @returns {Promise<NodeKind | undefined>}
 */
const probeMountChild = async cap => {
  try {
    // `__getMethodNames__` is the canonical CapTP introspection
    // method (DESIGN.md / AGENTS.md). Disable the lint rule that
    // forbids leading/trailing underscores on identifiers — the
    // double-underscore form is part of the CapTP protocol.
    // eslint-disable-next-line no-underscore-dangle
    const methods = await E(cap).__getMethodNames__();
    return kindFromMethods(methods);
  } catch (_e) {
    // Lookup may reject for non-FS reasons; treat as "unknown kind"
    // and let the caller decide (kind() returns undefined → consumer
    // sees ENOENT).
    return undefined;
  }
};

/**
 * Build an `FsBackend` over a `Mount` capability.
 *
 * @param {object} rootMount
 * @returns {FsBackend}
 */
export const makeFromMountBackend = rootMount => {
  /**
   * Resolve a path-array to a Mount or MountFile cap, or undefined
   * for a not-found path. Re-raises any error that isn't an
   * ENOENT-shaped lookup miss so genuine connection / permission
   * failures surface to the caller instead of masquerading as
   * "not found."
   *
   * @param {string[]} path
   */
  const resolve = async path => {
    if (path.length === 0) return rootMount;
    try {
      return await E(rootMount).lookup(path);
    } catch (e) {
      const msg = /** @type {Error} */ (e).message;
      if (isNotFoundMessage(msg)) return undefined;
      throw e;
    }
  };

  return harden({
    async kind(path) {
      const cap = await resolve(path);
      if (cap === undefined) return undefined;
      return probeMountChild(cap);
    },

    async *list(dirPath) {
      const mount = await resolve(dirPath);
      if (mount === undefined) {
        throw makeError(X`ENOENT: ${q(dirPath.join('/'))}`);
      }
      const names = await E(mount).list();
      // Resolve every entry's kind concurrently, pipelining each entry's
      // `__getMethodNames__` probe onto its still-unresolved `lookup` so an
      // entry costs one round-trip instead of two. This turns the listing
      // from `2 + 2n` serial round-trips into a single pipelined batch (see
      // fs-interface-reconciliation §"Review findings incorporated").
      const settled = await Promise.all(
        /** @type {string[]} */ (names).map(async name => {
          try {
            // eslint-disable-next-line no-underscore-dangle
            const methods = await E(E(mount).lookup(name)).__getMethodNames__();
            return { name, kind: kindFromMethods(methods) };
          } catch (e) {
            // Same policy as resolve(): missing nodes (and confinement
            // escapes, surfaced as EACCES) drop silently from the listing;
            // real I/O / permission errors re-raise.
            const msg = /** @type {Error} */ (e).message;
            if (!isNotFoundMessage(msg)) throw e;
            return { name, kind: undefined };
          }
        }),
      );
      for (const { name, kind } of settled) {
        if (kind !== undefined) {
          yield /** @type {DirEntry} */ (harden({ name, kind }));
        }
      }
    },

    async read(path, offset, length) {
      const cap = await resolve(path);
      if (cap === undefined) {
        throw makeError(X`ENOENT: ${q(path.join('/'))}`);
      }
      // A bytes-stream error mid-fetch propagates as a real failure
      // rather than being silently coerced to "empty file."
      const bytes = await drainBytesReader(cap);
      const off = offset === undefined ? 0 : toSafeNumber(offset, 'offset');
      if (length === undefined) return bytes.slice(off);
      const end = off + toSafeNumber(length, 'length');
      return bytes.slice(off, end);
    },

    /**
     * @param {string[]} path
     * @param {Uint8Array} bytes
     * @param {bigint} [offset]
     */
    async write(path, bytes, offset) {
      if (path.length === 0) {
        throw makeError(X`EISDIR: cannot write the root`);
      }
      const off = offset === undefined ? 0 : toSafeNumber(offset, 'offset');
      // Read current content (if the file already exists) so a ranged
      // write can be coalesced locally — Mount has no partial-range
      // write. A missing path resolves to undefined (treated as empty);
      // a bytes-stream error mid-fetch is a real failure and propagates.
      const cap = await resolve(path);
      let current = new Uint8Array(0);
      if (cap !== undefined) {
        current = await drainBytesReader(cap);
      }
      const needed = off + bytes.length;
      const outLen = Math.max(needed, current.length);
      const out = new Uint8Array(outLen);
      out.set(current.subarray(0, Math.min(current.length, needed)), 0);
      out.set(bytes, off);
      if (needed < current.length) {
        out.set(current.subarray(needed), needed);
      }
      // `Mount.write` materialises the file (creating parents and the
      // file itself) from a ReadableBlob. Hand it a reader reference,
      // not the raw bytes: byte arrays are not passable over CapTP.
      await E(rootMount).write(path, makeBytesBlob(out));
    },

    /**
     * Only `size` is meaningful for a Mount: it has whole-file write
     * but no metadata API, so resize is emulated by reading the current
     * bytes and rewriting them at the new length (truncating or
     * zero-filling). Portable time fields (`atime`/`mtime`) are silently
     * ignored — the Mount cannot set them. Providing this is what lets
     * `open({ truncate: true })`, `create({ truncate: true })`, and
     * whole-file overwrites work instead of throwing ENOSYS.
     *
     * @param {string[]} path
     * @param {NodeStat} patch
     */
    async setStat(path, patch) {
      if (path.length === 0) {
        throw makeError(X`EISDIR: cannot setStat the root`);
      }
      if (patch.size === undefined) return;
      const size = toSafeNumber(patch.size, 'size');
      const cap = await resolve(path);
      let current = new Uint8Array(0);
      if (cap !== undefined) {
        current = await drainBytesReader(cap);
      }
      const out = new Uint8Array(size);
      out.set(current.subarray(0, Math.min(current.length, size)), 0);
      await E(rootMount).write(path, makeBytesBlob(out));
    },

    async makeDirectory(path) {
      if (path.length === 0) return;
      const parent = await resolve(path.slice(0, -1));
      if (parent === undefined) {
        throw makeError(X`ENOENT: parent ${q(path.slice(0, -1).join('/'))}`);
      }
      const name = path[path.length - 1];
      await E(parent).makeDirectory(name);
    },

    async remove(path) {
      if (path.length === 0) {
        throw makeError(X`EINVAL: cannot remove root`);
      }
      const parent = await resolve(path.slice(0, -1));
      if (parent === undefined) {
        throw makeError(X`ENOENT: parent ${q(path.slice(0, -1).join('/'))}`);
      }
      const name = path[path.length - 1];
      await E(parent).remove(name);
    },

    async rename(src, dst) {
      // Mount has `move(srcAbs, dstAbs)` which takes absolute path
      // arrays from root.
      await E(rootMount).move(src, dst);
    },
  });
};
harden(makeFromMountBackend);
