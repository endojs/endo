// @ts-check
/* eslint-disable no-await-in-loop, no-underscore-dangle */

// Bridge between the file-explorer UI and `@endo/platform/fs/extended`.
//
// `./file-explorer-env.js` MUST be imported first: it installs the
// `globalThis.harden` / `Buffer` shims that the `@endo/platform/fs/extended` and
// `@endo/exo-stream` modules below assume.
//
// Capability chains are kept as unresolved promises wherever
// possible so CapTP pipelines them: a deep `root → lookup → lookup
// → open → read` walk dispatches as one batch instead of one
// round trip per segment.

import './file-explorer-env.js';

import { E } from '@endo/far';
import harden from '@endo/harden';

import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

import { makeInMemoryFilesystem } from '@endo/platform/fs/extended/in-memory.js';
import { readOnly } from '@endo/platform/fs/extended/readonly.js';
import { makeLayer } from '@endo/platform/fs/extended/layer.js';
import { mountAsFilesystem } from '@endo/platform/fs/extended/from-mount.js';
import { makeMemoryCas } from '@endo/platform/fs/extended/cas.js';
import { withCachedReads } from '@endo/platform/fs/extended/cached-fs.js';

/**
 * Any CapTP capability — possibly still an unresolved promise.
 *
 * @typedef {any} Cap
 */

/**
 * @typedef {object} DirEntry
 * @property {string} name
 * @property {'directory' | 'file' | 'unknown' | 'git'} type -
 *   `'git'` marks an `@endo/exo-git` cap (browsable via its
 *   worktree); `'unknown'` marks a child that is neither a
 *   sub-directory, a file, nor a recognized openable cap. The base
 *   endo-fs filesystem surface drops both (it is tree-only), so the
 *   explorer only sees them via raw-Mount enumeration.
 */

// Read/write in bounded chunks so a single `@endo/exo-stream`
// frame never exceeds its base64 length guard.
const CHUNK_BYTES = 256 * 1024;
const FRAME_LIMIT = CHUNK_BYTES * 2;

// Files larger than this are not previewed in full.
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

// Blob capacity of the ephemeral CAS-backed read cache.
const CAS_CAPACITY = 512;

/**
 * Classify a looked-up capability so the explorer knows how to
 * adapt it. A `Filesystem` exposes `root`/`statfs`; a `Layer`
 * exposes `asFilesystem`/`diff`/`apply`/`backing`; a legacy
 * `@endo/daemon` `Mount` exposes `lookup` plus directory mutators.
 *
 * Layer detection runs first because a `Layer` is a strictly more
 * authoritative cap than the `Filesystem` it covers — handing it
 * back as `'filesystem'` would lose the diff/apply surface that
 * makes it useful to re-open from the inventory.
 *
 * @param {Cap} cap
 * @returns {Promise<'filesystem' | 'layer' | 'mount' | 'git' | 'unknown'>}
 */
export const classifyCapability = async cap => {
  await null;
  let methods;
  try {
    methods = await E(cap).__getMethodNames__();
  } catch {
    return 'unknown';
  }
  const names = new Set(methods);
  if (
    names.has('asFilesystem') &&
    names.has('diff') &&
    names.has('apply') &&
    names.has('backing')
  ) {
    return 'layer';
  }
  // An `@endo/exo-git` cap — browsable through its writable worktree.
  if (names.has('worktree') && names.has('status') && names.has('commit')) {
    return 'git';
  }
  if (names.has('root') && names.has('statfs')) {
    return 'filesystem';
  }
  if (
    names.has('lookup') &&
    (names.has('makeDirectory') || names.has('writeText') || names.has('list'))
  ) {
    return 'mount';
  }
  return 'unknown';
};
harden(classifyCapability);

/**
 * Coerce a classified capability to an endo-fs `Filesystem`.
 * - `'filesystem'` is returned as-is.
 * - `'mount'` is projected through `mountAsFilesystem` (endo-fs
 *   `from-mount`).
 * - `'layer'` is projected through `asFilesystem()` so callers
 *   that only need read/write composed-view access don't have to
 *   know about the diff/apply surface. Returns a Promise in the
 *   layer case (the projection is a CapTP round trip); callers
 *   that need a synchronous result should await.
 *
 * - `'git'` is projected through its writable `worktree()` Mount, so
 *   the explorer browses the live working tree (including uncommitted
 *   files).
 *
 * @param {Cap} cap
 * @param {'filesystem' | 'layer' | 'mount' | 'git'} kind
 * @returns {Cap | Promise<Cap>}
 */
