// @ts-check
/**
 * Interface guards for `@endo/remote-fs` (§4 of DESIGN.md).
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

/**
 * Pattern matching anything passable. Stand-in for fully-typed
 * record patterns until F1 hardens the schemas.
 */
const Pass = M.any();

const FilesystemMethods = {
  root: M.call().returns(M.eref(M.remotable('Directory'))),
  named: M.call(M.string()).returns(M.eref(M.remotable('Directory'))),
  statfs: M.call().returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
};

export const FilesystemInterface = M.interface(
  'Filesystem',
  FilesystemMethods,
);
harden(FilesystemInterface);

/**
 * Methods that every `Directory` and `File` exposes (§4.2 Node base).
 * Composed into the per-subtype interfaces below.
 */
const NodeBaseMethods = {
  getQid: M.call().returns(Pass),
  getAttrs: M.call().returns(M.promise()),
  setAttrs: M.call(Pass).returns(M.promise()),
  watch: M.call().returns(M.eref(M.remotable('NodeWatcher'))),
  xattrs: M.call().returns(M.eref(M.remotable('Xattrs'))),
  help: M.call().optional(M.string()).returns(M.string()),
};

export const DirectoryInterface = M.interface('Directory', {
  ...NodeBaseMethods,
  lookup: M.call(M.string()).returns(
    M.eref(M.or(M.remotable('Directory'), M.remotable('File'))),
  ),
  list: M.call().returns(M.eref(M.remotable('Cursor'))),
  create: M.call(M.string(), Pass).returns(
    M.eref(M.remotable('OpenFile')),
  ),
  mkdir: M.call(M.string(), Pass).returns(M.eref(M.remotable('Directory'))),
  unlink: M.call(M.string()).returns(M.promise()),
  rename: M.call(M.string(), M.remotable('Directory'), M.string()).returns(
    M.promise(),
  ),
  fsync: M.call().returns(M.promise()),
});
harden(DirectoryInterface);

export const FileInterface = M.interface('File', {
  ...NodeBaseMethods,
  open: M.call(Pass).returns(M.eref(M.remotable('OpenFile'))),
  snapshot: M.call().returns(M.promise()),
});
harden(FileInterface);

export const CursorInterface = M.interface('Cursor', {
  stream: M.call().returns(M.eref(M.remotable('DirEntryReader'))),
  skip: M.call(M.bigint()).returns(M.promise()),
  rewind: M.call().returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(CursorInterface);

export const OpenFileInterface = M.interface('OpenFile', {
  read: M.call(M.bigint(), M.bigint()).returns(
    M.eref(M.remotable('BytesReader')),
  ),
  write: M.call(M.bigint()).returns(M.eref(M.remotable('BytesWriter'))),
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
  get: M.call(M.string()).returns(M.eref(M.remotable('BytesReader'))),
  set: M.call(M.string(), Pass).returns(M.eref(M.remotable('BytesWriter'))),
  list: M.call().returns(M.eref(M.remotable('Reader'))),
  remove: M.call(M.string()).returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(XattrsInterface);

/**
 * The streams returned by `Cursor.stream`, `OpenFile.read`,
 * `OpenFile.write`, `Xattrs.get`, `Xattrs.set`, `Xattrs.list`, and
 * `Node.watch` are intentionally minimal Far-iterator / Far-sink
 * shapes for v1. DESIGN.md §5 documents `@endo/exo-stream`'s
 * `PassableBytesReader` / `PassableBytesWriter` as the production
 * target; migration is a follow-up.
 */

export const BytesReaderInterface = M.interface('BytesReader', {
  next: M.call().returns(M.promise()),
  return: M.call().optional(Pass).returns(M.promise()),
});
harden(BytesReaderInterface);

export const BytesWriterInterface = M.interface('BytesWriter', {
  write: M.call(Pass).returns(M.promise()),
  close: M.call().optional(Pass).returns(M.promise()),
});
harden(BytesWriterInterface);

export const ReaderInterface = M.interface('Reader', {
  next: M.call().returns(M.promise()),
  return: M.call().optional(Pass).returns(M.promise()),
});
harden(ReaderInterface);

/**
 * `Node.watch` returns a watcher cap whose `events()` yields a
 * stream. v1 stubs return a watcher whose stream produces nothing.
 */
export const NodeWatcherInterface = M.interface('NodeWatcher', {
  events: M.call().returns(M.eref(M.remotable('Reader'))),
  cancel: M.call().returns(M.promise()),
});
harden(NodeWatcherInterface);
