// @ts-check

/**
 * Virtual File System (VFS) Abstraction
 *
 * Defines the interface contract for filesystem backends used by the
 * genie file tools.  The VFS surface is intentionally small — it
 * covers only the operations that `makeFileTools` needs — and is
 * oriented around modern async iteration over `Uint8Array` chunks
 * rather than Node-specific stream classes.
 *
 * Implementations must satisfy the {@link VFS} typedef below.
 *
 * @module
 */

/**
 * Stat information for a path.
 *
 * @typedef {object} VFSStat
 * @property {number} size - Size in bytes (0 for directories).
 * @property {string} mtime - ISO-8601 modified time.
 * @property {'file' | 'directory' | 'symlink' | 'other'} type
 */

/**
 * A directory entry returned by {@link VFS.readdir}.
 *
 * @typedef {object} VFSDirEntry
 * @property {string} name - Entry name (or relative path when
 *   recursive).
 * @property {'file' | 'directory' | 'symlink' | 'other'} type
 * @property {number} size - Size in bytes (0 for non-files).
 */

/**
 * Options for {@link VFS.createReadStream}.
 *
 * @typedef {object} VFSReadStreamOptions
 * @property {number} [start] - Byte offset to begin reading.
 * @property {number} [end] - Inclusive byte offset to stop reading.
 */

/**
 * Options for {@link VFS.readdir}.
 *
 * @typedef {object} VFSReaddirOptions
 * @property {boolean} [recursive] - Whether to recurse into
 *   subdirectories.
 */

/**
 * Options for {@link VFS.mkdir}.
 *
 * @typedef {object} VFSMkdirOptions
 * @property {boolean} [recursive] - Create parent directories as
 *   needed.
 */

/**
 * Options for {@link VFS.rm}.
 *
 * @typedef {object} VFSRmOptions
 * @property {boolean} [recursive] - Remove directory contents.
 */

/**
 * The Virtual File System interface.
 *
 * Every method accepts and returns plain data (strings, numbers,
 * Uint8Array) rather than Node-specific types.  Read streams are
 * expressed as `AsyncIterable<Uint8Array>` so any platform that
 * supports async iteration can provide an implementation.
 *
 * @typedef {object} VFS
 * @property {(path: string) => Promise<VFSStat>} stat
 *   Return metadata for the entry at `path`.
 * @property {(path: string) => Promise<string>} readFile
 *   Read the entire file at `path` as a UTF-8 string.
 * @property {(
 *   path: string,
 *   opts?: VFSReadStreamOptions,
 * ) => AsyncIterable<Uint8Array>} createReadStream
 *   Return an async iterable of byte chunks for the given byte range.
 * @property {(path: string, content: string) => Promise<void>} writeFile
 *   Write `content` (UTF-8) to `path`, creating or overwriting.
 * @property {(path: string, opts?: VFSMkdirOptions) => Promise<boolean>} mkdir
 *   Create a directory.  Returns `true` if a new directory was
 *   created, `false` if it already existed (when `recursive` is true).
 * @property {(path: string) => Promise<void>} unlink
 *   Remove a single file.
 * @property {(path: string) => Promise<void>} rmdir
 *   Remove an empty directory.
 * @property {(path: string, opts?: VFSRmOptions) => Promise<void>} rm
 *   Remove a file or directory tree (when `recursive` is true).
 * @property {(
 *   path: string,
 *   opts?: VFSReaddirOptions,
 * ) => AsyncIterable<VFSDirEntry>} readdir
 *   Yield directory entries as an async iterable stream.
 * @property {string} sep
 *   Path separator character (`'/'` for POSIX, platform-dependent
 *   for Node).
 * @property {(...parts: string[]) => string} join
 *   Join path segments using the VFS separator.
 * @property {(from: string, to: string) => string} relative
 *   Compute the relative path from `from` to `to`.
 * @property {(...paths: string[]) => string} resolve
 *   Resolve a sequence of paths into an absolute path.  When the
 *   VFS was created with a limiting root, the result is guaranteed
 *   to stay under that root (throws otherwise).
 */

// TODO VFS.readdir() should return an async stream of entries, not a promise-of-array

export {};
