# `@endo/platform` — Filesystem Types and Adapters

| | |
|---|---|
| **Created** | 2026-03-18 |
| **Updated** | 2026-03-18 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## What is the Problem Being Solved?

Filesystem primitives are scattered across `packages/daemon` and
`packages/cli`, tightly coupled to Node.js and to the daemon's formula
system.  The daemon defines `EndoReadable`, `ReadableTree`, and content-
addressed blob storage inside `daemon-node-powers.js` and `daemon.js`.
The CLI builds `Far('LocalTree')` objects inline in `checkin.js` and
reconstructs trees to disk inline in `checkout.js`.  Both sides use the
same conceptual vocabulary — trees, blobs, streaming, content hashes —
but share no code and no types.

This coupling has three consequences:

1. **The CLI cannot present a local filesystem to a remote daemon
   without reimplementing the tree protocol from scratch in each
   command.**  `checkin.js` and `checkout.js` each contain ad-hoc
   `Far` wrappers and duck-typing logic that should be reusable.

2. **The daemon's filesystem types (`EndoReadable`, readable-tree
   manifests) are entangled with formula persistence.**  A Go or Rust
   supervisor, a browser client, or a test harness cannot use them
   without importing the entire daemon.

3. **There is no shared type vocabulary for the distinction between
   a shallow readable view (the capability a guest holds) and the
   content-addressed representation (what the store manages).**  The
   `readOnly()` attenuation pattern from `daemon-capability-filesystem`
   has no home.

`@endo/platform` is the package.  `@endo/platform/fs` is the module
that provides the common ground: types, interfaces, and platform-agnostic
tree operations.  Platform-specific adapters live in condition-gated
modules (`@endo/platform/fs/node` for Node.js).

## Design

### Module Layout

```
packages/platform/
  src/
    fs/
      types.d.ts          # All TS types
      interfaces.js        # Exo interface guards (M.interface)
      snapshot-blob.js     # makeSnapshotBlob(store, sha256)
      snapshot-tree.js     # makeSnapshotTree(store, sha256)
      snapshot-store.js    # SnapshotStore contract, helpers
      checkin.js           # checkinTree(remoteTree, store) → sha256
      checkout.js          # checkoutTree(tree, writer) → void
      index.js             # Re-exports (platform-agnostic surface)
    fs-node/
      snapshot-sha256-store.js   # File-backed CAS
      local-tree.js             # makeLocalTree(dirPath) → ReadableTree Exo
      local-blob.js             # makeLocalBlob(filePath) → ReadableBlob Exo
      tree-writer.js            # makeTreeWriter(dirPath) → TreeWriter Exo
      index.js                  # Re-exports (Node.js surface)
  package.json
```

### Conditional Exports

```jsonc
// packages/platform/package.json
{
  "name": "@endo/platform",
  "exports": {
    "./fs": {
      "node": {
        "types": "./src/fs-node/types.d.ts",
        "default": "./src/fs-node/index.js"
      }
      // Future: "browser", "endo-go", "endo-rust"
    },
    "./fs/lite": {
      "types": "./src/fs/types.d.ts",
      "default": "./src/fs/index.js"
    },
    "./fs/node": {
      "types": "./src/fs-node/types.d.ts",
      "default": "./src/fs-node/index.js"
    }
  }
}
```

- `import { ... } from '@endo/platform/fs'` resolves via the `"node"`
  condition.  A bundler targeting `"browser"` would get a different
  implementation (or an error, until one exists).  A Go or Rust host
  would provide its own adapter under `"endo-go"` or `"endo-rust"`.

- `import { ... } from '@endo/platform/fs/lite'` always resolves to
  the platform-agnostic subset: types, interfaces, `makeSnapshotTree`,
  `makeSnapshotBlob`, `checkinTree`, `checkoutTree`.  This module never
  imports `node:fs` or any platform module.

- `import { ... } from '@endo/platform/fs/node'` is an explicit request
  for the Node.js adapter, bypassing condition resolution.

