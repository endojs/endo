# Demo: mount a remote daemon's filesystem over iroh + 9P

This walks through projecting a `Filesystem` capability held by one Endo
daemon into the Linux kernel of another machine, dialed over iroh
(peer-to-peer, no open ports). The `Filesystem` cap travels
`server → laptop` over CapTP; the 9P bridge and the kernel `mount` run on
`laptop` (the machine whose kernel mounts), holding a *remote presence*
of the server's cap.

> Status: this is a recorded runbook, **not** an automated test. The
> commands are accurate against the CLI and caplets on this branch but
> have not been wired into CI. See the compatibility caveats in
> [`README.md`](./README.md) § "Expected `Filesystem` compatibility".

## Roles

- **`server`** — the remote daemon holding the files (e.g. `/srv/data`)
  and printing the invitation.
- **`laptop`** — where the files should appear at `/mnt/endo`.

Both machines need an Endo repo checkout (several commands reference
caplets by repo-relative path). To run both daemons on one box, use the
`XDG_*` / `ENDO_SOCK` alias trick in
[`MULTIPLAYER.md`](../daemon/MULTIPLAYER.md) § "Single-Machine Setup".

## Part A — the remote `server` daemon

### A1. Install + start

```bash
server$ git clone https://github.com/endojs/endo-but-for-bots && cd endo-but-for-bots
server$ npx corepack yarn install
server$ yarn exec endo start
server$ yarn exec endo ping        # -> ok
```

### A2. Enable iroh networking

```bash
server$ yarn exec endo run --UNCONFINED \
  packages/daemon/src/networks/setup-iroh.js --powers @agent
# -> "iroh network installed at @nets/iroh"
```

Binds an in-memory iroh endpoint, derives a stable Ed25519 NodeId, and
registers the transport at `@nets/iroh`. No open ports; iroh discovery +
relays handle NAT traversal (needs outbound internet). Relies on the
optional `@number0/iroh` native binding.

### A3. Expose a directory as a `Filesystem` cap

The shipped `node-fs-module.js` caplet reads `ENDO_FS_ROOT` and returns a
`makeNodeFilesystem({ rootPath })` — the highest-fidelity backing for 9P
(real stat, atomic rename, real fsync, ranged I/O):

```bash
server$ yarn exec endo make --UNCONFINED \
  packages/platform/src/fs/extended/node-fs-module.js \
  --powers @none \
  -E ENDO_FS_ROOT=/srv/data \
  --name workspace-fs
# read-only export: also pass  -E ENDO_FS_READ_ONLY=1
```

### A4. Invite the host — print the invitation code

```bash
server$ yarn exec endo invite host
```

Prints the `endo://` **locator** (the invitation code). With iroh
enabled it carries an `iroh+captp0://<NodeId>` address:

```
endo://<key>?id=<n>&from=<n>&at=iroh%2Bcaptp0%3A%2F%2F<nodeid>...
```

Copy the whole string to `laptop`. It is a pairing locator, not a secret
cap. This creates a guest named `host` representing `laptop`.

### A5. Share the cap (after `laptop` accepts, B2)

```bash
server$ yarn exec endo send host 'workspace fs @workspace-fs'
```

## Part B — the local `laptop` daemon

### B1. Install, start, enable iroh (same as A1–A2)

```bash
laptop$ git clone https://github.com/endojs/endo-but-for-bots && cd endo-but-for-bots
laptop$ npx corepack yarn install
laptop$ yarn exec endo start
laptop$ yarn exec endo run --UNCONFINED \
  packages/daemon/src/networks/setup-iroh.js --powers @agent
```

### B2. Accept the invitation

```bash
laptop$ echo 'endo://<key>?id=...&at=iroh+captp0://...' \
  | yarn exec endo accept server
```

Now `laptop` has a peer `server`, and `server` has `host` → `laptop`. A
CapTP session is live over iroh.

### B3. Adopt the remote `Filesystem` cap

```bash
laptop$ yarn exec endo inbox                       # note the message number, e.g. 1
laptop$ yarn exec endo adopt 1 workspace-fs --name remote-fs
```

`remote-fs` now resolves — through the iroh peer connection — to the
server's live `Filesystem`. (Pull-style alternative: `endo request
'workspace fs' -t server` on laptop, then `endo resolve <msg#>
workspace-fs` on server.)

### B4. Install the mount caplet

```bash
laptop$ yarn exec endo make --UNCONFINED \
  packages/9p-server/mount-caplet.js \
  --powers @none \
  -E NINEP_SUDO=1 \
  --name fs-mounter
```

`-E NINEP_SUDO=1` routes through `sudo mount` / `sudo umount` (the daemon
worker is not root). You need passwordless sudo for those binaries:

```
youruser ALL=(root) NOPASSWD: /usr/bin/mount, /usr/bin/umount
```

### B5. Mount

```bash
laptop$ yarn exec endo eval 'E(m).mount(fs, "/mnt/endo")' \
  m:fs-mounter fs:remote-fs --name endo-mount
