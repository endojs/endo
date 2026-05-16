# @endo/remote-fs — Design

**Status**: Draft v0. Interfaces only. No implementation. No tests.
**Authoritative**: this file. The package's `README.md` is a pointer.
**Scope**: A pipelinable, stream-friendly filesystem capability for
Endo, suitable as the backing store behind protocol bridges (9P,
NFS, FUSE) and as a primary surface for Endo guests that want to
hand "a directory" to a peer across a CapTP boundary.

---

## 1. Goals and non-goals

### Goals

- **One round trip for `walk + open + read`** on a deeply-nested
  file, regardless of depth.
- **Bulk transfers ride streams**, not method-sized buffers. The
  underlying transport (or a chunking-aware peer) decides the unit
  size; the interface doesn't.
- **Content-addressed shortcuts** when a peer can prove it already
  holds the bytes. Optional; ignorable by peers that don't need it.
- **Discriminating subtypes** — `Directory`, `File`, `Symlink` — so a
  caller can pipeline a type-appropriate next call onto the lookup
  result without first probing what kind of node it got.
- **xattrs, locks, watches as first-class caps**, not as overloaded
  read/write verbs.
- **Composable with existing Endo primitives**: streams ride
  `@endo/exo-stream`; exos use `M.interface` guards from
  `@endo/patterns`; passable conventions follow
  `@endo/pass-style`.

### Non-goals

- **9P (or any other on-the-wire filesystem protocol) translation.**
  That belongs at the consumer — see `@endo/claude-container`'s
  `src/9p/` for the prototype 9P2000.L translator that already
  consumes a smaller FS surface, and §9 of its `ENDO-INTEGRATION.md`
  for the roadmap entry (R1) that motivates this package.
- **In-guest filesystem semantics** (page cache, dentry cache,
  unlink-while-open, etc.). Those are the kernel's problem; this
  surface is the *server* the kernel's client talks to.
- **Multi-writer coordination** beyond what `Lock` capabilities
  provide. No vector clocks, no causal consistency. The remote
  daemon's storage tier decides what writes mean.
- **A new bytes-passing protocol.** We use what
  `@endo/exo-stream` already provides — base64-on-the-wire today,
  native binary when CapTP gains it. The interface promises
  `Stream<Bytes>`; the implementation uses `PassableBytesReader` /
  `PassableBytesWriter`.

---

## 2. Position in the Endo ecosystem

| Concern | Existing | This package |
|---|---|---|
| Live FS access | `@endo/daemon` `Mount` (`packages/daemon/src/mount.js`): `has`, `list`, `lookup`, `readText`, `writeText`, `makeDirectory`, `remove`, `move`, ... | Typed `Directory` / `File` / `Symlink` subtypes; explicit `open()` separation; eager qid on every Node |
| Immutable snapshot | `@endo/daemon` `ReadableTree`: `has`, `list`, `lookup` over a content-addressed snapshot | `Node.snapshot() → BlobRef` returns a content-addressed handle anyone holding the bytes can fetch |
| File-shaped capability | `@endo/daemon` `MountFile`: `text`, `streamBase64`, `json`, `writeText`, `writeBytes`, `readOnly` | `File.open(flags) → OpenFile`; range reads, range writes, fsync, locks, watches |
| Byte streaming over CapTP | `@endo/exo-stream`: `PassableBytesReader` / `PassableBytesWriter`, base64 over the wire (until CapTP gains native binary) | Consumed; not replaced |
| Interface guards | `@endo/patterns` `M.interface(...)` | Same pattern; PascalCase interface names |
| Iteration over CapTP | `@endo/daemon`'s `makeIteratorRef`, `@endo/exo-stream`'s reader/writer pairs | Subscriptions, directory listings, range reads all use these |

`Mount` is a good local FS surface but was not designed for cross-
daemon use: each `lookup` is one round trip, and binary I/O goes
through `text()` (UTF-8 only) or `streamBase64()` (no offsets, no
length, no random access). `@endo/remote-fs` is what `Mount` would
look like redesigned around CapTP cost.

