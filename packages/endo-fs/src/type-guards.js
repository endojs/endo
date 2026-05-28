// @ts-check
/**
 * Interface guards for `@endo/endo-fs` (§4 of DESIGN.md).
 *
 * Every cap defined in §4 has an `M.interface` here. The shape of
 * passable records (Qid, Attrs, OpenOpts, ...) is documented in
 * DESIGN.md §4.9 but only loosely validated here (`M.any()` /
 * `M.record()`) — deep schema validation is implementation-time
 * work, not interface-time.
 *
 * Naming convention follows `@endo/exo-stream` and the rest of the
 * repo: `<TypeName>Interface` exported alongside, no `Endo*` prefix
 * (which is `@endo/daemon`'s convention).
 */

import { M } from '@endo/patterns';

// Re-export exo-stream's interface guards so consumers of endo-fs can
// import the stream interfaces from one place.
export {
  PassableReaderInterface,
  PassableBytesReaderInterface,
  PassableBytesWriterInterface,
} from '@endo/exo-stream/type-guards.js';

/**
 * Pattern matching anything passable. Stand-in for fully-typed
 * record patterns until F1 hardens the schemas.
 */
const Pass = M.any();

const FilesystemMethods = {
  root: M.call().returns(M.eref(M.remotable('Directory'))),
  named: M.call(M.string()).returns(M.eref(M.remotable('Directory'))),
  statfs: M.call().returns(M.promise()),
  // Extractable identity for cross-CapTP cycle detection. Returns
  // the set of primitive-Filesystem brand IDs reachable through
  // this cap; wrappers union their participants' brands.
  // `bigint` survives marshalling, so a Filesystem cap that's
  // passed across CapTP and re-composed locally still reports the
  // same brand — letting the composer detect the cycle that the
  // local-Symbol check (per-cap-presence) would miss.
  // See ROADMAP §1.6.
  brands: M.call().returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
};

// `sloppy: true` allows exo implementations to expose additional
// methods beyond what's declared here. New methods land in wrap-
// backend.js (the seam refactor) while these guards stay focused
// on the canonical wire shape; consumers that opt in to the new
// methods see them directly without an interface bump.
export const FilesystemInterface = M.interface(
  'Filesystem',
  FilesystemMethods,
  {
    sloppy: true,
  },
);
harden(FilesystemInterface);

/**
 * Methods that every `Directory` and `File` exposes (§4.2 Node base).
 * Composed into the per-subtype interfaces below.
 *
 * The interface declares both the "narrow" portable shape
 * (`getStat`/`setStat`, accepting only `size`/`mtime`/`atime`) and
 * the "wide" legacy shape (`getAttrs`/`setAttrs`/`getQid`/`xattrs`,
 * the pre-seam-refactor surface). Both are real public methods on
 * wrapBackend-built exos; consumers can use either pair. POSIX-only
 * fields like `mode`/`uid`/`gid` live in a future `PosixFs`
 * companion cap rather than in the base.
 */
const NodeBaseMethods = {
  getStat: M.call().returns(M.promise()),
  setStat: M.call(Pass).returns(M.promise()),
  getQid: M.call().returns(Pass),
  getAttrs: M.call().returns(M.promise()),
  setAttrs: M.call(Pass).returns(M.promise()),
  watch: M.call().returns(M.eref(M.remotable('NodeWatcher'))),
  xattrs: M.call().returns(M.eref(M.remotable('Xattrs'))),
  help: M.call().optional(M.string()).returns(M.string()),
};

export const DirectoryInterface = M.interface(
  'Directory',
  {
    ...NodeBaseMethods,
    lookup: M.call(M.string()).returns(
      M.eref(M.or(M.remotable('Directory'), M.remotable('File'))),
    ),
    list: M.call().returns(M.eref(M.remotable('Cursor'))),
    create: M.call(M.string(), Pass).returns(M.eref(M.remotable('OpenFile'))),
    makeDirectory: M.call(M.string(), Pass).returns(
      M.eref(M.remotable('Directory')),
    ),
    remove: M.call(M.string()).returns(M.promise()),
    // Legacy aliases for `makeDirectory` / `remove`. Kept declared
    // so the interface is honest about what wrapBackend's Directory
    // exos actually expose.
    mkdir: M.call(M.string(), Pass).returns(M.eref(M.remotable('Directory'))),
    unlink: M.call(M.string()).returns(M.promise()),
    // `newParent` is wrapped in `M.await` so a caller can pipeline a
    // `lookup → rename` chain without an intermediate await:
    //
    //   const newParent = E(host).lookup('newDir');       // promise
    //   await E(srcDir).rename('a', newParent, 'b');      // dispatched in
    //                                                      // the same batch
    //
    // The exo's async-shape dispatch (`M.callWhen`) awaits each
    // `M.await(...)` argument before invoking the method body. Without
    // this, the caller would need a serial round-trip: await the
    // lookup, then call rename. With it, the two collapse to one
    // round-trip. See DESIGN.md §10.1 for the cost framework.
    rename: M.callWhen(
      M.string(),
      M.await(M.remotable('Directory')),
      M.string(),
    ).returns(M.undefined()),
    fsync: M.call().returns(M.promise()),
    // Walk a path from this directory; for each segment, return the
    // existing Directory or `mkdir(seg)` it. The whole walk dispatches
    // in one round-trip per segment (the per-call branch is
    // server-side), so a deep materialise is one batch instead of
    // N serial lookup-then-mkdir round-trips. Compare DESIGN.md §10.1
    // [RT] item "No lookupOrCreate / materialise primitive".
    materialise: M.call(M.arrayOf(M.string()), Pass).returns(
      M.eref(M.remotable('Directory')),
    ),
    // Atomic snapshot + subscribe: returns a `Cursor` over the
    // directory's entries at the moment of subscription PLUS a
    // `NodeWatcher` that will receive every event from that point
    // onward — no gap between snapshot and subscribe. The standalone
    // `list()` + `watch()` pair has a TOCTOU race where mutations
    // between the two calls are invisible to both; `watchFrom`
    // closes that gap by materialising both halves in one method
    // invocation. See DESIGN.md §10.1.
    watchFrom: M.call().returns(M.eref(Pass)),
  },
  { sloppy: true },
);
harden(DirectoryInterface);

