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
  PassableReaderInterface,
  PassableBytesReaderInterface,
  PassableBytesWriterInterface,
} from './guards.js';
