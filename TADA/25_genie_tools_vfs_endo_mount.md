# Genie: route the file-tool VFS through an Endo Mount cap

Sub-task surfaced by [`21_genie_sandbox_review_notes.md`](./21_genie_sandbox_review_notes.md).

## Status

The seam landed: the genie's `files` tool group now routes through a
Mount cap when `setup.js` minted one, and falls back to ambient host
fs authority for the host-spawner / dev-repl paths.
Two upstream design decisions
(daemon-side `MountInterface.stat`, `MountFile.streamBytesRange`)
remain deferred and are documented in `vfs-mount.js` as known
tradeoffs rather than blockers.

## Context

`packages/genie/main.js` ~line 1323 now hands both the workspace path
**and** the optional Mount cap into `buildTools`:

```js
const genieTools = buildTools(workspaceDir, spawner, workspaceMount);
```

…which forwards to `buildGenieTools`
(`packages/genie/src/tools/registry.js`):
the `files` group constructs `makeMountVFS({ mount, rootDir })` when
the caller supplied `workspaceMount`, otherwise it falls back to
`makeNodeVFS()` for hosts without a daemon (e.g. `dev-repl.js`).

The `VFS` interface (`packages/genie/src/tools/vfs.js`) is structurally
close to `MountInterface` (`packages/daemon/src/interfaces.js`):

| `VFS` operation | `Mount` analogue |
| --- | --- |
| `readFile` | `readText` |
| `writeFile` | `writeText` |
| `stat` | (no direct analogue — synthesised from `lookup` + `text`) |
| `mkdir` | `makeDirectory` |
| `unlink` / `rmdir` / `rm` | `remove` (recursive walk for `rm -r`) |
| `readdir` | `list` (now async-iterable on every VFS impl) |
| `createReadStream` (byte ranges) | `readText` + slice |
| `sep` / `join` / `relative` / `resolve` | string utilities; Mount uses path-segment arrays |

How the adaptation gaps were resolved:

1. **`readdir` shape**.
   `VFS.readdir` is now an `AsyncIterable<VFSDirEntry>` on all three
   backends (`vfs-node.js`, `vfs-memory.js`, `vfs-mount.js`).
   The TODO that lived at `vfs.js` line 114 has been removed.
2. **`stat` mtime**.
   `MountInterface` still does not expose a stat operation, so the
   adapter synthesises `{ size, mtime, type }` from `lookup` (to
   discriminate file vs directory) plus a whole-file read for size.
   The `mtime` field is reported as an empty ISO-8601 string.
   See "Deferred upstream changes" below.
3. **Byte-range reads**.
   `EndoMountFile.streamBase64` is whole-file only, so
   `createReadStream({ start, end })` reads the whole file via
   `readText` and slices the resulting bytes.
   That is fine for the genie's current consumers (`readFile` capped
   at 100 MiB) but is not a true streaming path.
4. **Path translation**.
   `VFS` operates on POSIX path strings; `Mount` accepts either a
   string or an array of segments.
   The adapter canonicalises absolute path strings to segment arrays
   relative to the mount root and keeps the path-helper functions
   (`sep`, `join`, etc.) running on POSIX strings inside the genie's
   tool bodies.

## Deliverables

- [x] Implement `makeMountVFS(mount)` under
  `packages/genie/src/tools/vfs-mount.js` that adapts a Mount cap to
  the `VFS` interface.
  Path utilities (`sep`, `join`, `relative`, `resolve`) are thin
  wrappers over Node's `path/posix` so the genie's tool bodies do not
  need to learn segment arrays.
