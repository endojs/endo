# Filesystem Capability: Ideas and Directions

| | |
|---|---|
| **Date** | 2026-02-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

This document collects ideas for a filesystem capability that Endo could
provide to AI agent guests.  It is not a finished design — it is a bag
of ideas at varying levels of maturity, drawn from Endo's existing VFS
sketch (`docs/virtual-filesystem-design.md`), the OS sandbox plugin
design (`daemon-os-sandbox-plugin.md`), and the ocap patterns that
Endo already uses for its pet-name directory.

Some of these ideas are near-term and concrete (a physical-backend Dir
that wraps a host directory).  Others are speculative (git tree backends,
materialization for sandbox integration, CAS-backed immutable trees).
The intent is to lay out the design space so that contributors can
propose concrete steps toward realizing parts of this vision
incrementally — picking one facet, writing a focused design for it, and
building it without waiting for the whole picture to solidify.

If you see an idea here that interests you, consider writing a concrete
design document for it.  Good candidates for a first step include:

- A minimal physical-backend Dir/File with caretaker control, sufficient
  to grant a guest read-write access to a single project directory.
- A read-only git-tree backend that exposes a commit as a Dir.
- The materialization bridge between a non-physical VFS and the OS
  sandbox plugin.
- A VFS namespace compositor that mounts multiple backends into a single
  tree.

## Motivation

