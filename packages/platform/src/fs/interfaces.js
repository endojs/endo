// @ts-check

import { M } from '@endo/patterns';

// `help: help(method?) → string` is conventional on every capability
// (see root CLAUDE.md): with no argument it returns a one-line description
// of the cap; with a method name it documents that method.
const HelpMethod = M.call().optional(M.string()).returns(M.string());

export const ReadableBlobInterface = M.interface('ReadableBlob', {
  help: HelpMethod,
  streamBase64: M.call(M.any()).returns(M.promise()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
});
harden(ReadableBlobInterface);

export const SnapshotBlobInterface = M.interface('SnapshotBlob', {
  help: HelpMethod,
  sha256: M.call().returns(M.string()),
  streamBase64: M.call(M.any()).returns(M.promise()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
});
harden(SnapshotBlobInterface);

export const ReadableTreeInterface = M.interface('ReadableTree', {
  help: HelpMethod,
  has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise()),
});
harden(ReadableTreeInterface);

export const SnapshotTreeInterface = M.interface('SnapshotTree', {
  help: HelpMethod,
  sha256: M.call().returns(M.string()),
  has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise()),
});
harden(SnapshotTreeInterface);

export const TreeWriterInterface = M.interface('TreeWriter', {
  help: HelpMethod,
  writeBlob: M.call(M.arrayOf(M.string()), M.remotable()).returns(M.promise()),
  makeDirectory: M.call(M.arrayOf(M.string())).returns(M.promise()),
});
harden(TreeWriterInterface);

export const FileInterface = M.interface('File', {
  help: HelpMethod,
  streamBase64: M.call(M.any()).returns(M.promise()),
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
  help: HelpMethod,
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
