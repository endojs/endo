# Daemon Mount Formula

| | |
|---|---|
| **Created** | 2026-03-20 |
| **Updated** | 2026-03-20 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## Status

Phases 1, 2, 3, and 5 are implemented.  Phase 4 (sub-mounts and snapshot)
is not yet started.

### Implemented

- **Types:** `MountFormula`, `ScratchMountFormula` added to the `Formula`
  union in `packages/daemon/src/types.d.ts`.  `MountDeferredTaskParams`
  and `ScratchMountDeferredTaskParams` added.  `FilePowers` extended with
  `realPath`, `isDirectory`, `exists`.  `DaemonicPersistencePowers`
  extended with `statePath`.
- **Interfaces:** `MountInterface` and `MountFileInterface` in
  `packages/daemon/src/interfaces.js`.  `provideMount` and
  `provideScratchMount` added to `HostInterface`.
- **Mount exo:** `packages/daemon/src/mount.js` — path resolution with
  `.`/`..` clamping, symlink confinement via `realpath`, `has`, `list`,
  `lookup`, `write`, `remove`, `move`, `makeDirectory`, `readOnly()`,
  `help()`.  Transient directory and file exos returned by `lookup()`.
- **Daemon wiring:** `packages/daemon/src/daemon.js` — `mount` and
  `scratch-mount` entries in `makers` table, `extractLabeledDeps`,
  `formulateMount`, `formulateScratchMount` helpers.
- **Host methods:** `provideMount` and `provideScratchMount` in
  `packages/daemon/src/host.js` using deferred tasks.
- **Node powers:** `realPath`, `isDirectory`, `exists` in
  `packages/daemon/src/daemon-node-powers.js`.  `statePath` and
  `filePowers` threaded through `DaemonicPowers`.
- **Formula type registration:** `mount` and `scratch-mount` added to
  `packages/daemon/src/formula-type.js`.
- **CLI:** `packages/cli/src/commands/mount.js` (`endo mount`) and
  `packages/cli/src/commands/mkscratch.js` (`endo mkscratch`).

### Tests

`packages/daemon/test/endo.test.js` — 20 integration tests:

- **Core operations** (13 tests): list/has, lookup file, lookup
  subdirectory, write/remove, write creates parents, move,
  makeDirectory, read-only rejects, readOnly() attenuation, `..`
  clamping, scratch create/use, scratch restart persistence, file
  writeText/json.
- **Symlink confinement** (7 tests): internal absolute symlink (visible
  and usable), internal relative symlink (visible and usable), escaping
  absolute directory symlink (hidden from list, rejected on lookup),
  escaping relative directory symlink (hidden, rejected), escaping
  absolute file symlink (hidden, rejected), escaping relative file
  symlink (hidden, rejected), combined listing (cross-references raw
  `readdir` seeing 8 entries vs mount `list()` seeing only 4 confined
  entries).
- All tests cross-reference mount exo observations against direct
  `fs.promises` filesystem observations (e.g., after `write()`, verify
  file exists on disk; after `remove()`, verify file is gone).

### Not yet implemented

- `provideSubMount` host method (Phase 4)
- `snapshot()` — currently throws "not yet implemented" (Phase 4)
- GC cleanup for scratch mount backing directories — extracted to
  [daemon-content-store-gc](daemon-content-store-gc.md)
- CLI commands: `endo ls`, `endo cat`, `endo write` (Phase 6)

## What is the Problem Being Solved?

The daemon has two formula types for structured file content:

- **`readable-tree`** — immutable, content-addressed snapshots of
  directory trees.  Good for archival, deployment, and deduplication,
  but cannot be modified after creation.
- **`directory`** — mutable pet-name namespaces for organizing
  capabilities.  These are abstract capability containers, not
  filesystem directories.

Neither provides what an AI coding agent actually needs: **live, mutable
access to a physical filesystem directory** — reading project files,
writing generated code, creating build artifacts — all confined to a
specific directory subtree so the agent cannot escape to `~/.ssh` or
`/etc`.

