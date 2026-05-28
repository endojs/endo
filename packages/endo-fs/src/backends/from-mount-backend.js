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
import { makeError, X, q } from '@endo/errors';

/**
 * @import { FsBackend, NodeKind, DirEntry } from '../backend-types.js'
 */

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
        } catch {
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
      const parent = await resolve(path.slice(0, -1));
      if (parent === undefined) {
        throw makeError(X`ENOENT: parent ${q(path.slice(0, -1).join('/'))}`);
      }
      const name = path[path.length - 1];
      let cap;
      try {
        cap = await E(parent).lookup(name);
      } catch (e) {
        // Distinguish "file doesn't exist" (create it) from any
        // other error (re-raise so the caller sees the real cause).
        const msg = /** @type {Error} */ (e).message;
        if (!/ENOENT/.test(msg)) throw e;
        await E(parent).writeText(name, '');
        cap = await E(parent).lookup(name);
      }
      // Read current content, splice in new bytes, write back.
      // Mount has no partial-range write so we coalesce locally.
      // A bytes-stream error mid-fetch is a real failure — surface
      // it rather than silently substituting empty content.
      const stream = await E(cap).streamBase64();
      const current = await drainBase64Stream(stream);
      const needed = off + bytes.length;
      const outLen = Math.max(needed, current.length);
      const out = new Uint8Array(outLen);
      out.set(current.subarray(0, Math.min(current.length, needed)), 0);
      out.set(bytes, off);
      if (needed < current.length) {
        out.set(current.subarray(needed), needed);
      }
      await E(cap).writeBytes(out);
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
