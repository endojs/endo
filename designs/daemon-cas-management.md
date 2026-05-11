# Endor Content Address Store Management

| | |
|---|---|
| **Created** | 2026-04-17 |
| **Updated** | 2026-04-17 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## Status

Phases 1-4 implemented:

- **Phase 1**: `rust/endo/src/cas.rs` — `ContentStore` with
  `store`/`fetch`/`has`/`retain`/`release`, SHA-256 hashing,
  `.meta` sidecar files, atomic writes.
- **Phase 2**: Retain/release with in-memory ref count cache
  flushed to `.meta`.
- **Phase 3**: Tree type — `TreeManifest`/`TreeEntry` with
  serde serialization, `read_tree`/`list_tree`/`fetch_from_tree`
  with nested path traversal and structural sharing.
- **Phase 4**: Mark/sweep GC preserving retained entries and
  transitive tree children. `cas-gc` control verb and `endor gc`
  CLI subcommand.

Control verbs wired in `rust/endo/src/endo.rs`: `cas-store`,
`cas-fetch`, `cas-has`, `cas-retain`, `cas-release`,
`cas-store-tree`, `cas-gc`.

CBOR codec in `rust/endo/src/codec.rs`.

JS manager `controlPowers` in
`rust/endo/xsnap/src/daemon_bootstrap.js`: `casStore`, `casFetch`,
`casHas`, `casRetain`, `casRelease`, `casStoreTree`.

Remaining: Phase 5 (JS manager integration replacing
`makeContentStore()` with Rust CAS verbs).

## What is the Problem Being Solved?

The daemon's content-addressable store (CAS) at
`{statePath}/store-sha256/` is currently a flat directory of
opaque blobs.
Workers write snapshots to it and read them back, but the
supervisor has no structured API for CAS operations and no
awareness of what kind of content each hash represents.
There is no garbage collection — blobs accumulate forever.

The CAS needs to become a first-class subsystem of endor
with:

1. **Typed content** — distinguish directory trees from blobs,
   compartment-map archives from snapshots, so that
   higher-level operations (module loading, tree traversal)
   can dispatch on content type.
2. **Read/write verbs** — workers can store and retrieve
   content by hash through the envelope bus, without needing
   direct filesystem access to the CAS directory.
3. **Retain/release protocol** — reference-counted GC roots
   that workers can hold to keep content alive.
4. **Off-thread garbage collection** — a background sweep
   that removes unreferenced content without blocking the
   main supervisor loop.

### Supervisor-owned vs. worker-owned

The CAS could be managed by a dedicated worker or by the
supervisor process itself.
The supervisor is preferred because:

- The CAS is a shared resource accessed by all workers.
  A dedicated worker would require every CAS operation to
  cross the envelope bus twice (request + response), adding
  latency to module loading and snapshot operations.
- The supervisor already owns the filesystem paths and
  creates the CAS directory.
- GC requires knowledge of which handles are alive — the
  supervisor has this information; a worker would need to
  query for it.
- The supervisor can run GC on a background thread without
  blocking the routing loop.

The worker-role option is preserved as a future alternative
for deployments where the supervisor should remain minimal
(e.g., embedded systems).
The envelope verbs are identical in either case — only the
handler location differs.

## Design

### Content types

Each CAS entry has an associated **content type** stored in a
lightweight metadata sidecar.
The CAS directory layout becomes:

```
store-sha256/
  {sha256hex}           # content blob
  {sha256hex}.meta      # JSON metadata (optional)
```

The `.meta` file is a small JSON object:

```json
{
  "type": "blob",
  "refs": 0
}
```

Content types:

| Type | Description |
|------|-------------|
| `blob` | Opaque byte sequence (default) |
| `snapshot` | XS machine snapshot (has signature header) |
| `tree` | Directory tree (JSON manifest + child hashes) |
| `archive` | Compartment-map archive (has `compartment-map.json`) |

The `type` field is advisory — the content bytes are
self-describing (snapshots have a signature, archives have
a manifest), but the type avoids re-parsing on every access.

Missing `.meta` files default to `{ "type": "blob", "refs": 0 }`.
This provides backward compatibility with existing CAS content
written by the snapshot system.

### Tree representation

