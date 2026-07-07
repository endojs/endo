import type { ERef } from '@endo/eventual-send';

export type { ERef };

export interface FilesystemStats {
  blockSize?: bigint;
  totalBlocks?: bigint;
  freeBlocks?: bigint;
  totalBytes?: bigint;
  freeBytes?: bigint;
  files?: bigint;
  directories?: bigint;
  type?: string;
}

export interface Filesystem {
  root(): ERef<Directory>;
  named(name: string): ERef<Directory>;
  statfs(): Promise<FilesystemStats>;
  brands(): Promise<ReadonlySet<bigint> | readonly bigint[]>;
  help(method?: string): string;
}

export interface NodeStat {
  size?: bigint;
  mtime?: bigint;
  atime?: bigint;
}

export interface Qid {
  type: 'file' | 'directory';
  version?: bigint;
  path?: bigint;
}

export interface NodeWatcher {
  events(): any;
  cancel(): Promise<void>;
}

export interface Xattrs {
  list(): Promise<string[]>;
  get(name: string): Promise<Uint8Array | undefined>;
  set(name: string, value: any): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface Directory {
  getQid(): Qid;
  getStat(): Promise<NodeStat>;
  setStat(patch: NodeStat): Promise<void>;
  getAttrs(): Promise<NodeStat>;
  setAttrs(patch: NodeStat): Promise<void>;
  watch(): ERef<NodeWatcher>;
  xattrs(): ERef<Xattrs>;
  lookup(nameOrPath: string | string[]): ERef<any>;
  lookupStep(name: string): ERef<any>;
  subView(nameOrPath: string | string[]): ERef<Directory>;
  list(): ERef<Cursor>;
  write(name: string, value: string): Promise<void>;
  create(name: string, opts?: OpenFileOptions): ERef<OpenFile>;
  makeDirectory(name: string, opts?: object): ERef<Directory>;
  mkdir(name: string, opts?: object): ERef<Directory>;
  remove(name: string): Promise<void>;
  unlink(name: string): Promise<void>;
  move(fromPath: string | string[], toPath: string | string[]): Promise<void>;
  copy(fromPath: string | string[], toPath: string | string[]): Promise<void>;
  rename(
    oldName: string,
    newParent: ERef<Directory>,
    newName: string,
  ): Promise<void> | void;
  fsync(): Promise<void>;
  materialise(path: string[], opts?: object): ERef<Directory>;
  watchFrom(): ERef<object>;
  help(method?: string): string;
}

export interface File {
  getQid(): Qid;
  getStat(): Promise<NodeStat>;
  setStat(patch: NodeStat): Promise<void>;
  getAttrs(): Promise<NodeStat>;
  setAttrs(patch: NodeStat): Promise<void>;
  watch(): ERef<NodeWatcher>;
  xattrs(): ERef<Xattrs>;
  open(opts: OpenFileOptions): ERef<OpenFile>;
  read(opts?: object): any;
  write(opts?: object): any;
  snapshot(): Promise<object>;
  help(method?: string): string;
}

export interface Cursor {
  read(limit?: bigint): Promise<{ entries: unknown[]; atEnd: boolean }>;
  stream(): any;
}

export interface OpenFile {
  read(offset: bigint, length?: bigint): ERef<object>;
  write(...args: any[]): any;
  truncate(size: bigint): Promise<void>;
  lock(opts?: object): ERef<object>;
  close(): Promise<void>;
}

export interface OpenFileOptions {
  read?: boolean;
  write?: boolean;
  create?: boolean;
  truncate?: boolean;
  append?: boolean;
}
