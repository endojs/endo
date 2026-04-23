_Note for future readers_:
this document is the design for the "genie in a bottle" deployment
story — a remote Endo daemon hosting a root `@endo/genie` agent with
an invite-back path to the operator.
It was derived from the sketch in `TODO/90_genie_in_bottle.md` plus
research reported by the explore agents on 2026-04-21, then revised
2026-04-22 after the open-questions round of human feedback.
Phase 0 (bottle shell recipe) and what is now Phase 1
(genie-as-`@self` boot collapse) have landed — see
[`TADA/81_genie_bottle_phase0_shell.md`](../TADA/81_genie_bottle_phase0_shell.md)
and
[`TADA/10_genie_self.md`](../TADA/10_genie_self.md) and its
sub-tasks (11–14).
The latter eliminated the form-submission + `setup-genie` guest +
`main-genie` guest stack described in earlier revisions of this
document; the genie now runs as the daemon's `@self` worker
directly.
Phase 2 (primordial genie + `/model` builtin) is the next
unattempted phase;
see [§ Implementation phases](#implementation-phases) for the
ordered backlog.

# Genie in a Bottle: Remote Daemon + Root Genie Deployment

## Goal

Stand up `@endo/genie` on an arbitrary SSH-accessible host (bare metal,
alternate local user, systemd capsule, container, or micro-VM) with
the smallest number of user-visible steps and have the operator's own
daemon linked back via an invite/accept handshake.

"Genie in a bottle" = one daemon per host/user, with a single
**root genie** agent that fully owns it, and a CapTP edge from that
daemon back to the operator's local daemon.

## Non-goals

- Multi-tenant daemons.
  Each "bottle" holds one genie, and the operator invited in is
  assumed trusted.
  A shared/hosted genie service is a separate design.
- Secret management beyond what the operator supplies over the
  CapTP edge after handshake.
  `GENIE_MODEL` credentials (API keys, local Ollama URLs, etc.) flow
  from the owner _through_ the invite edge to a primordial genie,
  not via provisioning-time env;
  see [§ Credentialing](#credentialing-and-the-primordial-genie).
- Unattended install of Node.js / yarn / systemd.
  The bottle assumes a minimally-provisioned host.
  The design names where those prerequisites land but does not
  automate their installation.
- Replacing the dev-repl or in-process genie loop.
  Remote-mode dev-repl
  (see [`genie_loop_remote.md`](./genie_loop_remote.md))
  is the likely client once this bottle exists, but the bottle itself
  only cares about mail-level reachability.

## Current state (2026-04-23)

Drawn from `TODO/90_genie_in_bottle.md`, the genie package, the
daemon + CLI packages, and the Phase 0 + genie-as-`@self` work
already landed.
What already works vs what is missing:

| Concern            | Today                                                                                                      | Gap for "genie in a bottle"                                                                |
|--------------------|------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| Daemon bootstrap   | `endo start` forks a detached `daemon-node.js` (see `packages/daemon/index.js:443` and `daemon-node-powers.js:129`); `endo run-daemon` runs it in-process for init supervisors | No unit file generator; no `sd_notify`; no socket activation |
| Install            | `@endo/cli` is the only `bin` publisher; all packages build with `exit 0`; no native deps                  | Monorepo is `private: true`; `yarn global add <repo>#<branch>` path is untested and not documented; `bottle.sh evoke --install=push` (Phase 0) provides the bring-your-own-repo alternative |
| Networking         | TCP (`networks/tcp-netstring.js` + store `tcp-listen-addr` + `@nets/tcp`) and libp2p (`networks/setup-libp2p.js`) both supported; `bottle.sh invoke --transport=(libp2p\|tcp\|both)` wires them up | No treatment of unix-domain or ssh-pipe netlayers; tailscale/wireguard present as plain TCP over an overlay IP |
| Genie provisioning | `bottle.sh invoke` → `endo run --UNCONFINED setup.js --powers @agent` → `makeUnconfined('@main', main.js, { powersName: '@agent', resultName: 'main-genie', env })`.  The worker owns the daemon's `@self` / `@agent` inbox directly — no `setup-genie` form guest, no intermediate `main-genie` guest.  `GENIE_MODEL` / `GENIE_WORKSPACE` are required env vars validated at worker boot | Still assumes model credentials are in env at turn-up; the invite edge cannot yet hand credentials in post-handshake |
| Owner invite       | `endo invite owner` runs at the host level in `bottle.sh invoke`; locator emitted to stdout _and_ `PENDING_OWNER_INVITE` in the workspace; readiness wait polls `endo inbox` and removes the file on first non-self message | Fine for Phase 0.  Future work: replace polling with `sd_notify` and add structured CapTP ownership metadata rather than relying on "first message from a non-self locator" |
| Workspace          | Genie tools enforce workspace root; genie writes `HEARTBEAT.md`, `MEMORY.md`, `.genie/` etc.  `bottle.sh` defaults to `$XDG_DATA_HOME/endo/genie/workspace` | Root-level workspace-mount pet name (so child agents share a mount) is a future concern; the root `main.js` uses the literal `GENIE_WORKSPACE` path today |

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
host-level isolation (alternate user, capsule, container, VM) is the
operator's responsibility to set up _once_, then invoke the bottle
script inside.

**Default workspace**: `$XDG_DATA_HOME/endo/genie/workspace`
(_not_ `$XDG_RUNTIME_DIR`).
`$XDG_RUNTIME_DIR` is tmpfs on most systemd systems and is cleared
on logout; genie expects the workspace to survive reboots.

**Same-host coexistence.**
The bottle script must run safely next to an operator's existing
daemon, most obviously in the "alternate local user" and
"systemd-capsule" cases.
Concretely that means:

- Always use the invoking user's own `$XDG_*` tree.
  Do not read or write the operator's main-user tree.
- Honor `ENDO_SOCK` / `ENDO_ADDR` overrides if supplied
  (per `MULTIPLAYER.md`), but default to the XDG layout rather than
  hard-coding a path.
- On a TCP turnup, prefer `127.0.0.1:0` and let the OS pick a port so
  two bottles on the same host cannot collide.
  _(Open for capsules: if a capsule eventually carries a private
  network namespace we can revert to a fixed port; today we cannot
  assume that.)_

### 2. _install_ — putting `endo` on PATH

Precedence:

1. If `endo` is already on PATH and version-compatible, use it.
2. **Bring-your-own-repo push.**
   The operator is typically running the bottle script from a dev
   checkout; let them opt in to pushing _that_ checkout over to the
   bottle rather than pulling from GitHub.
   Mechanism: `git` over SSH into the bottle account,
   `git push ssh://user@host:~/endo.git <rev>:refs/heads/bottle`,
   then on the remote side `corepack yarn install` +
   `PATH=$PWD/packages/cli/bin:$PATH`.
   This is the preferred mode for development iteration.
3. Else, try `corepack` + `yarn global add
   github:endojs/endo#<branch-or-tag>`.
   The repo root is `"private": true` and the only publishable `bin`
   is `@endo/cli`, so a top-level install may fail to link the `endo`
   bin.
   We commit to yarn-global for now and accept that we may need one
   of the following fixes before it's reliable:
   - a `bin` passthrough at the workspace root,
   - a published `@endo/cli` tarball on npm (a release-engineering
     decision orthogonal to this plan), or
   - a bootstrap script that clones + runs `yarn install` + symlinks
     `packages/cli/bin/endo` into `~/.local/bin`.
   Phase 2 validates yarn-global in a clean VM and records the
   outcome.
4. Else fall back to a from-source bootstrap: `git clone`, `corepack
   yarn install`, `PATH=$PWD/packages/cli/bin:$PATH`.

The bottle script emits which branch was taken so the operator knows
what's on PATH.
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
with `Type=simple` and
`ExecStart=/usr/bin/env endo run-daemon`.
`endo run-daemon` already exists (`packages/cli/src/endo.js:786`,
"runs the endo daemon directly, no forking around") and is the
supported in-process entry point for init supervisors — no new CLI
flag is required.

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

**Overlay / tunnel transports.**
Tailscale and WireGuard do not need bespoke netlayers — they present
as plain TCP endpoints once the overlay is up, so `--transport=tcp`
with an overlay IP is sufficient.
The bottle script should document this and, when the operator names
`--transport=tailscale|wireguard`, treat those as aliases for TCP
with a hint in the banner that the listen address must be an
overlay IP.

**Two additional netlayers worth exploring (later phases).**
These share a theme — no public port required, no overlay required,
just a byte-stream that the operator already trusts:

- **Unix domain sockets.**
  When both endpoints are on the same host (e.g. two daemons under
  different local users sharing a socket in `/run/endo/` or a
  user-owned directory), a UDS netlayer avoids the TCP loopback
  dance entirely.
- **SSH-piped stdio.**
  Model the shape after `git-upload-pack` / `git-receive-pack`:
  the client runs `ssh user@host endo <gateway-receiver>` and the
  two processes speak the mail protocol over the SSH stdin/stdout
  pair.
  This turns SSH itself into the transport.
  Requires a new receiver command and a corresponding client
  netlayer; tracked as Phase 6 future work.

#### Root genie (the R2b+R3 shape, as landed)

The bottle's genie has to be _the_ agent for that daemon — it owns
the host, speaks to the owner over CapTP, and (over time) takes on
low-level reliability and deployment responsibilities.
Two moves compose to make this work:

- **R2b — the genie _is_ `@self`.**
  Originally drafted as "R2 — a `root-genie` guest with elevated
  introductions" (one level of indirection short of "genie *is*
  `@self`"), the landed design went further.
  `setup.js` is a thin launcher that calls
  `makeUnconfined('@main', main.js, { powersName: '@agent',
  resultName: 'main-genie', env })`; no intermediate `setup-genie`
  or `root-genie` guest exists.
  `main.js` receives the daemon's root host agent as its `powers`
  argument, reads `GENIE_*` configuration from `context.env`, and
  runs the agent loop against `@self` / `@agent` directly.
  See [`TADA/10_genie_self.md`](../TADA/10_genie_self.md) §§ 3a–3d
  for the collapsed boot chain, and
  [`packages/genie/CLAUDE.md`](../packages/genie/CLAUDE.md)
  § "Identity model" / "Boot shape" for the operational contract.
  The single-tenant constraint (no other plugin may claim `@self`
  on the same daemon) is documented in the same file.

- **R3 — the owner handshake carries ownership.**
  The bottle script runs `endo invite owner` from the _host_ level.
  The operator's acceptance installs them as a peer host in the
  bottle's pet store.
  Because genie *is* `@self`, the owner's `endo send <bottle-label>`
  mail lands in the genie's piAgent inbox directly — no per-guest
  addressing.
  The owner can hand capabilities (including model credentials, see
  next section) into the root genie over normal CapTP traffic with
  no extra plumbing beyond standard invite/accept.

Together: R2b gives the bottle a single identified root agent
whose identity is the daemon itself, and R3 gives the owner a way
to drive it.

Retained but dormant: `spawnAgent`, `removeChildAgent`, and
`listChildAgents` still exist in `main.js` as building blocks for
a future child-agent UX the root genie can expose as a capability.
They are not invoked on boot.
See [`TADA/10_genie_self.md`](../TADA/10_genie_self.md)
Clarification 2 for the planned shape.

#### Credentialing and the primordial genie

`GENIE_MODEL` env-var provisioning is wrong for the bottle because
it requires model credentials to exist before the daemon does.
Instead we go capability-native: the operator hands credentials to
the root genie over the invite edge _after_ handshake.

That means the root genie must be bootable in a
"no-model-yet" state.
We introduce a **primordial genie** — a pre-LLM message-processing
automaton that `main.js` runs until a model is configured:

- Reached via a `/model` builtin command on the genie side that
  accepts model-provider discovery, selection, and credential
  values over CapTP.
- Paired with a classic pre-LLM parser/responder that recognizes
  a small set of message shapes ("what models do you support?",
  "use provider X with API key Y", "run a smoke test") and
  guides the owner through early setup without needing an LLM to
  be online.
- Cedes the conversation to the piAgent loop once a model is
  selected and credentialed.

Today `main.js` fails fast if `GENIE_MODEL` is unset; the
primordial-genie work relaxes that to "start in primordial mode,
wait for `/model` over the invite edge".
Persist the selected model + credentials in the workspace
(next to `MEMORY.md`) so a daemon restart re-enters the
piAgent loop without re-prompting the owner.

Over time the primordial genie is the natural home for other
low-level reliability / deployment concerns (restart recovery,
transport reconfiguration, migration) that should work even when
the LLM is unavailable or misconfigured.

### 5. _invite_ — owner handshake

Once networking is up, `endo invite owner` prints a locator to stdout
(`cli/src/commands/invite.js:8-11`).
The bottle emits the locator in two places:

- **Stdout**, with a copy-paste-ready multi-line banner so SSH
  scrollback doesn't eat it.
- **A workspace file**, default `PENDING_OWNER_INVITE` in the
  genie workspace root.
  Friendlier for detached systemd services and for tools that want
  to poll for a fresh locator.
  The bottle removes this file once the owner's `endo accept` lands
  and the first CapTP message arrives — its presence is exactly
  "there is a pending invite" state.

The operator runs `endo accept <bottle-label>` on their local daemon
with that locator piped in.
After that:

- Operator's pet store: `<bottle-label>` → remote root handle, which
  is the bottle daemon's `@self`, which is the genie worker.
- Bottle's pet store: `owner` → operator's local host handle.

From this moment on:

- The operator's daemon can send mail, share values, and resolve
  requests against the bottle.
- The bottle's root genie can do the same in reverse (this is what
  makes R3 work without more plumbing).

The bottle also emits an explicit "waiting for owner…" readiness
signal (likely `followMessages` tailing for the first message
`from=<owner handle>`) so the operator can know when the edge is
live and `PENDING_OWNER_INVITE` has been cleared.

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

   **Alternate local user variant (same host, second daemon).**
   The operator can host a bottle on their own box under a
   separate UID.
   Roughly:
   1. Run classic `useradd` to create the alter user.
   2. Configure resource limits under something like
      `/etc/systemd/system/user-$UID.slice.d/override.conf`
      (see [§ Example systemd resource limit override](#example-systemd-resource-limit-override)).
   3. Enable user linger via `loginctl enable-linger`.
   4. Run `systemctl start user@$UID.service` to start a background
      session for the new user.
   5. Run `systemctl add-wants default.target user@$UID.service` so
      the session starts after system reboot.
      Alternately, run
      `systemctl add-wants user@$MAIN_UID.service user@$ALTER_UID.service`
      to instead link auto-launching of the alter user to the main
      owning user logging in.

   This pattern generalizes to non-systemd inits (launchd, OpenRC,
   etc.); the bottle design names the systemd recipe because it's
   the most common case but the script should not hard-assume it.

2. **systemd-capsule (systemd 256+).**
   `systemctl start capsule@genie.service` pre-creates a scoped user
   manager with `DynamicUser=1` and home at
   `/var/lib/capsules/genie`.
   Then `ssh -C genie@host` (or the new `-C` flag on systemd tools)
   drops into that scope and the same bottle script runs there.
   No need for linger — the capsule manages its own lifecycle.
   _Open:_ capsules today share the host network namespace, so the
   "second daemon on the same host" concerns from § 1 apply;
   revisit if capsules gain a private netns.

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

Relevant to the alternate-local-user scenario and possibly also
systemd-capsule, this example sets limits to:

- 4 virtual CPU cores
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
| Nothing        | Nothing; genie has the user's home dir                  | Warn. Suggest capsule or alternate-user.                         |
| Alternate user | UID boundary + cgroup slice limits                      | Run under that UID; honor XDG; libp2p or TCP-on-loopback:0       |
| systemd-capsule| Dynamic user, per-scope home, `systemctl -C genie`      | Use `systemctl --user` as normal; linger not needed              |
| Container      | FS + process isolation                                  | Install inside container; expose no ports; libp2p default        |
| Micro-VM       | Kernel isolation                                        | Same as container                                                |

## Resolved decisions

Carried over from the open-questions round (2026-04-22 feedback).
Each of these was explicitly confirmed before implementation starts;
the prior options are archived in git history rather than belabored
here.

- **Root genie shape**: R2b + R3 as described in
  [§ Root genie](#root-genie-the-r2br3-shape-as-landed) — genie
  runs as the daemon's `@self` directly (no intermediate guest),
  and the owner attaches over a standard invite/accept edge.
  The primordial genie extends this with a pre-LLM bootstrap path.
- **Same-host coexistence**: yes, supported. See
  [§ 1 _where_](#1-where--the-bottle-surface).
  Especially matters for alternate-local-user bottles and
  (until capsules gain a private netns) for capsule bottles.
- **Credentialing**: capability-native over the invite edge, driven
  by a `/model` builtin on the primordial genie.
  See [§ Credentialing](#credentialing-and-the-primordial-genie).
- **Install path**: yarn-global from GitHub is the committed path
  for now, with a bring-your-own-repo push mode as the preferred
  dev loop.
  See [§ 2 _install_](#2-install--putting-endo-on-path).
- **Transport menu**: libp2p default, TCP fallback, tailscale /
  wireguard as TCP-atop-overlay, and two future netlayers (Unix
  domain socket and SSH-piped stdio).
  See [§ Networking](#networking).
- **Invitation locator**: emitted to _both_ stdout and
  `PENDING_OWNER_INVITE` in the workspace; the file is removed on
  successful accept.
  See [§ 5 _invite_](#5-invite--owner-handshake).
- **Daemon-as-systemd-service**: use the existing `endo run-daemon`
  command as the unit's `ExecStart`; no new `--foreground` flag on
  `endo start` required.
  See [§ 3 _start_](#3-start--the-daemon).

## Implementation phases

All phases independently mergeable; each leaves the tree in a
working state.

### Phase 0: bottle script as a dumb shell recipe

`packages/genie/scripts/bottle.sh` dispatches on two subcommands:

- **`invoke`** — runs _inside_ the bottle.  Assumes `endo` on PATH.
  - Runs `endo start` under the invoking user's XDG paths (no
    throwaway state dir; the daemon is meant to survive the
    script).
  - Picks a transport (libp2p default; TCP fallback).
  - Runs genie `setup.js` to spawn the root genie worker
    under `powersName: '@agent'`, `resultName: 'main-genie'`
    (the R2b shape that landed as Phase 1; no `--owner` flag and
    no stubbing required — see Phase 1 below).
  - Prints the invite locator to stdout _and_ writes
    `PENDING_OWNER_INVITE` in the workspace.
  - Idempotent on re-run: transport turnup is skipped when
    `@nets/<name>` already exists; `endo start` no-ops when a
    daemon is already running.

- **`evoke`** — runs on the _operator's_ workstation.
  - Pushes the local checkout's `HEAD` to a bare repo on the
    bottle host (default: `$HOME/endo.git`), checks it out under
    `$HOME/endo`, runs `corepack yarn install`, and execs into
    `bottle.sh invoke` on that host.
  - `--install=yarn-global` falls back to
    `yarn global add github:endojs/endo#<branch>` on the remote;
    `--install=none` assumes endo is already on the remote PATH.
  - Pass-through args after `--` go straight to the remote invoke.

No systemd, no credential bootstrap, no validated install story
(Phase 3 hardens the install path).
Proves the composition works.
Tracked in [`TODO/81_genie_bottle_phase0_shell.md`](../TODO/81_genie_bottle_phase0_shell.md).

### Phase 1: genie as `@self` (R2b) — **landed**

Originally drafted as "R2: a `root-genie` guest with `@agent` + `@host`
introduced", this phase was replaced by the R2b shape during
implementation: the genie runs as the daemon's `@self` / `@agent`
directly, with no intermediate guest at all.
`setup.js` became a thin launcher that calls
`makeUnconfined('@main', main.js, { powersName: '@agent', resultName:
'main-genie', env })`;
`main.js` reads `GENIE_*` from `context.env`, validates
`GENIE_MODEL` / `GENIE_WORKSPACE`, and runs the piAgent loop against
`@self`.
The owner handshake still comes from Phase 0's `endo invite owner`
call at the host level;
because genie *is* `@self`, the operator's mail lands in the piAgent
inbox directly with no extra plumbing.
See [`TADA/10_genie_self.md`](../TADA/10_genie_self.md) and its
sub-tasks (11–14) for the landed design, code change, narrative
update, and test coverage.

_Deferred under Phase 1_: `spawnAgent` / `removeChildAgent` /
`listChildAgents` retained in `main.js` but not invoked on boot;
see `TADA/10_genie_self.md` Clarification 2.
A future "root genie exposes a child-agent capability" task will pick
those up — it is not blocking Phase 2.

### Phase 2: primordial genie and `/model` builtin (credentialing) — **next**

R3's invite edge is already live after Phase 0 + Phase 1; this phase
is the first thing we run _over_ that edge.

- Pre-LLM message-processing automaton that the root genie worker
  runs until a model is configured (no `piAgent` round-trip, no LLM
  calls).
- `/model` builtin command for model discovery / selection /
  credential ingestion over CapTP.
  Registered in the specials dispatcher alongside `/observe`,
  `/reflect`, `/help`, `/tools` in `main.js`.
- Persist selected model + credentials in the workspace (next to
  `MEMORY.md` / `HEARTBEAT.md`) so a daemon restart re-enters the
  piAgent loop without re-prompting the owner.
- Relax the current `GENIE_MODEL` fail-fast in `main.js` to "start in
  primordial mode when no model is configured (via env or persisted
  state) and wait for `/model` over the invite edge".
- Hand-off to the piAgent loop once a model is selected and
  credentialed — the automaton cedes the conversation and the next
  inbound message goes through `runAgentRound` as normal.

See [`TODO/92_genie_primordial.md`](../TODO/92_genie_primordial.md)
for the in-flight research + design task and its implementation
sub-tasks.

### Phase 3: install story

Phase 0's `bottle.sh evoke` already implements the bring-your-own-repo
push mode (default `--install=push`) and the yarn-global alternative
(`--install=yarn-global`); Phase 3 hardens the latter and picks a
canonical install path we are willing to document to end users.

- Validate `yarn global add github:endojs/endo#<rev>` in a clean
  VM and record whether it links the `endo` bin without the
  repo-root `"private": true` getting in the way.
- Pick one of: workspace-root `bin`, npm publish, or
  bootstrap-clone script, and document the outcome.
- Document in `packages/genie/README.md`.

### Phase 4: systemd user unit generator

`bottle.sh invoke --systemd` (or a sibling `bottle.sh install-unit`
subcommand — decide at task-authoring time):

- Writes the unit under `$XDG_CONFIG_HOME/systemd/user/` with
  `ExecStart=/usr/bin/env endo run-daemon`.
- Runs `systemctl --user enable --now endo.service`.
- Tries `loginctl enable-linger`.
- Reports results.

### Phase 5: `sd_notify` + `Type=notify` + socket activation

- Daemon signals readiness and optionally receives a pre-bound
  socket.
- Drop the `ping`-polling from the bottle script.

### Phase 6: additional netlayers

- Unix domain socket netlayer (for same-host, cross-user bottles).
- SSH-piped stdio netlayer modeled on `git-upload-pack` /
  `git-receive-pack`; requires a receiver-side `endo` command
  that speaks mail over stdin/stdout.

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
- [`packages/cli/src/endo.js`](../packages/cli/src/endo.js) §
  `run-daemon` (line 786) — the in-process daemon entry point
  used by the systemd unit
- [`PLAN/genie_loop_remote.md`](./genie_loop_remote.md) — what will
  consume the bottle from the operator's side once it exists
