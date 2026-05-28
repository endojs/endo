// @ts-check

export { makeInMemoryFilesystem } from './in-memory.js';
export { makeNodeFilesystem } from './node-fs.js';
export { readOnly } from './readonly.js';
export { mountAsFilesystem } from './from-mount.js';
export {
  emptyFilesystem,
  chroot,
  bind,
  namespace,
  compose,
} from './compose.js';
export { makeLayer, LayerInterface } from './layer.js';
export { makeMemoryCas, cacheBackedRead } from './cas.js';
export { withCachedReads } from './cached-fs.js';
export { makeTreeView } from './tree-view.js';

// Three-layer architecture (designs/endo-fs-backend-seam.md).
// `wrapBackend(backend)` builds a Filesystem cap on top of any
// `FsBackend` (see `backend-types.js` for the protocol). The legacy
// makeInMemoryFilesystem / makeNodeFilesystem / mountAsFilesystem
// exports above are now thin wrappers around
// `wrapBackend(make*Backend(...))`.
export { wrapBackend } from './wrap-backend.js';
export { makeInMemoryBackend } from './backends/in-memory-backend.js';
export { makeNodeFsBackend } from './backends/node-fs-backend.js';
export { makeFromMountBackend } from './backends/from-mount-backend.js';

// Public porcelain helpers (free functions over the typed cap surface).
export { walk, collectBytes, collectStream } from './helpers.js';

// PosixFs interface sketch — POSIX-shaped attrs / real OS locks /
// native disk xattrs live in a future companion cap. Only the
// guard is exported; backing-specific implementations come later.
export { PosixFsInterface } from './posix-fs.js';

export {
  FilesystemInterface,
  DirectoryInterface,
  FileInterface,
  CursorInterface,
  OpenFileInterface,
  LockInterface,
  XattrsInterface,
  NodeWatcherInterface,
  BlobRefInterface,
  TreeViewInterface,
  TreeBlobInterface,
  PassableReaderInterface,
  PassableBytesReaderInterface,
  PassableBytesWriterInterface,
} from './type-guards.js';
