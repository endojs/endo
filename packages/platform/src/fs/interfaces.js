// @ts-check

import { M } from '@endo/patterns';

// `help: help(method?) → string` is conventional on every capability
// (see root AGENTS.md): with no argument it returns a one-line description
// of the cap; with a method name it documents that method.
const HelpMethod = M.call().optional(M.string()).returns(M.string());

// Shared path-argument shapes. The reconciled vocabulary standardizes on
// `string | string[]` (a single name or a path of segments). Surfaces that
// accept more (e.g. the daemon `EndoMount`, which also takes a `MountEntry`
// cap) widen these in their own guards rather than here — see
// designs/fs-interface-consolidation.md § "The load-bearing constraint".
const NamePathShape = M.arrayOf(M.string());
const NameOrPathShape = M.or(M.string(), M.arrayOf(M.string()));

// `readableBlobMethodGuards` is the shared read-surface for immutable bytes.
// `SnapshotBlob` adds `sha256`; `File` adds the write surface. Exported so the
// extended cap-FS engine and the daemon blob caps can spread one definition
// rather than hand-copying the shapes (designs/fs-interface-consolidation.md
// § C2 / C4).
export const readableBlobMethodGuards = harden({
  help: HelpMethod,
  streamBase64: M.call(M.any()).returns(M.promise()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
});

// `readableTreeMethodGuards` is the shared read-surface for content-addressed
// directories. `SnapshotTree` adds `sha256`; `Directory` adds the write
// surface. Exported for the same reason as `readableBlobMethodGuards`
// (designs/fs-interface-consolidation.md § C2 / C3).
export const readableTreeMethodGuards = harden({
  help: HelpMethod,
  has: M.call().rest(NamePathShape).returns(M.promise()),
  list: M.call().rest(NamePathShape).returns(M.promise()),
  lookup: M.call(NameOrPathShape).returns(M.promise()),
});

// `readableNameHubMethodGuards` is the read surface of a *mutable* name hub /
// directory: the readable-tree read methods plus `maybeLookup`
// (lookup-or-undefined). It is the portable contract that the daemon's
// `EndoDirectory` / `EndoGuest` / `EndoHost` / `EndoMount` and genie's
// `LocalMount` all satisfy by method name (the daemon's full registry hub adds
// locator/identifier methods on top, which stay daemon-side). Lives here, not
// in `@endo/daemon`, so non-daemon hosts (genie, a browser/Go/Rust client) can
// consume it without depending on the daemon. See
// designs/fs-interface-consolidation.md § C1.
export const readableNameHubMethodGuards = harden({
  ...readableTreeMethodGuards,
  maybeLookup: M.call(NameOrPathShape).returns(M.any()),
});

// `directoryFileMethodGuards` is the live read/write surface a directory or
// mount adds on top of the read contract: directory creation plus text I/O.
// Shared by `EndoDirectory` / `EndoGuest` / `EndoHost` and genie's `LocalMount`
// (all on `NameOrPathShape`); `EndoMount` widens these to its entry-accepting
// shape in its own guard.
export const directoryFileMethodGuards = harden({
  makeDirectory: M.call(NameOrPathShape).returns(M.promise()),
  readText: M.call(NameOrPathShape).returns(M.promise()),
  maybeReadText: M.call(NameOrPathShape).returns(M.promise()),
  writeText: M.call(NameOrPathShape, M.string()).returns(M.promise()),
});

// `getInfo()` is the uniform content-address identity accessor: it returns the
// `{ algorithm, hash, size }` triple in one round-trip. It is the shared half
// of the range-I/O surface (live blobs add `fetch` for windowed reads) and is
// *also* carried by the content-addressed snapshot caps (`SnapshotBlob`,
// `SnapshotTree`, daemon `EndoReadableTree`), so a caller can read a content
// hash off *any* blob or tree uniformly via `getInfo().hash` without
// feature-detecting `sha256()` vs `getInfo()`. See
// designs/fs-interface-consolidation.md § C4.
export const getInfoMethodGuard = harden({
  getInfo: M.call().returns(M.any()),
});

// The range-I/O surface for content-addressed bytes — the richer
// `BlobRef` shape (see `@endo/platform/fs/extended` `BlobRefInterface`),
// lifted to a portable record so the daemon's remote blob cap can expose it
// too. `getInfo()` returns the `{ algorithm, hash, size }` triple in a single
// round-trip (so a caller can consult a local CAS before fetching), and
// `fetch(offset, length)` reads a byte *range* without streaming the whole
// blob — the two methods that make remote reads optimal. The whole-value
// `text` / `json` / `streamBase64` accessors layer on top. See
// designs/fs-interface-consolidation.md § C4.
export const rangeReadMethodGuards = harden({
  ...getInfoMethodGuard,
  fetch: M.call(M.bigint(), M.bigint()).returns(M.any()),
});

export const ReadableBlobInterface = M.interface('ReadableBlob', {
  ...readableBlobMethodGuards,
});
harden(ReadableBlobInterface);

// A `ReadableBlob` that also exposes the `BlobRef` range-I/O surface
// (`getInfo` / `fetch`) — the rich shape for content-addressed blobs read
// remotely. Pre-assembled so implementers (LocalBlob, GitBlob) can adopt the
// full surface without re-spreading the records or depending on `@endo/patterns`
// themselves. The interface tag is distinct from `ReadableBlobInterface`'s so
// the two shapes don't collide in diagnostics / marshaled interface names
// (feature detection keys on method names, not the tag). See
// designs/fs-interface-consolidation.md § C4.
export const ReadableBlobRangeInterface = M.interface('ReadableBlobRange', {
  ...readableBlobMethodGuards,
  ...rangeReadMethodGuards,
});
harden(ReadableBlobRangeInterface);

export const SnapshotBlobInterface = M.interface('SnapshotBlob', {
  ...readableBlobMethodGuards,
  ...getInfoMethodGuard,
  sha256: M.call().returns(M.string()),
});
harden(SnapshotBlobInterface);

export const ReadableTreeInterface = M.interface('ReadableTree', {
  ...readableTreeMethodGuards,
});
harden(ReadableTreeInterface);

export const SnapshotTreeInterface = M.interface('SnapshotTree', {
  ...readableTreeMethodGuards,
  ...getInfoMethodGuard,
  sha256: M.call().returns(M.string()),
});
harden(SnapshotTreeInterface);

export const TreeWriterInterface = M.interface('TreeWriter', {
  help: HelpMethod,
  writeBlob: M.call(M.arrayOf(M.string()), M.remotable()).returns(M.promise()),
  makeDirectory: M.call(M.arrayOf(M.string())).returns(M.promise()),
});
harden(TreeWriterInterface);

export const FileInterface = M.interface('File', {
  ...readableBlobMethodGuards,
  writeText: M.call(M.string()).returns(M.promise()),
  writeBytes: M.call(M.remotable()).returns(M.promise()),
  append: M.call(M.string()).returns(M.promise()),
  readOnly: M.call().returns(M.remotable('ReadableBlob')),
  snapshot: M.call().returns(M.promise()),
});
harden(FileInterface);

export const DirectoryInterface = M.interface('Directory', {
  ...readableTreeMethodGuards,
  write: M.call(M.arrayOf(M.string()), M.remotable()).returns(M.promise()),
  remove: M.call(M.arrayOf(M.string())).returns(M.promise()),
  move: M.call(M.arrayOf(M.string()), M.arrayOf(M.string())).returns(
    M.promise(),
  ),
  copy: M.call(M.arrayOf(M.string()), M.arrayOf(M.string())).returns(
    M.promise(),
  ),
  makeDirectory: M.call(M.arrayOf(M.string())).returns(M.promise()),
  readOnly: M.call().returns(M.remotable('ReadableTree')),
  snapshot: M.call().returns(M.promise()),
});
harden(DirectoryInterface);