`@endo/platform/fs/node` re-exports everything from `@endo/platform/fs/lite`
plus the Node.js-specific factories.  So `@endo/platform/fs` (under the
`"node"` condition) is a superset.

### Type Vocabulary

The central design challenge is distinguishing three roles an object
can play:

1. **Readable** — a shallow, possibly-remote capability.  The holder
   can `list`, `lookup`, and stream content, but cannot write.  This
   is what a guest or CLI client holds when interacting with a
   potentially-remote daemon.

2. **Snapshot** — a content-addressed, immutable snapshot whose identity
   is a hash.  The holder can obtain the hash (`sha256()`) and retrieve
   content from a `SnapshotStore`.  This is what the daemon persists.

3. **Mutable** — a live filesystem node that supports writes.
   `readOnly()` attenuates a mutable node to a readable one.

These roles compose along two axes — node kind (blob vs tree) and
mutability — producing a type lattice:

```
                     Blob                          Tree
                ┌─────────────┐             ┌──────────────┐
  Mutable       │    File     │             │   Directory   │
                │ read, write │             │ list, lookup, │
                │ readOnly()  │             │ write, remove │
                │ snapshot()  │             │ readOnly()    │
                │             │             │ snapshot()    │
                ├─────────────┤             ├──────────────┤
  Readable      │ ReadableBlob│             │ ReadableTree  │
  (shallow)     │ stream, text│             │ list, lookup  │
                │ json        │             │ has           │
                ├─────────────┤             ├──────────────┤
  Snapshot      │ SnapshotBlob│             │ SnapshotTree  │
  (content-     │ sha256()    │             │ sha256()      │
  addressed)    │ + Readable  │             │ + Readable    │
                └─────────────┘             └──────────────┘
```

A `SnapshotBlob` **is-a** `ReadableBlob` (it has all the same read
methods plus `sha256()`).  A `File` can produce a `ReadableBlob` via
`readOnly()`.  A `Directory` can produce a `ReadableTree` via
`readOnly()`.  These are structural subtypes, enforced by interface
guards.

### Types