Today, the only way to give an agent filesystem access is to grant it
ambient host permissions (full user filesystem) or to funnel everything
through `endo store` / `endo checkin` (immutable snapshots).  The first
violates least authority.  The second cannot support incremental edits
or watch-style workflows.

A **mount** formula bridges this gap: it wraps a physical directory as a
capability with the `ReadableTree`-compatible read interface extended
with mutation methods, confined to a single directory subtree via
symlink-aware path resolution.

A **scratch-mount** variant provides daemon-managed backing storage for
agents that need a temporary or persistent workspace without the host
choosing an external directory.

## Formula Definitions

### `mount` — External Directory

Captures an absolute filesystem path provided by the host.

```ts
type MountFormula = {
  type: 'mount';
  path: string;
  readOnly: boolean;
  parent?: FormulaIdentifier;
};
```

| Field | Description |
|-------|-------------|
| `type` | `'mount'` |
| `path` | Absolute filesystem path to the directory |
| `readOnly` | If `true`, mutation methods throw |
| `parent` | Optional parent mount formula (for sub-mounts created via host) |

### `scratch-mount` — Daemon-Managed Directory

Captures only a formula number.  The backing directory is derived:
`{statePath}/mounts/{formulaNumber}`.  The daemon creates this directory
when the formula is first evaluated and preserves it across restarts and
cancellation.  The directory is cleaned up only when the formula is
garbage-collected (unreachable from any pet store).

```ts
type ScratchMountFormula = {
  type: 'scratch-mount';
  readOnly: boolean;
  parent?: FormulaIdentifier;
};
```

| Field | Description |
|-------|-------------|
| `type` | `'scratch-mount'` |
| `readOnly` | If `true`, mutation methods throw |
| `parent` | Optional parent mount formula |

Both formula types share the same exo interface and implementation.  The
only difference is how the mount root path is derived: `mount` reads it
from the formula; `scratch-mount` computes it from `statePath` and the
formula number.

## Exo Interface

```js
export const MountInterface = M.interface('EndoMount', {
  // ReadableTree-compatible surface
  has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise()),

  // Mutation
  write: M.call(M.arrayOf(M.string()), M.any()).returns(M.promise()),
  remove: M.call(M.arrayOf(M.string())).returns(M.promise()),
  move: M.call(M.arrayOf(M.string()), M.arrayOf(M.string())).returns(M.promise()),
  makeDirectory: M.call(M.arrayOf(M.string())).returns(M.promise()),

  // Attenuation
  readOnly: M.call().returns(M.remotable()),

  // Snapshot
  snapshot: M.call().returns(M.promise()),

  // Discoverability
  help: M.call().returns(M.string()),
});
```

## Method Documentation

### Reading (ReadableTree-compatible)

#### `has(...path: string[]): Promise<boolean>`

Returns `true` if the resolved path exists within the mount root.
Symlinks that escape the mount root return `false`.  Empty path returns
`true` (the mount root itself exists).

#### `list(...path: string[]): Promise<string[]>`

Returns sorted entry names at the given path.  Entries whose symlink
targets escape the mount root are silently excluded.  Throws if the
path does not exist or is not a directory.

#### `lookup(path: string | string[]): Promise<MountExo | FileExo>`

Resolves a path within the mount.

- **Directory** — returns a transient mount exo sharing the same
  confinement root and `readOnly` setting.  This is NOT a new formula;
  it is an ephemeral exo that delegates to the same backing filesystem,
  rooted at the subdirectory.
- **File** — returns a transient file exo with `text()`,
  `streamBase64()`, `json()`, `writeText(content)`,
  `writeBytes(readable)`, and `readOnly()` methods.

Throws if the path does not exist or escapes the mount root.

### Mutation

#### `write(path: string[], value: ReadableBlob | string): Promise<void>`

