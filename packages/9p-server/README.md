# @endo/9p-server

A 9P2000.L server that serves an `@endo/endo-fs` `Filesystem` over
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
import { makeInMemoryFilesystem } from '@endo/endo-fs/src/in-memory.js';

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
parallel via `E(intermediate).getQid()` and gathered with
`Promise.allSettled` to support partial-success semantics. Every
lookup `CTP_CALL` in the chain reaches the wire before any
`CTP_RETURN` comes back — the structural pipelining property
proven by `@endo/endo-fs/test/pipelined-rtt.test.js`.

Each `qid` is pipelined alongside the `lookup` that produced its
parent cap (`Promise.allSettled` over the chain), so the qid
discovery shares the same round-trip as the walk. `getQid()` is
sync on the responder but costs one RTT across CapTP — pipelining
it into the same batch is the standard usage (see
`@endo/endo-fs/DESIGN.md` §4.10).

`Tread` against a file uses `OpenFile.read(offset, length)` →
`PassableBytesReader`; bytes flow through `@endo/exo-stream`'s
base64-on-the-wire framing (until CapTP gains native binary).

`Treaddir` drains an `OpenDirectory.list()` `Cursor` once per fid
into a per-fid buffer that's paginated against the kernel's 9P
offset cookie.

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

## Tests

```sh
yarn workspace @endo/9p-server test
```