export const toFilesystem = (cap, kind) => {
  if (kind === 'mount') return mountAsFilesystem(cap);
  if (kind === 'git') return mountAsFilesystem(E(cap).worktree());
  if (kind === 'layer') return E(cap).asFilesystem();
  return cap;
};
harden(toFilesystem);

/**
 * Resolve a git cap's writable worktree Mount, so callers can both
 * browse it (via {@link mountAsFilesystem}) and enumerate its raw
 * children (surfacing nested non-fs caps). Pipelines onto `cap`.
 *
 * @param {Cap} cap
 * @returns {Cap}
 */
export const gitWorktreeMount = cap => E(cap).worktree();
harden(gitWorktreeMount);

/**
 * Create a fresh, empty in-memory `Filesystem`.
 *
 * @returns {Cap}
 */
export const makeMemoryFilesystem = () => makeInMemoryFilesystem();
harden(makeMemoryFilesystem);

/**
 * Wrap a `Filesystem` in the endo-fs read-only attenuator.
 *
 * @param {Cap} filesystem
 * @returns {Cap}
 */
export const makeReadOnlyView = filesystem => readOnly(filesystem);
harden(makeReadOnlyView);

/**
 * Wrap a `Filesystem` with an ephemeral, content-addressed
 * LRU read cache (endo-fs `withCachedReads` + `makeMemoryCas`).
 * Cache hits answer reads with zero round trips.
 *
 * @param {Cap} filesystem
 * @returns {Cap}
 */
export const makeCachedFilesystem = filesystem =>
  withCachedReads(filesystem, makeMemoryCas({ capacity: CAS_CAPACITY }));
harden(makeCachedFilesystem);

/**
 * Build a writable layer over a backing `Filesystem`. The layer's
 * own mutations land in a fresh in-memory filesystem; reads fall
 * through to the backing.
 *
 * @param {Cap} backingFilesystem
 * @returns {{ layer: Cap, layerFilesystem: Cap }}
 */
export const makeFilesystemLayer = backingFilesystem => {
  const layerFilesystem = makeInMemoryFilesystem();
  const layer = makeLayer(layerFilesystem, backingFilesystem);
  return harden({ layer, layerFilesystem });
};
harden(makeFilesystemLayer);

/**
 * Replay a layer's accumulated mutations onto a target filesystem.
 *
 * @param {Cap} layer
 * @param {Cap} targetFilesystem
 * @returns {Promise<void>}
 */
export const applyLayer = async (layer, targetFilesystem) => {
  await E(layer).apply(targetFilesystem);
};
harden(applyLayer);

/**
 * Collect the layer's diff as an array of `LayerOp` records.
 *
 * @param {Cap} layer
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export const collectLayerOps = async layer => {
  const reader = await E(layer).diff();
  /** @type {Array<Record<string, unknown>>} */
  const ops = [];
  for await (const op of iterateReader(reader)) {
    ops.push(op);
  }
  return harden(ops);
};
harden(collectLayerOps);

/**
 * Resolve the root directory of a filesystem. Returns the
 * pipelinable promise without awaiting it.
 *
 * @param {Cap} filesystem
 * @returns {Cap}
 */
export const getRoot = filesystem => E(filesystem).root();
harden(getRoot);

/**
 * Look up a named child of a directory. `directory` may itself be
 * an unresolved promise, so the lookup pipelines onto it.
 *
 * @param {Cap} directory
 * @param {string} name
 * @returns {Cap}
 */
export const lookupChild = (directory, name) => E(directory).lookup(name);
harden(lookupChild);

/**
 * List a directory's entries, directories first then files, each
 * group sorted by name. `list()` and `stream()` are pipelined.
 *
 * @param {Cap} directory
 * @returns {Promise<DirEntry[]>}
 */