Important deliberate overlap: this package's `Filesystem` exposes a
surface that *could* be served by adapting a `Mount`. A reference
adapter (`@endo/remote-fs/src/from-mount.js`) is on the roadmap so
existing `Mount`-shaped caps can be re-projected without a
storage-tier change.

---

## 3. Design principles

The remote object graph is rich. A protocol translator (9P, NFS,
FUSE) is a thin local adapter that maintains a `fid → cap` table and
converts each protocol message into one or more (often pipelined)
calls. Two ideas do most of the work:

1. **Capabilities replace fids one-to-one.** Every "handle" the
   wire protocol traffics in maps to a cap that survives until
   dropped. Cloning a fid is duplicating the cap. Closing a fid is
   dropping the cap.

2. **Pipelining collapses message sequences into a single round
   trip.** Where 9P does `Twalk → Rwalk → Tlopen → Rlopen → Tread →
   Rread`, the translator does `E(dir).lookup(n).open(flags).read(off,
   len)` — three pipelined calls that arrive at the peer as one
   batch and produce one batch back.

3. **Streams handle bulk payloads.** File content, directory
   listings, xattr values, watch events. The interface promises an
   async iterable; the implementation chooses the chunk size. The
   protocol bridge frames bytes from the stream to whatever its
   client wants (9P `msize`, FUSE `max_read`, etc.).

4. **Content-addressed handles ride alongside the live read path.**
   `BlobRef` lets a peer say "I already have these bytes; don't fetch
   them." Both the producer and consumer of `BlobRef` are optional:
   producers that can't compute hashes return `null`; consumers that
   don't have a CAS ignore them.

---

## 4. Interface

This section is normative. Method signatures use Endo conventions:

- Every method on every cap returns `Promise<T>` (eventual send).
- "Eager" fields on a cap (`qid`, `BlobRef.hash`) are carried as a
  passable copy-record alongside the cap's slot, exposed via a
  side-effect-free getter on the exo state. See §4.11 for the
  mechanism.
- All capability holders are identities — methods do not take
  `pid`, `clientId`, `uid`, or `gid` arguments to designate the
  caller; the holder of the cap IS the caller.
- Numerically-flagged POSIX concepts (`O_*`, 12-bit perm bits,
  `XATTR_CREATE`) are modelled as structured copy-records; the
  thin translator between POSIX-shaped consumers and this surface
  does the bit-twiddling.
- `Node` is documentation, not an interface. Each of `Directory`,
  `File`, `Symlink` has its own `M.interface` guard that includes
  the "Node base" methods (§4.2) plus its subtype-specific ones.
- Every interface includes a `help() → string` per Endo convention.

The §10 appendix preserves the original POSIX-flavoured sketch from
the design conversation that motivated this package; this section
is the ocap-aligned working surface.

### 4.1 Filesystem

```
Filesystem
  root()                          → Directory
  named(viewName: string)         → Directory     // optional multi-root
  statfs()                        → FsStats
  help()                          → string
```

`Filesystem` is the top-level admin cap. A holder gets the (or *a*)
root `Directory` via `root()`; that root is what flows through the
graph from then on. Multi-rooted filesystems (analogous to 9P's
`aname` parameter) expose alternate roots via `named(viewName)`;
implementations whose backing store has only one root reject
`named` with a descriptive error.

`Filesystem` does NOT carry a "user identity" argument equivalent
to 9P's `uname`. Authorisation is by cap-issuance: who holds the
`Filesystem` cap decides what they can do with it.

### 4.2 Node base methods

Every `Directory`, `File`, and `Symlink` cap exposes these:

```
qid                               eager: Qid
getAttrs()                        → Attrs
setAttrs(updates: AttrsUpdate)    → void
watch()                           → PassableReader<Event>
xattrs()                          → Xattrs
help()                            → string
```

- `qid` is eager (carried with the cap, §4.4). Equal `qid.pathId`
  on two caps means they refer to the same on-disk inode;
  `qid.version` bumps on every metadata change. Implementations
  that have no native inode identity can synthesise one.