```ts
// @endo/platform/fs/types.d.ts

import type { FarRef, Reader } from '@endo/far';

// ── Readable (shallow) ──────────────────────────────────────────

/**
 * A read-only view of file content.  May be local or remote.
 * This is the minimal capability a consumer needs to read a file.
 */
export interface ReadableBlob {
  /** Stream file content as base64-encoded chunks. */
  streamBase64(): FarRef<Reader<string>>;
  /** Read entire content as UTF-8 text. */
  text(): Promise<string>;
  /** Read entire content as parsed JSON. */
  json(): Promise<unknown>;
}

/**
 * A read-only view of a directory tree.  May be local or remote.
 * Compatible with EndoNameHub's read surface.
 */
export interface ReadableTree {
  /** Whether a path of names exists in this tree. */
  has(...path: string[]): Promise<boolean>;
  /** List entry names at the root, or at a path within the tree. */
  list(...path: string[]): Promise<string[]>;
  /**
   * Resolve a path to a child.
   * Returns a ReadableBlob for files, ReadableTree for directories.
   */
  lookup(...path: string[]): Promise<ReadableBlob | ReadableTree>;
}

// ── Snapshot (content-addressed) ─────────────────────────────────

/**
 * A content-addressed blob snapshot: an immutable ReadableBlob whose
 * identity is a SHA-256 hash.  What the daemon persists as a
 * readable-blob formula.
 */
export interface SnapshotBlob extends ReadableBlob {
  /** The SHA-256 hex digest of the raw content. */
  sha256(): string;
}

/**
 * A content-addressed tree snapshot: an immutable ReadableTree whose
 * identity is a SHA-256 hash of its manifest.  What the daemon
 * persists as a readable-tree formula.
 */
export interface SnapshotTree extends ReadableTree {
  /** The SHA-256 hex digest of the tree manifest JSON. */
  sha256(): string;
}

// ── Mutable ─────────────────────────────────────────────────────

/**
 * A mutable file.  readOnly() attenuates to ReadableBlob.
 * snapshot() captures current content into a SnapshotStore.
 */
export interface File extends ReadableBlob {
  /** Replace file contents with text. */
  writeText(content: string): Promise<void>;
  /** Replace file contents with a byte stream. */
  writeBytes(readable: AsyncIterable<Uint8Array>): Promise<void>;
  /** Append text to the file. */
  append(text: string): Promise<void>;
  /** Get a read-only view that cannot be written. */
  readOnly(): ReadableBlob;
  /** Capture current content into the snapshot store. */
  snapshot(): Promise<SnapshotBlob>;
}

/**
 * A mutable directory.  readOnly() attenuates to ReadableTree.
 * snapshot() recursively captures current content into a SnapshotStore.
 */
export interface Directory extends ReadableTree {
  /** Write (or overwrite) an entry at a path. */
  write(path: string[], value: ReadableBlob | ReadableTree): Promise<void>;
  /** Remove an entry at a path. */
  remove(path: string[]): Promise<void>;
  /** Rename an entry. */
  move(from: string[], to: string[]): Promise<void>;
  /** Copy an entry. */
  copy(from: string[], to: string[]): Promise<void>;
  /** Create a subdirectory at a path. */
  makeDirectory(path: string[]): Promise<Directory>;
  /** Get a read-only view that cannot be mutated. */
  readOnly(): ReadableTree;
  /** Recursively capture current tree into the snapshot store. */
  snapshot(): Promise<SnapshotTree>;
}

// ── Snapshot Store ──────────────────────────────────────────────

/**
 * Abstract content-addressed store.  Platform adapters provide
 * concrete implementations (file-backed, memory-backed, etc.).
 */
export interface SnapshotStore {
  /**
   * Store bytes, returning the SHA-256 hex digest.
   * The store deduplicates: storing identical content twice returns
   * the same hash without doubling storage.
   */
  store(readable: AsyncIterable<Uint8Array>): Promise<string>;
  /** Retrieve a stored blob by hash. */
  fetch(sha256: string): SnapshotBlob;
  /** Whether the store contains this hash. */
  has(sha256: string): Promise<boolean>;
}

// ── Tree Writer (for checkout) ──────────────────────────────────

/**
 * Receives tree content during checkout.  Platform adapters provide
 * concrete implementations (write to filesystem, write to zip, etc.).
 */
export interface TreeWriter {
  /** Write file content at a path within the tree. */
  writeBlob(
    pathSegments: string[],
    readable: AsyncIterable<Uint8Array>,
  ): Promise<void>;
  /** Ensure a directory exists at a path within the tree. */
  makeDirectory(pathSegments: string[]): Promise<void>;
}
```

### Interface Guards

```js
// @endo/platform/fs/interfaces.js

import { M } from '@endo/patterns';

export const ReadableBlobInterface = M.interface('ReadableBlob', {
  streamBase64: M.call().returns(M.remotable()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
});

export const SnapshotBlobInterface = M.interface('SnapshotBlob', {
  sha256: M.call().returns(M.string()),
  streamBase64: M.call().returns(M.remotable()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
});

export const ReadableTreeInterface = M.interface('ReadableTree', {
  has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  lookup: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
});

export const SnapshotTreeInterface = M.interface('SnapshotTree', {
  sha256: M.call().returns(M.string()),
  has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  lookup: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
});

export const FileInterface = M.interface('File', {
  streamBase64: M.call().returns(M.remotable()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
  writeText: M.call(M.string()).returns(M.promise()),
  writeBytes: M.call(M.remotable()).returns(M.promise()),
  append: M.call(M.string()).returns(M.promise()),
  readOnly: M.call().returns(M.remotable('ReadableBlob')),
  snapshot: M.call().returns(M.promise()),
});

export const SnapshotStoreInterface = M.interface('SnapshotStore', {
  store: M.call(M.remotable()).returns(M.promise()),
  fetch: M.call(M.string()).returns(M.remotable()),
  has: M.call(M.string()).returns(M.promise()),
});

export const TreeWriterInterface = M.interface('TreeWriter', {
  writeBlob: M.call(M.arrayOf(M.string()), M.remotable()).returns(M.promise()),
  makeDirectory: M.call(M.arrayOf(M.string())).returns(M.promise()),
});

export const DirectoryInterface = M.interface('Directory', {
  has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  lookup: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  write: M.call(M.arrayOf(M.string()), M.remotable()).returns(M.promise()),
  remove: M.call(M.arrayOf(M.string())).returns(M.promise()),
  move: M.call(M.arrayOf(M.string()), M.arrayOf(M.string())).returns(M.promise()),
  copy: M.call(M.arrayOf(M.string()), M.arrayOf(M.string())).returns(M.promise()),
  makeDirectory: M.call(M.arrayOf(M.string())).returns(M.promise()),
  readOnly: M.call().returns(M.remotable('ReadableTree')),
  snapshot: M.call().returns(M.promise()),
});
```

