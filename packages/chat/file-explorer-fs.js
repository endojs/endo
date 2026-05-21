// @ts-check
/* eslint-disable no-await-in-loop, no-underscore-dangle */

// Bridge between the file-explorer UI and `@endo/endo-fs`.
//
// `./file-explorer-env.js` MUST be imported first: it installs the
// `globalThis.harden` / `Buffer` shims that the `@endo/endo-fs` and
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

import { makeInMemoryFilesystem } from '@endo/endo-fs/src/in-memory.js';
import { readOnly } from '@endo/endo-fs/src/readonly.js';
import { makeLayer } from '@endo/endo-fs/src/layer.js';
import { mountAsFilesystem } from '@endo/endo-fs/src/from-mount.js';
import { makeMemoryCas } from '@endo/endo-fs/src/cas.js';
import { withCachedReads } from '@endo/endo-fs/src/cached-fs.js';

/**
 * Any CapTP capability — possibly still an unresolved promise.
 *
 * @typedef {any} Cap
 */

/**
 * @typedef {object} DirEntry
 * @property {string} name
 * @property {'directory' | 'file'} type
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
 * adapt it. A `Filesystem` exposes `root`/`statfs`; a legacy
 * `@endo/daemon` `Mount` exposes `lookup` plus directory mutators.
 *
 * @param {Cap} cap
 * @returns {Promise<'filesystem' | 'mount' | 'unknown'>}
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
 * Coerce a looked-up capability to an endo-fs `Filesystem`. Legacy
 * `Mount` caps are projected through `mountAsFilesystem` (endo-fs
 * `from-mount`).
 *
 * @param {Cap} cap
 * @param {'filesystem' | 'mount'} kind
 * @returns {Cap}
 */
export const toFilesystem = (cap, kind) =>
  kind === 'mount' ? mountAsFilesystem(cap) : cap;
harden(toFilesystem);

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
    await E(openFile).close();
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
 * Mint a change-event watcher for a directory, preferring
 * `watchFrom()` (which atomically mints `{ cursor, watcher }`) over
 * the legacy `watch()` so callers using the cursor for the initial
 * listing close the `list()`+`watch()` TOCTOU race. Falls back to
 * `watch()` for adapters that don't implement `watchFrom`.
 *
 * The cursor returned alongside the watcher is intentionally
 * discarded here; the explorer's UI obtains directory entries via
 * `listDirectory`. Callers that need the TOCTOU-free snapshot
 * should reach for `subscribeChangesAtomic` instead.
 *
 * @param {Cap} directory
 * @returns {Promise<Cap>} the watcher capability
 */
const openWatcher = async directory => {
  const methods = await E(directory).__getMethodNames__();
  if (methods.includes('watchFrom')) {
    const { watcher } = await E(directory).watchFrom();
    return watcher;
  }
  return E(directory).watch();
};

/**
 * Subscribe to a directory's change events. Best-effort: a
 * filesystem without a `watch` surface (e.g. a Mount adapter)
 * simply never reports changes. Returns an unsubscribe function.
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
      const watcher = await openWatcher(directory);
      watcherCap = watcher;
      if (cancelled) {
        E(watcher)
          .cancel()
          .catch(() => {});
        return;
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
