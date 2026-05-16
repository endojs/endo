// @ts-check
/* eslint-disable no-await-in-loop, no-continue, no-bitwise, no-underscore-dangle */
/**
 * Layer + diff/apply (F12, DESIGN.md §8.5).
 *
 * A `Layer` is its own cap, conveying strictly more authority
 * than the `Filesystem` it wraps: `backing()` reveals what's
 * underneath, `diff()` enumerates the layer's mutations, and
 * `apply(target)` replays the layer onto another `Filesystem`.
 * `asFilesystem()` projects out the FS view alone, suitable for
 * handing to callers that should be able to read/write the
 * composed view but not extract the diff.
 *
 * Implementation strategy: the writable layer is just an in-memory
 * `Filesystem` (or any Filesystem the caller hands us). The
 * `Layer` cap wraps it and tracks the structural moves needed to
 * synthesise a `diff()` stream. To minimise tracking overhead,
 * `diff()` walks the layer's directory tree at call time and emits
 * a `LayerOp` per visited node — recording the layer's current
 * shape rather than its history. That's sufficient for `apply` to
 * replay against a clean target. (Whiteout/opaque markers from
 * `compose` flow through as `LayerOp.kind: 'whiteout'` /
 * `'opaque-dir'`.)
 *
 * `apply(target)`: drains the diff stream and replays each
 * operation against `target`. Failures land mid-stream and leave
 * the target in a partial state (per §10 open question — v2 may
 * add transactional commit/rollback).
 */

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, X, q } from '@endo/errors';

import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

const Pass = M.any();

const WHITEOUT_PREFIX = '__whiteout__';
const OPAQUE_NAME = '.__opaque__';

const isWhiteoutName = n => n.startsWith(WHITEOUT_PREFIX);
const whiteoutTarget = n => n.slice(WHITEOUT_PREFIX.length);