- `getAttrs()` returns everything in `Attrs` (§4.10). There is no
  field-selection mask; metadata is cheap, and a structural
  record is easier to evolve than a bitmask.
- `setAttrs(updates)` accepts a partial `AttrsUpdate` record;
  fields absent from the update are unchanged.
- `watch()` returns a `PassableReader<Event>` directly. The
  caller closes the stream to cancel; there is no separate
  `Subscription` type. Events start at the moment of the call —
  no replay.
- `xattrs()` returns an `Xattrs` sub-cap (§4.9) rather than
  spreading four xattr verbs across every node type.

### 4.3 Directory

Includes §4.2 plus:

```
lookup(name: string)              → Directory | File | Symlink
list()                            → PassableReader<DirEntry>
open()                            → OpenDirectory
create(name: string, opts: CreateFileOpts)
                                  → OpenFile
mkdir(name: string, opts: CreateDirOpts)
                                  → Directory
symlink(name: string, target: string)
                                  → Symlink
link(name: string, target: Node)  → void
unlink(name: string)              → void       // empty dir or any file
rename(oldName, newParent: Directory, newName)
                                  → void
```

Removed from the original sketch:

- `mknod` (device files): out of scope for a portable cap-FS.
- `flags carries AT_REMOVEDIR`: `unlink` handles directories
  (when empty) without a flag.
- `gid` parameters on `mkdir`/`symlink`: set group via
  `setAttrs({ owner: { group: ... } })` after creation.

`lookup` returns the type-correct subtype; implementations stat
at lookup time. A protocol translator can pipeline a typed call
(`open()`, `entries()`, `readlink`) on the returned promise
without a "what type is this?" probe.

### 4.4 File

Includes §4.2 plus:

```
open(opts: OpenOpts)              → OpenFile
snapshot()                        → BlobRef | null
```

`snapshot()` is permitted to return `null` for backing stores
that can't cheaply mint a content-addressed handle (e.g. live
mutable files on a non-CAS store). Callers must tolerate `null`
and fall back to `open().read(...)`.

### 4.5 Symlink

Includes §4.2 plus:

```
target()                          → string
```

`target()` returns the symlink's stored target as a UTF-8 string.
Filesystems whose names are non-UTF-8 expose a `targetBytes()`
variant (TBD; deferred to F1 in the roadmap).

### 4.6 OpenFile

```
read(offset: bigint, length: bigint)
                                  → PassableBytesReader
write(offset: bigint)             → PassableBytesWriter
truncate(length: bigint)          → void
fsync(opts: FsyncOpts)            → void
lock(opts: LockOpts)              → Lock
getLock(opts: LockProbe)          → LockState | null
close()                           → void
help()                            → string
```

- Offsets/lengths are `bigint`. Files can exceed 2⁵³ bytes;
  `Number` is unsafe at that scale.
- `read` and `write` return the typed-passable stream/sink shapes
  from `@endo/exo-stream`. Implementations choose chunk size;
  callers slice on receipt.
- `fsync(opts)` takes `{ metadata: boolean }` instead of the
  inverted POSIX `dataOnly`. The default (omitted) is whatever
  most callers want — leaving that as an open question (§9).
- `lock` returns a `Lock` cap (§4.8). The cap IS the lock holder;
  there is no `pid` or `clientId` argument because the cap
  conveys identity. Dropping the cap releases.
- `getLock` returns a structural description of what's currently
  locked at the requested range — NOT "who holds it". Identity
  through caps means there's no off-cap holder to name.
- `close()` is an explicit option in addition to cap-drop, useful
  for synchronously flushing before dropping.

### 4.7 OpenDirectory

```
entries(cursor?: DirCursor)       → PassableReader<DirEntry>
fsync()                           → void
close()                           → void
help()                            → string
```