### Platform-Agnostic Functions (`@endo/platform/fs/lite`)

#### `makeSnapshotBlob(store, sha256)`

Creates a `SnapshotBlob` Exo backed by a `SnapshotStore`.  Extracted from
`daemon.js:makeReadableBlob`.

```js
export const makeSnapshotBlob = (store, sha256) => {
  const { text, json, streamBase64 } = store.fetch(sha256);
  return makeExo('SnapshotBlob', SnapshotBlobInterface, {
    sha256: () => sha256,
    streamBase64,
    text,
    json,
  });
};
```

#### `makeSnapshotTree(store, sha256)`

Creates a `SnapshotTree` Exo backed by a `SnapshotStore`.  Extracted from
`daemon.js:makeReadableTree`.  Children are themselves `SnapshotBlob` or
`SnapshotTree`.

```js
export const makeSnapshotTree = (store, sha256) => {
  let entriesP;
  const getEntries = () => {
    if (!entriesP) {
      entriesP = store.fetch(sha256).json();
    }
    return entriesP;
  };
  const resolveChild = (childType, childSha256) => {
    if (childType === 'blob') return makeSnapshotBlob(store, childSha256);
    if (childType === 'tree') return makeSnapshotTree(store, childSha256);
    throw TypeError(`Unknown child type: ${childType}`);
  };
  return makeExo('SnapshotTree', SnapshotTreeInterface, {
    sha256: () => sha256,
    has: async (...path) => { /* walk entries */ },
    list: async (...path) => { /* walk entries, return names */ },
    lookup: async (nameOrPath) => { /* resolve to child Exo */ },
  });
};
```

#### `checkinTree(remoteTree, store, options?)`

Recursively ingests a remote `ReadableTree` (possibly over CapTP) into
a `SnapshotStore`, producing a root SHA-256.  Extracted from
`daemon.js:checkinNode`.

```js
/**
 * @param {ERef<ReadableTree>} remoteTree
 * @param {SnapshotStore} store
 * @param {{ maxDepth?: number }} [options]
 * @returns {Promise<{ type: 'tree', sha256: string }>}
 */
export const checkinTree = async (remoteTree, store, options = {}) => {
  const { maxDepth = 64 } = options;
  const checkinNode = async (node, isTree, depth) => {
    if (depth > maxDepth) throw Error('Maximum depth exceeded');
    if (!isTree) {
      // Stream blob content into store
      const readerRef = E(node).streamBase64();
      const sha256 = await store.store(makeRefReader(readerRef));
      return { type: 'blob', sha256 };
    }
    const names = await E(node).list();
    const entries = [];
    for (const name of names) {
      const child = await E(node).lookup(name);
      let childIsTree = false;
      try { await E(child).list(); childIsTree = true; } catch (_) {}
      const result = await checkinNode(child, childIsTree, depth + 1);
      entries.push([name, result.type, result.sha256]);
    }
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const manifest = new TextEncoder().encode(JSON.stringify(entries));
    const sha256 = await store.store((async function* () { yield manifest; })());
    return { type: 'tree', sha256 };
  };
  return checkinNode(remoteTree, true, 0);
};
```

