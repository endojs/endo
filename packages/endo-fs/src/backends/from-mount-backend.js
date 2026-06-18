// @ts-check
/* eslint-disable no-await-in-loop */
/* global atob */
/**
 * `FsBackend` adapter for an `@endo/daemon` `Mount` cap.
 *
 * Mount has a different interface (whole-file `text()`/`writeBytes()`,
 * `list()` of names, `lookup(segments)` for path-array access). This
 * adapter projects it into the `FsBackend` protocol.
 *
 * - No partial-range I/O: `read(path, offset, length)` fetches the
 *   whole file via `streamBase64()` and slices.
 * - No xattrs / locks / events surface (left absent so wrapBackend
 *   uses its vat-local lock table and synthesizes empty watchers).
 * - `kind` returns 'file' | 'directory' | undefined based on
 *   CapTP method introspection of the lookup result.
 */

import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';
import { encodeBase64 } from '@endo/base64';
import { makeError, X, q } from '@endo/errors';

/**
 * @import { FsBackend, NodeKind, DirEntry } from '../backend-types.js'
 */

/**
 * Wrap a `Uint8Array` as a `ReadableBlob`-shaped remotable that `Mount.write`
 * accepts. `Mount.write` introspects for a `streamBase64` method and drains it
 * through `makeRefReader` (base64-decode), so the blob yields its bytes as a
 * single base64 chunk. A raw `Uint8Array` cannot cross CapTP (byte arrays are
 * not yet passable), which is why writes must hand over a reader reference
 * rather than the bytes themselves.
 *
 * @param {Uint8Array} bytes
 */
const makeBytesBlob = bytes => {
  const base64 = encodeBase64(bytes);
  return Far('ReadableBlob', {
    streamBase64() {
      let sent = false;
      return Far('AsyncIterator', {
        async next() {
          if (sent) {
            return harden({ done: true, value: undefined });
          }
          sent = true;
          return harden({ done: false, value: base64 });
        },
        async return() {
          sent = true;
          return harden({ done: true, value: undefined });
        },
      });
    },
  });
};
harden(makeBytesBlob);

/**
 * Drain a Mount/MountFile `streamBase64` reader into a `Uint8Array`.
 *
 * @param {any} streamRef
 */
const drainBase64Stream = async streamRef => {
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await E(streamRef).next();
    if (done) break;
    // The wire format is a base64 string; decode it.
    const decoded = Uint8Array.from(atob(/** @type {string} */ (value)), c =>
      c.charCodeAt(0),
    );
    chunks.push(decoded);
    total += decoded.length;
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
 * Probe a Mount.lookup() result and determine whether it's a
 * sub-Mount (directory) or a MountFile (file).
 *
 * @param {any} cap
 * @returns {Promise<NodeKind | undefined>}
 */
const probeMountChild = async cap => {
  try {
    // `__getMethodNames__` is the canonical CapTP introspection
    // method (DESIGN.md / CLAUDE.md). Disable the lint rule that
    // forbids leading/trailing underscores on identifiers — the
    // double-underscore form is part of the CapTP protocol.
    // eslint-disable-next-line no-underscore-dangle
    const methods = await E(cap).__getMethodNames__();
    if (methods.includes('lookup')) return 'directory';
    if (methods.includes('text') || methods.includes('streamBase64')) {
      return 'file';
    }
  } catch (_e) {
    // Lookup may reject for non-FS reasons; treat as "unknown kind"
    // and let the caller decide (kind() returns undefined → consumer
    // sees ENOENT).
  }
  return undefined;
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
      if (/ENOENT/.test(msg)) return undefined;
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
      for (const name of /** @type {string[]} */ (names)) {
        let kind;
        try {
          const child = await E(mount).lookup(name);
          kind = await probeMountChild(child);
        } catch (e) {
          // Same policy as resolve(): missing nodes drop silently
          // from the listing; real I/O / permission errors re-raise.
          const msg = /** @type {Error} */ (e).message;
          if (!/ENOENT/.test(msg)) throw e;
          kind = undefined;
        }
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
      const stream = await E(cap).streamBase64();
      const bytes = await drainBase64Stream(stream);
      const off = offset === undefined ? 0 : Number(offset);
      if (length === undefined) return bytes.slice(off);
      const end = off + Number(length);
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
      const off = offset === undefined ? 0 : Number(offset);
      // Read current content (if the file already exists) so a ranged
      // write can be coalesced locally — Mount has no partial-range
      // write. A missing path resolves to undefined (treated as empty);
      // a bytes-stream error mid-fetch is a real failure and propagates.
      const cap = await resolve(path);
      let current = new Uint8Array(0);
      if (cap !== undefined) {
        const stream = await E(cap).streamBase64();
        current = await drainBase64Stream(stream);
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
     * @param {import('../backend-types.js').NodeStat} patch
     */
    async setStat(path, patch) {
      if (path.length === 0) {
        throw makeError(X`EISDIR: cannot setStat the root`);
      }
      if (patch.size === undefined) return;
      const size = Number(patch.size);
      const cap = await resolve(path);
      let current = new Uint8Array(0);
      if (cap !== undefined) {
        const stream = await E(cap).streamBase64();
        current = await drainBase64Stream(stream);
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