export const FileInterface = M.interface(
  'File',
  {
    ...NodeBaseMethods,
    open: M.call(Pass).returns(M.eref(M.remotable('OpenFile'))),
    snapshot: M.call().returns(M.promise()),
  },
  { sloppy: true },
);
harden(FileInterface);

// Cursor / OpenFile / Lock / Xattrs / NodeWatcher / BlobRef are
// non-evolving — their method set is stable; we declare every
// public method explicitly and skip `sloppy: true`. Drift on these
// guards is a real bug we want CapTP to catch.

export const CursorInterface = M.interface('Cursor', {
  // Bounded page read for single-RTT directory listing. Returns
  // `{ entries: DirEntry[], atEnd: boolean }`. `limit` is optional;
  // omitted = drain the rest.
  read: M.call().optional(M.bigint()).returns(M.promise()),
  // Streaming reader over `DirEntry` for huge directories.
  stream: M.call().returns(M.eref(M.remotable('PassableReader'))),
  // Drain-everything convenience; do not use on unbounded listings.
  toArray: M.call().returns(M.promise()),
  skip: M.call(M.bigint()).returns(M.promise()),
  rewind: M.call().returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(CursorInterface);

export const OpenFileInterface = M.interface('OpenFile', {
  // `read(offset, length)` returns a `PassableBytesReader` over the
  // requested slice. CapTP marshalling rejects raw mutable typed
  // arrays, so the wire shape stays a base64-streamed reader —
  // single-RTT pipelining via E gets the same effective cost as a
  // bare bytes return; see designs/endo-fs-backend-seam.md
  // "Design deviation". Both args optional so a 0-arg call is a
  // "from cursor to EOF" probe.
  read: M.callWhen().optional(M.bigint(), M.bigint()).returns(Pass),
  // `write(offset)` returns a `PassableBytesWriter` whose chunks are
  // coalesced and pwritten at `offset` on close (no truncate of the
  // tail). `offset` is optional — defaults to the cursor.
  write: M.callWhen().optional(M.bigint()).returns(Pass),
  truncate: M.call(M.bigint()).returns(M.promise()),
  fsync: M.call(Pass).returns(M.promise()),
  lock: M.call(Pass).returns(M.eref(M.remotable('Lock'))),
  getLock: M.call(Pass).returns(M.promise()),
  close: M.call().returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(OpenFileInterface);

export const LockInterface = M.interface('Lock', {
  release: M.call().returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(LockInterface);

export const XattrsInterface = M.interface('Xattrs', {
  get: M.call(M.string()).returns(M.eref(M.remotable('PassableBytesReader'))),
  set: M.call(M.string(), Pass).returns(
    M.eref(M.remotable('PassableBytesWriter')),
  ),
  list: M.call().returns(M.eref(M.remotable('PassableReader'))),
  remove: M.call(M.string()).returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(XattrsInterface);

/**
 * `Node.watch` returns a watcher cap whose `events()` yields a
 * PassableReader<Event> from `@endo/exo-stream`.
 */
export const NodeWatcherInterface = M.interface('NodeWatcher', {
  events: M.call().returns(M.eref(M.remotable('PassableReader'))),
  cancel: M.call().returns(M.promise()),
});
harden(NodeWatcherInterface);

/**
 * `BlobRef` is the content-addressed handle returned by
 * `File.snapshot()` (DESIGN.md §6). `getInfo()` returns
 * `{ algorithm, hash, size }`; `fetch(offset, length)` returns a
 * bytes stream over the immutable bytes captured at snapshot
 * time. `getInfo()` is a sync getter on the responder; callers
 * pipeline it alongside `snapshot` / `fetch` so the round-trip is
 * shared with the surrounding call (DESIGN.md §4.10).
 */
export const BlobRefInterface = M.interface('BlobRef', {
  getInfo: M.call().returns(Pass),
  fetch: M.call(M.bigint(), M.bigint()).returns(
    M.eref(M.remotable('PassableBytesReader')),
  ),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(BlobRefInterface);

/**
 * Tree-blob shape consumed by `@endo/daemon`'s `make-from-tree`
 * formula: a blob with a single `text()` method returning the
 * file's contents as a UTF-8 string. See `tree-view.js`.
 */
export const TreeBlobInterface = M.interface('TreeBlob', {
  text: M.call().returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(TreeBlobInterface);

/**
 * Tree-view shape consumed by `@endo/daemon`'s `make-from-tree`
 * formula: `lookup(name)` maps a `string` (single segment) or
 * `string[]` (segments) to a `TreeBlob`. See `tree-view.js`.
 */
export const TreeViewInterface = M.interface('TreeView', {
  lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(
    M.eref(M.remotable('TreeBlob')),
  ),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(TreeViewInterface);
