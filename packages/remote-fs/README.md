# @endo/remote-fs

Pipelinable, stream-friendly filesystem capabilities for Endo.

> **Status — Core landed with full streaming, watch, locks, and
> BlobRef.** Interface guards (DESIGN.md §4) and an in-memory
> `Filesystem` (§8.2) are in place and tested. Byte streams use
> `@endo/exo-stream`'s `PassableBytesReader` / `PassableBytesWriter`
> with bidirectional promise chains and base64-on-the-wire. Disk-
> backed (§8.3), `compose`/`readOnly`/`chroot`/`bind` (§8.6), layer
> diff/apply (§8.5), and the `from-mount.js` /
> `from-readable-tree.js` adapters remain on the roadmap. See
> `DESIGN.md` §9 for the full F-numbered status.

## Why a new FS surface

`@endo/daemon` already exposes `Mount` and `ReadableTree` — adequate
for local consumers, but every directory traversal across a CapTP
boundary costs one round trip per path segment, every file read
shuttles bytes through `text()` or `streamBase64()` without typed
ranges, and there is no way to advertise "this file's content is
already cached locally; don't fetch it over the network."

`@endo/remote-fs` is the proposal for a richer filesystem capability
designed around those costs:

- **Pipelinable lookup**: `Directory.lookup(name)` returns a
  subtype-correct cap (`File` / `Directory` / `Symlink`) whose qid is
  eagerly carried, so the resolved promise can be `open()`-ed without
  waiting for a host-side round trip.
- **Stream-shaped bulk I/O**: byte payloads ride
  `@endo/exo-stream` readers and writers, not method-sized chunks.
- **Optional content-addressed `BlobRef`s**: clients holding a CAS
  cache can skip the network entirely for cold reads.
- **Subscriptions**, **xattrs**, and **locks** as first-class
  capabilities, not as RPC verbs.

The 9P translation rules that motivated some of these choices live
in `@endo/claude-container` (a 9P-over-virtio-serial server that
consumes the FS capability as its backing store). They are not part
of this package.

## Layout

```
packages/remote-fs/
├── DESIGN.md           ← the full design
├── README.md           ← this file
├── package.json
├── src/
│   ├── index.js        ← public re-exports
│   ├── guards.js       ← M.interface for every type in DESIGN.md §4
│   └── in-memory.js    ← in-memory Filesystem (§8.2)
└── test/
    ├── in-memory.test.js   ← core CRUD: mkdir/lookup/create/read/write/
    │                         unlink/rename/setAttrs/xattrs/statfs
    ├── pipeline.test.js    ← pipelined-walk chains (DESIGN.md §3 #2):
    │                         root.lookup(a).lookup(b).lookup(c).open().read()
    │                         as one expression
    ├── cursor.test.js      ← Cursor.stream / skip / rewind / multi-cursor
    │                         independence (§4.5)
    ├── watch.test.js        ← Node.watch / NodeWatcher.events / cancel,
    │                         multi-watcher fan-out (F7)
    ├── lock.test.js         ← OpenFile.lock / getLock; shared vs exclusive,
    │                         range overlap, length-0 = to-end-of-file (F8)
    └── blobref.test.js      ← File.snapshot → BlobRef; sha256 hash,
                              fetch(offset, length), survives mutation (F6)
```

42 tests, all green. POSIX-specific fields (permissions, owner,
ACLs) remain absent from the base interface as designed (§4.9);
`PosixFs` companion cap is F15 future work.

## Relation to existing Endo work

| Subject | Where today | What this package adds |
|---|---|---|
| Live FS capability | `@endo/daemon` `Mount` | Typed `Directory`/`File`/`Symlink` subtypes; eager qid; explicit `open()` ↔ `OpenFile`/`OpenDirectory` split |
| Immutable snapshot | `@endo/daemon` `ReadableTree` | `Node.snapshot() → BlobRef` for content-addressed sub-trees |
| Byte streaming over CapTP | `@endo/exo-stream` `PassableBytesReader`/`Writer` | Consumes; doesn't replace |
| 9P-over-virtio-serial bridge | `@endo/claude-container` `src/9p/`, `src/fs-bridge-9p.js` | This package targets that bridge's *backing store* — the FS capability the bridge proxies into the guest |

See `DESIGN.md` §3 ("Position in the Endo ecosystem") for the
detailed comparison.
