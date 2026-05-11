# Daemon Checkin / Checkout Commands

| | |
|---|---|
| **Created** | 2026-03-17 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The daemon has a content-addressed store for immutable blobs
(`readable-blob`) and the `daemon-weblet-application` design proposes an
immutable directory structure (`readable-tree`), but there is no
general-purpose command for moving file trees between the local
filesystem and the daemon's formula store.

The `endo store` command can ingest a single file as a `readable-blob`,
and the `mkweblet` verb can extract a zip archive into a `readable-tree`
for weblet hosting.  But neither provides a direct way to:

- **Check in** a local directory as a `readable-tree` of
  `readable-blob` formulas, preserving directory structure.
- **Check out** a `readable-tree` from the daemon back to local files,
  recreating the directory structure on disk.
- Work with zip archives as an interchange format without coupling to
  weblet semantics.

These operations are fundamental to any workflow that moves structured
content into or out of the daemon: deploying weblets, archiving project
snapshots, seeding agent workspaces, or exporting results.

## Design

### Commands

#### `endo checkin` (`endo ci`)

Reads a local filesystem tree (or zip archive) into the daemon as a
hierarchy of `readable-tree` and `readable-blob` formulas.  Returns the
formula identifier of the root `readable-tree`.

**Directory mode (default):**

```
endo checkin <path> -n <name> [--as <agent>]
endo ci <path> -n <name> [--as <agent>]
```

Recursively walks `<path>`, storing each file as a `readable-blob` and
each directory level as a `readable-tree`.  The root tree is written to
the agent's pet store under `<name>`.

**Zip mode (`-z`):**

```
endo checkin -z <path> -n <name> [--as <agent>]
endo ci -z <path> -n <name> [--as <agent>]
```

Reads `<path>` as a zip archive, extracts its entries, and builds the
same `readable-tree` / `readable-blob` hierarchy.  Equivalent to
directory mode but from a zip file instead of a directory.

**Zip from stdin:**

```
endo checkin -z --stdin -n <name> [--as <agent>]
cat dist.zip | endo ci -z -n <name>
```

Reads a zip archive from stdin.

#### `endo checkout` (`endo co`)

Writes a `readable-tree` from the daemon back to the local filesystem
(or as a zip archive).

**Directory mode (default):**

```
endo checkout <name> <path> [--as <agent>]
endo co <name> <path> [--as <agent>]
```

Resolves `<name>` to a `readable-tree`, walks the tree recursively, and
recreates the directory structure at `<path>`.  Each `readable-blob`
is streamed to a local file.  `<path>` must not already exist (to
prevent accidental overwrites).

**Zip mode (`-z`):**

```
endo checkout -z <name> <path> [--as <agent>]
endo co -z <name> <path> [--as <agent>]
```

Produces a zip archive at `<path>` instead of a directory tree.

**Zip to stdout:**

```
endo checkout -z <name> [--as <agent>] > archive.zip
endo co -z <name> --stdout [--as <agent>] > archive.zip
```

Writes the zip archive to stdout.  Useful for piping to other tools.

### Flag Summary

| Flag | Short | Commands | Description |
|------|-------|----------|-------------|
| `--name <name>` | `-n` | `checkin` | Pet name for the root `readable-tree` |
| `--as <agent>` | `-a` | both | Agent to act as |
| `--zip` | `-z` | both | Interpret input as zip / produce zip output |
| `--stdin` | | `checkin` | Read zip archive from stdin (requires `-z`) |
| `--stdout` | | `checkout` | Write zip archive to stdout (requires `-z`) |

Positional arguments:

| Position | `checkin` | `checkout` |
|----------|-----------|------------|
| 1st | `<path>` — local directory or zip file | `<name>` — pet name of `readable-tree` |
| 2nd | — | `<path>` — local directory or zip file to write |

### Checkin Algorithm

#### Directory Mode

```
checkin(localPath, petName):
    tree = buildTree(localPath)
    rootId = await formulateTree(tree)
    await directory.write(petName, rootId)
    return rootId

buildTree(dirPath):
    entries = {}
    for each entry in readdir(dirPath):
        fullPath = join(dirPath, entry.name)
        if entry is file:
            entries[entry.name] = { type: 'file', path: fullPath }
        else if entry is directory:
            entries[entry.name] = { type: 'dir', tree: buildTree(fullPath) }
    return entries

formulateTree(tree):
    entryIds = {}
    for each (name, entry) in tree.entries:
        if entry.type === 'file':
            // Stream file to content store → readable-blob formula
            readerRef = makeReaderRefFromPath(entry.path)
            { id } = await formulateReadableBlob(readerRef)
            entryIds[name] = id
        else if entry.type === 'dir':
            // Recurse → readable-tree formula
            id = await formulateTree(entry.tree)
            entryIds[name] = id
    formula = { type: 'readable-tree', entries: entryIds }
    return formulate(randomHex256(), formula)
```

