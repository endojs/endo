// @ts-check
/* eslint-disable no-use-before-define */
/**
 * Transparent CAS-backed caching wrapper (DESIGN.md §6, ROADMAP §2.2).
 *
 * `withCachedReads(fs, cas)` wraps any `Filesystem` cap and produces
 * one with the same interface, where `OpenFile.read(offset, length)`
 * is served from `cas` on cache hits and falls through to the
 * underlying file on misses. Hash discovery (`snapshot()` →
 * `getInfo()`) pipelines through CapTP's eventual-send queue
 * alongside the speculative underlying read, so the wrapper costs
 * exactly one round-trip per `read` regardless of hit or miss —
 * matching the cost of a plain `read` with no caching layer.
 *
 * Mechanism:
 *
 *   1. On every `read`, the wrapper dispatches three calls in the
 *      same synchronous turn (and therefore the same CapTP batch):
 *      - `E(underlyingFile).snapshot()` → `BlobRef`
 *      - `E(blob).getInfo()` → `{ algorithm, hash, size }`
 *      - `E(underlyingOh).read(offset, length)` → speculative
 *        `PassableBytesReader`
 *   2. Await `getInfo`. Look up `(algorithm, hash)` in the CAS.
 *   3. On hit, return a reader over the cached slice. The
 *      speculative reader is never iterated, so its bytes never
 *      flow (`@endo/exo-stream` is pull-based) — no bandwidth waste.
 *   4. On miss, return the speculative reader directly to the
 *      caller (the bytes are already in flight from the same batch).
 *      In the background, fetch the full file via the BlobRef and
 *      populate the CAS so the *next* read of this content is a hit.
 *   5. If `snapshot()` returns `null` (backing has no CAS support),
 *      degenerate to plain pass-through.
 *
 * Writes / mutations pass through unchanged. The pre-write hash
 * entry remains in the CAS as harmless leftover; the post-write
 * content has a different hash, so the next read misses correctly
 * (no explicit invalidation needed).
 *
 * Composes with the rest of the algebra:
 *
 *     const cas = makeMemoryCas();
 *     const cached = withCachedReads(remoteFs, cas);
 *     const view = chroot(cached, ['workspace']);
 */

import { makeExo } from '@endo/exo';
import { E } from '@endo/eventual-send';
import { q } from '@endo/errors';

import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import {
  FilesystemInterface,
  DirectoryInterface,
  FileInterface,
  OpenFileInterface,
} from './type-guards.js';
import {
  EMPTY_BYTES,
  makeBytesReaderFromBytes,
  toSafeNumber,
} from './shared/helpers.js';

/**
 * @typedef {import('./cas.js').ContentAddressedStore} ContentAddressedStore
 * @typedef {{ algorithm: string, hash: string, size: bigint }} BlobInfo
 */

/**
 * Wrap a `Filesystem` so file reads consult `cas` first. Returns a
 * `Filesystem` cap that's structurally indistinguishable from a
 * primitive one (composes with `chroot`, `compose`, `readOnly`, …).
 *
 * @param {object} inner  any `Filesystem` cap
 * @param {ContentAddressedStore} cas
 * @returns {object}      a caching `Filesystem` cap
 */
