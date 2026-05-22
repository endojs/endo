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
import { encodeBase64, decodeBase64 } from '@endo/base64';

import { compose } from './compose.js';

const Pass = M.any();

const WHITEOUT_PREFIX = '__whiteout__';
const OPAQUE_NAME = '.__opaque__';

const isWhiteoutName = n => n.startsWith(WHITEOUT_PREFIX);
const whiteoutTarget = n => n.slice(WHITEOUT_PREFIX.length);

// Maximum payload per `write-bytes` LayerOp. Files larger than this
// are split across N+1 ops (N writes at chunk offsets + a final
// `truncate`) so a single op doesn't materialise the whole file
// into one Uint8Array on the wire.
const LAYER_CHUNK_BYTES = 1 << 20; // 1 MiB

// Base64-encoded payload limit for the bytes reader we drain per
// chunk. `iterateBytesReader` validates each frame against an
// `M.string({ stringLengthLimit })` pattern; the default 100_000 is
// well below our 1-MiB chunk (~1.37 MiB base64-encoded). Set the
// limit generously above the worst-case 4/3 expansion of one
// LAYER_CHUNK_BYTES so the per-frame ack-protocol doesn't reject
// the in-memory backing's one-shot framing.
const LAYER_BASE64_LIMIT = Math.ceil((LAYER_CHUNK_BYTES * 4) / 3) + 1024;