`Directory.list()` (§4.3) is stateless and returns a fresh
stream each call. `OpenDirectory.entries(cursor)` is stateful —
the open directory tracks a server-issued cursor that a protocol
translator can map to its wire-level cookie (9P's `Treaddir`
offset, NFS's cookie3, etc.). The cursor is an opaque passable
value; the implementation is free to use any encoding.

### 4.8 Lock

```
release()                         → void
help()                            → string
```

Dropping the cap releases the lock. `release()` is for callers
who want a synchronous release before dropping.

### 4.9 Xattrs

```
get(name: string)                 → PassableBytesReader
set(name: string, opts: XattrSetOpts)
                                  → PassableBytesWriter
list()                            → PassableReader<string>
remove(name: string)              → void
help()                            → string
```

Sub-cap rather than four verbs on every Node. `set` returns a
sink so very large xattrs (rare but legal) stream rather than
buffering. `XattrSetOpts` carries `{ existence: 'create' |
'replace' | 'either' }` instead of POSIX `XATTR_CREATE` /
`XATTR_REPLACE` flags.

### 4.10 Copy-record schemas

```
Qid                               (eager on every Node)
  type: 'directory' | 'file' | 'symlink'
  pathId: bigint                  // inode-like; stable for the lifetime of the node
  version: bigint                 // bumps on every metadata change

Attrs                             (returned by Node.getAttrs)
  size: bigint
  mtime: bigint                   // ns since epoch
  atime: bigint
  ctime: bigint
  btime: bigint | null            // birth time, if backing store records it
  permissions: Permissions
  owner: { uid: bigint, gid: bigint }
  nlink: bigint
  inode: bigint

Permissions
  user:   { read, write, execute: boolean }
  group:  { read, write, execute: boolean }
  other:  { read, write, execute: boolean }
  setuid, setgid, sticky: boolean

AttrsUpdate                       (passed to Node.setAttrs; all fields optional)
  size?, mtime?, atime?, ctime?, permissions?, owner?

OpenOpts                          (passed to File.open)
  read?, write?, append?, truncate?: boolean
  create?: 'never' | 'if-missing' | 'exclusive'

CreateFileOpts                    (passed to Directory.create)
  initialPermissions?: Permissions
  exclusive?: boolean

CreateDirOpts                     (passed to Directory.mkdir)
  initialPermissions?: Permissions

FsyncOpts
  metadata?: boolean

LockOpts                          (passed to OpenFile.lock)
  type: 'shared' | 'exclusive'
  start: bigint
  length: bigint                  // 0 means "to end of file"

LockProbe                         (passed to OpenFile.getLock)
  start: bigint
  length: bigint

LockState                         (returned by getLock; null = no lock)
  type: 'shared' | 'exclusive'
  start, length: bigint
  // no holder identity — caps confer identity

DirEntry
  name: string
  qid: Qid

Event                             (yielded by Node.watch)
  kind: 'changed' | 'removed' | 'child-added' | 'child-removed' | 'renamed'
  // kind-specific fields TBD; see §9

FsStats
  totalBytes, freeBytes, availableBytes: bigint
  totalNodes, freeNodes: bigint
  blockSize, fragmentSize: bigint

XattrSetOpts
  existence?: 'create' | 'replace' | 'either'
```

### 4.11 Eager state mechanism

`qid` (on every `Directory`/`File`/`Symlink`) and `BlobRef.hash` +
`BlobRef.size` are documented as eager — readable without a round
trip to the cap's producer.

Mechanism: the exo's interface guard pairs the cap with a passable
state record carried in the cap's slot. CapTP serialises the slot
plus state when the cap is passed. The exo exposes the state via a
sync getter (e.g. `getQid()` returning the stored record, not a
promise). Consumers prefer the sync getter for hot paths; falling
back to a method call still works if the runtime doesn't optimise
the eager case.

This is implementation work for F1. The interface guards in §4
treat `qid` and `hash`/`size` as documented eager facts; the
mechanism's details belong in the implementation contract, not the
interface.

---

## 5. Streaming and bytes

`Stream<Bytes>` and `Sink<Bytes>` in §4 are typed-passable
abstractions. The current realisation:

- **`Stream<Bytes>` → `PassableBytesReader`** from
  `@endo/exo-stream/bytes-reader-from-iterator.js`. Producer wraps an
  `AsyncIterator<Uint8Array>`; over the wire, bytes are base64-
  encoded (a CapTP limitation today; will become native binary when
  CapTP supports it).
- **`Sink<Bytes>` → `PassableBytesWriter`** from
  `@endo/exo-stream/bytes-writer-from-iterator.js`. Consumer wraps
  an `AsyncIterator<Uint8Array>` (a pipe-writer end); the producer
  side pushes chunks.

`Stream<Text>` and `Stream<DirEntry>` and `Stream<Event>` use the
generic `PassableReader<T>` from the same package.

**Pre-ack buffering** matters here. `@endo/exo-stream` readers and
writers accept a `buffer` option that lets the producer transmit N
items ahead of the consumer's demand. Range reads, `entries` for
large directories, and watch streams all benefit. Concrete tuning is
implementation work, not interface work — the interface only
guarantees the abstractions.

**Chunking** is the stream's concern, not the interface's. A
`File.open().read(0, 1 GiB)` returns a stream that yields chunks of
whatever size the implementation finds appropriate. Callers that
want fixed-size chunks slice on receipt. Callers that want zero-
copy slabs accept whatever they get.

---

## 6. BlobRef and content-addressing

A `BlobRef` advertises *bytes the producer is willing to identify
by hash*. The producer is not obligated to mint one — many file
systems have no cheap CAS — so `File.snapshot()` may return `null`.
When a `BlobRef` is present:

- `hash` and `size` are eager (carried with the cap). A caller can
  consult a local CAS keyed by `hash` and skip `fetch` entirely on a
  hit.
- `fetch(offset, length)` returns a stream identical in shape to
  `OpenFile.read(offset, length)`. The two are interchangeable from
  the caller's perspective; the difference is that `fetch` is
  guaranteed to be reproducible (the bytes won't have changed since
  the `BlobRef` was minted) and *may* hit a CAS peer rather than the
  origin.

The interface does not specify a hash algorithm. Implementations
choose; `BlobRef.hash` is an opaque byte string with the algorithm
identifier in `BlobRef.algorithm` (TBD — provisionally
`multihash`-encoded, but the interface only treats it as a string).

`@endo/daemon`'s existing `ReadableTree` is a moral analogue:
content-addressed, immutable. A reference adapter
(`@endo/remote-fs/src/from-readable-tree.js`) is on the roadmap so a
`ReadableTree` can be re-projected as a `Filesystem` whose `File`s
have eager `BlobRef`s.

---

## 7. What this buys you vs. a simpler approach

A `walk + open + read` sequence — typical when opening a deeply-
nested file across a daemon boundary — is one round trip end to
end, not depth-plus-two. The pipelined chain
`E(root).lookup(a).lookup(b).lookup(c).open(O_RDONLY).read(0, len)`
fans out as a single batch to the peer; only the final stream's
first chunk has to make the return trip before the caller sees any
bytes.

Bulk transfers ride streams sized to the underlying transport, not
to any protocol's msize equivalent. A 1 GiB read is one method call
and a stream the caller pulls at its own rate.

Cached content avoids the network entirely via `BlobRef`s. A peer
whose CAS knows the hash never asks the origin for the bytes.

Writes are async with deferred error reporting at `fsync` —
matching Linux page-cache semantics and freeing translators from
having to invent that buffering themselves.

The kernel (or other protocol client) sees a perfectly ordinary
filesystem; the wire sees a small number of richly-typed, pipelined
calls.

---

## 8. Roadmap

Items below are open unless marked otherwise.

| Item | Status |
|---|---|
| F1 — Interface guards (M.interface for every type in §4) | Open |
| F2 — Reference exos backed by a powers object | Open |
| F3 — Node `fs/promises`-backed powers + factory caplet | Open |
| F4 — In-memory powers for tests | Open |
| F5 — `from-mount.js` adapter (project `Mount` → `Filesystem`) | Open |
| F6 — `from-readable-tree.js` adapter (with eager `BlobRef`s) | Open |
| F7 — `Node.watch()` events backed by `chokidar` or kernel inotify | Open |
| F8 — Lock implementation (advisory, in-process for v1) | Open |
| F9 — Tests for pipelined-walk single-RTT property | Open |
| F10 — Integrate into `@endo/claude-container`'s 9P bridge as the new backing store (closes R1) | Open |

F1–F2 are the minimum viable shape — interface guards + a
factory-like constructor function. F3 turns this into something
useful (a directory on disk). F5–F6 make it composable with the
existing Endo FS world. F10 is the integration milestone.

The 9P translator that motivated this package's design is *not* on
this roadmap — it lives in `@endo/claude-container` and consumes the
`Filesystem` capability as a black box. The translation rules
(message-by-message mapping, parent-tracking, tag-to-promise
table) belong in that package's design doc, not here.

---

## 9. Open questions

The ocap rewrite (§4) resolves several of the original conversation's
open questions; remaining items below.

| Topic | Tentative answer |
|---|---|
| Should `Directory.list()` and `OpenDirectory.entries()` both exist, or pick one? | Both, for now. `list()` is stateless (fresh stream each call). `entries()` is bound to an `OpenDirectory` and tracks a server-side cursor a protocol translator can map to its wire-level cookie. Most direct callers want `list()`. |
| `fsync(metadata)` default | `metadata: false` (data only). Matches Linux `fdatasync` default and is faster on most storage tiers. Callers wanting full metadata sync pass `{ metadata: true }`. |
| Hash algorithm for `BlobRef` | TBD. Provisionally a `BlobRef` carries `{ algorithm, hash, size }` where `algorithm` is an opaque string; consumers compare by `(algorithm, hash)` tuple. Encourages multihash-style flexibility without baking in a choice. |
| Encoding for `Text` results (`Symlink.target`, `Xattrs.list`) | UTF-8 strings. Filesystems with non-UTF-8 names expose parallel `Bytes` accessors (e.g. `Symlink.targetBytes()`) as a follow-up. |
| `Event` schema | Kind discriminator settled (`changed` / `removed` / `child-added` / `child-removed` / `renamed`); per-kind payloads (which fields changed, new name on rename, etc.) TBD with F7 implementation. |
| Non-UTF-8 names in `Directory.lookup`/`create`/`unlink`/etc. | Out of scope for v1. Names are UTF-8 strings. A `lookupBytes(name: Uint8Array)` parallel surface can be added if a backing store demands it. |
| How does this surface relate to Endo's `provideMount` / pet-name resolution? | Out of scope for the interface. A `FilesystemFactory` caplet (F3) accepts a host path and mints a `Filesystem`; pet-name registration is a HOST concern, same pattern as `@endo/claude-container`'s factory. |
| Should `lookup` distinguish "doesn't exist" from "permission denied"? | "Doesn't exist" raises; "permission denied" should not occur, because possessing the `Directory` cap already conferred the authority to look. If a backing store enforces ACLs beneath the cap (e.g. an OS-level fs), translate denials to the same "doesn't exist" error to avoid leaking metadata about names the caller can't see. |
| `setAttrs({ owner: ... })` and ocap | Allowing the cap holder to change ownership grants escalation if other parts of the system trust owner identity. v1: implementations MAY reject `owner` updates entirely. Holding the cap doesn't have to mean holding chown authority. |

---

## 10. Source

This design originated in a research conversation. §3 (design
principles) and §7 (what this buys you) are reproduced largely
verbatim from that conversation; §4 (interface) has been refactored
to align with Endo conventions and object-capability discipline.
The original POSIX-flavoured sketch is preserved below for
historical reference and to make the deltas auditable.

The 9P translation section from the source conversation has been
deliberately omitted: it documents how a 9P server can be built *on
top of* this interface and belongs in the consuming package's docs,
not this one. See `@endo/claude-container`'s `ENDO-INTEGRATION.md`
§9 R1 for the roadmap entry that frames this package as the
FS-side answer to 9P-over-CapTP chattiness.

### 10.1 Deltas from the original sketch

- `Filesystem.attach(uname, aname)` → `Filesystem.root()` (+
  optional `named(viewName)`). 9P's user-identity argument is
  removed; holding the cap is the identity.
- `Node.getAttr(mask)` / `setAttr(mask, attrs)` → `getAttrs()` /
  `setAttrs(updates)`. POSIX field-mask removed; full record on
  read, partial record on write.
- `Node.watch() → Subscription` → `watch() → PassableReader<Event>`.
  Separate `Subscription` type collapsed into the stream's own
  close protocol.
- `Node.xattrGet/Set/List/Remove` → `Node.xattrs() → Xattrs`
  sub-cap. Cleaner per-Node interface, same expressiveness.
- `Directory.create(name, mode, flags)` → `create(name,
  CreateFileOpts)` with structured options. POSIX `O_*` and 12-bit
  mode bits become typed records.
- `Directory.mkdir(name, mode, gid)` → `mkdir(name, CreateDirOpts)`.
  `gid` removed (set later via `setAttrs`); `mode` becomes
  `initialPermissions: Permissions`.
- `Directory.symlink(name, target, gid)` → `symlink(name, target)`.
- `Directory.mknod(...)` removed. Device files out of scope for a
  portable remote FS cap.
- `Directory.unlink(name, flags)` (with `AT_REMOVEDIR` in flags) →
  `unlink(name)`. The implementation handles directories when
  empty without a flag.
- `OpenFile.lock(type, start, length, pid, clientId)` →
  `lock(LockOpts)`. `pid` and `clientId` removed; the Lock cap is
  the identity.
- `OpenFile.getLock(type, start, length, pid, clientId)
  → LockInfo` → `getLock(LockProbe) → LockState | null`. Result
  is a structural description of what's locked, not "who holds
  it".
- `OpenFile.fsync(dataOnly: Bool)` → `fsync(FsyncOpts)` with
  `metadata?: boolean`. Removes the awkward POSIX inversion.
- Eager-state mechanism made explicit (§4.11): a passable
  copy-record carried with the cap, exposed via a sync getter on
  the exo state.
- Offsets and lengths typed as `bigint` to match file sizes that
  exceed 2⁵³.
- Added `help()` per Endo convention.

### 10.2 Original POSIX-flavoured sketch

Preserved for reference; superseded by §4.

```
Filesystem
  attach(uname, aname) -> Directory
  statfs() -> FsStats

Node                            // common base
  qid (eager, carried with cap) // type + version + path-id
  getAttr(mask) -> Attrs
  setAttr(mask, attrs) -> ()
  watch() -> Subscription
  xattrGet(name) -> Stream<Bytes>
  xattrSet(name, flags) -> Sink<Bytes>
  xattrList() -> Stream<Text>
  xattrRemove(name) -> ()

Directory : Node
  lookup(name) -> Node          // returns the right subtype
  list() -> Stream<DirEntry>    // each entry: name, qid, type
  open(flags) -> OpenDirectory
  create(name, mode, flags) -> OpenFile
  mkdir(name, mode, gid) -> Directory
  symlink(name, target, gid) -> Symlink
  mknod(name, mode, major, minor, gid) -> Node
  link(name, target: Node) -> ()
  unlink(name, flags) -> ()     // flags carries AT_REMOVEDIR
  rename(oldName, newDir, newName) -> ()

File : Node
  open(flags) -> OpenFile
  snapshot() -> BlobRef         // optional: content-addressed handle

Symlink : Node
  readlink() -> Text

OpenFile
  read(offset, length) -> Stream<Bytes>
  write(offset) -> Sink<Bytes>  // returns total bytes accepted
  truncate(length) -> ()
  fsync(dataOnly: Bool) -> ()
  lock(type, start, length, pid, clientId) -> Lock
  getLock(type, start, length, pid, clientId) -> LockInfo
  // implicit close when cap is dropped

OpenDirectory
  entries(offset) -> Stream<DirEntry>  // offset is server-issued cookie
  fsync() -> ()

Subscription
  events() -> Stream<Event>     // changed, removed, child-added, etc.
  cancel() -> ()

Lock
  release() -> ()               // also released if cap is dropped

BlobRef
  hash, size                    // immutable, eagerly carried
  fetch(offset, length) -> Stream<Bytes>
```