A `tree` entry is a JSON document mapping names to child
references:

```json
{
  "entries": {
    "compartment-map.json": {
      "type": "blob",
      "hash": "sha256:abc123...",
      "size": 4096
    },
    "app-v1.0.0": {
      "type": "tree",
      "hash": "sha256:def456..."
    },
    "app-v1.0.0/index.js": {
      "type": "blob",
      "hash": "sha256:789abc...",
      "size": 1234
    }
  }
}
```

Trees are content-addressed like blobs — the tree's own hash
is the SHA-256 of its JSON serialization.
Child blobs and sub-trees are referenced by hash, enabling
structural sharing (two archives that share a dependency
share the dependency's tree and blob hashes).

### Envelope verbs

All CAS verbs are control messages (to handle 0) handled by
the supervisor.

#### `cas-store`

Store a blob in the CAS.

| Field | Value |
|-------|-------|
| verb | `"cas-store"` |
| payload | CBOR map: `{"data": <bytes>, "type": <text>}` |
| nonce | request nonce |

Response: `"cas-stored"` with payload
`{"hash": "sha256:..."}`.

For large content, a streaming variant `cas-store-stream`
uses the existing frame protocol to send chunks, with the
final frame carrying the nonce.
This avoids buffering large blobs in a single envelope.

#### `cas-fetch`

Retrieve content by hash.

| Field | Value |
|-------|-------|
| verb | `"cas-fetch"` |
| payload | CBOR map: `{"hash": <text>}` |
| nonce | request nonce |

Response: `"cas-content"` with payload containing the bytes.
For large content, `"cas-content-stream"` sends chunked
frames.

#### `cas-has`

Check existence.

| Field | Value |
|-------|-------|
| verb | `"cas-has"` |
| payload | CBOR map: `{"hash": <text>}` |
| nonce | request nonce |

Response: `"cas-exists"` with payload `{"exists": true/false}`.

#### `cas-retain` / `cas-release`

Reference counting for GC roots.

| Field | Value |
|-------|-------|
| verb | `"cas-retain"` or `"cas-release"` |
| payload | CBOR map: `{"hash": <text>}` |
| nonce | 0 |

`cas-retain` increments the ref count in `.meta`.
`cas-release` decrements it.
No response — fire-and-forget.

Workers retain hashes they need and release them when done.
The supervisor automatically retains hashes for suspended
workers and releases them on resume or cancellation.

#### `cas-store-tree`

Store a directory tree from an in-memory representation.

| Field | Value |
|-------|-------|
| verb | `"cas-store-tree"` |
| payload | CBOR map with tree entries (blobs inline or by hash) |
| nonce | request nonce |

The supervisor recursively stores child blobs, builds the
tree JSON, and stores the tree itself.
Response: `"cas-stored"` with the tree's root hash.

### Garbage collection

GC runs on a dedicated `std::thread` (or `tokio::spawn_blocking`)
to avoid blocking the supervisor's routing loop.

#### Algorithm

1. **Mark**: scan all live references:
   - Suspended workers: their snapshot hashes.
   - Explicit retain counts in `.meta` files.
   - Any hash referenced by the JS manager's formula store
     (communicated via a `cas-gc-roots` verb at GC start).
2. **Sweep**: iterate `store-sha256/`, delete entries with
   zero retain count that are not in the live set.
   For tree entries, recursively check children before
   deleting the tree.
3. **Report**: log freed space and entry count.

#### Trigger

GC is triggered by:
- A `cas-gc` control verb from the JS manager.
- A configurable timer (e.g., every 10 minutes).
- An explicit `endor gc` CLI subcommand.

GC is concurrent — it holds a read lock on the CAS index
during mark and takes brief write locks during sweep.
New stores during GC are safe because newly stored content
starts with refs=0 and will be collected in the next cycle
if unreferenced.

### Supervisor implementation

```rust
pub struct ContentStore {
    dir: PathBuf,
    // In-memory ref count cache (synced to .meta on flush).
    refs: RwLock<HashMap<String, u32>>,
}

impl ContentStore {
    pub fn store(&self, data: &[u8], content_type: &str)
        -> io::Result<String>;
    pub fn fetch(&self, hash: &str)
        -> io::Result<Vec<u8>>;
    pub fn has(&self, hash: &str) -> bool;
    pub fn retain(&self, hash: &str);
    pub fn release(&self, hash: &str);
    pub fn gc(&self, live_roots: &HashSet<String>)
        -> io::Result<GcReport>;
}
```

The `ContentStore` is owned by the `Supervisor` (or by
`Endo` and shared with the supervisor via `Arc`).
Control verb handlers in `endo.rs` delegate to it.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-content-store-gc](daemon-content-store-gc.md) | Supersedes: this design replaces the JS-side GC approach with a Rust-native implementation |
| [daemon-xs-worker-snapshot](daemon-xs-worker-snapshot.md) | Integrates: snapshots become typed CAS entries with retain/release |
| [daemon-endor-architecture](daemon-endor-architecture.md) | Extends: supervisor gains CAS management responsibility |

