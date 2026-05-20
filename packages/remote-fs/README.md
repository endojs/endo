# @endo/remote-fs

Pipelinable, stream-friendly filesystem capabilities for Endo.

> **Status — F1–F5, F7–F14 landed.** Interface guards (§4),
> in-memory (§8.2) and disk-backed (§8.3) `Filesystem`s, the
> `from-mount.js` adapter (§F5, `'surface'` default), the
> `readOnly` attenuator (§8.1), `compose` CoW (§8.4) with
> writable in-memory layer + `Layer.diff` / `Layer.apply` (§8.5),
> and the `chroot` / `bind` / `namespace` / `emptyFilesystem`
> structural primitives (§8.6) are all in place and tested.
> Byte streams use `@endo/exo-stream`'s `PassableBytesReader` /
> `PassableBytesWriter` with bidirectional promise chains and
> base64-on-the-wire.
> Open: F6 (`from-readable-tree.js`) and the F15–F17 OS-extension
> caps (`PosixFs`, `LinuxFs`, the speculative `GraphFs`).
> See `DESIGN.md` §9 for the full F-numbered status.

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
├── DESIGN.md                ← the full design
├── README.md                ← this file
├── package.json
├── src/
│   ├── index.js             ← public re-exports
│   ├── guards.js            ← M.interface for every type in §4
│   ├── in-memory.js         ← in-memory Filesystem (§8.2)
│   ├── in-memory-module.js  ← unconfined entry for in-memory FS
│   ├── disk.js              ← disk-backed Filesystem (§8.3)
│   ├── from-mount.js        ← @endo/daemon Mount adapter (§F5)
│   ├── readonly.js          ← readOnly attenuator (§8.1, §8.6)
│   ├── compose.js           ← CoW union (§8.4, §8.6)
│   └── layer.js             ← writable layer + diff/apply (§8.5)
└── test/
    ├── in-memory.test.js     ← core CRUD: mkdir/lookup/create/read/write/
    │                           unlink/rename/setAttrs/xattrs/statfs
    ├── disk.test.js          ← disk-backed CRUD + qid stability (F3)
    ├── from-mount.test.js    ← Mount → Filesystem projection (F5)
    ├── readonly.test.js      ← attenuator rejects mutations (F10)
    ├── compose.test.js       ← CoW union, whiteouts, copy-up (F11)
    ├── layer.test.js         ← Layer.diff / Layer.apply (F12)
    ├── configurations.test.js← structural primitives (chroot, bind,
    │                           namespace, emptyFilesystem) (F13)
    ├── pipeline.test.js      ← pipelined-walk chains (§3 #2):
    │                           root.lookup(a).lookup(b).lookup(c).open().read()
    │                           as one expression
    ├── pipelined-rtt.test.js ← single-RTT proof via call counts (F9)
    ├── optimal-querying.test.js ← PATTERN: tests for E()-chain, Promise.all,
    │                           and M.await pipelining (§10.1)
    ├── cursor.test.js        ← Cursor.stream / skip / rewind / multi-cursor
    │                           independence (§4.5)
    ├── watch.test.js         ← Node.watch / NodeWatcher.events / cancel,
    │                           multi-watcher fan-out (F7)
    ├── lock.test.js          ← OpenFile.lock / getLock; shared vs exclusive,
    │                           range overlap, length-0 = to-end-of-file (F8)
    └── blobref.test.js       ← File.snapshot → BlobRef; sha256 hash,
                                fetch(offset, length), survives mutation
```

127 ava cases across 14 files, all green. POSIX-specific fields
(permissions, owner, ACLs) remain absent from the base interface
as designed (§4.9); `PosixFs` companion cap is F15 future work.

## Relation to existing Endo work

| Subject | Where today | What this package adds |
|---|---|---|
| Live FS capability | `@endo/daemon` `Mount` | Typed `Directory`/`File` subtypes; eager qid; explicit `open()` ↔ `OpenFile`/`Cursor` split. (Symlinks are F16 `LinuxFs` future work, not part of the base.) |
| Immutable snapshot | `@endo/daemon` `ReadableTree` | `Node.snapshot() → BlobRef` for content-addressed sub-trees |
| Byte streaming over CapTP | `@endo/exo-stream` `PassableBytesReader`/`Writer` | Consumes; doesn't replace |
| 9P-over-UDS bridge | `@endo/9p-server` (`makeFsBridge9p`) | This package is the bridge's *backing store* — the `Filesystem` capability the bridge proxies into a 9P client (QEMU's `-chardev`, Linux v9fs, `diod`, …). |

See `DESIGN.md` §3 ("Position in the Endo ecosystem") for the
detailed comparison.
