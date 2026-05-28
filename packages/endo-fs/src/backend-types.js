// @ts-check
/**
 * `FsBackend` — the minimal protocol that any storage backing
 * (in-memory map, node:fs, a remote Mount adapter, a KV blob store,
 * SQLite, S3, IPFS, …) implements to participate in `@endo/endo-fs`.
 *
 * `wrapBackend(backend)` from `./wrap-backend.js` builds the full
 * `Filesystem` exo surface on top of a `FsBackend`. The seam is
 * deliberately small: 6 required methods + 5 optional methods, all
 * path-keyed, no redundancy (e.g. no separate `readFile` and
 * `readRange` — one `read(path, offset?, length?)` with optional
 * bounds).
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
 * An event yielded by `backend.watch?(path)`.
 *
 * @typedef {{
 *   kind: 'add' | 'remove' | 'change',
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
 * **Required (6 methods).** Every backing implements these. Toy
 * backings that only do these get a functional `Filesystem` with
 * vat-local advisory locks, no watchers, no `setStat`, non-atomic
 * rename, and a SHA-256 hash synthesized by re-reading.
 *
 * **Optional (5 methods).** Each advertised by method existence.
 * Missing methods → wrapBackend either synthesizes a safe fallback
 * (`rename` via copy+remove, `hash` via re-read, etc.) or surfaces
 * ENOSYS to the consumer (`setStat`).
 *
 * **Paths are `string[]` segments.** Backings that need string
 * paths join internally. The empty array `[]` denotes the root.
 *
 * **No `flock?`, no `getXattr?`/`setXattr?`, no `getStat?`.**
 *   - Real OS locks → `PosixFs` (F15). Base advisory locks served
 *     entirely by wrapBackend's `lockTable`.
 *   - Xattrs → `PosixFs`. Removed from base.
 *   - Reads of full attrs (`Attrs`, `Qid` identity) → `PosixFs`.
 *     Base exposes `getStat` on the Filesystem exo surface, which
 *     reads the narrow subset directly from `stat`-ish probes that
 *     wrapBackend builds out of `kind` + an internal cache (no
 *     backend method for reads of size/mtime/atime — those are
 *     looked up by reading the file or by composing a PosixFs
 *     backend on top).
 *
 * @typedef {{
 *   kind: (path: string[]) => Promise<NodeKind | undefined>,
 *   list: (dirPath: string[]) => AsyncIterable<DirEntry>,
 *   read: (path: string[], offset?: bigint, length?: bigint) => Promise<Uint8Array>,
 *   write: (path: string[], bytes: Uint8Array, offset?: bigint) => Promise<void>,
 *   makeDirectory: (path: string[]) => Promise<void>,
 *   remove: (path: string[]) => Promise<void>,
 *
 *   setStat?: (path: string[], patch: NodeStat) => Promise<void>,
 *   fsync?: (path: string[]) => Promise<void>,
 *   rename?: (src: string[], dst: string[]) => Promise<void>,
 *   watch?: (path: string[]) => AsyncIterable<WatchEvent>,
 *   hash?: (path: string[]) => Promise<Uint8Array>,
 * }} FsBackend
 */

// This module is types-only. Exporting an empty object keeps it as a
// `.js` module that ts-check and JSDoc consumers can `@import` from.
export {};
