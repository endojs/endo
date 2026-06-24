# @endo/9p-server

A 9P2000.L server that serves an `@endo/platform/fs/extended` `Filesystem` over
a Unix domain socket. Anyone speaking 9P over UDS — QEMU's
`-chardev socket,server=off` for guest workspace projection, Linux
v9fs (`mount -t 9p -o trans=fd …`), `diod`, or any other 9P
client — can connect and traverse the FS the cap projects.

Originally built for `@endo/claude-container`'s microVM workspace
projection (R1 of `claude-container/ENDO-INTEGRATION.md` §9). Split
out here so other consumers can use the bridge without depending on
the whole container stack.

## Quick start

```js
import { makeFsBridge9p } from '@endo/9p-server';
import { makeInMemoryFilesystem } from '@endo/platform/fs/extended/in-memory.js';

const fs = makeInMemoryFilesystem();
// ... populate fs ...

const bridge = makeFsBridge9p({ fs, socketPath: '/tmp/9p.sock' });
await bridge.start();
// Any 9P client connecting to /tmp/9p.sock now serves `fs`.
// bridge.stop() closes the UDS and severs every live connection.
```

## What gets pipelined

`Twalk` for an N-segment path issues `E(cur).lookup(n0).lookup(n1)
.lookup(...)` as one batch; each step's qid is requested in
parallel via `E(intermediate).getQid()` during chain build, so
every lookup + getQid `CTP_CALL` reaches the wire before any
`CTP_RETURN` comes back. Results are collected by sequentially
awaiting each `qidPromise` — same wall-clock as `Promise.allSettled`
(the dispatches were already pipelined) but with first-failure
early-exit semantics that 9P's partial-success `Twalk` requires.
Structural property proven by `@endo/platform/fs/extended/test/pipelined-rtt.test.js`.

`getQid()` is sync on the responder but costs one RTT across
CapTP — pipelining it into the same batch as the `lookup` that
produced its parent cap is the standard usage (see
`@endo/platform/fs/extended/DESIGN.md` §4.10).

Other handlers that pipeline two or three calls into one batch:

- `Tattach`: `root()` + `getQid()` — one RTT instead of two.
- `Tmkdir`: `mkdir()` + `getQid()` against the new-dir promise —
  one RTT instead of two.
- `Tlcreate`: `create()` + `lookup()` + `getQid()` all dispatched
  in the same turn — one RTT instead of three.

`Tread` against a file uses `OpenFile.read(offset, length)` →
`PassableBytesReader`; bytes flow through `@endo/exo-stream`'s
base64-on-the-wire framing (until CapTP gains native binary).
Drained with `{ buffer: 1 }` so the producer pre-emits the first
chunk without waiting for our sync — saves the per-chunk
sync/ack round-trip for the common single-frame case.

`Treaddir` drains a `Directory.list()` `Cursor` once per fid
into a per-fid buffer that's paginated against the kernel's 9P
offset cookie. Buffer is set to 64 entries so the cursor pre-acks
ahead of our pulls — typical directory dumps drain in one batch
rather than one-RTT-per-entry.

`Twrite` pushes the chunk through `iterateBytesWriter` with
`{ buffer: 1 }` so the single chunk this Twrite carries doesn't
wait for the first ack.

## 9P operations

| Op | Status |
|---|---|
| Tversion | supported |
| Tattach | supported |
| Twalk (single + pipelined chain, `..` walks) | supported |
| Tlopen | supported |
| Tread | supported |
| Treaddir | supported |
| Tgetattr | supported |
| Tsetattr | supported |
| Tstatfs | supported |
| Tlcreate | supported |
| Twrite | supported |
| Tmkdir | supported |
| Tunlinkat | supported |
| Trenameat | supported |
| Tclunk | supported |
| Tflush | supported |
| Tlerror emission | supported |
| Tauth | `Rlerror(ENOSYS)` |
| Txattrwalk | `Rlerror(ENOSYS)` |

## Mounting into the Linux kernel

[`mount-caplet.js`](./mount-caplet.js) is an unconfined Endo caplet that
projects a `Filesystem` cap (possibly a remote CapTP presence) into the
host Linux kernel: it stands up `makeFsBridge9p` on a per-mount Unix
socket and runs `mount -t 9p -o trans=unix,version=9p2000.L,…`. Its
`make()` returns a *mounter* exo whose `mount(fs, mountPoint, options)`
returns a handle with `unmount()`; every live mount is torn down when
the caplet's cancellation context fires.

For an end-to-end walkthrough — fresh daemon, iroh networking, printing
an invitation on the remote daemon, sharing a `Filesystem` cap, and
mounting it on another machine — see [`DEMO.md`](./DEMO.md). That doc
also sketches a proposed *auto-mount host* that mounts fs caps arriving
in messages and replies with their mountpoint.

