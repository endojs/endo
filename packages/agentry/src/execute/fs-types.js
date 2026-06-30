// @ts-check
/// <reference types="ses"/>

/**
 * GENERATED FILE - do not edit by hand.
 *
 * Regenerate with: yarn workspace agentry gen:code-mode-types
 *
 * Source of truth:
 *   - workspace: the platform/fs/extended interface guards
 *     (`FilesystemInterface` and the remotables it reaches), the richest
 *     available source since the FS `.d.ts` is a stub.
 *
 * The generic extraction and rendering live in
 * scripts/code-mode-type-extract.js; this exo's source configuration lives in
 * its scripts/code-mode-*-extract.js extractor. The divergence gate in
 * test/code-mode-types.test.js keeps this artifact fresh.
 *
 * Each entry is consumed by formatGlobalDeclarations in execute/globals.js via
 * the per-exo descriptor in execute/fs.js:
 * `aux` is the supporting `type` aliases, `body` is the object type spliced
 * after the dynamic `declare const <name>:`.
 */

export const fsCodeModeTypeDeclarations = harden({
  workspace: {
    aux: `type Filesystem = {
  brands: () => Promise<unknown>;
  help: (arg0?: string) => string;
  named: (arg0: string) => ERef<Directory>;
  root: () => ERef<Directory>;
  statfs: () => Promise<unknown>;
};
type ERef<T> = T | Promise<T>;
type Cursor = {
  close: () => Promise<unknown>;
  help: (arg0?: string) => string;
  read: (arg0?: bigint) => Promise<unknown>;
  rewind: () => Promise<unknown>;
  skip: (arg0: bigint) => Promise<unknown>;
  stream: () => ERef<PassableReader>;
  toArray: () => Promise<unknown>;
};
type Directory = {
  copy: (arg0: string | Array<string>, arg1: string | Array<string>) => Promise<unknown>;
  create: (arg0: string, arg1: unknown) => ERef<OpenFile>;
  fsync: () => Promise<unknown>;
  getAttrs: () => Promise<unknown>;
  getQid: () => unknown;
  getStat: () => Promise<unknown>;
  help: (arg0?: string) => string;
  list: () => ERef<Cursor>;
  lookup: (arg0: string | Array<string>) => ERef<Directory | File>;
  lookupStep: (arg0: string) => ERef<Directory | File>;
  makeDirectory: (arg0: string, arg1: unknown) => ERef<Directory>;
  materialise: (arg0: Array<string>, arg1: unknown) => ERef<Directory>;
  mkdir: (arg0: string, arg1: unknown) => ERef<Directory>;
  move: (arg0: string | Array<string>, arg1: string | Array<string>) => Promise<unknown>;
  remove: (arg0: string) => Promise<unknown>;
  rename: (arg0: string, arg1: Directory, arg2: string) => undefined;
  setAttrs: (arg0: unknown) => Promise<unknown>;
  setStat: (arg0: unknown) => Promise<unknown>;
  subView: (arg0: string | Array<string>) => ERef<Directory>;
  unlink: (arg0: string) => Promise<unknown>;
  watch: () => ERef<NodeWatcher>;
  watchFrom: () => ERef<unknown>;
  write: (arg0: string, arg1: string) => Promise<unknown>;
  xattrs: () => ERef<Xattrs>;
};
type File = {
  getAttrs: () => Promise<unknown>;
  getQid: () => unknown;
  getStat: () => Promise<unknown>;
  help: (arg0?: string) => string;
  open: (arg0: unknown) => ERef<OpenFile>;
  setAttrs: (arg0: unknown) => Promise<unknown>;
  setStat: (arg0: unknown) => Promise<unknown>;
  snapshot: () => Promise<unknown>;
  watch: () => ERef<NodeWatcher>;
  xattrs: () => ERef<Xattrs>;
};
type Lock = {
  help: (arg0?: string) => string;
  release: () => Promise<unknown>;
};
type NodeWatcher = {
  cancel: () => Promise<unknown>;
  events: () => ERef<PassableReader>;
};
type OpenFile = {
  close: () => Promise<unknown>;
  fsync: (arg0: unknown) => Promise<unknown>;
  getLock: (arg0: unknown) => Promise<unknown>;
  help: (arg0?: string) => string;
  lock: (arg0: unknown) => ERef<Lock>;
  read: (arg0?: bigint, arg1?: bigint) => unknown;
  truncate: (arg0: bigint) => Promise<unknown>;
  write: (arg0?: bigint) => unknown;
};
type PassableBytesReader = {
  readReturnPattern: () => undefined | unknown;
  streamBase64: (arg0: unknown) => Promise<unknown>;
};
type PassableBytesWriter = {
  streamBase64: (arg0: unknown) => Promise<unknown>;
  writeReturnPattern: () => undefined | unknown;
};
type PassableReader = {
  readPattern: () => undefined | unknown;
  readReturnPattern: () => undefined | unknown;
  stream: (arg0: unknown) => Promise<unknown>;
};
type Xattrs = {
  get: (arg0: string) => ERef<PassableBytesReader>;
  help: (arg0?: string) => string;
  list: () => ERef<PassableReader>;
  remove: (arg0: string) => Promise<unknown>;
  set: (arg0: string, arg1: unknown) => ERef<PassableBytesWriter>;
};`,
    body: `Filesystem`,
  },
});
harden(fsCodeModeTypeDeclarations);
