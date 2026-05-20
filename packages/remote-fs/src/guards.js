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

// Re-export exo-stream's interface guards so consumers of remote-fs can
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
  help: M.call().optional(M.string()).returns(M.string()),
};

export const FilesystemInterface = M.interface('Filesystem', FilesystemMethods);
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
  create: M.call(M.string(), Pass).returns(M.eref(M.remotable('OpenFile'))),
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
});
harden(DirectoryInterface);

export const FileInterface = M.interface('File', {
  ...NodeBaseMethods,
  open: M.call(Pass).returns(M.eref(M.remotable('OpenFile'))),
  snapshot: M.call().returns(M.promise()),
});
harden(FileInterface);

export const CursorInterface = M.interface('Cursor', {
  stream: M.call().returns(M.eref(M.remotable('PassableReader'))),
  skip: M.call(M.bigint()).returns(M.promise()),
  rewind: M.call().returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(CursorInterface);

export const OpenFileInterface = M.interface('OpenFile', {
  read: M.call(M.bigint(), M.bigint()).returns(
    M.eref(M.remotable('PassableBytesReader')),
  ),
  write: M.call(M.bigint()).returns(M.eref(M.remotable('PassableBytesWriter'))),
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
 * `File.snapshot()` (DESIGN.md §6). Eager `algorithm`/`hash`/`size`
 * via `getInfo()`; `fetch(offset, length)` returns a bytes stream
 * over the immutable bytes captured at snapshot time.
 */
export const BlobRefInterface = M.interface('BlobRef', {
  getInfo: M.call().returns(Pass),
  fetch: M.call(M.bigint(), M.bigint()).returns(
    M.eref(M.remotable('PassableBytesReader')),
  ),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(BlobRefInterface);
