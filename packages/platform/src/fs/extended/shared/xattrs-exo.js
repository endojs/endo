// @ts-check
/**
 * Build an `Xattrs` exo backed by a vat-local sidecar `Map<path-key,
 * Map<name, Uint8Array>>`. Only the `user.*` namespace is accepted;
 * other namespaces (`security.*`, `trusted.*`, `system.*`) are
 * POSIX-specific and deferred to a future `PosixFs` cap that reads
 * real disk xattrs.
 *
 * The sidecar's lifetime is the `wrapBackend(...)` call — a daemon
 * restart, or a second `wrapBackend` over the same backing, loses
 * the xattrs. Persistence to disk is `PosixFs`'s job (F15).
 *
 * Mutations fire a `'changed'` event on the wrapping `wrapBackend`'s
 * local event bus, so a `Node.watch()` subscriber sees xattr writes
 * the same way it sees content writes.
 */

import { makeExo } from '@endo/exo';
import { makeError, X, q } from '@endo/errors';

import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { bytesWriterFromIterator } from '@endo/exo-stream/bytes-writer-from-iterator.js';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

import { XattrsInterface } from '../type-guards.js';

/**
 * @param {object} opts
 * @param {Map<string, Map<string, Uint8Array>>} opts.xattrTable
 * @param {(path: string[], event: { kind: string, name?: string }) => void} opts.fireLocal
 * @param {(path: string[]) => string} opts.lockKeyOf
 * @param {string[]} opts.path  the path this xattrs cap is bound to
 */
export const makeXattrsExo = ({ xattrTable, fireLocal, lockKeyOf, path }) => {
  const key = lockKeyOf(path);
  const ensureMap = () => {
    let m = xattrTable.get(key);
    if (!m) {
      m = new Map();
      xattrTable.set(key, m);
    }
    return m;
  };
  const assertUserNamespace = name => {
    if (typeof name !== 'string') {
      throw makeError(X`EINVAL: xattr name must be a string`);
    }
    if (!name.startsWith('user.')) {
      throw makeError(
        X`ENOTSUP: only user.* xattrs supported at this layer (got ${q(name)})`,
      );
    }
  };
  return makeExo('Xattrs', XattrsInterface, {
    async get(name) {
      assertUserNamespace(name);
      const m = xattrTable.get(key);
      const bytes = m && m.get(name);
      if (bytes === undefined) {
        throw makeError(X`ENODATA: xattr ${q(name)} not set`);
      }
      const gen = async function* () {
        if (bytes.length !== 0) yield bytes;
      };
      return bytesReaderFromIterator(gen());
    },
    async set(name, _opts) {
      assertUserNamespace(name);
      const m = ensureMap();
      /** @type {Uint8Array[]} */
      const chunks = [];
      const sink = {
        async next(chunk) {
          if (chunk instanceof Uint8Array && chunk.length !== 0) {
            chunks.push(chunk);
          }
          return { done: false, value: undefined };
        },
        async return(value) {
          let total = 0;
          for (const c of chunks) total += c.length;
          const merged = new Uint8Array(total);
          let p = 0;
          for (const c of chunks) {
            merged.set(c, p);
            p += c.length;
          }
          m.set(name, merged);
          fireLocal(path, { kind: 'changed' });
          return { done: true, value };
        },
        [Symbol.asyncIterator]() {
          return sink;
        },
      };
      return bytesWriterFromIterator(sink);
    },
    async list() {
      const m = xattrTable.get(key);
      const names = m ? [...m.keys()] : [];
      const gen = async function* () {
        for (const n of names) yield n;
      };
      return readerFromIterator(gen());
    },
    async remove(name) {
      assertUserNamespace(name);
      const m = xattrTable.get(key);
      if (!m || !m.has(name)) {
        throw makeError(X`ENODATA: xattr ${q(name)} not set`);
      }
      m.delete(name);
      if (m.size === 0) xattrTable.delete(key);
      fireLocal(path, { kind: 'changed' });
    },
    help(method) {
      if (method === undefined) {
        return 'Xattrs: vat-local user.* metadata (sidecar storage).';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(makeXattrsExo);