#### `checkoutTree(tree, writer, options?)`

Recursively walks a `ReadableTree` (local or remote) and materializes
it through a `TreeWriter`.  Extracted from `cli/checkout.js:writeTree`.

```js
/**
 * @param {ERef<ReadableTree>} tree
 * @param {TreeWriter} writer
 * @param {{ onFile?: () => void }} [options]
 */
export const checkoutTree = async (tree, writer, options = {}) => {
  const { onFile } = options;
  const walk = async (node, pathSegments) => {
    await writer.makeDirectory(pathSegments);
    const names = await E(node).list();
    for (const name of names) {
      const child = await E(node).lookup(name);
      const childPath = [...pathSegments, name];
      let isTree = false;
      try { await E(child).list(); isTree = true; } catch (_) {}
      if (isTree) {
        await walk(child, childPath);
      } else {
        const reader = makeRefReader(E(child).streamBase64());
        await writer.writeBlob(childPath, reader);
        if (onFile) onFile();
      }
    }
  };
  await walk(tree, []);
};
```

### Node.js Adapter (`@endo/platform/fs/node`)

#### `makeSnapshotSha256Store(storePath, filePowers)`

File-backed `SnapshotStore`.  Extracted from
`daemon-node-powers.js:makeSnapshotSha256Store`.  Streams bytes to a
temp file while computing SHA-256, atomically renames to
`{storePath}/{sha256}`.

#### `makeLocalTree(dirPath, options?)`

Creates a `ReadableTree` Exo from a local directory.  Extracted from
`cli/checkin.js:makeLocalTree`.  The returned object satisfies
`ReadableTree` — it can be passed to `checkinTree` or sent over CapTP
to a remote daemon.

```js
import { ReadableTreeInterface } from '@endo/platform/fs/lite';

/**
 * @param {string} dirPath
 * @param {{ maxDepth?: number, onFile?: () => void }} [options]
 * @returns {ReadableTree}
 */
export const makeLocalTree = (dirPath, options = {}) => {
  return makeExo('LocalTree', ReadableTreeInterface, {
    has: async (...path) => { /* fs.access */ },
    list: async (...path) => { /* fs.readdir, filter, sort */ },
    lookup: async (...path) => {
      // stat → isDirectory ? makeLocalTree(child) : makeLocalBlob(child)
    },
  });
};
```

#### `makeLocalBlob(filePath)`

Creates a `ReadableBlob` Exo from a local file.  Streams file content
as base64 via `@endo/stream-node`.

```js
import { ReadableBlobInterface } from '@endo/platform/fs/lite';

export const makeLocalBlob = (filePath) => {
  return makeExo('LocalBlob', ReadableBlobInterface, {
    streamBase64: () => {
      const reader = makeNodeReader(fs.createReadStream(filePath));
      return makeReaderRef(reader);
    },
    text: () => fs.promises.readFile(filePath, 'utf-8'),
    json: async () => JSON.parse(await fs.promises.readFile(filePath, 'utf-8')),
  });
};
```

#### `makeTreeWriter(dirPath)`

Creates a `TreeWriter` Exo that writes to a local directory.  Extracted
from `cli/checkout.js:writeTree`.

```js
import { TreeWriterInterface } from '@endo/platform/fs/lite';

export const makeTreeWriter = (dirPath) => {
  return makeExo('TreeWriter', TreeWriterInterface, {
    writeBlob: async (pathSegments, readable) => {
      const filePath = path.join(dirPath, ...pathSegments);
      // stream readable → file
    },
    makeDirectory: async (pathSegments) => {
      await fs.promises.mkdir(path.join(dirPath, ...pathSegments), { recursive: true });
    },
  });
};
```

#### Receiving `node:fs` Powers