**Content deduplication** is automatic.  The content store is keyed by
SHA-256: identical files (within the same checkin or across different
checkins) share the same `store-sha256/` entry.  However, each file
produces its own `readable-blob` formula (distinct formula number,
same `content` hash).  This matches the existing `formulateReadableBlob`
behavior.

**Empty directories** produce a `readable-tree` with an empty `entries`
record.  This is a valid formula.

#### Zip Mode

```
checkinZip(zipSource, petName):
    zipBytes = await readAll(zipSource)  // from path or stdin
    entries = parseZip(zipBytes)
    tree = buildTreeFromZipEntries(entries)
    rootId = await formulateTree(tree)
    await directory.write(petName, rootId)
    return rootId

buildTreeFromZipEntries(zipEntries):
    root = {}
    for each entry in zipEntries:
        if entry.name ends with '/':
            continue  // directory marker; structure is implicit
        segments = entry.name.split('/')
        node = root
        for each segment except last:
            node[segment] ??= {}
            node = node[segment]
        node[lastSegment] = { type: 'file', content: entry.content }
    return convertToTree(root)
```

Zip extraction reuses the algorithm from `daemon-weblet-application`
(lines 287-351) but is available as a standalone command without weblet
coupling.  Both `checkin -z` (reading) and `checkout -z` (writing) use
`@endo/zip` with its new compression support for DEFLATE inflation and
deflation.

### Checkout Algorithm

#### Directory Mode

```
checkout(petName, localPath):
    assert localPath does not exist
    tree = await provide(resolve(petName))
    await writeTree(tree, localPath)

writeTree(tree, dirPath):
    mkdir(dirPath)
    names = await E(tree).list()
    for each name in names:
        value = await E(tree).lookup(name)
        localEntryPath = join(dirPath, name)
        if value is EndoReadable (readable-blob):
            content = await streamFromBase64(E(value).streamBase64())
            writeFile(localEntryPath, content)
        else if value is readable-tree:
            await writeTree(value, localEntryPath)
```

**Type discrimination.**  The checkout code must distinguish
`readable-blob` (files) from `readable-tree` (directories).  Two
approaches:

1. **Duck typing:** Call `E(value).list()`.  If it succeeds, it is a
   tree; if it throws, it is a blob.  Fragile but requires no new
   interface methods.

2. **Formula type query (preferred):** The `readable-tree` and
   `readable-blob` formulas already carry their type in the formula
   store.  Expose a `type()` method on both interfaces (or use the
   existing locator format which encodes the formula type).  The
   checkout code resolves the pet name to a locator, inspects the type,
   and dispatches accordingly.

The `locate()` method on directories already returns a locator string
that encodes the formula type (e.g., `?type=readable-tree`).  The
checkout implementation can use this:

```
const locator = await E(directory).locate(name)
const { formulaType } = parseLocator(locator)
if (formulaType === 'readable-tree') { ... }
else if (formulaType === 'readable-blob') { ... }
```

#### Zip Mode

```
checkoutZip(petName, destination):
    tree = await provide(resolve(petName))
    zipWriter = new ZipWriter()
    await addTreeToZip(zipWriter, tree, '')
    zipBytes = await zipWriter.finalize()
    write zipBytes to destination (path or stdout)

addTreeToZip(writer, tree, prefix):
    names = await E(tree).list()
    for each name in names:
        value = await E(tree).lookup(name)
        entryPath = prefix ? `${prefix}/${name}` : name
        if value is readable-blob:
            content = await readAll(E(value).streamBase64())
            writer.add(entryPath, content)
        else if value is readable-tree:
            await addTreeToZip(writer, value, entryPath)
```

### Daemon-Side Methods

The checkin operation requires a new method on the host/agent interface
that orchestrates the recursive tree formulation.  The checkout
operation can be implemented entirely client-side (in the CLI) using
existing `list()`, `lookup()`, and `streamBase64()` methods.

#### New Host Method: `checkinTree`

```ts
// Added to HostInterface
checkinTree: M.callWhen(
  M.remotable('Reader'),        // reader providing directory listing
  M.arrayOf(M.string()),        // petNamePath for the root tree
).returns(M.string()),          // formula identifier of root tree
```

The CLI walks the local directory structure and sends it to the daemon
as a structured reader.  The daemon receives the directory listing,
streams each file into the content store, and formulates the tree
bottom-up.