Writes content to a file at the given path.  Creates parent directories
as needed.  If `value` is a string, writes UTF-8 text.  If `value` is a
`ReadableBlob` (or any object with `streamBase64()`), streams the
content.  Throws if `readOnly` is `true`.

#### `remove(path: string[]): Promise<void>`

Removes a file or empty directory at the given path.  For recursive
removal of non-empty directories, the caller must remove children first.
Throws if `readOnly` is `true` or if the path escapes the mount root.

#### `move(from: string[], to: string[]): Promise<void>`

Atomically renames an entry.  Both `from` and `to` must resolve within
the mount root after symlink resolution.  Throws if `readOnly` is
`true`.

#### `makeDirectory(path: string[]): Promise<void>`

Creates a directory (and any missing parents) at the given path.  No-op
if the directory already exists.  Throws if `readOnly` is `true`.

### Attenuation

#### `readOnly(): MountExo`

Returns an attenuated view of this mount where all mutation methods
throw.  This is a runtime-only restriction — no new formula is created.
The returned exo shares the same confinement root.

This follows the same pattern as `ReadableBlob.readOnly()` and
`Directory.readOnly()` in the platform-fs type lattice.

### Snapshot

#### `snapshot(): Promise<SnapshotTree>`

Recursively captures the current state of the mount as a
content-addressed `readable-tree` / `readable-blob` formula hierarchy.
Returns the `SnapshotTree` exo for the root.

This is the bridge from mutable mount → immutable snapshot.  Combined
with `endo checkin` (which creates `readable-tree` from a directory),
this provides a complete round-trip: mount ↔ snapshot.

### Discoverability

#### `help(): string`

Returns a description of the mount capability.  For external mounts,
includes the path.  For scratch mounts, indicates daemon-managed
storage.  Lists available methods with brief descriptions.

## Path Resolution Algorithm

All methods that accept path segments resolve them relative to the
mount's current root (which may be a subdirectory of the confinement
root, in the case of transient exos returned by `lookup()`).

1. **Validate segments** — each segment is checked:
   - Reject if it contains `/`, `\`, or `\0`
   - Reject if it is empty
   - `.` means "self" — skip (do not advance)
   - `..` means "parent" — pop one level, clamped to the confinement
     root (navigating above the confinement root is a no-op, not an
     error)

2. **Join** the validated segments onto the current root to produce a
   candidate path.

3. **Symlink confinement check** — see next section.

The confinement root is always the mount formula's root directory (for
external mounts, the `path` field; for scratch mounts, the derived
directory).  All directories within a mount are mutually accessible via
`..` — there is no per-subdirectory confinement.

## Symlink Confinement Algorithm

Every filesystem operation must verify that the resolved path remains
within the confinement root.  The check happens at **operation time**
(not at `lookup()` time) to prevent TOCTOU races.

```
function assertConfined(candidatePath, confinementRoot):
  resolved = realpath(candidatePath)
  if not resolved.startsWith(confinementRoot + '/') and resolved != confinementRoot:
    throw error "Path escapes mount root"
