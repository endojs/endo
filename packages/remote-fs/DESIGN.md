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
- **Discriminating subtypes** — `Directory`, `File` — so a caller
  can pipeline a type-appropriate next call onto the lookup result
  without first probing what kind of node it got.
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
- **POSIX-isms in the base interface.** POSIX permissions /
  mode bits, owner (`uid`/`gid`), POSIX ACLs, symlinks, hard
  links, and OS-specific xattr namespaces (`system.*`,
  `trusted.*`, `security.*`) all carry semantics that an
  object-capability interface can't honestly express — they let
  parties other than the cap holder decide access, traffic in
  identity-shaped values (uids, gids) instead of caps, or assume
  a single global path namespace. The base `Filesystem` omits
  them entirely. Companion caps (`PosixFs`, future `LinuxFs`)
  layer the OS-specific semantics on top for backings that can
  honour them; see §8 and §9.
- **Graph semantics in the base.** The base is tree-shaped (see
  §3). Hard links (DAG: one node, multiple names) move to
  `PosixFs`. Arbitrary cap-target edges that admit cycles or
  shared subtrees — Plan 9–style union mounts, capability graphs
  that aren't filesystems-as-trees in the usual sense — would
  belong in a far-future `GraphFs` extension, not in this base.

---

## 2. Position in the Endo ecosystem

| Concern | Existing | This package |
|---|---|---|
| Live FS access | `@endo/daemon` `Mount` (`packages/daemon/src/mount.js`): `has`, `list`, `lookup`, `readText`, `writeText`, `makeDirectory`, `remove`, `move`, ... | Typed `Directory` / `File` subtypes; explicit `open()` separation; eager qid on every Node |
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

5. **Filesystems are trees.** Every `Directory`/`File` cap issued by
   a base `Filesystem` has at most one parent reachable through
   `Directory.lookup`. The base interface offers no operations that
   would create aliasing (no `Directory.link(name, target: Node)`,
   no symlinks) or cycles. This isn't runtime enforcement — it's
   that the interface has no shape that lets an implementation
   violate the invariant the way an ocap-pure base has no method
   that would let a caller "elevate authority". Implementations
   sign a contract by issuing base FS caps: their nodes form a
   tree. Extensions that relax this — `PosixFs` adds hard links
   (DAG-shaped: a single file with multiple names), a hypothetical
   `GraphFs` would add arbitrary cap-target edges — own the
   responsibility for whatever invariants their relaxation
   requires.

---

## 4. Interface

This section is normative. Method signatures use Endo conventions:

- Every method on every cap returns `Promise<T>` (eventual send).
- "Eager" fields on a cap (`qid`, `BlobRef.hash`) are carried as a
  passable copy-record alongside the cap's slot, exposed via a
  side-effect-free getter on the exo state. See §4.10 for the
  mechanism.
- All capability holders are identities — methods do not take
  `pid`, `clientId`, `uid`, or `gid` arguments to designate the
  caller; the holder of the cap IS the caller.
- Numerically-flagged POSIX concepts (`O_*`, 12-bit perm bits,
  `XATTR_CREATE`) are modelled as structured copy-records; the
  thin translator between POSIX-shaped consumers and this surface
  does the bit-twiddling.
- `Node` is documentation, not an interface. Each of `Directory`
  and `File` has its own `M.interface` guard that includes the
  "Node base" methods (§4.2) plus its subtype-specific ones.
- Every interface includes a `help() → string` per Endo convention.

See §11 for the design's provenance.

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

Every `Directory` and `File` cap exposes these:

```
qid                               eager: Qid
getAttrs()                        → Attrs
setAttrs(updates: AttrsUpdate)    → void
watch()                           → PassableReader<Event>
xattrs()                          → Xattrs
help()                            → string
```

- `qid` is eager (carried with the cap, §4.10). Equal `qid.pathId`
  on two caps means they refer to the same underlying node;
  `qid.version` bumps on every metadata change. Implementations
  that have no native inode identity can synthesise one.
- `getAttrs()` returns everything in `Attrs` (§4.9): size +
  timestamps. POSIX fields (permissions, owner, nlink) are exposed
  via the `PosixFs` extension, not here.
- `setAttrs(updates)` accepts a partial `AttrsUpdate` record;
  fields absent from the update are unchanged. The update does NOT
  accept ownership changes — `chown` is `PosixFs` territory and
  conveys authority the base cap does not.
- `watch()` returns a `PassableReader<Event>` directly. The
  caller closes the stream to cancel; there is no separate
  `Subscription` type. Events start at the moment of the call —
  no replay.
