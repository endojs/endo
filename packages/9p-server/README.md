# @endo/9p-server

A 9P2000.L server that serves an `@endo/remote-fs` `Filesystem` over
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
import { makeInMemoryFilesystem } from '@endo/remote-fs/src/in-memory.js';

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
`Promise.allSettled` to support partial-success semantics. End
result: an `Twalk → Rwalk` cycle for a deeply-nested path is a
single round-trip against a remote `Filesystem`, not depth+1.

`Tread` against a file uses `OpenFile.read(offset, length)` →
`PassableBytesReader`; bytes flow through `@endo/exo-stream`'s
base64-on-the-wire framing (until CapTP gains native binary).

`Treaddir` drains an `OpenDirectory.list()` `Cursor` once per fid
into a per-fid buffer that's paginated against the kernel's 9P
offset cookie.

## 9P operations implemented

Tversion, Tattach, Twalk (with pipelined lookup + `..` walks),
Tlopen, Tread, Treaddir, Tgetattr, Tsetattr, Tstatfs, Tlcreate,
Twrite, Tmkdir, Tunlinkat, Trenameat, Tclunk, Tflush, Tlerror
emission. Tauth and Txattrwalk return ENOSYS.

## Layout

```
packages/9p-server/
├── README.md
├── package.json
├── src/
│   ├── index.js        re-exports
│   ├── fs-bridge.js    makeFsBridge9p: UDS server wrapping serveConnection
│   ├── server.js       9P2000.L message-driven state machine
│   ├── wire.js         9P message framing + LE primitives
│   └── types.js        T, QT, errno, mode constants
└── test/
    ├── wire.test.js    framing round-trips
    └── server.test.js  full protocol coverage against an in-memory FS
```

## Tests

```sh
yarn workspace @endo/9p-server test
```

17 tests: 4 framing, 13 protocol coverage (Tversion / Tattach /
Twalk single+pipelined / Tlopen+Tread / Treaddir / Tlcreate+Twrite /
Tmkdir+Tunlinkat / Tgetattr / Tclunk / partial-walk success / walk
of missing name → Rlerror(ENOENT) / `..` from root and from
subdir).
