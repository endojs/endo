/**
 * Hand-written declarations covering the public exports `@endo/endo-fs`
 * consumers reach for.  The package's runtime is JavaScript with
 * `@ts-check` JSDoc, but there is no `.d.ts` emission pipeline; without
 * a `types` entrypoint, downstream packages whose own `tsc --build`
 * walks into endo-fs source files hit module-resolution failures for
 * endo-fs's transitive `@endo/eventual-send` / `@endo/patterns`
 * imports (those packages' `.d.ts` only exist mid-prepack and are
 * cleaned up by `postpack` before the consumer's pack runs).
 *
 * Surface kept narrow on purpose: each declaration matches the
 * concrete shape consumers depend on today; richer fidelity lives
 * in the source JSDoc and is recovered at consumer-side runtime
 * via `__getMethodNames__` and the interface guards.
 */

// Mirror of `@endo/exo/exo-makers.js`'s `Exo` placeholder; declared
// here so downstream consumers don't need to depend on that package
// transitively just for the shape.
type ExoLike = object;

declare module '@endo/endo-fs' {
  /**
   * Build a `Filesystem` exo over an `FsBackend`.  Optional
   * `opts.description` populates `statfs().type`; `opts.namedDirs`
   * configures the `Filesystem.named(name)` lookup table.
   */
  export const wrapBackend: (
    backend: object,
    opts?: {
      description?: string;
      namedDirs?: Record<string, string[]>;
    },
  ) => ExoLike;

  /**
   * Recursively wrap a `Filesystem` so every mutating verb rejects
   * with EACCES at the cap boundary.
   */
  export const readOnly: (fs: object) => ExoLike;

  /** Build an in-memory `Filesystem`. */
  export const makeInMemoryFilesystem: (opts?: object) => ExoLike;

  /** Build a node:fs/promises-backed `Filesystem`. */
  export const makeNodeFilesystem: (rootPath: string, opts?: object) => ExoLike;

  /** Adapt a daemon `Mount` to a `Filesystem`. */
  export const mountAsFilesystem: (mount: object, opts?: object) => ExoLike;

  /** Build an in-memory `FsBackend`. */
  export const makeInMemoryBackend: (opts?: object) => object;

  /** Build a node:fs/promises-backed `FsBackend`. */
  export const makeNodeFsBackend: (rootPath: string, opts?: object) => object;

  /** Adapt a daemon `Mount` to an `FsBackend`. */
  export const makeFromMountBackend: (mount: object) => object;

  /** The empty `Filesystem` — a root with no entries. */
  export const emptyFilesystem: () => ExoLike;
  export const chroot: (fs: object, subPath: string[]) => ExoLike;
  export const bind: (
    host: object,
    mountPath: string[],
    guest: object,
  ) => ExoLike;
  export const namespace: (mounts: Record<string, object>) => ExoLike;
  export const compose: (participants: object[]) => ExoLike;

  export const makeLayer: (opts?: object) => ExoLike;
  export const LayerInterface: object;

  export const makeMemoryCas: () => object;
  export const cacheBackedRead: (cas: object, fs: object) => object;
  export const withCachedReads: (fs: object, cas: object) => ExoLike;

  export const walk: (
    fs: object,
    path: string[],
  ) => AsyncIterable<{ path: string[]; kind: 'file' | 'directory' }>;
  export const collectBytes: (readerRef: object) => Promise<Uint8Array>;
  export const collectStream: (readerRef: object) => Promise<unknown[]>;

  export const PosixFsInterface: object;

  export const FilesystemInterface: object;
  export const DirectoryInterface: object;
  export const FileInterface: object;
  export const CursorInterface: object;
  export const OpenFileInterface: object;
  export const LockInterface: object;
  export const XattrsInterface: object;
  export const NodeWatcherInterface: object;
  export const BlobRefInterface: object;
  export const PassableReaderInterface: object;
  export const PassableBytesReaderInterface: object;
  export const PassableBytesWriterInterface: object;
}

declare module '@endo/endo-fs/src/type-guards.js' {
  export const FilesystemInterface: object;
  export const DirectoryInterface: object;
  export const FileInterface: object;
  export const CursorInterface: object;
  export const OpenFileInterface: object;
  export const LockInterface: object;
  export const XattrsInterface: object;
  export const NodeWatcherInterface: object;
  export const BlobRefInterface: object;
  export const PassableReaderInterface: object;
  export const PassableBytesReaderInterface: object;
  export const PassableBytesWriterInterface: object;
}

declare module '@endo/endo-fs/src/backend-types.js' {
  export type NodeKind = 'file' | 'directory';
  export type DirEntry = { name: string; kind: NodeKind };
  export type NodeStat = {
    size?: bigint;
    mtime?: bigint;
    atime?: bigint;
  };
  export type WatchEvent = {
    kind: 'changed' | 'created' | 'removed' | 'child-added' | 'child-removed';
    name?: string;
  };
  export type FsBackend = {
    kind: (path: string[]) => Promise<NodeKind | undefined>;
    list: (dirPath: string[]) => AsyncIterable<DirEntry>;
    read: (
      path: string[],
      offset?: bigint,
      length?: bigint,
    ) => Promise<Uint8Array>;
    write: (
      path: string[],
      bytes: Uint8Array,
      offset?: bigint,
    ) => Promise<void>;
    makeDirectory: (path: string[]) => Promise<void>;
    remove: (path: string[]) => Promise<void>;
    getStat?: (path: string[]) => Promise<NodeStat>;
    setStat?: (path: string[], patch: NodeStat) => Promise<void>;
    fsync?: (path: string[]) => Promise<void>;
    rename?: (src: string[], dst: string[]) => Promise<void>;
    watch?: (path: string[]) => AsyncIterable<WatchEvent>;
    statfs?: () => Promise<{
      blockSize?: bigint;
      totalBlocks?: bigint;
      freeBlocks?: bigint;
      totalBytes?: bigint;
      freeBytes?: bigint;
      files?: bigint;
      directories?: bigint;
    }>;
  };
}