export const listDirectory = async directory => {
  const stream = await E(E(directory).list()).stream();
  /** @type {DirEntry[]} */
  const entries = [];
  for await (const entry of iterateReader(stream)) {
    const record = /** @type {{ name: string, qid?: { type?: string } }} */ (
      entry
    );
    const type =
      record.qid && record.qid.type === 'directory' ? 'directory' : 'file';
    entries.push({ name: String(record.name), type });
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return harden(entries);
};
harden(listDirectory);

/**
 * Classify a child cap of a Mount the same way `@endo/endo-fs`'s
 * from-mount backend does: a `lookup` method means a sub-directory
 * (sub-Mount), `text`/`streamBase64` means a file. Anything else is
 * a non-fs cap (e.g. a git workspace) which the tree-only filesystem
 * surface would silently drop — we surface it as `'unknown'` so the
 * explorer can show it greyed-out instead of hiding it.
 *
 * A git cap (browsable via its worktree) is reported as `'git'` so
 * the explorer can offer to open it; any other non-fs cap is
 * `'unknown'`.
 *
 * @param {Cap} cap
 * @returns {Promise<'directory' | 'file' | 'unknown' | 'git'>}
 */
const probeMountChildType = async cap => {
  await null;
  try {
    const methods = await E(cap).__getMethodNames__();
    const names = new Set(methods);
    if (names.has('lookup')) return 'directory';
    if (names.has('text') || names.has('streamBase64')) return 'file';
    if (names.has('worktree') && names.has('status') && names.has('commit')) {
      return 'git';
    }
  } catch {
    // A child whose introspection rejects is treated as unsupported
    // rather than crashing the whole listing.
  }
  return 'unknown';
};

/**
 * List a Mount's children by enumerating the raw Mount directly
 * (rather than the wrapped, tree-only `Filesystem` surface), so that
 * non-fs children surface as `'unknown'` entries instead of being
 * dropped. Ordering mirrors {@link listDirectory}: directories
 * first, then files, then unsupported entries, each group sorted by
 * name.
 *
 * `mountRoot` is the Mount cap; `pathSegments` is the directory path
 * relative to it (`[]` for the root). Nested lookups pipeline onto
 * the root in a single round trip.
 *
 * @param {Cap} mountRoot
 * @param {string[]} pathSegments
 * @returns {Promise<DirEntry[]>}
 */
export const listMountDirectory = async (mountRoot, pathSegments) => {
  await null;
  const dir =
    pathSegments.length === 0 ? mountRoot : E(mountRoot).lookup(pathSegments);
  const names = /** @type {string[]} */ (await E(dir).list());
  /** @type {DirEntry[]} */
  const entries = await Promise.all(
    names.map(async name => {
      const type = await probeMountChildType(E(dir).lookup(name));
      return { name: String(name), type };
    }),
  );
  const rank = { directory: 0, git: 1, file: 2, unknown: 3 };
  entries.sort((a, b) => {
    if (a.type !== b.type) return rank[a.type] - rank[b.type];
    return a.name.localeCompare(b.name);
  });
  return harden(entries);
};
harden(listMountDirectory);

/**
 * Read a file's bytes, capped at the preview limit. `getAttrs`
 * and `open` are dispatched together (and pipeline onto any
 * upstream `lookup`).
 *
 * @param {Cap} fileCap
 * @returns {Promise<{ bytes: Uint8Array, size: number, truncated: boolean }>}
 */
export const readFile = async fileCap => {
  const attrsPromise = E(fileCap).getAttrs();
  const openPromise = E(fileCap).open({ read: true });
  // Defensive: if attrsPromise throws first we never await openPromise,
  // so attach a no-op catch to keep its rejection out of the unhandled
  // queue.
  openPromise.catch(() => {});
  const attrs = await attrsPromise;
  const size = Number(attrs.size);
  const limit = Math.min(size, MAX_PREVIEW_BYTES);
  /** @type {Uint8Array[]} */
  const pieces = [];
  try {
    let offset = 0;
    while (offset < limit) {
      const take = Math.min(CHUNK_BYTES, limit - offset);
      const reader = await E(openPromise).read(BigInt(offset), BigInt(take));
      for await (const piece of iterateBytesReader(reader, {
        stringLengthLimit: FRAME_LIMIT,
      })) {
        pieces.push(piece);
      }
      offset += take;
    }
  } finally {
    // Best-effort: never let close() mask the primary read error.
    await E(openPromise)
      .close()
      .catch(() => {});
  }
  let total = 0;
  for (const piece of pieces) {
    total += piece.length;
  }
  const bytes = new Uint8Array(total);
  let cursor = 0;
  for (const piece of pieces) {
    bytes.set(piece, cursor);
    cursor += piece.length;
  }
  return harden({ bytes, size, truncated: size > MAX_PREVIEW_BYTES });
};
harden(readFile);

/**
 * Overwrite a file's contents with the given text.
 *
 * @param {Cap} fileCap
 * @param {string} text
 * @returns {Promise<void>}
 */
export const writeFileText = async (fileCap, text) => {
  const bytes = new TextEncoder().encode(text);
  const openFile = await E(fileCap).open({ write: true, truncate: true });
  try {
    const writer = await E(openFile).write(0n);
    const sink = iterateBytesWriter(writer);
    let offset = 0;
    while (offset < bytes.length) {
      const chunk = bytes.subarray(offset, offset + CHUNK_BYTES);
      await sink.next(chunk);
      offset += chunk.length;
    }
    await sink.return();
  } finally {
    // Best-effort: never let close() mask the primary write error.
    // Mirrors `readFile`'s finally-close discipline above.
    await E(openFile)
      .close()
      .catch(() => {});
  }
};
harden(writeFileText);

/**
 * Create an empty subdirectory.
 *
 * @param {Cap} directory
 * @param {string} name
 * @returns {Promise<void>}
 */
export const createDirectory = async (directory, name) => {
  await E(directory).mkdir(name, {});
};
harden(createDirectory);

/**
 * Create an empty file (failing if one already exists).
 *
 * @param {Cap} directory
 * @param {string} name
 * @returns {Promise<void>}
 */
export const createFile = async (directory, name) => {
  const openFile = await E(directory).create(name, { exclusive: true });
  await E(openFile).close();
};
harden(createFile);

/**
 * Remove a file or empty directory.
 *
 * @param {Cap} directory
 * @param {string} name
 * @returns {Promise<void>}
 */
export const removeEntry = async (directory, name) => {
  await E(directory).unlink(name);
};
harden(removeEntry);

/**
 * Move/rename an entry. `sourceDirectory` and `targetDirectory`
 * must belong to the same filesystem.
 *
 * @param {Cap} sourceDirectory
 * @param {string} name
 * @param {Cap} targetDirectory
 * @param {string} newName
 * @returns {Promise<void>}
 */
export const renameEntry = async (
  sourceDirectory,
  name,
  targetDirectory,
  newName,
) => {
  await E(sourceDirectory).rename(name, targetDirectory, newName);
};
harden(renameEntry);

/**
 * Subscribe to a directory's change events with TOCTOU-free setup.
 * Returns an unsubscribe function that is safe to call before the
 * watcher has finished establishing.
 *
 * Establishment prefers `watchFrom()` (the atomic
 * `{ cursor, watcher }` mint per endo-fs DESIGN.md §10.1) over the
 * legacy `watch()`, in a single round trip — we don't probe
 * `__getMethodNames__` first; the `watch()` fallback only fires if
 * `watchFrom` actually rejects. The cursor `watchFrom` yields is
 * discarded (the explorer's UI takes its snapshot via
 * `listDirectory`), but once the watcher is live we synthesise a
 * `{ kind: 'watch-ready' }` event so consumers can (re-)take their
 * snapshot under the active subscription. That fully closes the
 * `list()` + `watch()` race: any mutation observable after
 * watch-ready is either in the post-establish snapshot or in an
 * event the watcher is about to emit.
 *
 * Subscription is otherwise best-effort: pump errors are swallowed,
 * so a Mount adapter without a watch surface simply yields no
 * events past `watch-ready`.
 *
 * @param {Cap} directory
 * @param {(event: unknown) => void} onChange
 * @returns {() => void}
 */
export const subscribeChanges = (directory, onChange) => {
  let cancelled = false;
  /** @type {Cap} */
  let watcherCap = null;
  const pump = async () => {
    await null;
    try {
      /** @type {Cap} */
      let watcher;
      try {
        // Atomic establish — one round trip — when supported.
        const result = await E(directory).watchFrom();
        watcher = result.watcher;
      } catch {
        // Fallback for adapters that predate watchFrom.
        watcher = await E(directory).watch();
      }
      watcherCap = watcher;
      if (cancelled) {
        E(watcher)
          .cancel()
          .catch(() => {});
        return;
      }
      // Signal the consumer that the subscription is live; the
      // explorer treats this as a cue to re-take its directory
      // snapshot under the now-active watcher.
      try {
        onChange(harden({ kind: 'watch-ready' }));
      } catch {
        // Consumer errors must not tear down the pump.
      }
      const events = await E(watcher).events();
      for await (const event of iterateReader(events)) {
        if (cancelled) break;
        onChange(event);
      }
    } catch {
      // No watch surface, or the stream ended — best-effort only.
    }
  };
  pump().catch(() => {});
  return () => {
    cancelled = true;
    if (watcherCap) {
      E(watcherCap)
        .cancel()
        .catch(() => {});
    }
  };
};
harden(subscribeChanges);

/**
 * Decode file bytes as UTF-8 text, flagging probable binary data.
 *
 * @param {Uint8Array} bytes
 * @returns {{ text: string, binary: boolean }}
 */
export const decodeText = bytes => {
  const sampleLength = Math.min(bytes.length, 8000);
  for (let i = 0; i < sampleLength; i += 1) {
    if (bytes[i] === 0) {
      return harden({ text: '', binary: true });
    }
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return harden({ text, binary: false });
};
harden(decodeText);
