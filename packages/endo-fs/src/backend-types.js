// @ts-check
/**
 * `FsBackend` — the minimal protocol that any storage backing
 * (in-memory map, node:fs, a remote Mount adapter, a KV blob store,
 * SQLite, S3, IPFS, …) implements to participate in `@endo/endo-fs`.
 *
 * `wrapBackend(backend)` from `./wrap-backend.js` builds the full
 * `Filesystem` exo surface on top of a `FsBackend`. The seam is
 * deliberately small: a required core plus a handful of optional
 * methods, all path-keyed, no redundancy (e.g. no separate
 * `readFile` and `readRange` — one `read(path, offset?, length?)`
 * with optional bounds).
 *
 * Optional methods are advertised by **method existence**:
 * `wrapBackend` probes `typeof backend.X === 'function'` once at
 * wrap time and synthesizes a fallback (or surfaces ENOSYS) when
 * absent.
 *
 * See `designs/endo-fs-backend-seam.md` for the design rationale,
 * the wire-protocol mapping to 9P, and the migration sequencing.
 */

/**
 * The kind of a filesystem node — file or directory. Base endo-fs
 * is tree-shaped (no hard links, no symlinks) so two kinds suffice.
 * Symlinks and hard links live in the future `PosixFs` extension.
 *
 * @typedef {'file' | 'directory'} NodeKind
 */

/**
 * An entry in a directory listing. `name` is the unqualified child
 * name (no path separators). `kind` is the child's node type.
 *
 * Backings that can include size or POSIX-shaped identity cheaply
 * (in-memory, KV stores) may add fields, but `wrapBackend` only
 * reads `name` and `kind` from the base. Richer metadata is the
 * purview of `PosixFs.attrs(node)`.
 *
 * @typedef {{
 *   name: string,
 *   kind: NodeKind,
 * }} DirEntry
 */

/**
 * Partial attribute patch accepted by `setStat` and yielded by
 * `getStat`. Narrow on purpose: only the portable subset that any
 * filesystem can be expected to support. POSIX-specific fields
 * (`mode`, `uid`, `gid`, `ctime`, `btime`) live in `PosixFs`.
 *
 * `size` resizes the file (subsumes a hypothetical `truncate`).
 * Times are nanoseconds since the Unix epoch — `BigInt`.
 *
 * @typedef {{
 *   size?: bigint,
 *   mtime?: bigint,
 *   atime?: bigint,
 * }} NodeStat
 */

/**
 * An event yielded by `backend.watch?(path)` and by wrap-backend's
 * local event bus (for events that originate at the wrap-backend
 * layer, e.g. xattrs mutations).
 *
 * Vocabulary (matches the legacy in-memory test surface):
 * - `'changed'`     — fired on a file/directory node when its
 *                     content or its xattrs change.
 * - `'created'`     — fired on a node when it first comes into
 *                     existence.
 * - `'removed'`     — fired on a node just before it disappears.
 * - `'child-added'` — fired on a directory node when a direct child
 *                     was added; `name` carries the child's name.
 * - `'child-removed'` — fired on a directory node when a direct
 *                     child was removed; `name` carries the child's
 *                     name.
 *
 * @typedef {{
 *   kind:
 *     | 'changed'
 *     | 'created'
 *     | 'removed'
 *     | 'child-added'
 *     | 'child-removed',
 *   name?: string,
 * }} WatchEvent
 */

/**
 * Range-lock options. `start` and `length` are byte offsets; the
 * convention `length === 0n` means "to end of file". Used both by
 * `OpenFile.lock` (vat-local, served from wrapBackend's lockTable)
 * and by a future `posixFs.flock` extension that delegates to real
 * OS locks.
 *
 * @typedef {{
 *   type: 'shared' | 'exclusive',
 *   start?: bigint,
 *   length?: bigint,
 *   wait?: boolean,
 * }} LockOpts
 */

/**
 * The backend protocol.
 *
 * **Required core.** Every backing implements `kind`, `list`, `read`,
 * `write`, `makeDirectory`, and `remove`. Toy backings that only do
 * these get a functional `Filesystem` with vat-local advisory locks,
 * no watchers, vat-local synthesized stat timestamps, and a
 * non-atomic rename fallback.
 *
 * **Optional set.** Each advertised by method existence. Missing
 * methods → wrapBackend either synthesizes a safe fallback or
 * surfaces ENOSYS to the consumer.
 *
 * **Paths are `string[]` segments.** Backings that need string
 * paths join internally. The empty array `[]` denotes the root.
 *
 * **Tree-only kind.** `kind()` returns `'file' | 'directory' |
 * undefined`. Non-{file,directory} entries (sockets, symlinks,
 * device files) surface as `undefined` and read as ENOENT to
 * consumers — base endo-fs is tree-shaped; OS-specific shapes
 * live in `PosixFs`. `kind()` returning `undefined` is therefore
 * the canonical ENOENT signal: wrapBackend interprets "missing"
 * and "not a file or directory" identically. Backings should NOT
 * use `undefined` to mean "I don't expose kind for this path."
 *
 * **No `flock?`, no `getXattr?`/`setXattr?` here.** Real OS locks
 * and native disk xattrs are POSIX-shaped → `PosixFs` extension.
 * The base xattrs sub-cap on `Node` is served from a vat-local
 * sidecar inside `wrapBackend`.
 *
 * **`getStat?` is optional but important on persistent backings.**
 * When present, `wrapBackend.File.getStat/getAttrs` prefers the
 * backend's value over its own vat-local stat table — so node-fs's
 * `getStat` returns the real disk mtime, not the moment the vat
 * first looked at the file. Toy backends (KV stores, in-memory)
 * can omit it; the vat-local table fills in.
 *
 * **`rename?` fallback caveat.** Backings that don't implement
 * `rename` get a copy-then-remove fallback in `wrapBackend`. The
 * fallback is non-atomic AND it currently only handles files —
 * renaming a directory without backend support raises ENOSYS rather
 * than recursing. Persistent backings (anything with on-disk state)
 * should implement `rename` for correctness; toy backings can skip
 * it as long as no consumer renames directories.
 *
 * @typedef {object} FsBackend
 * @property {(path: string[]) => Promise<NodeKind | undefined>} kind
 * @property {(dirPath: string[]) => AsyncIterable<DirEntry>} list
 * @property {(path: string[], offset?: bigint, length?: bigint) => Promise<Uint8Array>} read
 * @property {(path: string[], bytes: Uint8Array, offset?: bigint) => Promise<void>} write
 * @property {(path: string[]) => Promise<void>} makeDirectory
 * @property {(path: string[]) => Promise<void>} remove
 * @property {(path: string[]) => Promise<NodeStat>} [getStat]
 * @property {(path: string[], patch: NodeStat) => Promise<void>} [setStat]
 * @property {(path: string[]) => Promise<void>} [fsync]
 * @property {(src: string[], dst: string[]) => Promise<void>} [rename]
 * @property {(path: string[]) => AsyncIterable<WatchEvent>} [watch]
 * @property {() => Promise<{ blockSize?: bigint, totalBlocks?: bigint, freeBlocks?: bigint, totalBytes?: bigint, freeBytes?: bigint, files?: bigint, directories?: bigint }>} [statfs]
 */

// `hash?` was probed but never wired through any consumer.
// `BlobRef` does its own SHA-256 over captured bytes
// (`shared/blobref.js`); reintroduce a hash optional once a real
// porcelain method (`File.contentHash()`?) wants it.

// This module is types-only. Exporting an empty object keeps it as a
// `.js` module that ts-check and JSDoc consumers can `@import` from.
export {};
