// @ts-check

import { M } from '@endo/patterns';

// `help: help(method?) → string` is conventional on every capability
// (see root CLAUDE.md): with no argument it returns a one-line description
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

export const ReadableBlobInterface = M.interface('ReadableBlob', {
  ...readableBlobMethodGuards,
});
harden(ReadableBlobInterface);

export const SnapshotBlobInterface = M.interface('SnapshotBlob', {
  ...readableBlobMethodGuards,
  sha256: M.call().returns(M.string()),
});
harden(SnapshotBlobInterface);

export const ReadableTreeInterface = M.interface('ReadableTree', {
  ...readableTreeMethodGuards,
});
harden(ReadableTreeInterface);

export const SnapshotTreeInterface = M.interface('SnapshotTree', {
  ...readableTreeMethodGuards,
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