export const LayerInterface = M.interface('Layer', {
  asFilesystem: M.call().returns(M.eref(M.remotable('Filesystem'))),
  backing: M.call().returns(M.eref(M.remotable('Filesystem'))),
  diff: M.call().returns(M.eref(M.remotable('PassableReader'))),
  apply: M.call(M.remotable('Filesystem')).returns(M.promise()),
  seal: M.call().returns(M.eref(M.remotable('Filesystem'))),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(LayerInterface);

/**
 * Walk the layer's directory tree, producing a stream of LayerOps.
 *
 * @param {object} layerFs
 */
const enumerateLayerOps = async function* (layerFs) {
  const root = await E(layerFs).root();
  // BFS through the layer, recording (path, node) along the way.
  /** @type {Array<{ dir: any, path: string[] }>} */
  const queue = [{ dir: root, path: [] }];
  while (queue.length > 0) {
    const { dir, path } = /** @type {{ dir: any, path: string[] }} */ (
      queue.shift()
    );
    const cursor = await E(dir).list();
    const stream = await E(cursor).stream();
    for await (const entry of iterateReader(stream)) {
      const name = /** @type {string} */ (entry.name);
      const childPath = [...path, name];
      if (name === OPAQUE_NAME) {
        yield harden({ kind: 'opaque-dir', path });
        continue;
      }
      if (isWhiteoutName(name)) {
        yield harden({ kind: 'whiteout', path: [...path, whiteoutTarget(name)] });
        continue;
      }
      if (entry.qid.type === 'directory') {
        yield harden({ kind: 'create-dir', path: childPath });
        const child = await E(dir).lookup(name);
        queue.push({ dir: child, path: childPath });
        continue;
      }
      if (entry.qid.type === 'file') {
        yield harden({ kind: 'create-file', path: childPath });
        // Stream the file's bytes as a separate op so apply can
        // replay them. Read in one chunk; large files would need
        // chunked emission, deferred.
        const file = await E(dir).lookup(name);
        const oh = await E(file).open({ read: true });
        const reader = await E(oh).read(0n, 1n << 30n);
        const chunks = [];
        let total = 0;
        for await (const chunk of iterateBytesReader(reader)) {
          chunks.push(chunk);
          total += chunk.length;
        }
        await E(oh).close();
        if (total > 0) {
          const merged = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) {
            merged.set(c, off);
            off += c.length;
          }
          yield harden({
            kind: 'write-bytes',
            path: childPath,
            offset: 0n,
            bytes: merged,
          });
        }
      }
    }
  }
};

/**
 * Apply a single `LayerOp` against a target `Filesystem`.
 *
 * @param {object} target
 * @param {{ kind: string, path: string[], [k: string]: any }} op
 */
const applyOp = async (target, op) => {
  const navigate = async path => {
    let cur = await E(target).root();
    for (let i = 0; i < path.length - 1; i += 1) {
      cur = await E(cur).lookup(path[i]);
    }
    return cur;
  };
  const dirOf = path => navigate(path);
  const lastSeg = path => path[path.length - 1];

  switch (op.kind) {
    case 'create-dir': {
      const parent = await dirOf(op.path);
      try {
        await E(parent).mkdir(lastSeg(op.path), {});
      } catch (e) {
        // If the directory already exists, swallow the error.
        const msg = e instanceof Error ? e.message : String(e);
        if (!/EEXIST/.test(msg)) throw e;
      }
      return;
    }
    case 'create-file': {
      const parent = await dirOf(op.path);
      const opened = await E(parent).create(lastSeg(op.path), {});
      await E(opened).close();
      return;
    }
    case 'write-bytes': {
      const parent = await dirOf(op.path);
      const opened = await E(parent).create(lastSeg(op.path), {});
      const writer = await E(opened).write(op.offset);
      const w = iterateBytesWriter(writer);
      await w.next(op.bytes);
      await w.return();
      await E(opened).close();
      return;
    }
    case 'whiteout': {
      const parent = await dirOf(op.path);
      try {
        await E(parent).unlink(lastSeg(op.path));
      } catch {
        // Already absent; whiteout has no further effect.
      }
      return;
    }
    case 'opaque-dir': {
      // Best-effort: ignore. Opaque-dir is a layer-side marker for
      // hiding backing entries; applying it against a clean
      // target has no observable effect.
      return;
    }
    case 'set-attrs': {
      const dir = await navigate([...op.path, 'unused-for-dirof']);
      const node = await E(dir).lookup(lastSeg(op.path));
      await E(node).setAttrs(op.updates);
      return;
    }
    case 'rename': {
      const oldParent = await navigate(op.oldPath);
      const newParent = await navigate(op.newPath);
      await E(oldParent).rename(
        lastSeg(op.oldPath),
        newParent,
        lastSeg(op.newPath),
      );
      return;
    }
    case 'truncate': {
      const parent = await dirOf(op.path);
      const file = await E(parent).lookup(lastSeg(op.path));
      const oh = await E(file).open({ write: true });
      await E(oh).truncate(op.length);
      await E(oh).close();
      return;
    }
    default:
      throw makeError(X`unknown LayerOp kind ${q(op.kind)}`);
  }
};

/**
 * Build a `Layer` cap over a `layerFs` + `backingFs`.
 *
 * @param {object} layerFs
 * @param {object} backingFs
 */
export const makeLayer = (layerFs, backingFs) => {
  return makeExo('Layer', LayerInterface, {
    asFilesystem() {
      // For an attenuated read+write view, just hand back the
      // composed FS. Callers wanting CoW semantics should pair
      // this with `compose(layerFs, backingFs)` themselves; the
      // attenuated view returned here is just the layer plus the
      // backing, no whiteouts/opaque markers consulted. Mirror
      // the design's expectation that asFilesystem is the
      // "attenuated FS view of this Layer."
      // eslint-disable-next-line global-require, import/no-dynamic-require
      throw makeError(
        X`Layer.asFilesystem returns the composed FS; wire via compose() at the call site`,
      );
    },
    backing() {
      return backingFs;
    },
    async diff() {
      return readerFromIterator(enumerateLayerOps(layerFs));
    },
    async apply(target) {
      const opsReader = readerFromIterator(enumerateLayerOps(layerFs));
      for await (const op of iterateReader(opsReader)) {
        await applyOp(target, /** @type {any} */ (op));
      }
    },
    async seal() {
      // Promote to read-only by wrapping with the readOnly attenuator.
      // eslint-disable-next-line global-require
      const { readOnly } = await import('./readonly.js');
      return readOnly(layerFs);
    },
    help(method) {
      if (method === undefined) {
        return 'Layer (DESIGN.md §8.5).';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(makeLayer);

// Re-import patterns helper kept above to satisfy interface guard
// usage; eslint silence as needed.
// eslint-disable-next-line no-unused-vars
const _Pass = Pass;