## Expected `Filesystem` compatibility

> **Status: expected, not test-verified.** The tables below are derived
> from reading [`src/server.js`](./src/server.js) and the
> `@endo/platform/fs/extended` backends, *not* from integration tests.
> The only path exercised by `test/server.test.js` today is the
> in-memory backend. Treat the rest as the intended contract pending a
> backend-parametrised test matrix (see "Known gaps").

### Mountability by fs object

The bridge consumes the `@endo/platform/fs/extended` `Filesystem` exo
only. Other fs shapes reach it (or not) as follows:

| fs object | Mountable | How |
|---|---|---|
| `makeNodeFilesystem({ rootPath })` | expected ✅ direct | highest fidelity (real stat / atomic rename / real fsync / ranged I/O) |
| `makeInMemoryFilesystem()` | expected ✅ direct | ephemeral; vat-local timestamps |
| `readOnly` / `compose` (CoW) / `chroot` / `bind` / `namespace` / `cached-fs` wrappers | expected ✅ direct | each returns a `Filesystem` |
| daemon **`Mount`** (`packages/daemon/src/mount.js`) | expected ✅ via adapter | `mountAsFilesystem` (`from-mount`) |
| daemon **`ReadableTree`** (immutable snapshot) | ❌ not yet | `from-readable-tree.js` is roadmap **F6, open** |
| the other `@endo/platform/fs` interface (`File` / `Directory` / `SnapshotTree`) | ❌ | different contract; no adapter ships |

### Behavior ceiling — expected for every backing

These are limits of the 9P server plus the base `Filesystem`, so no
choice of backing changes them:

| 9P op / feature | Expected behavior | Source |
|---|---|---|
| `Tattach`, `Twalk`, `Tlopen`, `Tread`, `Twrite`, `Treaddir`, `Tmkdir`, `Tunlinkat`, `Trenameat`, `Tclunk`, `Tflush`, `Tstatfs` | supported | `src/server.js` dispatch |
| `Tgetattr` | size + a/m/c/btime real; **mode synthesized** `0o755`/`0o644`, uid/gid `1000`, nlink `1` | `server.js:611` |
| `Tsetattr` size / atime / mtime | forwarded to `setAttrs` | `server.js:901` |
| `Tsetattr` mode / uid / gid (chmod / chown) | **silently ignored** | `server.js:886` (read off the wire, discarded) |
| `Txattrwalk` (xattrs) | `ENOSYS` (vat-local `user.*` sidecar not exposed) | `server.js:264` |
| `Tlock` / `Tgetlock` (byte-range locks) | not implemented | — |
| `Tsymlink` / `Tmknod` (symlinks, device nodes) | not implemented (tree-shaped base) | — |
| `Tauth` | `ENOSYS` (the cap is the authority; mount `access=any`) | `server.js:232` |

`readOnly(fs)` additionally rejects every mutating op; the mounting
process sees `EACCES`.

### Variance by backing — expected

Driven by which optional `FsBackend` methods each implements
(`getStat` / `fsync` / `rename` / range I/O); `wrapBackend` synthesizes
the rest:

| behavior | `node-fs` | `in-memory` | daemon `Mount` (`from-mount`) |
|---|---|---|---|
| `ls -l` timestamps | real disk (`getStat`) | vat-local | vat-local (no `getStat`) |
| `rename` (`Trenameat`) | atomic (`fs.rename`) | atomic (Map swap) | via `Mount.move` |
| `fsync` durability | real | no-op | no-op |
| range `Tread`/`Twrite` | true ranged | true ranged | read-whole-then-slice / write-whole, O(filesize)×1.33 |
| persistence | on disk | ephemeral | the Mount's backing store |

`PosixFs` (roadmap F15) would lift the ceiling — real mode/uid/gid,
real `flock`/`fcntl`, native xattrs — but it is scaffolded only and
**not wired into the 9P server**, so none of that is reachable today.

### Known gaps

- No backend-parametrised conformance test for the 9P surface; the
  backings are exercised only by the in-memory suite, **except**
  `Tlcreate`, which now has a node-fs regression test (it caught a
  create-vs-lookup race that ENOENT'd `echo x > newfile.txt` on disk
  backings — see [`DEMO.md`](./DEMO.md) § "Fixed issues"). The rest of
  the matrix above is still unverified on disk / Mount backings.
- `from-readable-tree.js` (F6) is unimplemented, so daemon
  `ReadableTree` snapshots cannot be mounted.
- `PosixFs` is not composed into the bridge; chmod/chown/xattrs/locks
  are no-ops or ENOSYS regardless of backing.

## Tests

```sh
yarn workspace @endo/9p-server test
```
