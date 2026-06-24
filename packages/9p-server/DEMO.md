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
>
> The Part A / Part B steps below describe the **two-machine, iroh**
> topology. The flow has also been executed **end-to-end on a single
> host** (both daemons on one box) — see
> [§ "Verified single-host run"](#verified-single-host-run), which
> carries CapTP over a loopback-TCP transport instead of iroh and notes
> two environment gotchas (the optional iroh binding, and iroh stream
> stability for two peers behind one NAT).

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

> **Gotcha — the iroh binding may be skipped at install time.**
> `@number0/iroh` is an `optionalDependency` of `@endo/daemon`; if the
> platform-specific prebuilt isn't pulled in by the initial
> `yarn install` (observed on `linux/arm64`), `setup-iroh.js` instantiates
> nothing and `@nets/iroh` never appears. Confirm and, if missing, force
> it explicitly:
>
> ```bash
> node -e 'require("@number0/iroh")'   # should not throw
> # if it throws "Cannot find module":
> yarn add -D @number0/iroh@^1.0.0 @number0/iroh-linux-arm64-gnu@1.0.0
> ```
>
> **Same-host only:** when both daemons share one machine, set
> `ENDO_IROH_PUBLISH_PRIVATE=1` in each daemon's environment *before*
> `endo start` so the iroh endpoint advertises its loopback/private
> address (otherwise the locator only carries the public/relay path,
> which two co-located peers can't usefully use). See the caveat in
> [§ "Verified single-host run"](#verified-single-host-run).

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

`mount(2)` / `umount(2)` need `CAP_SYS_ADMIN`. How you grant it decides
whether you pass `NINEP_SUDO=1`:

**Privileged / root daemon (verified path — containers, dev VMs).** If
the daemon (hence its caplet workers) already runs as root with
`CAP_SYS_ADMIN` — e.g. a `--privileged` container — install the caplet
*without* `NINEP_SUDO`; it then calls `mount` / `umount` directly:

```bash
laptop$ yarn exec endo make --UNCONFINED \
  packages/9p-server/mount-caplet.js \
  --powers @none \
  --name fs-mounter
```

**Unprivileged daemon (typical laptop).** Pass `-E NINEP_SUDO=1` to route
through `sudo mount` / `sudo umount`, and grant passwordless sudo for
exactly those binaries:

```bash
laptop$ yarn exec endo make --UNCONFINED \
  packages/9p-server/mount-caplet.js \
  --powers @none \
  -E NINEP_SUDO=1 \
  --name fs-mounter
```

```
# /etc/sudoers.d/endo-9p
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

## Verified single-host run

The Part A / B flow above targets two machines over iroh. To exercise the
*entire* pipeline on one box — and to sidestep two environment issues
found while doing so — this variant runs both daemons locally and carries
CapTP over a **loopback-TCP** transport instead of iroh. Everything else
(the `node-fs` export, invite/accept, send/adopt, the mount caplet, the
kernel 9P mount) is identical and transport-agnostic.

### Why not iroh here

iroh's handshake, pairing, and cap transfer all succeed on a single host
(with `ENDO_IROH_PUBLISH_PRIVATE=1`, A2) — a one-shot
`E(remote-fs).root()` returns a live `Directory`. But for two peers
behind one NAT, the relay/hole-punched QUIC stream tears down under
sustained traffic (`Error: iroh stream closed` on both daemons), which is
enough to break continuous 9P I/O. On two real machines iroh negotiates a
stable path and this doesn't bite; on one box, use the loopback-TCP
carrier below. (To keep chasing iroh locally, try a direct-only profile —
`presetN0DisableRelay` — so it never falls back to the relay.)

### Two daemons on one box

Per [`MULTIPLAYER.md`](../daemon/MULTIPLAYER.md): the `server` persona
uses the default state tree; the `laptop` persona gets its own via env.
Define a `laptop` helper, then create its dirs:

```bash
laptop() { env XDG_STATE_HOME=/tmp/endo-laptop/state \
  XDG_RUNTIME_DIR=/tmp/endo-laptop/run XDG_CACHE_HOME=/tmp/endo-laptop/cache \
  ENDO_SOCK=/tmp/endo-laptop/endo.sock ENDO_ADDR=127.0.0.1:8921 \
  yarn exec endo "$@"; }
mkdir -p /tmp/endo-laptop/{state,run,cache}
```

### Loopback-TCP transport

`setup-tcp.js` (companion to `setup-iroh.js`) stores a listen address
under the agent pet name `tcp-listen-addr` and registers the repo's
`tcp-netstring` transport at `@nets/tcp`. Install on both daemons; the
default `127.0.0.1:0` auto-assigns a free port:

```bash
server$ yarn exec endo run --UNCONFINED \
  packages/daemon/src/networks/setup-tcp.js --powers @agent
laptop run --UNCONFINED \
  packages/daemon/src/networks/setup-tcp.js --powers @agent   # laptop helper
```

With only `@nets/tcp` registered, `endo invite host` emits a
`tcp+netstring+json+captp0://127.0.0.1:<port>` locator. The remainder is
verbatim Part A3–A5 / B2–B5, using the `laptop` helper for the laptop
persona and installing the mount caplet **without** `NINEP_SUDO` (the
daemon runs as root here — see B4).

### What was verified

Against a `node-fs` export of `/srv/data`, mounted at `/mnt/endo-remote`
on the laptop daemon:

- `ls -la /mnt/endo-remote`, `cat HELLO.txt`, `cat docs/readme.md` — reads
  and directory walks across the CapTP link ✓
- `mkdir /mnt/endo-remote/from-laptop` — propagated to the server's real
  disk at `/srv/data/from-laptop` ✓
- write to an existing file — round-tripped to the server backing ✓

The `O_CREAT | O_TRUNC`-on-new-file failure in
[§ "Fixed issues"](#fixed-issues) was first reproduced through this exact
remote stack; with that commit applied, `echo x > newfile` round-trips
too.

## Variant: adopt the cap into another daemon's inventory (no mount)

Mounting is Linux-only (it needs v9fs + `CAP_SYS_ADMIN`). But the
`Filesystem` cap is useful on its own: a second daemon can hold it in its
inventory and drive it programmatically (`E(fs).root()`, `list()`,
`read`/`write`) over CapTP — including on a host that can't 9P-mount at
all (e.g. macOS). This variant stops at `adopt`; it skips Part B4–B5.

**Reachability decides the dial direction, not the cap direction.** The
acceptor always dials the inviter, but mail (`send`/`adopt`) flows either
way once the session is up. So make the **reachable** side the inviter/
listener regardless of which side holds the cap. Example: a daemon in a
Docker container can reach the host's LAN IP, but the host can't reach
into the container — so the **host** is the inviter/listener and the
**container** (which holds the cap) dials out and then `send`s.

```bash
# 1. On the reachable side (here: the host) — listen on an address the
#    other daemon can actually dial, and invite a guest for it.
host$ endo run --UNCONFINED packages/daemon/src/networks/setup-tcp.js \
  --powers @agent -E ENDO_TCP_LISTEN=192.168.1.105:9200   # host LAN IP
host$ endo invite box                                     # -> locator (tcp+netstring://192.168.1.105:9200)

# 2. On the cap-holder (here: the container's server daemon) — accept,
#    which dials the host, then send the cap back over the session.
box$  endo accept mac < locator.txt                       # peer 'mac' dials 192.168.1.105:9200
box$  endo send mac 'workspace fs @workspace-fs'

# 3. Back on the host — adopt from the inbox into the local inventory.
host$ endo inbox                                          # note the message number, e.g. 79
host$ endo adopt 79 workspace-fs --name container-fs
host$ endo eval 'E(fs).root()' fs:container-fs            # -> Object [Alleged: Directory]
```

`container-fs` now lives in the host daemon's inventory and resolves —
over the network — to the remote backing dir. On Linux you could then
feed it to the mount caplet (B4–B5); on macOS you use it as a capability
only. `setup-tcp.js` is the same companion script from
[§ "Verified single-host run"](#verified-single-host-run); pass
`-E ENDO_TCP_LISTEN=<reachable-host:port>` (or bake a default) so the
locator advertises an address the dialing peer can reach.

> Cross-version note: this was exercised between two daemons on
> *different branches* over `tcp+netstring+json+captp0` — the handshake
> and locator format are compatible across the versions tried here.

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