```

For parent directories of new files (e.g., `write(['a', 'b', 'c.txt'])`
where `a/b` may not exist yet), the check verifies the deepest existing
ancestor.

### Behavior with escaping symlinks

- `list()` — entries whose targets escape the root are **silently
  excluded** from the returned array.
- `has()` — returns `false` for paths that resolve outside the root.
- `lookup()` — throws for paths that resolve outside the root.
- `write()`, `remove()`, `move()` — throw for paths that resolve
  outside the root.

## Scratch Mount Provisioning and Lifecycle

### Creation

When the daemon evaluates a `scratch-mount` formula:

1. Compute backing path: `{statePath}/mounts/{formulaNumber}`
2. Create the directory if it does not exist (`mkdir -p` equivalent)
3. Return the mount exo rooted at that path

### Persistence

The backing directory persists across daemon restarts.  The formula JSON
on disk is sufficient to re-derive the path and re-create the exo.

### Cancellation

Cancelling a scratch-mount formula does **not** delete the backing
directory.  The formula remains in the store and can be re-evaluated.

### Garbage Collection

When a scratch-mount formula becomes unreachable (no pet name references
it, directly or transitively), the GC pass:

1. Removes the formula JSON from disk
2. Removes the backing directory (`rm -rf {statePath}/mounts/{formulaNumber}`)

This mirrors how the daemon already manages ephemeral state for other
formula types.

## Host Integration

Mount creation is exposed through host methods, not through methods on
the mount exo itself.  This avoids a GC race where a formula created in
the JavaScript heap could be collected before being named in a pet
store.

All host methods use deferred tasks to atomically create and name the
formula in a single operation.

### `provideMount(path, petName, options?)`

Creates an external `mount` formula for the given absolute filesystem
path and writes it to the caller's pet store under `petName`.

```js
const provideMount = async (path, petName, options = {}) => {
  const { readOnly = false } = options;
  const { namePath } = assertPetNamePath(namePathFrom(petName));

  /** @type {DeferredTasks<MountDeferredTaskParams>} */
  const tasks = makeDeferredTasks();
  tasks.push(identifiers =>
    petStore.write(namePath, identifiers.mountId),
  );

  /** @type {MountFormula} */
  const formula = harden({
    type: 'mount',
    path,
    readOnly,
  });

  return formulate('mount', formula, tasks);
};
```

### `provideScratchMount(petName, options?)`

Creates a `scratch-mount` formula with daemon-managed backing storage
and writes it to the caller's pet store under `petName`.

```js
const provideScratchMount = async (petName, options = {}) => {
  const { readOnly = false } = options;
  const { namePath } = assertPetNamePath(namePathFrom(petName));

  /** @type {DeferredTasks<ScratchMountDeferredTaskParams>} */
  const tasks = makeDeferredTasks();
  tasks.push(identifiers =>
    petStore.write(namePath, identifiers.scratchMountId),
  );

  /** @type {ScratchMountFormula} */
  const formula = harden({
    type: 'scratch-mount',
    readOnly,
  });

  return formulate('scratch-mount', formula, tasks);
};
```

### `provideSubMount(mountName, subpath, newName, options?)`

Creates a new `mount` formula rooted at a subdirectory of an existing
mount and writes it to the caller's pet store under `newName`.  The
parent mount is recorded in the formula for dependency tracking.

```js
const provideSubMount = async (mountName, subpath, newName, options = {}) => {
  const { readOnly = false } = options;
  const mountId = petStore.identify(namePathFrom(mountName));
  const mountFormula = formulaForId.get(mountId);
  // Derive the full path from parent mount + subpath
  const parentPath = mountFormula.type === 'mount'
    ? mountFormula.path
    : `${statePath}/mounts/${formulaNumberForId(mountId)}`;
  const fullPath = path.join(parentPath, ...subpath);

  /** @type {MountFormula} */
  const formula = harden({
    type: 'mount',
    path: fullPath,
    readOnly,
    parent: mountId,
  });

  return formulate('mount', formula, tasks);
};
```

## CLI Sketch

### `endo mount <path> [petName]`

Mounts an external directory.

```
$ endo mount ./my-project project-dir
$ endo mount /absolute/path data --read-only
```

### `endo mkscratch [petName]`

Creates a daemon-managed scratch mount.

```
$ endo mkscratch workspace
```

### `endo ls <mountName> [path...]`

Lists entries in a mount.

```
$ endo ls project-dir
src/
package.json
README.md

$ endo ls project-dir src
index.js
utils.js
```

### `endo cat <mountName> <path...>`

Reads file content from a mount.

```
$ endo cat project-dir package.json
```

### `endo write <mountName> <path...>`

Writes stdin to a file in a mount.

```
$ echo "hello" | endo write workspace notes.txt
```

## Help Text

```
Mount — live mutable access to a filesystem directory.

