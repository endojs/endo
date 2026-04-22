_Note for future readers_:
this document is the initial design for the "genie in a bottle" deployment
story — a remote Endo daemon hosting a root `@endo/genie` agent with an
invite-back path to the operator.
It is derived from the sketch in `TODO/90_genie_in_bottle.md` plus research
reported by the explore agents on 2026-04-21.
No code has been written yet.

# Genie in a Bottle: Remote Daemon + Root Genie Deployment

## Goal

Stand up `@endo/genie` on an arbitrary SSH-accessible host (bare metal,
systemd capsule, container, or micro-VM) with the smallest number of
user-visible steps and have the operator's own daemon linked back via an
invite/accept handshake.

"Genie in a bottle" = one daemon per host, with a single root genie agent
that fully owns it, and a CapTP edge from that daemon back to the
operator's local daemon.

## Non-goals

- Multi-tenant daemons.
  Each "bottle" holds one genie, and the operator invited in is assumed
  trusted.
  A shared/hosted genie service is a separate design.
- Secret management beyond what the operator supplies via env.
  `GENIE_MODEL` credentials (API keys, local Ollama URLs, etc.) are
  provisioning-time inputs, not rotated by the bottle.
- Unattended install of Node.js / yarn / systemd.
  The bottle assumes a minimally-provisioned host.
  The design names where those prerequisites land but does not automate
  their installation.
- Replacing the dev-repl or in-process genie loop.
  Remote-mode dev-repl
  (see [`genie_loop_remote.md`](./genie_loop_remote.md))
  is the likely client once this bottle exists, but the bottle itself
  only cares about mail-level reachability.

## Current state (2026-04-21)

Drawn from `TODO/90_genie_in_bottle.md`, the genie package, and the
daemon + CLI packages.
What already works vs what is missing:

| Concern            | Today                                                                                                      | Gap for "genie in a bottle"                                                                |
|--------------------|------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| Daemon bootstrap   | `endo start` forks a detached `daemon-node.js` (see `packages/daemon/index.js:443` and `daemon-node-powers.js:129`) | No systemd integration (no `sd_notify`, no `Type=notify`, no socket activation, no unit file generator) |
| Install            | `@endo/cli` is the only `bin` publisher; all packages build with `exit 0`; no native deps                  | Monorepo is `private: true`; `yarn global add <repo>#<branch>` path is untested and not documented |
| Networking         | TCP (`networks/tcp-netstring.js` + store `tcp-listen-addr` + `NETS.tcp`) and libp2p (`networks/setup-libp2p.js`) both supported | Sketch only names the TCP recipe; libp2p is strictly better for NAT-bound remote hosts |
| Genie provisioning | `yarn setup` runs `endo run --UNCONFINED setup.js --powers @agent` with `GENIE_MODEL`/`GENIE_WORKSPACE` env (setup.js:22–70) | The `setup-genie` guest is a sandbox for the form-submission workflow; it is _not_ a privileged root genie agent |
| Owner invite       | `endo invite <name>` and `endo accept <name>` are wired end-to-end (`cli/src/commands/{invite,accept}.js`, `host.js:793`) | No convention for "the invitee is the operator who should own this daemon" |
| Workspace          | Genie tools enforce workspace root; genie writes `HEARTBEAT.md`, `MEMORY.md`, `.genie/` etc.               | No default path on a remote host; sketch proposes `$XDG_RUNTIME_DIR/endo/genie/workspace` which is wrong (runtime dir is tmpfs; workspace must be persistent) |

## Proposed architecture

The deployment is a composition of five independent concerns that each
map onto existing Endo primitives where possible.
Each concern has a target UX line; the operator experience is the sum
of those lines.

### 1. _where_ — the bottle surface

Target URL forms, in order of ambition:

1. `user@host` — plain SSH, Endo lives under the user's `$HOME`.
2. `user@host:path/to/workspace` — override the genie workspace.
3. Capsule / nspawn / incus / firecracker wrappers — see
   [§ Isolation layers](#isolation-layers) below.

The bottle script never assumes it is root.
Everything lands under the invoking user's XDG directories, and
host-level isolation (capsule, container, VM) is the operator's
responsibility to set up _once_, then invoke the bottle script inside.

**Default workspace**: `$XDG_DATA_HOME/endo/genie/workspace`
(_not_ `$XDG_RUNTIME_DIR`).
`$XDG_RUNTIME_DIR` is tmpfs on most systemd systems and is cleared
on logout; genie expects the workspace to survive reboots.

### 2. _install_ — putting `endo` on PATH

Precedence:

1. If `endo` is already on PATH and version-compatible, use it.
2. Else, try `corepack` + `yarn global add
   github:endojs/endo#<branch-or-tag>`.
   Open question:
   the repo root is `"private": true` and the only publishable `bin` is
   `@endo/cli`, so a top-level install may fail to link the `endo` bin.
   **Action item**: validate `yarn global add
   github:endojs/endo#master` in a clean VM and document the outcome.
   Likely we need either:
   - a `bin` passthrough at the workspace root,
   - a published `@endo/cli` tarball on npm (preferred long-term), or
   - a bootstrap script that clones + runs `yarn install` + symlinks
     `packages/cli/bin/endo` into `~/.local/bin`.
3. Else fall back to a from-source bootstrap: `git clone`, `corepack
   yarn install`, `PATH=$PWD/packages/cli/bin:$PATH`.

The bottle script emits one of those three states to the operator so
they know which path was taken.
We do not try to reconcile Node.js version mismatches automatically;
`nvm` / `fnm` / `mise` are prerequisites the operator owns.

### 3. _start_ — the daemon

Phase A — _today_: `endo start` is invoked directly.
The forked daemon detaches and writes its PID to
`$XDG_RUNTIME_DIR/endo/endo.pid`; the bottle script sanity-checks
readiness via `endo ping`.
This is enough to unblock the rest of the design.

Phase B — _systemd user unit_ (opt-in, best-effort):
Generate
`$XDG_CONFIG_HOME/systemd/user/endo.service`
with `Type=simple`
and `ExecStart=/usr/bin/env endo start --foreground`, where
`--foreground` is a new CLI flag that runs the daemon in the current
process instead of re-forking.

Then:

```
systemctl --user daemon-reload
systemctl --user enable --now endo.service
```

Also best-effort:

- `loginctl enable-linger $USER` — keep the user manager up after
  logout. If it fails (e.g. unprivileged), warn the operator.
- Wanting `endo.service` from `default.target` at the _system_ level
  requires root; we do not attempt it. We instead tell the operator
  to enable linger so the per-user `default.target` pulls us in.

Phase C — _`sd_notify` readiness and socket activation_ (future work):

- Daemon calls `sd_notify("READY=1")` after the gateway and Unix
  socket are listening (`daemon-node-powers.js:194`).
  Cuts the `ping`-polling dance out of the bottle script.
- Daemon honors `LISTEN_FDS` so systemd can hand it an already-bound
  Unix socket; makes socket activation possible.
- `Type=notify` in the unit. Requires phase C landed.

Phase C work is called out here so phase B does not paint us into a
corner (e.g. we should land `--foreground` before generating the unit
so there is nothing to unwind later).

### 4. _turnup_ — networking + root genie

#### Networking

Decision: **default to libp2p, fall back to TCP on operator request.**

Rationale: the bottle is most valuable on remote hosts behind NATs.
libp2p's circuit-relay-v2 + WebRTC bootstrap does not require a
reachable public port, while TCP demands either a public IP or an
operator-maintained port forward.
`MULTIPLAYER.md:128–173` already documents libp2p as the recommended
cross-network transport.

libp2p turnup (one command):

```
endo run --UNCONFINED packages/daemon/src/networks/setup-libp2p.js \
  --powers @agent
```

This `makeUnconfined`'s the libp2p module under `@agent`, names it
`network-service-libp2p`, and moves it to `NETS/libp2p`
(`setup-libp2p.js:16-26`).
No store step, no port decision, no host decision.

TCP fallback (the sketch's original recipe):

```
endo store --text "$ENDO_LISTEN" --name tcp-listen-addr
endo make --UNCONFINED packages/daemon/src/networks/tcp-netstring.js \
  --powers @agent --name network-service
endo mv network-service NETS.tcp
```

Pick via `--transport=tcp|libp2p|both` on the bottle script.
`both` is legal and sometimes desirable (`MULTIPLAYER.md:168–172`):
the invitation locator aggregates `at=` params across all active
transports, and the acceptor tries them in order.

#### Root genie vs setup-genie

The sketch asks for "elevated powers since this daemon is here to be
fully owned and operated by this root genie agent."
This is the part of the design that most needs clarification with the
humans — see [§ Open questions](#open-questions).
Starting point:

Today `setup.js` creates a `setup-genie` guest with `@agent`
introduced as `host-agent` (setup.js:28–32) and launches `main.js`
under that guest.
The child agents that `main.js` provisions are _confined_ —
they only get `workspace-mount`.

For a "bottle-owning" genie we need one of:

- **Option R1.** `setup-genie` _is_ the root genie. Skip the child-agent
  provisioning step, or have `setup.js` submit its own form so that
  `setup-genie` runs the piAgent loop directly.
  - Pros: no new capability grants; the `@agent` introduction already exists.
  - Cons: `setup-genie` was designed to be a provisioner, not a conversational
    agent; its tool surface and prompt are shaped for form-watching, not
    piAgent rounds.

- **Option R2.** Introduce a third flavor of genie guest (call it `root-genie`)
  that is provisioned by `setup.js` with `@agent` and `@host` introduced, runs
  a normal piAgent loop (like a `main-genie` child), and is the one the owner
  invite is bound to.
  - Pros: clean separation, keeps `main-genie` confined behavior unchanged.
  - Cons: new guest flavor; needs its own form fields or a short- circuited
    bootstrap.

- **Option R3.** Leave guest provisioning alone but have the bottle script call
  `endo invite owner` from the _host_ level, and document that the owner's
  handle in the bottle daemon's pet store _is_ the ownership token. Any tool
  that needs to give the owner more power does so by sending capabilities over
  that CapTP edge.
  - Pros: avoids re-architecting genie; matches the existing invite/accept
    semantics (which already give the acceptor a peer host handle, equivalent
    to `@host` on that remote daemon).
  - Cons: owner ownership is implicit; no single "this genie is the boss"
    capability on the remote side.

**Recommendation**: combine R2 and R3.
`setup.js` grows an `--owner` flag that, when present:

1. Provisions a `root-genie` guest with both `@agent` and `@host`
   introduced (clear naming: this is _the_ agent, not just an agent).
2. Configures it with a distinctive system prompt describing its
   ownership role.
3. Emits an `endo://` invitation locator for the operator to paste
   into their local daemon's `endo accept`.

### 5. _invite_ — owner handshake

Once networking is up, `endo invite owner` prints a locator to stdout
(`cli/src/commands/invite.js:8-11`).
The operator runs `endo accept <bottle-label>` on their local daemon
with that locator piped in.
After that:

- Operator's pet store: `<bottle-label>` → remote root-genie handle
  (equivalent to remote `@host`).
- Bottle's pet store: `owner` → operator's local host handle.

From this moment on:

- The operator's daemon can send mail, share values, and resolve
  requests against the bottle.
- The bottle's root genie can do the same in reverse (this is what
  makes R3 work without more plumbing).

We need a small convention to avoid footguns:

- The bottle script prints the locator with a copy-paste-ready
  multi-line banner rather than bare stdout, so SSH-session
  scrollback doesn't eat it.
- The bottle emits an explicit "waiting for owner…" readiness
  signal (maybe `followMessages` tailing for the first message
  `from=<owner handle>`) so the operator can know when the edge is
  live.

## Deployment scenarios (MECE)

Per the sketch's step 1, four bottle shapes.
Each just composes the phases above, varying mostly in the "where"
and in what prerequisites the operator has arranged.

1. **Plain SSH, user session.**
   Simplest.
   `ssh user@host -- endo-genie-in-a-bottle <args>`.
   The bottle script runs entirely under `$HOME`.
   Daemon lives as long as the SSH session unless linger is enabled
   or the systemd user unit is used.
   - **NOTE** this could also be a locally added alternate user, operator could:
     1. run classic `useradd`
     2. configure resource limits in something like `/etc/systemd/system/user-$UID.slice.d/override.conf`
     3. enable user linger via `loginctl`
     4. run `systemctl start user@$UID.service` to start a background session for the new user
     5. run `systemctl add-wants default.target user@$UID.service` so that such session starts after system reboot
       - alternately run `systemctl add-wants user@$MAIN_UID.service user@$ALTER_UID.service` ...
       - ... to instead link auto launching of an alter user to its main owning user logging in
   - **NOTE** this can also potentially generalize to other Operating Systems and/or init implementations other than systemd

2. **systemd-capsule (systemd 256+).**
   `systemctl start capsule@genie.service` pre-creates a scoped user
   manager with `DynamicUser=1` and home at
   `/var/lib/capsules/genie`.
   Then `ssh -C genie@host` (or the new `-C` flag on systemd tools)
   drops into that scope and the same bottle script runs there.
   No need for linger — the capsule manages its own lifecycle.

3. **Container (incus/podman/docker).**
   Operator arranges a rootless container with Node available.
   Bottle script runs inside; `endo start` binds to the container's
   Unix socket; libp2p is strongly preferred (container NAT).
   The container's filesystem _is_ the workspace; no extra isolation
   beyond what the container provides.

4. **Micro-VM (firecracker, cloud-hypervisor, etc.).**
   Same as container from the bottle script's perspective.
   Differences are entirely operator-side (provisioning the VM).

### Example systemd resource limit override

Relevant to plan local alternate user accounts, an maybe also systemd-capsule,
this example sets limits to:
- 4 cpu core virtual quota
- 8G memory and swap limit
- limited task count, e.g. to contain classic fork-bomb behavior
- denied access to typical IPv4 LAN ranges

```
[Slice]
CPUQuota=400%
MemoryAccounting=on
MemoryMin=2G
MemoryHigh=4G
MemoryMax=8G
MemorySwapMax=8G
TasksAccounting=on
TasksMax=1024
IOAccounting=on
IPAccounting=on
IPAddressDeny=192.168.0.0/16
IPAddressDeny=172.19.0.0/16
```

## Isolation layers

These are the _operator's_ concern, but the bottle script should
emit guidance when it detects common shapes:

| Layer          | What it gives you                                       | What the bottle script does                                      |
|----------------|---------------------------------------------------------|------------------------------------------------------------------|
| Nothing        | Nothing; genie has the user's home dir                  | Warn. Suggest capsule or container.                              |
| systemd-capsule| Dynamic user, per-scope home, `systemctl -C genie`      | Use `systemctl --user` as normal; linger not needed              |
| Container      | FS + process isolation                                  | Install inside container; expose no ports; libp2p default         |
| Micro-VM       | Kernel isolation                                        | Same as container                                                |

## Implementation phases

All phases independently mergeable; each leaves the tree in a
working state.

### 1. **Phase 0: bottle script as a dumb shell recipe.**

- Add `packages/genie/scripts/bottle.sh` that assumes `endo` on PATH
- runs `endo start`
- picks a transport
- runs genie `setup.js` with an `--owner` flag
- prints the invite locator

* No systemd
* No install
* Proves the composition works.

### 2. **Phase 1: `--owner` flag in `setup.js`.**

Implements R2 above: provisions a `root-genie` guest with
`@agent` + `@host`, configures it, emits an invitation.

### 3. **Phase 2: install story.**

- Validate `yarn global add github:endojs/endo#<rev>` in a clean VM
- Pick one of: workspace-root `bin`, npm publish, or bootstrap-clone script
- Document in `packages/genie/README.md`

### 4. **Phase 3: `endo start --foreground`.**

- Daemon can run in the foreground without forking.
- Prerequisite for any systemd unit that uses `Type=simple`.

### 5. **Phase 4: systemd user unit generator.**

`endo-genie-in-a-bottle --systemd`
- writes the unit under `$XDG_CONFIG_HOME/systemd/user/`
- runs `systemctl --user enable --now endo.service`
- tries `loginctl enable-linger`
- reports results

### 6. **Phase 5: `sd_notify` + `Type=notify` + socket activation.**

- Daemon signals readiness and optionally receives a pre-bound socket.
- Drop the `ping`-polling from the bottle script.

## Open questions — Updated With Feedback

These are the things I want to confirm with the humans before
implementation begins.

1. **What does "fully owned and operated by this root genie agent"
   mean concretely?**
   Option R1 vs R2 vs R3 above are three different answers.
   The design currently recommends R2+R3.
   Is that the right shape, or is R1 (just promote `setup-genie`)
   preferred for its simplicity?
   - **Answer** you've convinced me that your R2+R3 recommendation seems
     sensible, let's go with that, revamp the design around that path, and I'll
     review before implementation
   - **Answer extended** note this also has overlap with number 3 below, when I
     talk about how there needs to be a pre-LLM-model-selection fallback,
     basically a primordial genie that aids with its own model selection and
     credentialing; such primordial genie may take on additional low level
     reliability/deployment concerns as they come up going forward

2. **Do we care about the "same host, second daemon" use case?**
   `MULTIPLAYER.md` supports it via `ENDO_SOCK` / `ENDO_ADDR` /
   XDG overrides.
   If the bottle script must be safe to run on the operator's own
   box, it needs to check and refuse (or silently use an alternate
   state tree).
   - **Answer** yes we care about this, especially for "same host, different
     user(s), additional daemon(s)" ; probably also the systemd capsule case,
     unless capsules get a private network interface?

3. **How should `GENIE_MODEL` credentials arrive at the bottle?**
   Env via `ssh -E`? Pre-seeded file? Owner passes them over CapTP
   after the handshake?  The last option is most capability-native
   but requires `setup.js` to wait for a post-invite configuration
   message.
   - **Answer** let's just go with the capability-native path, so what we'll
     need to provide a fallback non-LLM driven message processing automaton
     that assists with such low level tasks as model discovery, selection, and
     passing credentials for model providers. Much of this can probably be done
     under a new special `/model` builtin command, but we should/could still
     have a fallback message parser/responder based on classic pre-LLM methods
     to lightly guide the owner thru early setup.

4. **Is `yarn global add github:endojs/endo#<rev>` a supported path
   we want to commit to, or do we want to publish `@endo/cli` to
   npm and install from there?**
   This is a release-engineering question as much as a design
   question.  The bottle design does not depend on the answer;
   it only depends on _some_ answer existing.
   - **Answer** yes we'll just go with yarn-global for now, but also have the
     ability to push a git repository in during bottle setup; basically bottle
     running in "use my dev repo where we're running from, but push a copy into
     the bottle to use"

5. **Do we need a transport preference beyond `libp2p | tcp | both`?**
   e.g. is there a case for tailscale, wireguard, or a Unix-domain
   relay?  Default to no for now.
   - **Answer** so tailscale and wireguard yes, make notes and affordance for
     those since they can work with our existing tcp netlayer; if endo has a
     netlayer for unix domain socket, or even just anonymous reader/writer pipe
     handles, then we could use those also; imagine doing like git-push and
     git-pull do, and just using ssh as the netlayer, by handing off to a
     receiving `endo ...` command on the other side via stdin/stdout piping
     thru ssh

6. **Should the invitation locator be emitted on stdout or written
   to a file?**
   Stdout is friendlier to SSH piping; a file is friendlier to
   detached systemd services.  Probably both, controlled by a flag.
   - **Answer** yes both, write the pending invitation to a workspace file like
     `PENDING_OWNER_INVITE`, which we can and should remove after the invite
     has been accepted

### Other Feedback

**Answer** we do not need to add a `--foreground` flag to `endo start`; there
is already an `endo run-daemon` specifically for things like systemd unit entry.

## References

- Sketch: [`TODO/90_genie_in_bottle.md`](../TODO/90_genie_in_bottle.md)
- [`packages/daemon/MULTIPLAYER.md`](../packages/daemon/MULTIPLAYER.md)
- [`packages/genie/setup.js`](../packages/genie/setup.js) — genie
  provisioner today
- [`packages/daemon/src/networks/setup-libp2p.js`](../packages/daemon/src/networks/setup-libp2p.js)
  — libp2p run-and-register pattern
- [`packages/daemon/src/networks/tcp-netstring.js`](../packages/daemon/src/networks/tcp-netstring.js)
  — TCP transport
- [`packages/daemon/src/host.js`](../packages/daemon/src/host.js)
  § `invite` / `accept` (lines 793–899)
- [`PLAN/genie_loop_remote.md`](./genie_loop_remote.md) — what will
  consume the bottle from the operator's side once it exists