- `xattrs()` returns an `Xattrs` sub-cap (§4.8) scoped to the
  `user.*` namespace only. OS-level xattr namespaces (`system.*`,
  `trusted.*`, `security.*`) and POSIX ACLs are surfaced through
  `PosixFs`.

### 4.3 Directory

Includes §4.2 plus:

```
lookup(name: string)              → Directory | File
list()                            → Cursor       // see §4.5
create(name: string, opts: CreateFileOpts)
                                  → OpenFile
mkdir(name: string, opts: CreateDirOpts)
                                  → Directory
unlink(name: string)              → void         // empty dir or file
rename(oldName, newParent: Directory, newName)
                                  → void
fsync()                           → void         // impl-dependent
```

`lookup` returns the type-correct subtype — `Directory` or `File`.
A protocol translator can pipeline a typed call (`open()`,
`stream()`, etc.) on the returned promise without a
"what type is this?" probe.

`lookup` for a name that the backing rejects (ACL deny, hidden
entry, etc.) returns the same error as a name that doesn't exist
— `ENOENT`-equivalent. The cap is the authority; there shouldn't
*be* a permission denied beneath it, and surfacing one would leak
metadata about names the caller can't see.

Deliberate omissions from the base interface:

- **Symlinks and hard links.** Symlinks tangle two incompatible
  shapes (POSIX path-string targets vs ocap cap targets), and
  cross-filesystem aliasing breaks composition. Hard links require
  a same-filesystem brand check. Both are deferred to the
  `PosixFs` / `LinuxFs` extensions (§9 future work).
- **`mknod` (device files).** Out of scope for a portable cap-FS.
- **`chmod` / `chown` / POSIX ACLs.** These traffic in identity
  shapes (`uid`, `gid`) that aren't ocap-meaningful. Implemented
  by `PosixFs` for OS-backed backings.
- **`AT_REMOVEDIR`-style flag on `unlink`.** `unlink(name)`
  handles empty directories without a flag.

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

### 4.5 Cursor

A `Cursor` is the cap returned by `Directory.list()`. It carries
the iteration state; the same `Directory` can mint multiple
independent cursors, each at its own position.

```
stream()                          → PassableReader<DirEntry>
skip(n: bigint)                   → void
rewind()                          → void
help()                            → string
```

- **`stream()`** is the primary read path. Returns an
  `@endo/exo-stream` reader from the cursor's current position;
  closing the stream leaves the cursor advanced to where reading
  stopped, so calling `stream()` again resumes from there. exo-
  stream's pre-ack buffering pipelines chunks over high-latency
  links.
- **`skip(n)`** advances the cursor without yielding entries.
  Default implementation reads-and-discards; backings with
  ordered indexes (b-trees, sorted directories) can implement it
  in `O(log n)`.
- **`rewind()`** resets the cursor to the start of the directory.
  Equivalent to `rewinddir(3)`. Sufficient for the realistic
  resumption cases; arbitrary seek-to-position would require
  value-cursors and reintroduce the state-in-value problem.

The cursor cap IS the cursor state — no opaque cookie tokens
flow through arguments. Protocol bridges that need to map an
external cookie (9P `Treaddir` offset, NFS3 `readdir` cookie)
keep a `Map<cookie, Cursor>` in the bridge process; that
translator-side cache is the right place for that protocol-
specific bookkeeping.

For persistence across daemon restart, the cursor is a
formulated cap whose env captures its current position;
reincarnation restores the cursor to the same place.

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
  most callers want — leaving that as an open question (§10).
- `lock` returns a `Lock` cap (§4.7). The cap IS the lock holder;
  there is no `pid` or `clientId` argument because the cap
  conveys identity. Dropping the cap releases.
- `getLock` returns a structural description of what's currently
  locked at the requested range — NOT "who holds it". Identity
  through caps means there's no off-cap holder to name.
- `close()` is an explicit option in addition to cap-drop, useful
  for synchronously flushing before dropping.

### 4.7 Lock

```
release()                         → void
help()                            → string
```

Dropping the cap releases the lock. `release()` is for callers
who want a synchronous release before dropping.

### 4.8 Xattrs

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

**Namespace scoping.** The base `Xattrs` cap only exposes the
`user.*` namespace — arbitrary application-level metadata.
Linux's `system.*` (POSIX ACLs), `trusted.*` (root-only), and
`security.*` (SELinux, integrity) namespaces are filtered out;
they encode OS-level authority and are surfaced through the
`PosixFs` / `LinuxFs` extension caps instead (§9). Implementations
wrapping an OS filesystem strip the `user.` prefix from `name` on
the wire and add it back when calling the kernel; callers don't
see the prefix.