AI coding agents need to read and write files in a project directory.
Today, agents either receive ambient filesystem access (the host OS
user's full permissions) or no filesystem access at all.  Ambient access
lets a prompt-injected agent read credentials (`~/.ssh/id_rsa`,
`~/.aws/credentials`), poison configuration (`~/.bashrc`, `.git/hooks`),
or exfiltrate source code — attacks demonstrated at 84% success rates
against unprotected editors [1][2].

Endo already has an object-capability directory abstraction
(`packages/daemon/src/directory.js`) for its pet-name store, and a
virtual filesystem design sketch (`docs/virtual-filesystem-design.md`)
that establishes the ocap patterns: `Dir` and `File` as capabilities,
a controller facet following the caretaker pattern, recursive attenuation
via subdirectory grants, policies for traversal containment, and
backend composition.

The ideas below explore how these foundations could be extended into
concrete capabilities for AI agent use cases.

## Ideas

### Layered architecture

The system could be organized into three layers.  Each layer is
independently useful and could be built incrementally.

```
┌─────────────────────────────────────────────┐
│               Guest (Dir / File)            │
│  Navigation, read, write, attenuation       │
│  Structural confinement — cannot go up      │
├─────────────────────────────────────────────┤
│        VFS Namespace (host-only)            │
│  Composes backends into a virtual tree      │
│  mount(), root(), control facets            │
├───────────┬─────────────┬───────────────────┤
│ Physical  │  Git Tree   │  Memory / CAS     │
│ Backend   │  Backend    │  Backend          │
│           │             │                   │
│ OS files  │ git refs,   │ Ephemeral or      │
│ sandbox-  │ worktrees   │ content-addressed  │
│ compatible│             │ blobs             │
└───────────┴─────────────┴───────────────────┘
```

**VFS Namespace.**  The host constructs a virtual filesystem by mounting
backends at paths within the namespace.  This is where `mount` lives —
it attaches a backend subtree to a virtual path, following the same
semantics as the VFS design sketch.  The namespace is a chroot jail:
the guest sees a single unified tree and cannot distinguish which
backend serves which path.

**Backends.**  Each backend provides storage behind the `Dir`/`File`
interface.  The guest-facing interface is identical regardless of
backend — the same `Dir` and `File` methods work whether the backing
is a physical directory, a git tree, or an in-memory store.

**Dir / File.**  The guest-facing capabilities.  Obtained from the VFS
namespace via `root()` or by navigating into subdirectories.  These are
the only capabilities the guest holds.

### Backend types

Several backend types could serve the Dir/File interface.  A physical
backend is the obvious starting point; the others are more speculative
but illustrate the design space.

#### Physical backend

The simplest and most immediately useful backend.  Wraps a host OS
directory, mapping read and write operations to real filesystem calls
via the daemon's `FilePowers`.  This backend's key advantage is
**interoperability with OS-level sandboxing**: a physically-backed VFS
can be passed to the OS sandbox plugin (`daemon-os-sandbox-plugin.md`)
as a filesystem endowment, letting sandboxed native processes access
the same files the agent sees.

```js
const projectBackend = physicalBackend('/home/user/project');
```

#### Git tree backend

Exposes a git tree-ish (commit, branch, tag) as a read-only directory
tree.  Writes create a new tree object (or work against a temporary
index) without touching the working directory.  This lets an agent
read source at a specific revision, diff across commits, or
experiment with changes without modifying the physical checkout.

```js
const mainBackend = gitTreeBackend('/home/user/project/.git', 'main');
const prBackend = gitTreeBackend('/home/user/project/.git', 'feature/foo');
```

#### Memory backend

Ephemeral in-memory storage.  Useful for scratch space, temporary
results, and experimentation.  Contents are lost when the VFS is
discarded.  Writes are cheap and cannot affect the physical system.

```js
const scratchBackend = memoryBackend();
```

#### CAS backend

Content-addressed storage.  Inherently read-only (content is immutable
once stored).  Useful for caching build artifacts, sharing immutable
datasets, and providing reproducible inputs.

```js
const artifactsBackend = casBackend(contentAddressStore);
```

### VFS namespace construction

The VFS namespace is the analogue of a chroot jail or a build
sandbox's input tree.  The host constructs it by mounting backends at
paths.  Each mount can be independently attenuated (read-only,
size-limited, etc.) at the backend level.  The namespace itself is a
host-only capability — the guest receives only the `Dir` obtained
from `root()`.

How exactly the namespace API should look is an open question.  The
VFS design sketch uses `vfs.mount(pathArray, backend)`.  One
possible shape:

```js
const vfs = makeVirtualFs({ policy: rootedPolicy });

// Physical project source — read-write
vfs.mount(['project'], physicalBackend('/home/user/project'));

// Git main branch — read-only reference copy
vfs.mount(['ref', 'main'], gitTreeBackend(
  '/home/user/project/.git', 'main',
));

// Scratch space — ephemeral, no physical footprint
vfs.mount(['tmp'], memoryBackend());

// Build cache — immutable artifacts
vfs.mount(['cache'], casBackend(artifactStore));

// Get the root Dir for granting to a guest:
const { dir: rootDir, control: rootControl } = vfs.root();
```

The guest sees:

```
/
├── project/     (physical, read-write)
│   ├── src/
│   ├── package.json
│   └── ...
├── ref/
│   └── main/    (git tree, read-only)
│       ├── src/
│       └── ...
├── tmp/         (memory, read-write)
└── cache/       (CAS, read-only)
```

The guest cannot tell which paths are physical and which are virtual.
It interacts with all of them through the same `Dir` and `File` methods.

### Materialization for sandbox integration

This idea is more speculative but connects the VFS concept to the OS
sandbox plugin in a powerful way.

A VFS backed entirely by non-physical backends (git trees, memory, CAS)
cannot be passed directly to an OS sandbox, since sandboxed native
processes need real filesystem paths.  **Materialization** would bridge
this gap: the VFS (or a subtree of it) is checked out to temporary
physical storage, the sandboxed process runs against that checkout, and
changes
are read back into the VFS.

```js
// Materialize the VFS into a temp directory for sandbox use:
const { physicalPath, syncBack } = await E(vfs).materialize(['project']);

// Pass to the OS sandbox plugin:
const sandbox = await E(sandboxMaker).describe({
  fs: [{ path: physicalPath, mode: 'read-write' }],
});
const result = await E(sandbox).run('/usr/bin/make', ['build']);

// Read changes back into the VFS:
await syncBack();
```

This is the same trick Bazel uses: a build step sees only the
dependencies explicitly mounted into its sandbox.  If a dependency is
not declared, it is not mounted, and the build step cannot see it —
the absence is enforced structurally, not by policy.  A VFS namespace
with selective mounts achieves the same property: an agent or
subprocess sees exactly the files that were mounted, nothing more.

### Dir and File capabilities

`Dir` and `File` are the guest-facing capabilities.  Of all the ideas
in this document, these are the most concrete and the best candidate
for a first implementation — a Dir backed by a single physical
directory would be immediately useful for granting project access to
an agent guest.

#### Overview

- **`Dir`** — directory capability.  Exposes methods to list, read,
  write, and navigate.  Can only reach descendants of its root.
- **`File`** — file capability.  Can attenuate itself to read-only or
  revocable forms.
- **`DirControl`** / **`FileControl`** — caretaker facets the host
  holds.  Can toggle readability and writability, or revoke entirely,
  without the guest's cooperation.

The guest never holds a "filesystem service configured with a
descriptor."  It holds a `Dir` rooted at a specific location.  It
cannot name paths outside that root because no method on `Dir` returns
a reference to a parent.  This is structural confinement — the security
property follows from the object graph, not from a denylist.

#### Capability flow

```
HOST
 │
 ├─ vfs.root()
 │   └─ rootDir                              (Dir over entire VFS)
 │
 ├─ rootDir.readOnly()
 │   └─ readOnlyDir                          (read-only view)
 │
 ├─ rootDir.subDir("project/src")
 │   └─ srcDir                               (Dir re-rooted at project/src/)
 │
 ├─ rootDir.readOnly().subDir("project/src")
 │   └─ readOnlySrcDir                       (chained: read-only + scoped)
 │
 └─ rootControl                              (caretaker)
     ├─ setWritable(false)                   (locks writes)
     └─ revoke()                             (invalidates rootDir)

GUEST
 └─ receives rootDir or readOnlyDir or srcDir
     ├─ list()                → ["src", "package.json", "README.md"]
     ├─ openDir("src")        → Dir (navigate into src/)
     ├─ openFile("README.md") → File
     │   ├─ readText()         → string
     │   ├─ readOnly()         → File (read-only facet)
     │   └─ writeText(s)       → (if writable)
     ├─ glob("**/*.js")       → ["src/index.js", "src/lib/util.js"]
     └─ help()                → usage description
```

#### Recursive attenuation

Attenuation happens by calling methods that each narrow in a single
dimension.  These methods return new capabilities and compose by
chaining:

- **`readOnly()`** — removes write authority.  Returns a `Dir` (or
  `File`) that supports all read operations but rejects writes.
- **`subDir(path)`** — scopes to a subtree.  Takes a `/`-separated
  relative path and returns a new `Dir` re-rooted at that location.
  The recipient cannot navigate above the new root.

Both methods are available on every `Dir`.  A guest can further
attenuate capabilities it holds (attenuation is always safe), and a
host uses them when constructing grants.

```js
// Full VFS access:
const rootDir = vfs.root().dir;

// Read-only (one dimension: remove writes):
const readOnlyDir = await E(rootDir).readOnly();

// Scoped to project/src (one dimension: narrow scope):
const srcDir = await E(rootDir).subDir('project/src');

// Chained: read-only + scoped:
const readOnlySrc = await E(await E(rootDir).readOnly()).subDir('project/src');

// Single read-only file:
const readme = await E(rootDir).openFile('README.md');
const readOnlyReadme = await E(readme).readOnly();
```

Each result is a complete, self-contained capability.  The recipient
cannot navigate upward from `srcDir` to reach `rootDir`, nor can they
recover write authority from `readOnlyDir`.

`openDir(name)` remains a distinct navigation method — it takes a
single path segment and returns the child directory for traversal
within a session.  `subDir(path)` is the attenuation method — it
takes a multi-segment path and creates a new confined root.

#### Caretaker separation

The host holds control facets that are structurally separate from the
capabilities granted to the guest:

```js
// Host gets both facets from the VFS:
const { dir: rootDir, control: rootControl } = vfs.root();

// Host grants only the dir facet to the guest:
E(host).grant(guestName, 'fs', rootDir);

// Later, host can lock writes without the guest's involvement:
E(rootControl).setWritable(false);

// Or revoke entirely:
E(rootControl).revoke();
// Guest's rootDir now throws on all method calls.
```

The guest cannot discover, access, or influence the control facet.

#### Defense-in-depth deny patterns (optional)

As a secondary safety net, the physical backend may apply hardcoded deny
patterns to catch mistakes in VFS construction.  These are not the
primary confinement mechanism — structural confinement via selective
mounting is — but they provide an additional layer if a host accidentally
mounts a directory that contains sensitive files:

```
**/.ssh/**
**/.aws/**
**/.gnupg/**
**/.env
**/.env.*
**/*.pem
**/*.key
**/credentials.json
**/.netrc
**/.npmrc
```

These patterns are enforced at the backend level, not in the `Dir` or
`File` exos, so they cannot be circumvented by the guest.  They are
configurable by the host and can be disabled when the host explicitly
intends to expose such paths (e.g., a credential management agent).

Non-physical backends (git tree, memory, CAS) do not need these
patterns — they contain only the content explicitly placed in them.

### Interface guards

```js
const PathSegment = M.string();

const NodeStatShape = M.splitRecord(
  {
    name: M.string(),
    type: M.or(
      M.literal('file'),
      M.literal('directory'),
      M.literal('symlink'),
    ),
  },
  {
    sizeBytes: M.number(),
    modifiedMs: M.number(),
  },
);

const DirI = M.interface('Dir', {
  // Navigation
  list: M.call().returns(M.promise(M.arrayOf(M.string()))),
  get: M.call(PathSegment).returns(M.promise(M.remotable('Node'))),
  openDir: M.call(PathSegment).returns(M.promise(M.remotable('Dir'))),
  openFile: M.call(PathSegment).returns(M.promise(M.remotable('File'))),
  stat: M.call(PathSegment).returns(M.promise(NodeStatShape)),
  glob: M.call(M.string()).returns(M.promise(M.arrayOf(M.string()))),

  // Mutation (writable Dir only)
  createDir: M.call(PathSegment).returns(M.promise(M.remotable('Dir'))),
  createFile: M.call(PathSegment).returns(M.promise(M.remotable('File'))),
  remove: M.call(PathSegment).returns(M.promise(M.undefined())),

  // Attenuation — each narrows one dimension, composable by chaining
  readOnly: M.call().returns(M.remotable('Dir')),
  subDir: M.call(M.string()).returns(M.promise(M.remotable('Dir'))),

  help: M.call().returns(M.string()),
});

const FileI = M.interface('File', {
  readText: M.call().returns(M.promise(M.string())),
  readBytes: M.call().returns(M.promise(M.remotable('Bytes'))),
  writeText: M.call(M.string()).returns(M.promise(M.undefined())),
  writeBytes: M.call(M.remotable('Bytes')).returns(M.promise(M.undefined())),
  append: M.call(M.string()).returns(M.promise(M.undefined())),
  stat: M.call().returns(M.promise(NodeStatShape)),
  readOnly: M.call().returns(M.remotable('File')),
  revocable: M.call().returns(
    M.splitRecord({
      file: M.remotable('File'),
      revoke: M.remotable('Revoker'),
    }),
  ),
  help: M.call().returns(M.string()),
});

const DirControlI = M.interface('DirControl', {
  setWritable: M.call(M.boolean()).returns(M.undefined()),
  getWritable: M.call().returns(M.boolean()),
  revoke: M.call().returns(M.undefined()),
  getChild: M.call(PathSegment).returns(
    M.promise(M.remotable('NodeControl')),
  ),
  help: M.call().returns(M.string()),
});

const FileControlI = M.interface('FileControl', {
  setWritable: M.call(M.boolean()).returns(M.undefined()),
  getWritable: M.call().returns(M.boolean()),
  setReadable: M.call(M.boolean()).returns(M.undefined()),
  getReadable: M.call().returns(M.boolean()),
  revoke: M.call().returns(M.undefined()),
  help: M.call().returns(M.string()),
});

const RevokerI = M.interface('Revoker', {
  revoke: M.call().returns(M.undefined()),
});

const VfsI = M.interface('VirtualFs', {
  mount: M.call(M.arrayOf(M.string()), M.remotable('Backend'))
    .returns(M.promise(M.undefined())),
  root: M.call().returns(
    M.splitRecord({
      dir: M.remotable('Dir'),
      control: M.remotable('DirControl'),
    }),
  ),
  materialize: M.call(M.arrayOf(M.string()))
    .returns(M.promise(M.splitRecord({
      physicalPath: M.string(),
      syncBack: M.remotable('SyncBack'),
    }))),
  help: M.call().returns(M.string()),
});
```

### LLM discoverability

An LLM agent receiving a `Dir` or `File` capability can discover its
interface through two mechanisms:

1. **`help()` text** — comprehensive natural-language documentation of
   every method, its parameters, return types, and examples.

2. **Interface guards** — machine-readable method signatures with specific
   shapes that an LLM can inspect via Endo's interface introspection to
   construct valid calls without guessing.

The `help()` text is written for an LLM that has never seen this
capability before.  It explains what the capability does, enumerates
every method, and gives concrete example invocations.

Note: the guest sees only `Dir` and `File`.  It does not see the `Vfs`
interface, backend types, or control facets.  The LLM needs to
understand only the Dir/File methods to use the filesystem.

### help() text

#### Dir

```js
help() {
  return `\
Dir provides access to a directory and its contents.

You can list entries, open subdirectories or files, and create new
entries. This Dir is rooted at a specific location — you can navigate
into subdirectories but cannot navigate above the root.

Navigation:
  list() - List entry names in this directory.
    Returns: string[]
    Example: list() → ["src", "package.json", "README.md"]

  get(name) - Get a child node (file, directory, or link).
    name: string - Entry name (single segment, no slashes).
    Returns: Node
    Example: get("package.json")

  openDir(name) - Open a subdirectory as a new Dir capability.
    name: string - Subdirectory name (single segment).
    Returns: Dir
    Example: openDir("src")

  openFile(name) - Open a file as a File capability.
    name: string - File name (single segment).
    Returns: File
    Example: openFile("index.js")

  stat(name) - Get metadata for an entry.
    name: string - Entry name.
    Returns: { name, type: 'file'|'directory'|'symlink', sizeBytes?, modifiedMs? }

  glob(pattern) - Find entries matching a glob pattern, recursively.
    pattern: string - Glob pattern (relative to this Dir).
    Returns: string[] - Matching relative paths.
    Example: glob("**/*.js") → ["index.js", "lib/util.js"]

Mutation (writable Dir only):
  createDir(name) - Create a new subdirectory.
    name: string - New directory name.
    Returns: Dir

  createFile(name) - Create a new file.
    name: string - New file name.
    Returns: File

  remove(name) - Remove an entry.
    name: string - Entry to remove.

Attenuation (each narrows one dimension, chainable):
  readOnly() - Get a read-only view of this Dir.
    Returns: Dir - All navigation works; createDir, createFile,
    remove, and File writes throw.
    Example: readOnly()

  subDir(path) - Re-root this Dir at a subpath.
    path: string - Relative path with "/" separators.
    Returns: Dir - A new Dir that cannot navigate above path.
    Example: subDir("src/lib")

  Chaining example:
    readOnly().subDir("src") → read-only Dir scoped to src/

  help() - Returns this description.`;
}
```

#### File

```js
help() {
  return `\
File provides access to a single file's contents.

Methods:
  readText() - Read the file as UTF-8 text.
    Returns: string
    Example: readText() → "# README\\n..."

  readBytes() - Read the file as raw bytes.
    Returns: Bytes

  writeText(content) - Replace the file contents with text (writable only).
    content: string
    Example: writeText("new content")

  writeBytes(data) - Replace the file contents with bytes (writable only).
    data: Bytes

  append(text) - Append text to the file (writable only).
    text: string

  stat() - Get file metadata.
    Returns: { name, type: 'file', sizeBytes?, modifiedMs? }

  readOnly() - Get a read-only view of this file.
    Returns: File - A File that cannot be written to.

  revocable() - Get a revocable wrapper around this file.
    Returns: { file: File, revoke: Revoker }
    The returned file works identically until revoke.revoke() is called,
    after which all methods throw.

  help() - Returns this description.`;
}
```

#### DirControl

```js
help() {
  return `\
DirControl is the caretaker facet for a Dir capability.

It can modify permissions or revoke the Dir entirely. The guest
holding the corresponding Dir cannot see or influence this controller.

Methods:
  setWritable(flag) - Toggle whether the Dir allows writes.
    flag: boolean

  getWritable() - Check current write permission.
    Returns: boolean

  revoke() - Permanently invalidate the corresponding Dir.
    All future method calls on the Dir will throw.

  getChild(name) - Get the control facet for a child node.
    name: string
    Returns: NodeControl (FileControl or DirControl)

  help() - Returns this description.`;
}
```

### Granting examples

These illustrate how the pieces might compose.  The API shapes are
suggestive, not settled.

#### Grant read-write access to a project VFS

```js
const vfs = makeVirtualFs({ policy: rootedPolicy });
vfs.mount(['src'], physicalBackend('/home/user/project'));
vfs.mount(['tmp'], memoryBackend());

const { dir: rootDir, control: rootControl } = vfs.root();
E(host).grant(guestName, 'fs', rootDir);
```

#### Grant read-only access

```js
const readOnlyDir = await E(rootDir).readOnly();
E(host).grant(guestName, 'fs', readOnlyDir);
```

#### Grant access scoped to a subtree

```js
const srcDir = await E(rootDir).subDir('src/lib');
E(host).grant(guestName, 'fs', srcDir);
```

#### Grant read-only access scoped to a subtree

```js
const readOnlySrc = await E(await E(rootDir).readOnly()).subDir('src');
E(host).grant(guestName, 'fs', readOnlySrc);
```

#### Bazel-style selective dependency mounting

```js
// Build step sees only its declared dependencies — nothing else
// is mounted, so undeclared dependencies are structurally invisible.
const buildVfs = makeVirtualFs({ policy: rootedPolicy });
buildVfs.mount(['src'], physicalBackend('/home/user/project/packages/foo/src'));
buildVfs.mount(['deps', 'bar'], physicalBackend('/home/user/project/packages/bar'));
buildVfs.mount(['out'], memoryBackend());

const { dir: buildDir } = buildVfs.root();
E(host).grant(buildAgent, 'fs', buildDir);
```

#### Experiment against a git revision without touching the working tree

```js
const experimentVfs = makeVirtualFs({ policy: rootedPolicy });
experimentVfs.mount(
  ['base'],
  gitTreeBackend('/home/user/project/.git', 'main'),
);
experimentVfs.mount(['scratch'], memoryBackend());

const { dir: experimentDir } = experimentVfs.root();
E(host).grant(guestName, 'fs', experimentDir);
// Agent can read main-branch source and write to scratch/
// without affecting the physical working directory.
```

#### Materialize for sandboxed execution

```js
const { physicalPath, syncBack } = await E(vfs).materialize(['src']);

const sandbox = await E(sandboxMaker).describe({
  fs: [{ path: physicalPath, mode: 'read-write' }],
  exec: { allowPaths: ['/usr/bin'] },
});
const result = await E(sandbox).run('/usr/bin/make', ['build']);

await E(syncBack).sync();
```

#### Grant a single read-only file

```js
const configFile = await E(rootDir).openFile('config.json');
const readOnlyConfig = await E(configFile).readOnly();
E(host).grant(guestName, 'config', readOnlyConfig);
```

#### Revoke mid-session

```js
// Host detects anomalous behavior and revokes:
E(rootControl).revoke();
// All subsequent calls by the guest throw immediately.
```

### Relationship to existing Endo abstractions

Any concrete design should build on these existing pieces rather than
introducing parallel abstractions.

**Pet-name directory (`packages/daemon/src/directory.js`).**  The existing
`EndoDirectory` is a capability for the daemon's pet-name store — it maps
names to formula identifiers, not to files.  The filesystem `Dir` is a
separate capability that maps names to file and directory nodes backed by
a storage backend.  Both follow the same structural pattern (you navigate
by name, you cannot go up), but they serve different purposes and live at
different layers.  A pet-name directory might contain a reference to a
filesystem `Dir` as one of its entries.

**Virtual filesystem design sketch (`docs/virtual-filesystem-design.md`).**
The ideas here build on that sketch.  The `Dir`, `File`, `DirControl`,
and `FileControl` interfaces are refinements of the `DirI`, `FileI`,
`FsControlI`, and `NodeControlI` interfaces defined there.  The key
additions explored in this document are:

- `readOnly()` and `subDir(path)` on `Dir` as constituent single-
  dimension attenuation methods, replacing the sketch's general
  `attenuate(opts)` with composable, chainable calls
- Git tree and CAS backends as first-class backend types alongside
  physical and memory
- Materialization bridge for OS sandbox integration
- `readText()` / `writeText()` convenience methods on `File` (the sketch
  uses raw byte arrays)
- `glob()` on `Dir` for recursive pattern matching
- `help()` on all facets for LLM discoverability
- Agent-facing granting patterns and examples
- Defense-in-depth deny patterns as a backend-level concern

**`FilePowers` (`packages/daemon/src/types.d.ts`).**  The daemon's
internal `FilePowers` type provides raw path-based file operations
(`readFileText(path)`, `writeFileText(path, text)`, etc.) used by the
daemon itself.  These are ambient-authority operations — any code with
`FilePowers` can read or write any path.  The filesystem capability
described here wraps and confines these powers: the physical backend
uses `FilePowers` internally, but the `Dir` and `File` facets exposed
to guests restrict access to the mounted subtree.

**OS sandbox plugin (`daemon-os-sandbox-plugin.md`).**  The sandbox
plugin accepts filesystem endowments as host paths with access modes.
Physically-backed VFS subtrees can be passed directly as sandbox
endowments.  Non-physical subtrees (git tree, memory, CAS) must be
materialized to temporary physical storage first.  The materialization
API bridges this gap.

### Packages that would likely be affected

- **`packages/daemon`** — New plugin or module implementing `Dir`, `File`,
  control facets, VFS namespace, and backends.
- **`packages/daemon`** — Integration tests.
- **`packages/cli`** — Optional CLI commands for constructing and
  granting filesystem capabilities.

### Dependencies to be aware of

- The physical backend would depend on the daemon's existing `FilePowers`
  for OS file access.
- A git tree backend would depend on git object storage (either via
  `child_process` git commands or a JS git library).
- The materialization idea depends on both the VFS layer and the OS
  sandbox plugin's filesystem endowment interface.
- The virtual filesystem design sketch
  (`docs/virtual-filesystem-design.md`) provides the architectural
  foundation.
- No dependency on other capability bank categories (network, process,
  etc.) — these can proceed independently.

## Security Considerations

Any concrete design should address these concerns.  They are listed
here as a checklist for future design authors.

- **Structural confinement is the primary defense.**  A guest holding a
  `Dir` rooted at a VFS namespace cannot access paths outside that
  namespace because no method on `Dir` returns a reference to a parent
  or sibling.  There is no path string the guest can construct that
  reaches outside the root — the capability model makes such access
  structurally impossible, not merely denied by policy.

- **Selective mounting is the Bazel property.**  The VFS namespace
  contains only what the host explicitly mounts.  Undeclared
  dependencies are not denied by policy — they are absent from the
  namespace entirely.  A guest cannot access `/home/user/.ssh` if no
  mount exposes it, regardless of what the physical filesystem contains.

- **Symlink escape.**  Symbolic links within a physically-backed subtree
  that resolve outside the mount boundary must not be followed.  The
  physical backend must resolve symlinks and check that the target is
  within the mount boundary before returning a node.  Non-physical
  backends (git tree, memory, CAS) store links as opaque targets and
  resolve them within their own namespace, so escape is not possible.

- **Path traversal in entry names.**  The `PathSegment` type must reject
  names containing `/`, `\`, `..`, or the null byte.  These checks occur
  in the `Dir` exo, not just in the backend, so they are enforced even
  for in-memory or CAS-backed filesystems.  `subDir(path)` splits on
  `/`, validates each resulting segment, and resolves eagerly — the
  returned `Dir` holds a direct reference to the resolved subtree, so
  TOCTOU races between scoping and use are avoided.

- **Caretaker revocation is immediate.**  When a control facet calls
  `revoke()`, the corresponding capability must become immediately
  inoperative.  In-flight operations may complete, but no new operations
  are accepted.  This requires a shared revocation flag between the
  capability and its control facet.

- **Attenuation is irreversible.**  A read-only `Dir` obtained via
  `readOnly()` cannot be upgraded to read-write by the guest.  A `Dir`
  obtained via `subDir("src")` cannot navigate above `src/`.  Each
  narrowing is one-way — the guest cannot recover authority that was
  removed.

- **Materialization is a controlled rights expansion.**  Converting a
  non-physical VFS subtree to temporary physical storage creates real
  files that a sandboxed process can access.  The materialized path
  must be confined (e.g., under a temp directory with restrictive
  permissions), and `syncBack` must validate that changes are within
  the materialized scope before writing them back to the VFS.

- **Defense-in-depth deny patterns catch granting mistakes.**  If a host
  accidentally mounts `$HOME` instead of `$HOME/project`, the physical
  backend's deny patterns for `.ssh`, `.aws`, `.env`, etc. provide a
  secondary barrier.  Non-physical backends do not need these patterns
  since they contain only explicitly placed content.

- **Backend isolation.**  The physical backend holds ambient `FilePowers`.
  It must never expose these powers through any `Dir` or `File` method.
  The backend is part of the trusted computing base; the `Dir` and `File`
  exos are not.

## Open Questions

These are questions that a concrete design for any facet of this
vision should address.

- What is the right backend interface?  The VFS sketch leaves this
  largely implicit.  A concrete backend interface would make it
  possible to implement and test backends independently.
- Should `glob()` live on `Dir` or be a separate utility that takes a
  `Dir`?  Glob is expensive and its semantics (streaming vs bounded,
  cross-mount behavior) may warrant separate treatment.
- How should the VFS handle mounts that overlap or shadow each other?
  The sketch is silent on this.
- What are the atomicity semantics for writes that cross mount
  boundaries (e.g., moving a file from a physical mount to a memory
  mount)?
- How should materialization handle large subtrees?  Streaming?
  Bounded size?  Lazy materialization on first access?
- Is `subDir(path)` the right name and signature for scope attenuation?
  Alternatives include `chroot(path)`, `scope(path)`, or overloading
  `openDir` to accept multi-segment paths.
- Should `readOnly()` and `subDir()` return new exos with their own
  control facets, or should control be inherited from the parent?

## Notes for Implementers

**Scaling.**  Dir and File capabilities are lightweight exos wrapping
a backend reference and a permissions record — thousands can coexist.
Revocation uses a shared boolean flag (O(1) check per operation).
Git tree backends read from packfiles; performance depends on
repository size.  Materialization copies to temp storage proportional
to subtree size.

**Compatibility.**  Dir and File should be plain Endo exos serializable
over OCapN.  Backends are pluggable — new types can be added without
changing the Dir/File interface.  The interface should align with the
VFS design sketch so backends are interchangeable.

**Upgrade path.**  New methods can be added to Dir or File as optional
extensions.  Incompatible changes should introduce new types (e.g.,
`DirV2`) rather than modifying existing interfaces.

## References

[1]: Y. Liu et al., "'Your AI, My Shell': Demystifying Prompt Injection
Attacks on Agentic AI Coding Editors," arXiv:2509.22040, September 2025.
https://arxiv.org/abs/2509.22040

[2]: A. Marzouk (MaccariTA), "IDEsaster: 30+ Vulnerabilities in AI
Coding Tools Enabling Data Theft and RCE," December 2025.
https://thehackernews.com/2025/12/researchers-uncover-30-flaws-in-ai.html