- [x] Land the `vfs.js` line-114 TODO ("`VFS.readdir()` should return
  an async stream of entries") and convert `makeNodeVFS` /
  `makeMemoryVFS` to async-iterable readdir at the same time so all
  three implementations share the new shape.
- [ ] Extend `MountInterface` with whatever is missing for `stat`
  (mtime + size + type) — likely a `stat(path)` method returning
  `{ size, mtime, type }`.
  **Deferred**: see "Deferred upstream changes" below.
  The adapter currently synthesises the shape with an empty `mtime`
  and a `text()`-derived `size`; the genie file tools that consume
  the VFS surface never read `mtime`, so the gap has no downstream
  user today.
- [x] Decide what to do about partial / byte-range reads.
  `readFile` caps at 100 MiB and `createReadStream({ start, end })`
  is now implemented as a whole-file read followed by a slice
  (documented at the top of `vfs-mount.js`).
  No genie tool currently issues range-bounded reads against the
  Mount adapter; if one ever does, follow up by extending
  `MountFileInterface` with a `streamBytesRange(start, end)` method.
- [x] Plumb `workspaceMount` through `buildTools` so the file tools
  can opt in to the Mount-backed VFS while the host-spawner / dev-repl
  paths keep `makeNodeVFS()`.
  Both `main.js` `buildTools` and `registry.js` `buildGenieTools`
  accept an optional `workspaceMount` cap; the `files` group switches
  to `makeMountVFS` only when one is supplied.
- [x] Add `packages/genie/test/tools/vfs-mount.test.js` covering the
  new adapter against an in-memory Mount fake.
  The fake mirrors the subset of `MountInterface` the adapter drives
  (`has`, `list`, `lookup`, `readText`, `writeText`, `remove`,
  `makeDirectory`) and exposes `__getMethodNames__()` so the
  file-vs-directory discriminator lights up the same way it would
  against a real `makeExo()` Mount.
  Coverage: path utilities, `readFile`/`writeFile` happy paths and
  ENOENT/EISDIR surfacing, `createReadStream` byte ranges, `stat`
  size synthesis, `mkdir`/`unlink`/`rmdir` semantics, recursive `rm`
  walk, async-iterable `readdir` (shallow + recursive + ENOTDIR),
  and out-of-root rejection.
- [x] Update `packages/genie/CLAUDE.md` § "Tools that need host fs
  access stay daemon-side" so the convention reflects the new
  cap-driven path.
  The section now explicitly says daemon-side fs tools must consume
  a `Mount` capability rather than a raw host path, with `setup.js`
  minting `workspace-mount` via `provideMount`.

## Deferred upstream changes

Two follow-ups would tighten the adapter but require coordination
with the daemon team and a `MountInterface` schema bump:

1. **`Mount.stat(pathArg)`**.
   Today the adapter has no way to surface `mtime`, and reads the
   whole file just to learn its size.
   A daemon-side `stat` method that returns `{ size, mtime, type }`
   from a single `fs.stat` call would replace the current synthesis.
   Until then the adapter reports `mtime: ''`; document the limit at
   the call site if a downstream tool starts depending on mtime
   semantics.
2. **`MountFile.streamBytesRange(start, end)`**.
   `streamBase64` is whole-file only, so byte-range reads currently
   pull the whole file across CapTP and slice on the genie side.
   A range-bounded streaming method would let the genie keep its
   100 MiB cap without paying the whole-file cost on partial reads.

Both are non-blocking for the current consumers (the genie's
`readFile` tool reads whole files and never asks for `mtime`); track
them as separate daemon-side TODOs when those features land.

## Open design question (resolved)

The original write-up flagged a tradeoff between latency
(no per-`fs.readFile` CapTP round-trip) and cap-correctness
(no ambient host fs authority).
The chosen resolution is **opt-in**: `setup.js` mints `workspace-mount`,
`main.js` plumbs it through `buildTools`, and the `files` group falls
back to `makeNodeVFS()` only when the cap is absent
(host-spawner / dev-repl).
That keeps the cap-driven path as the default for the daemon-hosted
genie while preserving the legacy ambient-fs path for hosts without
a daemon.

## Blocked by / blocks

- Pairs with [`23_genie_init_workspace_endo_fs.md`](./23_genie_init_workspace_endo_fs.md):
  the same Mount-write surface drives both seed-template copy and
  runtime tool writes, so they evolved together.
- Independent of [`22_genie_workspace_mount_form_value.md`](./22_genie_workspace_mount_form_value.md)
  and [`24_genie_sandbox_spawner_simplify.md`](./24_genie_sandbox_spawner_simplify.md).

## Cross-references

- `packages/genie/main.js` ~line 1323 — `buildTools` now forwards the
  optional Mount cap.
- `packages/genie/src/tools/registry.js` — `buildGenieTools` switches
  between `makeMountVFS` and `makeNodeVFS` based on the
  `workspaceMount` option.
- `packages/genie/src/tools/vfs.js`, `vfs-node.js`, `vfs-memory.js`,
  `vfs-mount.js` — current VFS surface and implementations (all
  three speak async-iterable `readdir`).
- `packages/genie/test/tools/vfs-mount.test.js` — adapter unit tests.
- `packages/daemon/src/interfaces.js` — `MountInterface` /
  `MountFileInterface` (no `stat` / `streamBytesRange` yet; see
  "Deferred upstream changes").
- `packages/daemon/CLAUDE.md` § "Storage Concepts" — Mount /
  ReadableTree contract.
- `packages/genie/CLAUDE.md` § "Tools that need host fs access stay
  daemon-side" — convention now reflects the cap-driven path.