export const LayerInterface = M.interface('Layer', {
  asFilesystem: M.call().returns(M.eref(M.remotable('Filesystem'))),
  backing: M.call().returns(M.eref(M.remotable('Filesystem'))),
  diff: M.call().returns(M.eref(M.remotable('PassableReader'))),
  // `target` is `M.await`-wrapped so a caller can pipeline a
  // `compose(...) → Layer.apply` chain (or any "build the target,
  // then apply onto it" pattern) without an intermediate await.
  // See DESIGN.md §10.1 (M.await pipelining).
  apply: M.callWhen(M.await(M.remotable('Filesystem'))).returns(M.undefined()),
  // Wipe the writable side of the layer back to empty. After
  // `revert()`, the composed view (`asFilesystem()`) reads
  // identically to `backing()` — layer-only files disappear,
  // whiteouts no longer hide backing entries, and opaque markers
  // are removed. The backing is never touched.
  // `M.eref` so the async implementation can return a Promise.
  revert: M.call().returns(M.eref(M.undefined())),
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
        yield harden({
          kind: 'whiteout',
          path: [...path, whiteoutTarget(name)],
        });
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
        const file = await E(dir).lookup(name);
        const attrs = await E(file).getAttrs();
        const size = /** @type {bigint} */ (attrs.size);
        const oh = await E(file).open({ read: true });
        try {
          // Emit `write-bytes` ops in `LAYER_CHUNK_BYTES`-sized
          // chunks. For files larger than a single chunk this
          // bounds the per-op allocation and the per-op
          // CTP_CALL payload. A final `truncate` op pins the
          // file's exact size (covering the shrunk-file case
          // where a prior apply left trailing bytes).
          let offset = 0n;
          const chunkBig = BigInt(LAYER_CHUNK_BYTES);
          while (offset < size) {
            const remaining = size - offset;
            const take = remaining > chunkBig ? chunkBig : remaining;
            const reader = await E(oh).read(offset, take);
            /** @type {Uint8Array[]} */
            const pieces = [];
            let total = 0;
            const consumer = iterateBytesReader(reader, {
              stringLengthLimit: LAYER_BASE64_LIMIT,
            });
            for await (const piece of consumer) {
              pieces.push(piece);
              total += piece.length;
            }
            const chunk = new Uint8Array(total);
            let p = 0;
            for (const piece of pieces) {
              chunk.set(piece, p);
              p += piece.length;
            }
            // `write-bytes` ops travel across CapTP when a remote
            // consumer drains `Layer.diff()`, and the marshal
            // layer (a) rejects mutable typed arrays and (b) does
            // not yet implement the `'byteArray'` (immutable
            // ArrayBuffer) passStyle. Carry the payload as a
            // base64-encoded string — the same encoding the
            // bytes-stream protocol uses on the wire. `applyOp`
            // and any consumer (e.g. the chat layer-diff viewer)
            // decode via `decodeBase64`.
            yield harden({
              kind: 'write-bytes',
              path: childPath,
              offset,
              bytesBase64: encodeBase64(chunk),
            });
            offset += BigInt(chunk.length);
            if (chunk.length === 0) break; // defensive — empty read at EOF
          }
        } finally {
          await E(oh).close();
        }
        // Always emit a terminal truncate so apply lands the
        // exact size, including the empty-file and
        // file-shrank-since-prior-apply cases.
        yield harden({
          kind: 'truncate',
          path: childPath,
          length: size,
        });
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
      // Look up the file (previous `create-file` op materialised
      // it) and open for write. We avoid re-`create`-ing so that
      // chunk N+1 of a large file doesn't truncate the bytes
      // chunk N just wrote. The terminal `truncate` op handles
      // the final size.
      const parent = await dirOf(op.path);
      const file = await E(parent).lookup(lastSeg(op.path));
      const opened = await E(file).open({ write: true });
      try {
        const writer = await E(opened).write(op.offset);
        const w = iterateBytesWriter(writer);
        // `op.bytesBase64` is a base64-encoded string (see
        // `enumerateLayerOps`). Decode to a `Uint8Array` for the
        // bytes-writer, which then base64-encodes again on the
        // wire — round-trip is fine.
        await w.next(decodeBase64(op.bytesBase64));
        await w.return();
      } finally {
        await E(opened).close();
      }
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
      // `dirOf(op.path)` is the parent of the leaf; look up the
      // leaf inside it and apply the attrs to that node. The
      // earlier shape passed `[...op.path, 'unused-for-dirof']`
      // through `navigate` so that `navigate`'s `path.length - 1`
      // would happen to land on `op.path`, but the result was the
      // wrong directory — `navigate` stops one segment short of
      // its argument, so the original code stopped at `op.path`
      // itself and then did `lookup` on the *node* by its own
      // name. No caller emits `set-attrs` ops today, but the bug
      // would bite the moment one does.
      const parent = await dirOf(op.path);
      const node = await E(parent).lookup(lastSeg(op.path));
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
 * Recursively unlink every child of `dir`, leaving `dir` itself
 * empty. Walks depth-first because `unlink` refuses non-empty
 * directories (ENOTEMPTY). Whiteout and opaque-dir entries are
 * just regular files/dirs from the layer's POV, so they get
 * removed too — exactly what `revert()` wants.
 *
 * @param {any} dir
 */
const clearDirRecursive = async dir => {
  const cursor = await E(dir).list();
  const stream = await E(cursor).stream();
  /** @type {Array<{ name: string, isDir: boolean }>} */
  const entries = [];
  for await (const entry of iterateReader(stream)) {
    entries.push({
      name: /** @type {string} */ (entry.name),
      isDir: entry.qid.type === 'directory',
    });
  }
  for (const e of entries) {
    if (e.isDir) {
      const child = await E(dir).lookup(e.name);
      await clearDirRecursive(child);
    }
    await E(dir).unlink(e.name);
  }
};

/**
 * Build a `Layer` cap over a `layerFs` + `backingFs`.
 *
 * @param {object} layerFs
 * @param {object} backingFs
 */
export const makeLayer = (layerFs, backingFs) => {
  // Cache the composed view so repeated `asFilesystem()` calls
  // return the same cap (the caller can reason about identity).
  /** @type {object | null} */
  let composedFs = null;

  return makeExo('Layer', LayerInterface, {
    asFilesystem() {
      // Project a Filesystem view that does NOT carry layer
      // authority (no `diff()` / `apply()` escape hatch). Per
      // DESIGN.md §8.5 this is the layer-over-backing CoW view —
      // whiteouts and opaque markers are honoured the same as
      // `compose(layer, backing)` at the call site.
      if (composedFs === null) {
        composedFs = compose(layerFs, backingFs);
      }
      return composedFs;
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
    async revert() {
      // Discard everything we've accumulated in the writable
      // layer, including whiteouts (so backing entries reappear)
      // and opaque-dir markers (so backing subtrees reappear).
      // The backing filesystem is never reached — `clearDirRecursive`
      // walks `layerFs.root()` only. `composedFs` is reused as-is:
      // `compose` reads live state from `(layerFs, backingFs)` on
      // every operation, so the same composed view cap now
      // reflects the empty layer — and callers (chat, etc.)
      // holding the original cap keep their identity.
      const root = await E(layerFs).root();
      await clearDirRecursive(root);
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