`@endo/platform/fs/node` imports `node:fs` directly.  This is the
"elevator" module — it does `import fs from 'node:fs'` so that the
lite module never has to.

In a locked-down SES environment, the daemon entry point
(`daemon-node.js`) already has access to `node:fs` before lockdown.
The Node.js adapter can be imported there and the resulting
`SnapshotStore` or `FilePowers` passed into the platform-agnostic
daemon code via dependency injection — exactly as
`daemon-node-powers.js` works today.

### How the Daemon Adapts

After this refactor, the daemon imports from `@endo/platform/fs/lite`
for types and factories, and receives a `SnapshotStore` via dependency
injection:

```js
// daemon.js (platform-agnostic)
import {
  makeSnapshotBlob,
  makeSnapshotTree,
  checkinTree,
} from '@endo/platform/fs/lite';

// In the maker table:
'readable-blob': ({ content }) => makeSnapshotBlob(snapshotStore, content),
'readable-tree': ({ content }) => makeSnapshotTree(snapshotStore, content),

// In checkinTree:
const { sha256 } = await checkinTree(remoteTree, snapshotStore);
```

```js
// daemon-node-powers.js
import { makeSnapshotSha256Store } from '@endo/platform/fs/node';

export const makeDaemonicPersistencePowers = (...) => {
  const snapshotStore = makeSnapshotSha256Store(storeDir, filePowers);
  return { snapshotStore, ... };
};
```

### How the CLI Adapts

```js
// cli/src/commands/checkin.js
import { makeLocalTree } from '@endo/platform/fs/node';

const localTree = makeLocalTree(resolvedPath, { onFile: () => progress.files++ });
await E(agent).storeTree(localTree, petName);
```

```js
// cli/src/commands/checkout.js
import { checkoutTree } from '@endo/platform/fs/lite';
import { makeTreeWriter } from '@endo/platform/fs/node';

const tree = await E(agent).lookup(treeName);
const writer = makeTreeWriter(resolvedPath);
await checkoutTree(tree, writer, { onFile: () => progress.files++ });
```

### Relationship to Existing Interfaces

**EndoNameHub / EndoDirectory.**  `ReadableTree` is structurally
compatible with the read surface of `EndoNameHub` (`has`, `list`,
`lookup`).  `Directory` is structurally compatible with the mutation
surface.  However, `@endo/platform/fs` types do **not** include
`identify`, `locate`, `followNameChanges`, or other formula-system
concepts.  The daemon's `EndoDirectory` extends beyond filesystem
semantics into the formula graph; `@endo/platform/fs` stops at the
filesystem boundary.

A daemon `EndoDirectory` could implement `ReadableTree` (it already
has `has`, `list`, `lookup`), making it usable wherever a
`ReadableTree` is expected — for example, as input to `checkinTree`.

**EndoReadable.**  The existing `EndoReadable` type (`sha256`,
`streamBase64`, `text`, `json`) maps directly to `SnapshotBlob`.  The
daemon can type-alias `EndoReadable = SnapshotBlob` or keep both during
migration.

**daemon-capability-filesystem.md.**  The `Dir` and `File` interfaces
in that design document correspond to `Directory` and `File` here.
The attenuation pattern (`readOnly()`, `subDir()`) is preserved.
`subDir()` is not in this design because it is a VFS namespace
concern, not a storage concern — it belongs in a future VFS layer
that composes `@endo/platform/fs` primitives.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-capability-filesystem](daemon-capability-filesystem.md) | Speculative Dir/File/VFS design.  This design provides the concrete types and adapters that the capability filesystem would build on. |
| [daemon-checkin-checkout](daemon-checkin-checkout.md) | Checkin/checkout commands.  After this design, those commands delegate to `@endo/platform/fs` factories instead of inline implementations. |

## Implementation Phases

### Phase 1: Package Skeleton and Types (S)

- Create `packages/platform/` with `package.json`, conditional exports.
- Define all TypeScript types in `src/fs/types.d.ts`.
- Define interface guards in `src/fs/interfaces.js`.
- No behavioral code yet — types and guards only.