**Alternative: CLI-side formulation.**  The CLI could call
`formulateReadableBlob` for each file and `formulateReadableTree` for
each directory, building the tree entirely from the client side.  This
requires exposing `formulateReadableTree` as a host method:

```ts
// Added to HostInterface
formulateReadableTree: M.callWhen(
  M.recordOf(M.string(), M.string()),  // entries: name → formulaId
  M.arrayOf(M.string()),               // petNamePath for the result
).returns(M.string()),                 // formula identifier
```

This approach is simpler: the CLI handles filesystem walking (which it
can do directly via Node.js APIs), and the daemon handles formula
creation (which it already knows how to do).  The CLI calls
`storeBlob()` for each file (reusing the existing method), then calls
`formulateReadableTree()` with the collected entry IDs.

The CLI-side approach is preferred because:
- `storeBlob()` already exists and handles streaming.
- The daemon does not need to understand local filesystem walking.
- The CLI has direct access to `fs` APIs for reading directories.
- The daemon only needs one new method (`formulateReadableTree`).

#### New Host Method: `storeTree`

A single convenience method that wraps `formulateReadableTree`:

```ts
// Added to HostInterface
storeTree: M.callWhen(
  M.recordOf(M.string(), M.string()),  // entries: name → formulaId
  M.arrayOf(M.string()),               // petNamePath
).returns(M.string()),                 // formula identifier
```

This is the tree analog of `storeBlob`.  The CLI calls `storeBlob` for
each file, then `storeTree` for each directory level (bottom-up),
finally `storeTree` for the root with `-n <name>`.

### Filesystem Considerations

#### Ignored Entries

The checkin command ignores:
- Symbolic links (no formula representation; print a warning).
- Special files (devices, sockets, FIFOs).
- `.git` directories (common and large; print a note).
- Files matching `.endoignore` patterns if a `.endoignore` file exists
  in the root directory (same glob syntax as `.gitignore`).

#### Entry Name Validation

`readable-tree` entries are keyed by single-segment names (no `/` or
`..`).  The checkin command validates each directory entry name against
this constraint.  In practice, all valid filenames on POSIX and Windows
systems satisfy this constraint because `/` is not allowed in filenames
and `..` is a reserved name.

#### File Permissions and Metadata

`readable-tree` and `readable-blob` formulas store **content only**, not
metadata (permissions, timestamps, ownership).  This is intentional:
the formulas represent immutable content snapshots, not filesystem
replicas.  On checkout, files are created with the process's default
umask.

#### Large Trees

For trees with many files, the CLI should display progress:

```
endo ci ./dist -n my-app
  storing 247 files...
  my-app → endo://abc123…/def456…?type=readable-tree
```

The checkin streams files sequentially (to avoid exhausting file
descriptors) but could be parallelized with a bounded concurrency pool
in a future optimization.

#### Maximum Depth

The checkin command enforces a maximum directory depth (default 64
levels) to prevent pathological inputs.  This is a CLI-side guard, not a
daemon constraint.

### Relationship to `endo store` and `mkweblet`

| Command | Input | Output | Use Case |
|---------|-------|--------|----------|
| `endo store -p <file> -n <name>` | Single file | `readable-blob` | Store one file |
| `endo checkin <dir> -n <name>` | Directory tree | `readable-tree` | Store a file tree |
| `endo checkin -z <zip> -n <name>` | Zip archive | `readable-tree` | Store a zip as a tree |
| `endo mkweblet <name>` | `readable-tree` | weblet | Host a tree as a web app |

`endo checkin -z` replaces the zip extraction that was previously
embedded inside `mkweblet`.  The `mkweblet` verb can be simplified to
accept a `readable-tree` directly (already checked in) rather than
performing extraction itself:

```
endo ci -z dist.zip -n my-app-content
endo mkweblet my-app-content --as my-app
```

Or as a single pipeline (mkweblet can still accept a zip pet name for
convenience and call checkin internally).

### Chat Commands

```
/checkin <path> [--name <name>] [--zip]
/checkout <name> <path> [--zip]
```

In Chat, file paths refer to files accessible to the daemon process.
For Familiar (Electron), this means paths on the user's local machine.
For a remote daemon (Docker), this means paths inside the container —
less useful unless the container mounts a host volume.

The Chat commands are secondary to the CLI commands.  The primary
workflow is CLI-driven.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-weblet-application](daemon-weblet-application.md) | Defines `readable-tree` formula type and zip extraction algorithm.  This design reuses both and proposes exposing them as standalone commands. |
| [daemon-capability-filesystem](daemon-capability-filesystem.md) | Explores filesystem capabilities.  Checkin/checkout is complementary: it moves content between the local FS and daemon formulas, while Dir/File capabilities provide live confined access. |