```

`/mnt/endo` now shows the server's `/srv/data` to any process. Options go
in a third arg (`E` and `harden` are available in `endo eval`):

```bash
# read-only:
laptop$ yarn exec endo eval 'E(m).mount(fs, "/mnt/endo", harden({ readOnly: true }))' \
  m:fs-mounter fs:remote-fs -n endo-mount
```

### B6. Unmount

```bash
laptop$ yarn exec endo eval 'E(h).unmount()' h:endo-mount   # this mount
laptop$ yarn exec endo cancel fs-mounter                    # or: tear down all mounts
```

## Useful information

- **What works over 9P**: read/write/mkdir/unlink/rename/truncate, `ls`,
  sizes, timestamps. **No-ops regardless of backing**: chmod/chown,
  xattrs, locks, symlinks. See [`README.md`](./README.md) § "Expected
  `Filesystem` compatibility" for the full matrix.
- **Privilege / namespaces**: `mount(2)` needs `CAP_SYS_ADMIN`. Under
  systemd `PrivateMounts`, a `sudo mount` may land in a different mount
  namespace than the daemon — mount from a shell in the daemon's
  namespace, or drop `PrivateMounts`.
- **Latency**: the endo-fs interface pipelines `walk+open+read` into one
  CapTP round-trip, so a kernel mount tolerates the iroh hop; expect
  interactive latency ≈ the iroh path RTT. `cache=loose` (pass
  `extraMountOptions: 'cache=loose'`) helps read-heavy workloads at the
  cost of liveness.
- **Locator**: encodes the inviter's NodeId, host-handle id, and
  transport address(es); with both TCP and iroh enabled it lists all,
  tried in order. Re-run `endo invite host` for a fresh one if paths
  change.

## Fixed issues

- **`O_CREAT | O_TRUNC` on a missing path** (e.g. `echo x > newfile.txt`,
  a single `Tlcreate`) used to create the backend file (0 bytes) but
  return `ENOENT` from the kernel `open()`. Root cause: `onLcreate` in
  [`src/server.js`](./src/server.js) dispatched `lookup(name)`
  concurrently with `create(name)` in one batch, and on a disk-backed
  (`node-fs`) backing the same-turn lookup raced ahead of the async
  entry write and ENOENT'd — while `create` still wrote the file. Only
  the in-memory backend registers entries eagerly, which is why the
  in-memory test suite missed it. Fixed by sequencing the lookup after
  `create` resolves; regression-tested against node-fs in
  `test/server.test.js`.

## Proposed: an auto-mount host

> Status: proposal, not implemented. Recorded here so the demo can grow
> into a one-command experience.

A small unconfined caplet — call it the **mount host** — that turns
"send me a filesystem" into "it's mounted at this path". It composes the
existing pieces (the `fs-mounter` from `mount-caplet.js` plus a guest's
mailbox powers) into an inbox-follow loop, in the same shape as the
`lal` / `fae` agents.

Behavior, per inbound message:

1. Scan the message for attached `Filesystem` caps (edges whose value
   passes a shape probe — `E(cap).__getMethodNames__()` includes
   `root` / `statfs`). Ignore messages with none.
2. For each, derive a deterministic mountpoint under a configured base
   dir, e.g. `${BASE}/${peer}/${edge}` (or `${BASE}/${formulaId}`), and
   call `E(fsMounter).mount(fs, mountPoint, options)` with the host's
   default options (read-only? network profile? lazy unmount?).
3. **On success**, reply to the sender with the mountpoint (and, if
   useful, the socket path) — `E(powers).reply(msgNumber, 'mounted at
   ${mountPoint}')`.
4. **On failure**, reply with the structured error the mount caplet
   already surfaces (`mount` stderr, EBUSY, privilege, etc.).

Lifecycle and config:

- Teardown is already handled: the mount caplet unmounts every live
  mount when its cancellation context fires, so cancelling the mount host
  cleans up the kernel mounts it created.
- Config via the caplet's `env` / a configuration form: base mountpoint
  dir, an allowlist of peers permitted to auto-mount, default mount
  options (`readOnly`, `extraMountOptions`, `lazyUnmount`), and a cap on
  concurrent mounts.
- Idempotency: re-mounting the same `(peer, edge)` should reuse the
  existing handle rather than stack mounts on one path — keep a
  `Map<mountPoint, handle>` and short-circuit.

Open questions: how to name/clean up mountpoints across daemon restarts
(the handles are not persisted); whether to auto-`adopt` the cap or mount
it transiently; and whether the reply should hand back an *unmount*
capability so the sender can release it remotely.