### 4.9 Copy-record schemas

```
Qid                               (eager on every Node)
  type: 'directory' | 'file'
  pathId: bigint                  // inode-like; stable for the lifetime of the node
  version: bigint                 // bumps on every metadata change

Attrs                             (returned by Node.getAttrs)
  size: bigint
  mtime: bigint                   // ns since epoch
  atime: bigint
  ctime: bigint
  btime: bigint | null            // birth time, if backing store records it
```

The base `Attrs` deliberately omits POSIX-isms (`permissions`,
`owner: { uid, gid }`, `nlink`). The `PosixFs` extension cap
exposes a richer `PosixAttrs` covering those fields for backings
that can honour them.

```
AttrsUpdate                       (passed to Node.setAttrs; all fields optional)
  size?: bigint
  mtime?, atime?, ctime?: bigint

OpenOpts                          (passed to File.open)
  read?, write?, append?, truncate?: boolean
  create?: 'never' | 'if-missing' | 'exclusive'

CreateFileOpts                    (passed to Directory.create)
  exclusive?: boolean

CreateDirOpts                     (passed to Directory.mkdir)
  // currently empty — kept as a record for forward compat

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
  // kind-specific fields TBD; see §10

FsStats
  totalBytes, freeBytes, availableBytes: bigint

XattrSetOpts
  existence?: 'create' | 'replace' | 'either'
```

`CreateFileOpts.initialPermissions` and
`CreateDirOpts.initialPermissions` were removed — initial
permissions are POSIX-shaped, set via the `PosixFs` extension if
needed. The base FS creates with implementation-defined defaults
(typically "fully readable/writable to the cap holder," since
the cap is the authority).

POSIX-specific stat fields the base omits but `PosixFs` adds:
`permissions`, `owner: { uid, gid }`, `nlink`, mode bits with
`setuid` / `setgid` / `sticky`, `blockSize` / `fragmentSize` /
`totalNodes` / `freeNodes` on `FsStats`.

### 4.10 Eager state mechanism

`qid` (on every `Directory`/`File`) and `BlobRef.hash` +
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

## 8. Implementations and composition

The interface in §4 is one shape. Many implementations share it.
The space below sketches the obvious ones, plus the composition
primitives that turn them from independent products into a small
algebra of filesystems.

### 8.1 Read-only

A `Filesystem` whose mutating methods (`Directory.create`,
`mkdir`, `unlink`, `rename`; `File.open` with any of `write`,
`append`, `truncate`, `create`; `Node.setAttrs`, `Xattrs.set`,
`Xattrs.remove`) reject with permission-style errors.
Two natural sources:

- **Attenuator** over an existing `Filesystem` — same backing,
  read methods pass through, write methods reject. Hand the
  attenuator to consumers that shouldn't be able to mutate.
- **Content-addressed snapshot** — fixed at construction; every
  `File.snapshot()` returns a non-null `BlobRef`. The Endo
  analogue is `@endo/daemon`'s `ReadableTree`; F6 in the roadmap
  is the bridge.

### 8.2 In-memory

State in plain JS — `Map<string, Node>` for directory entries,
`Uint8Array` for file content, an in-process event emitter for
`watch()`. `Qid.pathId` is a counter; `Qid.version` bumps on every
mutation. Useful for tests (F4 in the roadmap) and ephemeral
scratch space. Inherits no on-disk semantics — open files have no
durability guarantee beyond process lifetime.

### 8.3 Disk-backed

Wraps `node:fs/promises`. `Qid.pathId` from the inode; `Qid.version`
derived from a fingerprint of (`mtime`, `size`, `mode`). `BlobRef`
minted lazily by reading + hashing on demand, with a cache keyed by
(inode, version). Watches via `chokidar` or kernel inotify.

### 8.4 Copy-on-write (the interesting one)

A CoW filesystem is composed of two participants:

1. A **backing** `Filesystem`, typically (but not necessarily)
   read-only — a snapshot, a remote daemon, a content-addressed
   store, even another CoW.
2. A **writable layer** `Filesystem` whose state records changes
   relative to the backing.

`Directory.lookup(name)` on the composed view consults the layer
first:

- The layer holds a **whiteout** for `name` → return `ENOENT`.
- The layer holds an **entry** for `name` → return the layer's
  cap.