### Phase 2: Snapshot Store and Snapshot Blob/Tree (S)

- Extract `makeSnapshotSha256Store` from `daemon-node-powers.js` into
  `src/fs-node/snapshot-sha256-store.js`.
- Extract `makeSnapshotBlob` and `makeSnapshotTree` (née `makeReadableBlob`
  and `makeReadableTree`) from `daemon.js` into `src/fs/`.
- Daemon imports from `@endo/platform/fs/lite`.
- Daemon tests continue to pass.

### Phase 3: Checkin/Checkout Extraction (S)

- Extract `checkinTree` from `daemon.js` into `src/fs/checkin.js`.
- Extract `checkoutTree` logic from `cli/checkout.js` into
  `src/fs/checkout.js`.
- Extract `makeLocalTree`, `makeLocalBlob` from `cli/checkin.js` into
  `src/fs-node/`.
- Extract `makeTreeWriter` from `cli/checkout.js` into `src/fs-node/`.
- CLI commands become thin wrappers around `@endo/platform/fs` calls.

### Phase 4: Mutable Directory and File (M)

- Implement `File` Exo with `readOnly()` attenuation.
- Implement `Directory` Exo with `readOnly()` attenuation.
- Physical backend (Node.js filesystem) in `src/fs-node/`.
- This is the concrete starting point for the capability filesystem
  design.

## Design Decisions

1. **`@endo/platform/fs` not `@endo/tree`.**  Trees are one node kind
   among several (blobs, files, directories).  The module name reflects
   the broader filesystem concern, and the package name (`@endo/platform`)
   leaves room for future platform abstractions beyond filesystems.

2. **Condition-gated `"node"` export, not assumed.**  Importing
   `@endo/platform/fs` requires the `"node"` build condition.  This
   makes it explicit that the import resolves differently (or not at
   all) on non-Node platforms.  `@endo/platform/fs/lite` is always
   available for platform-agnostic code.

3. **`ReadableBlob` is shallow; `SnapshotBlob` adds `sha256()`.**  A
   consumer streaming file content over CapTP does not need to know
   the content hash.  Separating the readable surface from the
   content-addressed identity keeps the guest-facing capability minimal
   and allows `readOnly()` on `File` to return a `ReadableBlob` that
   cannot reveal the storage identity.

4. **`readOnly()` returns the readable interface, not a frozen copy.**
   Calling `file.readOnly()` returns a `ReadableBlob`, not a `File`
   with write methods that throw.  The attenuation is structural —
   the returned object simply lacks mutation methods — not behavioral.

5. **No `help()` in this layer.**  The `help()` method is a daemon
   convention for LLM discoverability.  `@endo/platform/fs` provides
   the raw interfaces; the daemon wraps them with `help()` when
   constructing Exos for guest consumption.

6. **Tree manifest format is `[name, type, sha256][]`.**  This matches
   the existing `readable-tree` formula content in the daemon's CAS.
   Sorted by name for deterministic hashing.

7. **`TreeWriter` is a push interface.**  Rather than requiring the
   checkout target to implement a full `Directory`, we define a minimal
   `TreeWriter` with `writeBlob` and `makeDirectory`.  This decouples
   checkout from any specific mutable tree implementation and allows
   zip writers, memory buffers, or remote filesystems to serve as
   targets.

## Prompt

> Let's name the package `@endo/platform` and the module pertaining
> to the representation of files `@endo/platform/fs`.  Let's name a
> module `@endo/platform/fs/node` that captures the Node.js specific
> concern of elevating a Node.js `node:fs` module.  Let's allow
> `@endo/platform/fs/lite` to contain the portion that is not
> platform-specific.  We will require the build condition `"node"` to
> import the module `@endo/platform/fs`.  The most important common
> ground will be the types for File, Blob, Tree, and Readable*
> attenuations.  Distinguish Readable* (shallow) from content-
> addressable.  Leave space for .readOnly() methods.
