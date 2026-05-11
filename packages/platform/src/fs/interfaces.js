// @ts-check

import { M } from '@endo/patterns';

export const AsyncIteratorInterface = M.interface('AsyncIterator', {
  next: M.call().returns(M.promise()),
  return: M.call().optional(M.any()).returns(M.promise()),
  throw: M.call().optional(M.any()).returns(M.promise()),
});
harden(AsyncIteratorInterface);

export const ReadableBlobInterface = M.interface('ReadableBlob', {
  streamBase64: M.call().returns(M.remotable()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
});
harden(ReadableBlobInterface);

export const SnapshotBlobInterface = M.interface('SnapshotBlob', {
  sha256: M.call().returns(M.string()),
  streamBase64: M.call().returns(M.remotable()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
});
harden(SnapshotBlobInterface);

export const ReadableTreeInterface = M.interface('ReadableTree', {
  has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise()),
});
harden(ReadableTreeInterface);

export const SnapshotTreeInterface = M.interface('SnapshotTree', {
  sha256: M.call().returns(M.string()),
  has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise()),
});
harden(SnapshotTreeInterface);

export const ContentStoreInterface = M.interface('ContentStore', {
  store: M.call(M.remotable()).returns(M.promise()),
  fetch: M.call(M.string()).returns(M.remotable()),
  has: M.call(M.string()).returns(M.promise()),
});
harden(ContentStoreInterface);

export const SnapshotStoreInterface = M.interface('SnapshotStore', {
  store: M.call(M.remotable()).returns(M.promise()),
  fetch: M.call(M.string()).returns(M.remotable()),
  has: M.call(M.string()).returns(M.promise()),
  loadBlob: M.call(M.string()).returns(M.remotable()),
  loadTree: M.call(M.string()).returns(M.remotable()),
});
harden(SnapshotStoreInterface);

export const TreeWriterInterface = M.interface('TreeWriter', {
  writeBlob: M.call(M.arrayOf(M.string()), M.remotable()).returns(M.promise()),
  makeDirectory: M.call(M.arrayOf(M.string())).returns(M.promise()),
});
harden(TreeWriterInterface);

export const FileInterface = M.interface('File', {
  streamBase64: M.call().returns(M.remotable()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
  writeText: M.call(M.string()).returns(M.promise()),
  writeBytes: M.call(M.remotable()).returns(M.promise()),
  append: M.call(M.string()).returns(M.promise()),
  readOnly: M.call().returns(M.remotable('ReadableBlob')),
  snapshot: M.call().returns(M.promise()),
});
harden(FileInterface);

export const DirectoryInterface = M.interface('Directory', {
  has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise()),
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