## Implementation phases

### Phase 1: ContentStore struct and basic verbs

1. Create `rust/endo/src/cas.rs` with `ContentStore`.
2. Implement `store`, `fetch`, `has` with SHA-256 hashing.
3. Wire `cas-store`, `cas-fetch`, `cas-has` control verbs.
4. Migrate existing snapshot CAS writes to use `ContentStore`.
5. **Test**: store/fetch round-trip, has check.

### Phase 2: Retain/release and metadata

1. Add `.meta` sidecar read/write.
2. Implement `retain`, `release` with in-memory cache.
3. Wire `cas-retain`, `cas-release` verbs.
4. Update suspend/resume to retain/release snapshot hashes.
5. **Test**: retain increments, release decrements, verify
   `.meta` persistence.

### Phase 3: Tree type

1. Implement tree JSON format and `store_tree` method.
2. Wire `cas-store-tree` verb.
3. Add tree traversal: `list_tree(hash)` and
   `fetch_from_tree(root_hash, path)`.
4. **Test**: store tree, fetch by path, structural sharing.

### Phase 4: Garbage collection

1. Implement `gc` method with mark/sweep.
2. Wire `cas-gc` control verb and `endor gc` CLI subcommand.
3. Add configurable timer trigger.
4. **Test**: store content, release all refs, run GC, verify
   deletion.

### Phase 5: JS manager integration

1. Expose `cas-store`, `cas-fetch`, `cas-retain`,
   `cas-release` in `controlPowers` in
   `daemon_bootstrap.js`.
2. Replace `makeContentStore()` in the JS manager with calls
   to the Rust CAS verbs.
3. **Test**: end-to-end store/fetch from JS manager.

## Design decisions

1. **Supervisor-owned, not a worker.**
   The CAS is a shared resource; the supervisor has the
   filesystem access and handle liveness information needed
   for GC. A worker-based CAS would add unnecessary latency
   and complexity.

2. **Sidecar `.meta` files, not a database.**
   A SQLite metadata table would be faster for large stores
   but adds a dependency and crash-recovery complexity.
   Sidecar files are atomic (write-rename), human-readable,
   and sufficient for the expected store size (thousands of
   entries, not millions).

3. **Reference counting, not tracing GC.**
   Reference counting is simple and deterministic.
   The retain/release protocol maps naturally to worker
   lifecycles. A tracing GC would require enumerating all
   live references from the JS formula store, which is
   possible but more complex.

4. **Type field is advisory.**
   Content is self-describing (snapshots have signatures,
   archives have manifests). The type field avoids
   re-parsing but is not authoritative — a consumer should
   validate the content regardless.

5. **Tree entries use flat paths with hash references.**
   This enables structural sharing between archives that
   share dependencies. The flat `entries` map (not nested
   objects) keeps the JSON simple and the hash stable.

## Prompt

> Please create a design document for endor detailing how it
> might take up responsibility for managing the daemon's content
> address store while it is online, providing verbs for reading
> and writing files from the content address store, releasing
> and retaining content of the content address store, garbage
> collecting the content address store off the main thread. This
> could conceivably be another worker role or a role taken on by
> the supervisor process on behalf of its children (preferring
> the latter but with the option of the former).
>
> The content address store may need to be much more intimately
> aware of the type of the addressed content at least to
> distinguish directory trees from blobs.