## Implementation Phases

### Phase 1: `readable-tree` Formula Type (S)

Implement the `readable-tree` formula type from the weblet application
design:

- Add `ReadableTreeFormula` to `types.d.ts`.
- Add `readable-tree` to the `Formula` discriminated union.
- Add `readable-tree` maker to the `makers` table in `daemon.js`.
- Add `extractDeps` case: all values in `formula.entries`.
- Implement the incarnated exo with `has()`, `list()`, `lookup()`,
  `help()` methods and `ReadableTreeInterface` guards.
- Add `storeTree()` method to the host interface.

### Phase 2: `endo checkin` — Directory Mode (S)

- Add `checkin` command to `packages/cli/src/commands/`.
- Register `ci` alias.
- CLI-side recursive directory walk.
- Call `storeBlob()` for each file (existing method).
- Call `storeTree()` for each directory level (bottom-up).
- Write root tree to pet store under `-n <name>`.
- Progress display.
- `.endoignore` support.

### Phase 3: `endo checkout` — Directory Mode (S)

- Add `checkout` command to `packages/cli/src/commands/`.
- Register `co` alias.
- Resolve pet name → `readable-tree`.
- Recursive tree walk via `list()` and `lookup()`.
- Type discrimination via locator.
- Stream `readable-blob` content to local files.
- Create directories for nested `readable-tree` nodes.
- Refuse to overwrite existing paths.

### Phase 4: Zip Support (`-z` flag) (S)

- Add zip extraction to `checkin -z`: parse zip → call same tree
  formulation as directory mode.
- Add zip creation to `checkout -z`: walk tree → build zip → write to
  path or stdout.
- `--stdin` support for `checkin -z`.
- `--stdout` support for `checkout -z`.
- Uses `@endo/zip` with its new compression support (DEFLATE) for both
  reading and writing zip archives.

### Phase 5: Chat Integration (S)

- Add `/checkin` and `/checkout` Chat commands.
- Render `readable-tree` entries in Chat inventory with a tree icon.
- Display checkin progress in Chat.

## Design Decisions

1. **Checkin builds formulas from the CLI side, not the daemon side.**
   The CLI walks the local directory (using Node.js `fs` APIs it already
   has), calls `storeBlob()` for each file, and `storeTree()` for each
   directory.  The daemon does not need filesystem walking logic.  This
   keeps the daemon focused on formula management and avoids giving it
   ambient filesystem access.

2. **Checkout is entirely CLI-side.**  The CLI resolves the tree via
   `list()`, `lookup()`, and `streamBase64()` — all existing methods.
   No new daemon methods are needed for checkout.

3. **`readable-tree` entries store formula IDs, not content hashes.**
   Each entry in the tree points to a formula identifier (which may be a
   `readable-blob` or a nested `readable-tree`).  The content hash is
   one level of indirection away, inside the `readable-blob` formula.
   This preserves the formula graph for GC and allows the same content
   hash to back multiple formulas with different identities.

4. **Zip mode reuses the same tree formulation.**  Whether the input is
   a directory or a zip file, the result is the same `readable-tree` /
   `readable-blob` hierarchy.  The zip is just an alternative
   serialization of a file tree.  This means `endo checkin ./dist -n app`
   and `endo checkin -z dist.zip -n app` produce structurally identical
   formula trees (given identical content).

5. **No metadata preservation.**  Formulas store content only.
   Permissions, timestamps, and ownership are not captured.  This
   simplifies the model and avoids platform-specific metadata concerns.
   If metadata preservation is needed in the future, it can be added as
   an optional sidecar formula without changing the core tree structure.

6. **Symlinks are skipped with a warning.**  The `readable-tree` model
   has no concept of symlinks.  Following symlinks could create cycles
   or reference files outside the intended tree.  Skipping them is the
   safe default.

7. **`.endoignore` for exclusion.**  Rather than inventing a new flag
   syntax for exclusion patterns, checkin respects a `.endoignore` file
   (`.gitignore` syntax) in the root directory.  This is familiar to
   developers and composable with existing tooling.  `.git` directories
   are always ignored regardless of `.endoignore`.

## Prompt

> Add a design document that concretely proposes `endo checkin`
> (`endo ci`) and `endo checkout` (`endo co`) that are able to read a
> filesystem snapshot into a tree of readable-tree and readable-blob
> formulas in the daemon's content address store, and give both of them
> a `--zip` (`-z`) flag for indicating the content of a zip file instead
> of an ordinary file.  The `-n` name flag and `--as` flag should be
> consistent with other commands.