Methods:
  has(...path)           Check if a path exists
  list(...path)          List directory entries
  lookup(path)           Get a file or subdirectory
  write(path, value)     Write content to a file
  remove(path)           Remove a file or empty directory
  move(from, to)         Rename an entry
  makeDirectory(path)    Create a directory
  readOnly()             Get a read-only view
  snapshot()             Capture as immutable readable-tree
  help()                 Show this help text

All paths are confined to the mount root.  Symlinks that escape
the root are invisible.
```

## Security Considerations

### Confinement boundary

The mount root is an absolute, inescapable boundary.  Every operation
resolves through `realpath` and checks containment.  There is no API
to change the confinement root after creation.

### Symlink attacks

Symlinks pointing outside the mount root are treated as non-existent.
The check happens at operation time to prevent TOCTOU attacks where a
symlink target changes between lookup and use.

### Read-only attenuation

The `readOnly` flag is checked at the exo level.  A read-only mount
cannot be "upgraded" to read-write through any API path.  The flag is
persisted in the formula, so it survives daemon restarts.

### Sub-mount isolation

Sub-mounts created via `provideSubMount` record their parent in the
formula but have their own confinement root.  A sub-mount at
`/project/src` cannot reach `/project/.env` via `..`.

### No ambient access

Mounts do not inherit any ambient filesystem permissions.  The daemon
process needs filesystem access to the mounted path, but the formula
system ensures guests can only access mounts explicitly granted to them
via pet names.

### Scratch mount cleanup

Scratch mount directories persist until GC.  This is intentional — a
daemon restart should not lose agent workspace state.  The trade-off is
disk usage, mitigated by GC when the formula becomes unreachable.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [platform-fs](platform-fs.md) | Uses `ReadableTree`, `ReadableBlob`, `File`, `Directory`, `SnapshotTree` type definitions |
| [daemon-capability-filesystem](daemon-capability-filesystem.md) | This design implements a concrete subset of the speculative vision described there |
| [daemon-checkin-checkout](daemon-checkin-checkout.md) | `snapshot()` produces `readable-tree` formulas consumable by `endo checkout`; mounts are a natural target for checkout |
| [daemon-agent-tools](daemon-agent-tools.md) | Agent filesystem tools will be backed by mount capabilities |
| [daemon-content-store-gc](daemon-content-store-gc.md) | Scratch-mount directory cleanup and content-store pruning |

## Implementation Phases

### Phase 1: Core mount exo and `mount` formula — **Complete**

1. ~~Add `MountFormula` to the `Formula` union in `types.d.ts`~~
2. ~~Add `MountInterface` to `interfaces.js`~~
3. ~~Implement `makeMount(rootPath, confinementRoot, readOnly)` in a new
   `src/mount.js` — path resolution, symlink confinement, all read
   methods~~
4. ~~Add `'mount'` entry to `makers` table in `daemon.js`~~
5. ~~Add `extractLabeledDeps` case for `'mount'`~~
6. ~~Add `provideMount` host method~~
7. ~~Add `endo mount` CLI command~~
8. ~~Tests: confinement, symlink rejection, read operations~~

### Phase 2: Mutation methods — **Complete**

1. ~~Implement `write`, `remove`, `move`, `makeDirectory`~~
2. ~~Add `endo write` CLI command~~
3. ~~Tests: write operations, read-only enforcement~~

### Phase 3: Scratch mounts — **Complete**

1. ~~Add `ScratchMountFormula` to the `Formula` union~~
2. ~~Implement backing directory lifecycle in `daemon.js`~~
3. ~~Add `provideScratchMount` host method~~
4. ~~Add `endo mkscratch` CLI command~~
5. ~~Tests: creation, persistence across restart~~

GC cleanup of scratch-mount backing directories is covered by
[daemon-content-store-gc](daemon-content-store-gc.md).

### Phase 4: Sub-mounts and snapshot — Not Started

1. Implement `provideSubMount` host method
2. Implement `snapshot()` using the content store from platform-fs
3. Tests: sub-mount isolation, snapshot round-trip

### Phase 5: Transient lookup exos — **Complete**

1. ~~Implement directory and file transient exos returned by `lookup()`~~
2. ~~Tests: navigation, file read/write through lookup~~

### Phase 6: CLI commands for mount interaction — Not Started

1. `endo ls <mountName> [path...]` — list entries via CLI
2. `endo cat <mountName> <path...>` — read file content via CLI
3. `endo write <mountName> <path...>` — write stdin to a file via CLI
4. Tests for each command

## Design Decisions

1. **Two formula types rather than one.** External mounts and scratch
   mounts have different lifecycle semantics (user-managed path vs
   daemon-managed storage with GC cleanup).  Separate formula types
   make this explicit in the formula store and avoid conditional logic
   for "does this mount own its directory?"

2. **No `mount()` method on the exo.** Sub-mount creation goes through
   the host because it creates a new formula.  Formulas created in the
   JS heap without being atomically named in a pet store are vulnerable
   to GC races — the formula could be collected before anyone holds a
   reference.  Host methods with deferred tasks prevent this.

3. **`readOnly()` IS on the exo.** Unlike sub-mount creation, read-only
   attenuation does not create a new formula.  It returns a restricted
   view of the same object, following the pattern established by
   `ReadableBlob.readOnly()` in platform-fs.  No GC race is possible
   because no formula is involved.

4. **`lookup()` returns transient exos, not formulas.** Navigating a
   mount's directory structure should be lightweight and not pollute the
   formula store with entries for every subdirectory visited.  Transient
   exos share the parent's confinement root and are garbage-collected
   normally by the JS runtime.

5. **Symlink confinement at operation time.** Checking symlinks at
   `lookup()` time and caching the result would create a TOCTOU window
   where the symlink target could change between lookup and use.
   Checking at operation time is the only safe approach.

6. **`..` is clamped, not rejected.** Navigating above the confinement
   root is a no-op (stays at root) rather than an error.  This matches
   POSIX filesystem behavior at `/` and is more ergonomic for agents
   that may construct paths mechanically.

7. **Scratch mount directories survive cancellation.** An agent's
   workspace should not be destroyed by a transient daemon restart or
   formula re-evaluation.  Only GC (unreachability) triggers cleanup,
   ensuring intentional deletion requires removing all pet-name
   references.

8. **Path-based, not inode-based (for now).** The current design binds
   a mount, file, or directory exo to a *path*, not to an underlying
   inode.  This means that if the backing file or directory is moved or
   replaced at the OS level, the exo follows the path rather than
   tracking the original inode.  We cannot currently enforce inode
   identity because Node.js's `fs` API opens files by path.  However,
   on platforms where the daemon runs under a supervisor with access to
   POSIX `openat` and the rest of the `*at` family (`renameat`,
   `fstatat`, `mkdirat`, etc.), we could open a directory file
   descriptor at mount time and perform all subsequent operations
   relative to that descriptor, pinning the exo to a specific inode
   regardless of path-level motion.  This is a future enhancement that
   would strengthen confinement guarantees on supporting platforms.

## Prompt

> Implement the mount and scratch-mount formula types for the daemon.
> Mount wraps an external filesystem directory as a mutable capability
> with ReadableTree-compatible reads, mutation methods, symlink
> confinement, and read-only attenuation.  Scratch-mount provides
> daemon-managed backing storage.  Both share the same exo interface.
> Host methods (provideMount, provideScratchMount, provideSubMount) use
> deferred tasks for atomic creation.  Sub-mount creation and mount()
> are host-only to avoid GC races.  readOnly() stays on the exo since
> it creates no formula.  lookup() returns transient exos.  snapshot()
> bridges to readable-tree.