- The layer is marked **opaque** at this directory → ignore the
  backing entirely (used to fully replace a directory's children).
- Otherwise → fall through to the backing's `lookup(name)`.

`Directory.list()`'s `Cursor` (§4.5) on a composed view yields
entries from both sides, applying whiteouts. The merge is shallow
per directory — children appearing in the layer hide their
backing counterparts; everything else flows from the backing.

**Copy-up** semantics: writing to a file that exists only in the
backing copies it into the layer on first write. Implementations
may copy bytes eagerly, or (when both sides are content-addressed)
copy a `BlobRef` and lazily realise bytes only when a write spans
a region the backing hasn't supplied yet.

**Metadata-only overlays**: a layer can store a node that holds
only an `AttrsUpdate` for a backing path — `setAttrs` doesn't
have to copy file content. This avoids the well-known overlayfs
trap where `chmod` triggers a whole-file copy-up.

**Whiteout encoding** is implementation-internal. Overlayfs uses
character device files at `(0, 0)`; the in-memory layer would use
a tagged record; a disk-backed layer might use a sentinel xattr.
The interface doesn't see them.

The layer is itself a `Filesystem` (same interface), with the
additional operations in §8.5. Composition is N-ary: a stack of
N layers behaves like (((L₁ ∘ L₂) ∘ L₃) … ∘ Lₙ). Docker-style
image stacks fall out without special-casing.

### 8.5 Layer-specific operations: diff and apply

A writable layer carries enough state to enumerate its changes
relative to its backing. Expose this as two methods on a `Layer`
sub-interface, NOT on the composed `Filesystem`:

```
Layer (cap, separate from Filesystem)
  asFilesystem()                  → Filesystem    // attenuator
  backing()                       → Filesystem
  diff()                          → PassableReader<LayerOp>
  apply(target: Filesystem)       → void
  seal()                          → Filesystem    // promote to read-only
  help()                          → string
```

A `Layer` is its own cap — it conveys strictly more authority
than the `Filesystem` it covers. `asFilesystem()` projects out
just the FS view, suitable for handing to consumers that should
see the composed filesystem but shouldn't be able to introspect
or extract the diff. The base `compose(layer, backing)` (§8.6)
takes a `Layer` and a `Filesystem` and returns a `Filesystem`;
the resulting cap doesn't carry layer authority.

`LayerOp` is a discriminated copy-record:

```
LayerOp =
  | { kind: 'create-file',     path }
  | { kind: 'create-dir',      path }
  | { kind: 'whiteout',        path }
  | { kind: 'opaque-dir',      path }
  | { kind: 'set-attrs',       path, updates: AttrsUpdate }
  | { kind: 'set-xattr',       path, name, value: PassableBytesReader }
  | { kind: 'remove-xattr',    path, name }
  | { kind: 'write-bytes',     path, offset: bigint,
                               bytes: PassableBytesReader }
  | { kind: 'truncate',        path, length: bigint }
  | { kind: 'rename',          oldPath, newPath }
```

`create-symlink` and `link` (hard link) variants are absent —
symlinks and hard links are `PosixFs` / `LinuxFs` concepts and
get layered diff support in the corresponding extension. POSIX-
shaped layers built on PosixFs add `chmod` / `chown` / `set-acl`
variants in their own `PosixLayerOp` union.

`diff()` is a stream so large layers don't have to materialise in
one record. The stream's order is the order needed to apply on a
clean target (creates before writes, renames after destinations
exist) — the layer is free to topologically sort.

`apply(target)` is implementable in terms of `diff()` and the
target's own methods. A default implementation lives in this
package. Special-case implementations (apply over a CAS sync
protocol, apply via `rsync(1)`, apply by `BlobRef` transfer
only) are out-of-scope optimisations callers can supply.

`seal()` freezes the layer's mutations and returns a read-only
view — useful for promoting a working set into a fresh backing
for a higher layer to use.

A **"view of the diff as a filesystem"** — what overlayfs users
sometimes want when they ask "what have I changed?" — is just
`compose(layer, emptyFilesystem())`: the layer mounted over a
backing with no entries. The result presents only the changes,
walkable like any other `Filesystem`. No new operation is needed.

### 8.6 Composition primitives

Each is a constructor that takes one or more `Filesystem`s and
returns one. Cap-shaped composition; no module-level wiring,
nothing the composed `Filesystem` does that an ordinary caller
couldn't.

```
readOnly(fs)                                   → Filesystem
compose(layer, backing, opts?)                 → Filesystem  // §8.4
chroot(fs, subPath: string[])                  → Filesystem
bind(host: Filesystem, mountPath: string[],
     guest: Filesystem)                        → Filesystem
namespace(mounts: Record<string, Filesystem>)  → Filesystem
emptyFilesystem(opts?)                         → Filesystem
```

- **`readOnly`** — §8.1, the attenuator.
- **`compose`** — §8.4 CoW union. `opts` carry policy: whether
  metadata-only overlays are allowed, copy-up granularity, how
  qids are derived.
- **`chroot`** — present a subtree as the root. Lets a guest see
  "just this directory" without rebuilding the subtree.
- **`bind`** — graft one filesystem at a path inside another.
  Host's lookups at the mount path return the guest's root;
  lookups elsewhere return the host. Recursive (mounts can
  contain mounts).
- **`namespace`** — start with a synthetic empty root and mount
  filesystems at named children. Same primitive `bind` uses;
  surfaced separately because "no host, just mounts" is a common
  shape (think `/proc`, `/sys`, `/dev` as a synthetic root).
- **`emptyFilesystem`** — the unit object: a `Filesystem` whose
  root contains nothing. Useful as the backing for a `compose`
  that should present only a layer's changes.

The result of any of these is a `Filesystem` indistinguishable
(from a caller's perspective) from a primitive one. That means
the primitives compose with themselves: `readOnly(compose(...))`,
`compose(chroot(big, ['workspace']), scratch)`, etc.

**Cycle defense.** `bind` and `namespace` can apparently introduce
cycles — `bind(host, ['foo'], host)` makes `host`'s `/foo` resolve
back to `host`, so `host/foo/foo/foo/...` traverses forever. The
tree invariant from §3 is a contract; each composition primitive
is responsible for rejecting configurations that would break it.
Concretely:

- `bind` MUST reject when `host` and `guest` are the same
  `Filesystem` cap, or when `guest` is itself a composed view
  that (transitively) includes `host`.
- `namespace` MUST reject when any two of its mounted filesystems
  share a `Filesystem` cap, or when any of them includes a
  composed view of the namespace under construction.
- `compose(layer, backing)` MUST reject when `layer` and
  `backing` are the same cap (a layer over itself is degenerate
  and the CoW semantics produce nonsense).

Detection mechanism is per-implementation. A pragmatic choice:
maintain a tag set on every composed `Filesystem` cap (the union
of its participants' tags); a composition is rejected if its
proposed participants' tag sets overlap. Tags are minted opaquely
at primitive `Filesystem` construction and carried through
composition. This is one realisation of the same-FS brand idea
that §9.1 raises for `LinuxFs` symlink targets; the two
mechanisms could share an implementation.

The §10 open questions include a follow-up on whether cycle
detection is eager (at composition time) or lazy (at traversal
time); the eager option is what's specified here.

### 8.7 What rides through composition

Eager state (§4.10) and content-addressing (§6) need a story
under composition. Each is the implementation's choice, with
consequences:

- **`Qid` identity**: the composed view's qid must distinguish a
  copy-up from the backing (so callers caching by qid don't see
  stale content after a write). Options:
  - (a) Derive a deterministic qid from
    `(layer-qid ?? backing-qid)`, so equality across composed
    views with the same backing means "same underlying object."
    Callers that cache by qid see cache hits across uncovered
    files.
  - (b) Mint fresh qids for every composed view. Simpler;
    eliminates the (a) cache benefit.
  `compose(...)` should default to (a) and let callers opt out.

- **`BlobRef`**: a CoW `File.snapshot()` can return the backing's
  `BlobRef` for files never copied up. After copy-up, `snapshot`
  either re-mints from the new content (if cheap) or returns
  `null` until a sealing step. `Layer.apply(target)` where both
  sides know the same CAS can transmit only `BlobRef`s and defer
  the bytes.

- **`watch()`**: subscriptions on a composed view yield merged
  events from both participants — a child added in the layer and
  a child added in the backing are both surfaced. A layer-only
  `watch` (`layer.watch(...)` directly) surfaces only the
  layer's mutations — useful for "show me what I've modified."

### 8.8 Implementation notes

- **Hot paths.** `lookup` and `list` dominate. Layered lookup is
  O(stack depth) sequential in the worst case, but the
  primitives can pipeline lookups in parallel and take the
  first definitive answer (`'present in this layer'` or
  `'whiteout'` short-circuits the rest). The implementation must
  cancel still-pending lookups once it has a winner.

- **Caching.** A composed view can memoise per-directory the
  "this child lives in layer L" decision. Invalidation comes
  from `watch()` events from any participating layer; the
  primitives should expose enough hooks that the cache can stay
  honest.

- **Atomicity.** `apply` is NOT transactional across multiple
  paths. Callers needing atomic groups should build an
  intermediate layer, `apply` it as a single operation against
  a fresh CoW target, then promote with `seal()`.

- **Path sanity.** `chroot`, `bind`, `namespace` must defend
  against `..` escapes, since the §4 surface speaks `string[]`
  paths in some operations. Each implementation enforces its own
  containment.

These are an implementation menu, not interface obligations. The
roadmap (§9) sequences the few of these that have to exist for
the package to be useful at all; the rest are future work and
contributor surface.

---

## 9. Roadmap

Items below are open unless marked otherwise.

| Item | Status |
|---|---|
| F1 — Interface guards (M.interface for every type in §4) | **Done** |
| F2 — Reference exos backed by a powers object | **Done** |
| F3 — Disk-backed `Filesystem` over `node:fs/promises` (§8.3) | **Done** (factory caplet is follow-up) |
| F4 — In-memory `Filesystem` for tests (§8.2) | **Done** |
| F5 — `from-mount.js` adapter (project `@endo/daemon` `Mount` → `Filesystem`); ship `'surface'` first (stateless, simplest) | **Done** (`'surface'` default; dedup/reject deferred) |
| F6 — `from-readable-tree.js` adapter (with eager `BlobRef`s) | Open |
| F7 — `Node.watch()` events backed by `chokidar` or kernel inotify | **Done** (in-memory dispatch; disk-side polling is follow-up) |
| F8 — Lock implementation (advisory, in-process for v1) | **Done** |
| F9 — Tests for pipelined-walk single-RTT property | Open |
| F10 — `readOnly(fs)` attenuator (§8.1, §8.6) | **Done** |
| F11 — `compose(layer, backing)` CoW union + writable in-memory layer (§8.4) | **Done** |
| F12 — `Layer.diff()` / `Layer.apply(target)` (§8.5) | Open |
| F13 — `chroot` / `bind` / `namespace` / `emptyFilesystem` primitives (§8.6), including eager cycle detection via composition-time tag sets | **Done** |
| F14 — Integrate into `@endo/claude-container`'s 9P bridge as the new backing store (closes R1) | **Done** |
| F15 — `PosixFs` companion cap: POSIX `permissions`, owner (`uid`/`gid`), `chmod`, `chown`, POSIX ACLs as structured ops, `system.*`/`trusted.*`/`security.*` xattrs, hard links (DAG relaxation of the tree invariant) | Open (future) |
| F16 — `LinuxFs : PosixFs`: symlinks, Linux capabilities, SELinux contexts; `asFilesystem()` projection; same-FS brand check for cap-shaped symlink targets | Open (future, design TBD — see §9.1) |
| F17 — `GraphFs` (far future, only if a real driver appears): arbitrary cap-target edges, Plan-9-style union mounts, no tree/DAG invariant. Not on a path; documented so the base interface can be honest about what it excludes. | Open (far future) |

F1–F2 are the minimum viable shape — interface guards + a
factory-like constructor function. F3 / F4 turn that into
something useful (a directory on disk; an in-memory FS for tests).
F5–F6 make it composable with the existing Endo FS world. F10–F13
deliver the implementation menu described in §8 — `readOnly` first
because it's a one-line attenuator, then `compose` (CoW) and the
layer's diff/apply, then the structural primitives. F14 is the
integration milestone. F15–F16 are the OS-extension layer, deferred
deliberately so the base FS's ocap invariants don't get muddied
with POSIX-isms in the early implementation phase.

### 9.1 LinuxFs (F16) — open design considerations

When the LinuxFs milestone gets picked up, these are the
substantive questions that have to be answered before the cap
shape is settled:

- **String targets vs cap targets for symlinks.** POSIX-shaped
  `target() → string` keeps the wire-compatible POSIX semantics
  (target is a path the resolver re-walks at lookup time, dangling
  symlinks are normal, target may resolve into a different mount).
  ocap-shaped `target() → Node` gives you a graph filesystem
  (target is a live cap, no resolver indirection, no dangling).
  Mixing the two on one interface is muddy; pick one. The cap-
  shaped form needs a brand check (see below) to keep same-
  filesystem semantics; the string-shaped form needs the resolver
  to live somewhere honest. Likely answer: cap-shaped, because
  the wider design is ocap-pure; but the cost is implementations
  have to carry brand identity through every Node they mint.
- **Same-filesystem brand check.** If symlinks carry cap targets
  (and PosixFs hard links accept Node caps as their target), the
  cap-accepting operations have to refuse targets that come from
  a different `Filesystem`. Mechanism: each `Filesystem` mints a
  unique opaque brand at construction; every `Directory` / `File`
  it issues carries the brand on its exo state; symlink/link
  creation compares brands and rejects mismatches with an
  `EXDEV`-equivalent error. This costs every implementation a
  brand-allocation step and a brand-check on every link/symlink
  call. The same brand machinery serves the cycle-detection in
  `bind` / `namespace` / `compose` (§8.6) — one tag set covers
  both concerns.
- **`asFilesystem()` projection.** A `LinuxFs` cap can be
  attenuated to a base `Filesystem` view for callers that don't
  want the OS-specific concepts. The hard question: how does the
  base view handle directories that contain symlinks or hard
  links?
  - **Option A — auto-follow at lookup.** `Directory.lookup` on
    a symlink-bearing entry follows the link and returns the
    target. Matches POSIX `stat` (vs `lstat`). Risks: symlink
    loops, dangling targets surface as ENOENT.
  - **Option B — filter at list / hide on lookup.** Symlinks
    don't appear in `list()`; `lookup` of a symlinked name
    returns ENOENT. Honest about what the base interface can
    represent; gives a "POSIX-projected" view fewer surprises.
  - **Option C — opaque file.** Symlinks appear as zero-size
    files whose `read` returns the target bytes. Misleading but
    survives `find`-style traversal.
  Likely answer: Option B. The base view is honestly smaller
  than the LinuxFs view; hiding symlinks is more honest than
  pretending they're something else.
- **Hard links across composition.** A composed CoW where the
  backing is a `LinuxFs` and the layer is a base FS: hard links
  from the backing become … what in the composed view? They're
  not representable in base FS. Probably the composed FS exposes
  them only when projected through a `LinuxFs` view, and
  presents the backing-link entries as ordinary `File`s in the
  base view.
- **Symlinks crossing compose boundaries.** A symlink in the
  backing whose target string points at a path that the layer
  whitens-out. POSIX: follow resolution gives ENOENT. The
  composed FS must honour that without leaking the layer's
  whiteout encoding. (Cap-shaped symlinks dodge this because the
  cap target is direct, not path-resolved — but they have their
  own composition problems re: brand checks across composed
  filesystems with different brands.)

The 9P translator that motivated this package's design is *not* on
this roadmap — it lives in `@endo/claude-container` and consumes the
`Filesystem` capability as a black box. The translation rules
(message-by-message mapping, parent-tracking, tag-to-promise
table) belong in that package's design doc, not here.

---

## 10. Open questions

Questions resolved during design and reflected in §4 / §8 above:

- `Directory.list()` returns a `Cursor` cap (§4.5); `OpenDirectory`
  goes away. The cap IS the iteration state; no opaque cookie
  values flow through arguments.
- `lookup` collapses backing-store permission denials to
  ENOENT-equivalent (§4.3) so the cap is the only meaningful
  authority surface.
- `setAttrs` does not accept `owner` updates in the base interface
  (§4.2); chown is `PosixFs` territory.
- `Layer` is a separate cap with `asFilesystem()` projection
  (§8.5), not a sub-interface of `Filesystem`. Holding a `Layer`
  conveys strictly more authority than holding its FS view.
- Symlinks are removed from the base entirely and deferred to
  `LinuxFs` (F16); hard links are deferred to `PosixFs` (F15)
  since POSIX is where they're defined. Detailed open questions
  in §9.1.
- The base interface is tree-shaped (§3 principle 5). No
  interface operation introduces aliasing or cycles; composition
  primitives (`bind` / `namespace` / `compose`) carry their own
  cycle-detection responsibility (§8.6). `PosixFs` relaxes to
  DAG via hard links; a hypothetical `GraphFs` (F17) would
  relax further to a true graph.

Remaining open questions:

| Topic | Tentative answer |
|---|---|
| `fsync(metadata)` default | `metadata: false` (data only). Matches Linux `fdatasync` default and is faster on most storage tiers. Callers wanting full metadata sync pass `{ metadata: true }`. |
| Hash algorithm for `BlobRef` | TBD. Provisionally a `BlobRef` carries `{ algorithm, hash, size }` where `algorithm` is an opaque string; consumers compare by `(algorithm, hash)` tuple. Encourages multihash-style flexibility without baking in a choice. |
| Encoding for `Text` results (`Xattrs.list`) | UTF-8 strings. Backings whose xattr names are non-UTF-8 expose a parallel `Bytes` accessor as a follow-up. |
| `Event` schema | Kind discriminator settled (`changed` / `removed` / `child-added` / `child-removed` / `renamed`); per-kind payloads (which fields changed, new name on rename, etc.) TBD with F7 implementation. |
| Non-UTF-8 names in `Directory.lookup`/`create`/`unlink`/etc. | Out of scope for v1. Names are UTF-8 strings. A `lookupBytes(name: Uint8Array)` parallel surface can be added if a backing store demands it. |
| How does this surface relate to Endo's `provideMount` / pet-name resolution? | Out of scope for the interface. A `FilesystemFactory` caplet (F3) accepts a host path and mints a `Filesystem`; pet-name registration is a HOST concern, same pattern as `@endo/claude-container`'s factory. |
| Qid stability under `compose` | §8.7 sketches "derive composed qid from backing-qid for uncovered files". Concrete derivation function TBD — probably `qid := backing-qid` for read-through, `{ pathId: hash(layer-path), version: layer-version }` for layer entries. Needs to survive arbitrary stack depths without collisions. |
| Whiteout encoding | `LayerOp.kind: 'whiteout'` is wire-level. The in-memory representation inside a writable layer is implementation-internal — overlayfs uses char-dev(0,0), but nothing forces that on us. Probably a tagged record. |
| Where do `apply` errors land? | `apply(target)` may fail partway through (target rejects a `set-attrs`, runs out of space, etc.). v1: surface the error and leave target in a partial state. v2: `apply` returns a sub-cap with `commit()` / `rollback()` for transactional groups. Connects to F12. |
| `compose` over a `compose` | Composition is associative on paper. Implementations should not require multi-layer stacks to be a flat list — `compose(compose(L₁, B), L₂)` should behave like `compose(L₂, compose(L₁, B))` from a caller's perspective, modulo the qid-stability choice above. |
| `PosixFs` cap surface | §4.9 lists what `PosixFs` adds (POSIX `Attrs` fields, `chmod`, `chown`, `system.*`/`trusted.*`/`security.*` xattrs, structured POSIX ACLs). Open: is `PosixFs` a single cap that takes `Node`s as arguments (`posixAttrs(node)`, `chmod(node, ...)`), or a `PosixNode` sub-cap per Node (`Node.posix() → PosixNode \| null`)? The former is more compact; the latter is more ocap-pure (each node carries its own authority). |
| LinuxFs open questions | See §9.1 — symlink target shape (string vs cap), same-FS brand check, `asFilesystem()` projection of symlink-bearing directories, hard links across composition, symlinks crossing compose boundaries. |
| Cycle detection — eager or lazy? | §8.6 specifies eager: `bind` / `namespace` / `compose` check at construction time and reject configurations whose participants' tag sets overlap. Open: should it ALSO detect lazily at traversal time, in case a composed FS gets re-introduced later via some other channel (a remote FS handed back over CapTP, say)? Eager-only is simpler and covers the obvious cases; the lazy version costs every `lookup` a tag-set check forever. Provisional answer: eager-only, and document that adversarial cap-passing patterns can defeat it. |
| `from-mount.js` (F5) and Mount-with-hard-links | Resolved: the adapter takes a config option for behaviour, defaulting to the simplest implementation for v1. `{ hardLinks: 'surface' }` (v1 default) — present each path as its own `File` cap with no inode-tracking; stateless adapter that honestly admits its base view isn't a strict tree where the backing has links. `{ hardLinks: 'dedup' }` — track inodes, pick one canonical path, hide the rest; more state but preserves the tree invariant. `{ hardLinks: 'reject' }` — error at `lookup` time when an inode-with-multiple-paths is encountered, useful when the caller demands the tree property hold strictly. `{ hardLinks: 'surface' }` ships first because it's stateless and matches what a caller wanting `PosixFs` on the same adapter would expect anyway. |

---

## 11. Provenance

This design grew out of a research conversation; §3 (design
principles) and §7 (what this buys you) are reproduced largely
verbatim from it. §4 (the interface) is its own work — the original
sketch was POSIX-flavoured (numeric mode/flag bitmasks, `pid` /
`gid` arguments, `Filesystem.attach(uname, aname)`, a separate
`Subscription` type) and has been refactored to align with Endo
conventions and object-capability discipline.

The 9P translation section from the source conversation has been
deliberately omitted: it documents how a 9P server can be built *on
top of* this interface and belongs in the consuming package's docs,
not this one. See `@endo/claude-container`'s `ENDO-INTEGRATION.md`
§9 R1 for the roadmap entry that frames this package as the
FS-side answer to 9P-over-CapTP chattiness.