export const withCachedReads = (inner, cas) => {
  // Dedupe concurrent background populates of the same hash so two
  // simultaneous misses for the same content don't both drag the
  // bytes twice.
  /** @type {Map<string, Promise<void>>} */
  const inFlight = new Map();

  // Wrapper-Directory → inner-Directory map. `rename` on the
  // disk-backed and Mount-adapted backings identifies same-FS targets
  // by `WeakMap.get(newParent)` keyed on the inner exo; passing the
  // wrapper through unchanged would look like a different FS and
  // raise EXDEV. Recording every wrapped Directory here lets `rename`
  // unwrap before forwarding.
  /** @type {WeakMap<object, object>} */
  const wrapperToInner = new WeakMap();

  /**
   * @param {any} blobP
   * @param {BlobInfo} info
   */
  const populateInBackground = (blobP, info) => {
    const key = `${info.algorithm}:${info.hash}`;
    if (cas.has(info) || inFlight.has(key)) return;
    const promise = (async () => {
      try {
        if (cas.has(info)) return;
        const size = toSafeNumber(info.size, 'size');
        const fullReader = await E(blobP).fetch(0n, BigInt(size));
        /** @type {Uint8Array[]} */
        const chunks = [];
        let total = 0;
        for await (const chunk of iterateBytesReader(fullReader)) {
          chunks.push(chunk);
          total += chunk.length;
        }
        const merged = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          merged.set(c, off);
          off += c.length;
        }
        if (!cas.has(info)) cas.put(info, merged);
      } catch {
        // Best-effort. Caller already got their bytes via the
        // speculative read; cache populate is incidental.
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, promise);
  };

  return makeCachingFilesystem(inner, cas, populateInBackground, wrapperToInner);
};
harden(withCachedReads);

/**
 * Resolve a `Node` cap + its `qid` in one pipelined batch (DESIGN.md
 * §4.10). `getQid` is sync on the responder but costs one RTT across
 * CapTP; pipelining it alongside the call that produced the cap
 * folds it into the same batch, so the wrapper's sync `getQid()`
 * getter can honor `M.call().returns(Pass)` without paying a per-
 * call round-trip.
 *
 * @param {Promise<any> | any} nodeRef
 */
const resolveNodeWithQid = async nodeRef => {
  const qidP = E(nodeRef).getQid();
  const [node, qid] = await Promise.all([Promise.resolve(nodeRef), qidP]);
  return { node, qid };
};

/**
 * @param {object} inner
 * @param {ContentAddressedStore} cas
 * @param {(blobP: any, info: BlobInfo) => void} populateInBackground
 * @param {WeakMap<object, object>} wrapperToInner
 */
const makeCachingFilesystem = (
  inner,
  cas,
  populateInBackground,
  wrapperToInner,
) => {
  return makeExo('Filesystem', FilesystemInterface, {
    async root() {
      const { node, qid } = await resolveNodeWithQid(E(inner).root());
      return makeCachingDirectory(
        node,
        qid,
        cas,
        populateInBackground,
        wrapperToInner,
      );
    },
    async named(viewName) {
      const { node, qid } = await resolveNodeWithQid(E(inner).named(viewName));
      return makeCachingDirectory(
        node,
        qid,
        cas,
        populateInBackground,
        wrapperToInner,
      );
    },
    async statfs() {
      return E(inner).statfs();
    },
    help(method) {
      if (method === undefined) {
        return 'Filesystem (CAS-cached). Reads consult a local CAS before falling through to the underlying file.';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};

/**
 * @param {object} dir
 * @param {any} cachedQid  qid resolved at construction so the
 *   wrapper's sync `getQid()` doesn't need to fall back to a remote
 *   call (DESIGN.md §4.10 pipelining convention)
 * @param {ContentAddressedStore} cas
 * @param {(blobP: any, info: BlobInfo) => void} populateInBackground
 * @param {WeakMap<object, object>} wrapperToInner
 */
const makeCachingDirectory = (
  dir,
  cachedQid,
  cas,
  populateInBackground,
  wrapperToInner,
) => {
  const exo = makeExo('Directory', DirectoryInterface, {
    getQid() {
      return cachedQid;
    },
    async getAttrs() {
      return E(dir).getAttrs();
    },
    async setAttrs(updates) {
      return E(dir).setAttrs(updates);
    },
    async watch() {
      return E(dir).watch();
    },
    async xattrs() {
      return E(dir).xattrs();
    },
    async lookup(name) {
      // Pipeline lookup + getQid as one batch so a CapTP-mediated
      // lookup still costs one RTT total — and we cache the qid
      // on the wrapper exo so its sync `getQid()` getter doesn't
      // need a follow-up round-trip (DESIGN.md §4.10 convention).
      const { node, qid } = await resolveNodeWithQid(E(dir).lookup(name));
      if (qid && qid.type === 'directory') {
        return makeCachingDirectory(
          node,
          qid,
          cas,
          populateInBackground,
          wrapperToInner,
        );
      }
      return makeCachingFile(node, qid, cas, populateInBackground);
    },
    async list() {
      return E(dir).list();
    },
    async create(name, opts) {
      // create() returns an OpenFile directly. Wrap so the
      // caller's first write goes through the wrapper too.
      const underlyingOh = await E(dir).create(name, opts);
      // We don't have a File cap here (create returns OpenFile,
      // not File), so the wrapped OpenFile has no underlyingFile
      // for `snapshot()`. Treat it as no-cache (pass through). A
      // subsequent `lookup(name)` would return a wrapped File whose
      // open() participates in the cache.
      return makeCachingOpenFile(underlyingOh, null, cas, populateInBackground);
    },
    async mkdir(name, opts) {
      const { node, qid } = await resolveNodeWithQid(E(dir).mkdir(name, opts));
      return makeCachingDirectory(
        node,
        qid,
        cas,
        populateInBackground,
        wrapperToInner,
      );
    },
    async unlink(name) {
      return E(dir).unlink(name);
    },
    async rename(oldName, newParent, newName) {
      // The underlying disk-backed and Mount-adapted impls identify
      // same-FS targets via a private `WeakMap.get(newParent)`
      // keyed on the inner exo, so forwarding the wrapper would
      // raise EXDEV. Look up the inner; fall back to forwarding the
      // raw value (covers callers passing inner caps directly).
      const inner = wrapperToInner.get(newParent) || newParent;
      return E(dir).rename(oldName, inner, newName);
    },
    async fsync() {
      return E(dir).fsync();
    },
    async materialise(path, opts) {
      // Delegate to the inner — primitive backings collapse the
      // whole walk to one RTT. Wrap the resulting Directory cap.
      const innerLeaf = await E(dir).materialise(path, opts || {});
      const qid = await E(innerLeaf).getQid();
      return makeCachingDirectory(
        innerLeaf,
        qid,
        cas,
        populateInBackground,
        wrapperToInner,
      );
    },
    help(method) {
      if (method === undefined) {
        return 'Directory (CAS-cached).';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
  wrapperToInner.set(exo, dir);
  return exo;
};

/**
 * Per-File state used by `withCachedReads` to skip the
 * `snapshot + getInfo` round-trip on reads of an unchanged file.
 * The wrapper subscribes to `file.watch()` on first read; any event
 * flips `dirty`, forcing the next read to re-discover the hash and
 * refresh `knownInfo`.
 *
 * @typedef {object} FileWatchState
 * @property {BlobInfo | null} knownInfo
 *   Last `BlobInfo` we observed for this File, or null if we
 *   haven't read it yet.
 * @property {boolean} dirty
 *   Set to true when the watcher reports any event; cleared on
 *   the next full snapshot/getInfo round-trip.
 * @property {boolean} watchSubscribed
 *   Whether we've already subscribed to the underlying watcher.
 */

/**
 * @param {object} file
 * @param {any} cachedQid  qid resolved at construction so the
 *   wrapper's sync `getQid()` doesn't need to fall back to a remote
 *   call (DESIGN.md §4.10 pipelining convention)
 * @param {ContentAddressedStore} cas
 * @param {(blobP: any, info: BlobInfo) => void} populateInBackground
 */
const makeCachingFile = (file, cachedQid, cas, populateInBackground) => {
  // Per-File state captured in this closure. Intentionally NOT
  // hardened — the `dirty`, `knownInfo`, and `watchSubscribed`
  // fields are mutable, and the object never escapes this scope.
  /** @type {FileWatchState} */
  const state = {
    knownInfo: null,
    dirty: false,
    watchSubscribed: false,
  };

  // Subscribe lazily — building a watcher costs at least one RTT,
  // and many consumers never read.
  const ensureWatcher = () => {
    if (state.watchSubscribed) return;
    state.watchSubscribed = true;
    void (async () => {
      try {
        const watcher = await E(file).watch();
        const events = await E(watcher).events();
        // eslint-disable-next-line no-unused-vars
        for await (const ev of iterateReader(events)) {
          state.dirty = true;
        }
      } catch {
        // Backings that don't support watch (or the watcher
        // itself failing) shouldn't poison the wrapper. The
        // worst case is the read path falls back to the
        // snapshot+getInfo flow on every call — same as before.
      }
    })();
  };

  return makeExo('File', FileInterface, {
    getQid() {
      return cachedQid;
    },
    async getAttrs() {
      return E(file).getAttrs();
    },
    async setAttrs(updates) {
      return E(file).setAttrs(updates);
    },
    async watch() {
      return E(file).watch();
    },
    async xattrs() {
      return E(file).xattrs();
    },
    async open(opts) {
      const underlyingOh = await E(file).open(opts);
      return makeCachingOpenFile(
        underlyingOh,
        file,
        cas,
        populateInBackground,
        state,
        ensureWatcher,
      );
    },
    async snapshot() {
      // Pass through. The wrapper doesn't intercept snapshots
      // because BlobRefs are already content-addressed — any
      // consumer that calls snapshot() can use a CAS directly.
      return E(file).snapshot();
    },
    help(method) {
      if (method === undefined) {
        return 'File (CAS-cached).';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};

/**
 * @param {object} underlyingOh
 * @param {object | null} underlyingFile  reference for `snapshot()` (null when
 *   the OpenFile was minted by `Directory.create` rather than `File.open`)
 * @param {ContentAddressedStore} cas
 * @param {(blobP: any, info: BlobInfo) => void} populateInBackground
 * @param {FileWatchState} [watchState]  per-File hash cache (omitted when the
 *   OpenFile was minted by `Directory.create` — no File cap to attach to)
 * @param {() => void} [ensureWatcher]  subscribes the per-File watcher on
 *   first use; idempotent
 */
const makeCachingOpenFile = (
  underlyingOh,
  underlyingFile,
  cas,
  populateInBackground,
  watchState,
  ensureWatcher,
) => {
  /**
   * Slice a CAS-cached payload to the requested range and return
   * it as a one-shot reader.
   *
   * @param {Uint8Array} cached
   * @param {bigint | number} offset
   * @param {bigint | number} length
   */
  const sliceCached = (cached, offset, length) => {
    const off = toSafeNumber(offset, 'offset');
    const len = toSafeNumber(length, 'length');
    const end = Math.min(off + len, cached.length);
    const slice =
      off >= cached.length ? EMPTY_BYTES : cached.slice(off, end);
    return makeBytesReaderFromBytes(slice);
  };

  return makeExo('OpenFile', OpenFileInterface, {
    async read(offset, length) {
      // If we have no `underlyingFile` (came from `create`), we
      // can't call `snapshot` — just pass through.
      if (underlyingFile === null) {
        return E(underlyingOh).read(offset, length);
      }
      // Zero-RTT path: if we already know this file's hash from a
      // prior read and a watch subscription hasn't reported any
      // change since, look up the CAS directly. On hit, return
      // immediately without issuing snapshot/getInfo/read.
      if (
        watchState !== undefined &&
        watchState.knownInfo !== null &&
        !watchState.dirty
      ) {
        const cached = cas.get(watchState.knownInfo);
        if (cached !== undefined) {
          // Make sure the watcher is up so future events flip dirty
          // promptly; idempotent.
          if (ensureWatcher) ensureWatcher();
          return sliceCached(cached, offset, length);
        }
      }
      // Fall-through path: snapshot + getInfo + speculative read
      // in one synchronous batch. `@endo/exo-stream` is pull-based,
      // so the speculative reader's bytes don't flow until iterated;
      // on a hit we return a different reader and never iterate the
      // speculative one — no bandwidth waste, no extra RTT.
      const blobP = E(underlyingFile).snapshot();
      const infoP = E(blobP).getInfo();
      const speculativeReadP = E(underlyingOh).read(offset, length);

      const info = await infoP;
      if (info) {
        const typedInfo = /** @type {BlobInfo} */ (info);
        // Refresh hash cache + clear dirty for the next zero-RTT
        // attempt. Subscribe the watcher if we haven't yet.
        if (watchState !== undefined) {
          watchState.knownInfo = typedInfo;
          watchState.dirty = false;
        }
        if (ensureWatcher) ensureWatcher();
        const cached = cas.get(typedInfo);
        if (cached !== undefined) {
          // Cache hit. Slice locally; speculative reader is GC'd
          // unused.
          return sliceCached(cached, offset, length);
        }
        // Cache miss. Hand the speculative reader to the caller
        // (its bytes are already in flight in the same CapTP
        // batch as the hash discovery). Populate the cache in the
        // background so the next read of this content is a hit.
        populateInBackground(blobP, typedInfo);
        return speculativeReadP;
      }
      // No BlobRef on this backing — wrapper degenerates to plain
      // pass-through.
      return speculativeReadP;
    },
    async write(offset) {
      return E(underlyingOh).write(offset);
    },
    async truncate(length) {
      return E(underlyingOh).truncate(length);
    },
    async fsync(opts) {
      return E(underlyingOh).fsync(opts);
    },
    async lock(opts) {
      return E(underlyingOh).lock(opts);
    },
    async getLock(opts) {
      return E(underlyingOh).getLock(opts);
    },
    async close() {
      return E(underlyingOh).close();
    },
    help(method) {
      if (method === undefined) {
        return 'OpenFile (CAS-cached). `read` consults the CAS; other methods pass through.';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
