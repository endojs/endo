# Claude Container × Endo Integration

**Status**: Draft v0 — companion to `DESIGN.md`.
**Scope**: How the microVM sandbox described in `DESIGN.md` is presented as
an Endo capability, how a user creates one, and how the resulting Claude
Code instance becomes an addressable object on the Endo network.

`DESIGN.md` covers the host-level orchestrator, microVM image, network
isolation, and protocols.
This document covers the Endo-side surface that sits on top of that
orchestrator: a factory caplet on `@host`, a form for binding a filesystem
capability into a new sandbox, and a `ClaudeClient` exo that wraps
`claude -p` streaming JSON I/O and is reachable over CapTP just like any
other Endo object.

---

## 1. Overview

```
+----------------------------------------------------------------+
|                         Endo Daemon                            |
|                                                                |
|   HOST petstore                                                |
|     ├─ <user-created filesystem caplet>  (e.g. "my-workspace") |
|     └─ claude-container-factory          (this package)        |
|              │                                                 |
|              │  presents form to @host                         |
|              │  fields: name, filesystem, network, ...         |
|              v                                                 |
|       on submission:                                           |
|         1. resolve "filesystem" by pet name → FS capability    |
|         2. open 9P bridge: FS cap ↔ UDS at fsSocketPath        |
|         3. POST /v1/sessions to orchestrator                   |
|         4. wire attach stream                                  |
|         5. wrap stdio in `claude -p --output-format stream-json` |
|         6. store ClaudeClient exo as <name> in @host petstore  |
+--------------|-------------------------------------------------+
               │
               │ HTTP/UDS  (caller ↔ orchestrator API, §6.1 of DESIGN.md)
               │ 9P/UDS    (caller ↔ guest workspace, §5.7 of DESIGN.md)
               v
        +----------------------+
        |  claude-orch daemon  |
        |  (out-of-process,    |
        |   per DESIGN.md)     |
        +----------------------+
```

The orchestrator and the Endo daemon remain separate processes.
The factory caplet is an unconfined Endo guest running inside the Endo
daemon's process space.
It speaks to the orchestrator over the orchestrator's own UDS API
(§6.1 of `DESIGN.md`), and serves 9P back to the guest VM over a
separate UDS that QEMU connects to.

A user never invokes the orchestrator API directly; they hold an Endo
capability (the `ClaudeClient`) and the factory does the plumbing.

---

## 2. Goals and Non-Goals

### Goals

- Expose Claude Code sandboxes as first-class Endo capabilities.
  Holding a `ClaudeClient` is the entire surface needed to talk to a
  running Claude instance — no out-of-band tooling.
- Let any Endo filesystem capability (host directory, in-memory FS,
  remote ocapn FS, derived view) be projected into a sandbox without
  changes to the orchestrator.
- One-shot factory creation via a shell script; subsequent sandboxes
  are created via the form (or programmatically against the factory).
- Keep the orchestrator unaware of Endo — it remains a generic
  microVM service speaking the protocols in `DESIGN.md`.

### Non-Goals (v1)

- A remote-efficient FS protocol.
  v1 bridges arbitrary Endo FS capabilities to 9P at the caplet, which
  is chatty when the FS lives across the network.
  A purpose-built remote FS surface is roadmap (§9).
- Multi-tenancy at the factory level.
  v1 creates one factory caplet per Endo guest; isolation between
  containers comes from the underlying microVM.
- Cross-daemon sharing of `ClaudeClient` instances.
  The exo is reachable over CapTP, so this works incidentally, but no
  effort is made to make handoff survive daemon restarts.
- Credential management.
  v1 inherits whatever credential model the orchestrator's broker
  supplies (§5.5 of `DESIGN.md`).
  An Endo-native credential capability is roadmap (§9).

---

## 3. Threat Model Addenda

`DESIGN.md` §3 models the in-guest adversary.
This document adds three Endo-specific concerns:

- **Caplet compromise**.
  The factory caplet is unconfined and holds: a connection to the
  orchestrator UDS, the FS capability passed at form submission time,
  and the attach stream to a running guest.
  Anyone who can write to the factory caplet's source can compromise
  every sandbox it creates.
  Treat the caplet's source as part of the trusted compute base.
- **FS capability scope**.
  When a user submits the form with a filesystem reference, the
  factory hands that reference to the bridge for the lifetime of the
  sandbox.
  Users should pass the narrowest FS capability they're willing to
  share with Claude — a workspace subtree, not `@host`'s root.
- **Form-replay**.
  Endo forms are addressed by message number on the host's inbox; the
  factory must accept each form-reply only once.
  Re-submission with a stale message id MUST be rejected so a hostile
  actor with mailbox write access cannot smuggle a different filesystem
  reference into an existing session.

The factory caplet does not need any further trust grant from `@host`
beyond what `provideGuest` issues — it cannot, for example, escalate
to other inboxes.

---

## 4. Endo Capability Surface

### 4.1 ClaudeContainerFactory

Pet name: `claude-container-factory` (configurable).

Created by: `scripts/create-factory.sh` (§5).

```js
M.interface('ClaudeContainerFactory', {
  help: M.call().optional(M.string()).returns(M.string()),
})
```

The factory carries no exposed verbs other than `help` — it is driven
entirely by HOST-inbox form submissions.
This mirrors `@endo/fae`'s `llm-provider-factory.js` pattern.

### 4.2 ClaudeClient

Pet name: chosen by the user at form-submission time (e.g. `claude-1`).

```js
M.interface('ClaudeClient', {
  // Send a prompt; resolve to a reader of parsed JSON events
  // (`claude -p --output-format stream-json`).
  send: M.call(M.string())
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.promise()),

  // Interrupt the in-flight prompt without terminating the session.
  interrupt: M.call().returns(M.promise()),

  // Tear down the entire microVM session.
  terminate: M.call().returns(M.promise()),

  // Get a snapshot of session metadata.
  status: M.call().returns(M.promise()),

  help: M.call().optional(M.string()).returns(M.string()),
})
```

Events surfaced through the reader follow the `claude -p` JSON-stream
schema (one JSON object per line: `system`, `assistant`, `user`,
`result`, ...).
Callers consume the reader with `makeRefIterator` from
`@endo/daemon/ref-reader.js`, the same pattern used elsewhere in the
codebase for message followers.

Why mirror `claude -p` instead of a higher-level chat surface: the
`claude -p` JSON protocol is the contract Anthropic ships and the
paseo integration already uses; matching it keeps tool-use semantics,
permission events, and error shapes consistent.

### 4.3 Workspace FS expectations (v1)

The factory accepts any FS capability whose surface is compatible with
the bridge in `src/fs-bridge-9p.js`.
v1 targets the same shape used by `@endo/daemon`'s `makeFileSystem`
powers: `readFile`, `writeFile`, `readDir`, `stat`, `unlink`, `rename`,
`mkdir`.

The bridge translates 9P messages into these calls.
The bridge is intentionally not part of the public capability surface
— it's an internal adapter the factory wires up per-session.

A richer, more efficient FS surface lives on the roadmap (§9).

---

## 5. Setup and Lifecycle

### 5.1 One-time factory creation

```sh
./packages/claude-container/scripts/create-factory.sh
```

Behind the scenes (see the script for the canonical version):

```sh
endo run --UNCONFINED ./setup.js --powers @agent \
  -E FACTORY_NAME=claude-container-factory \
  -E ORCHESTRATOR_SOCKET=/run/claude-orch/api.sock
```

`setup.js`:

1. If `<factory-name>` already exists in HOST's petstore, exit
   idempotently (matches `@endo/fae`'s `setup.js`).
2. Provide a guest named `<factory-name>` with
   `introducedNames: { '@agent': 'host-agent' }`.
3. `makeUnconfined` the factory caplet from
   `src/claude-container-factory.js`, naming the result
   `controller-for-<factory-name>` and binding the orchestrator socket
   path into the guest's environment.

### 5.2 Per-sandbox creation

1. The factory's form lands in `@host`'s inbox on first launch:

   ```
   Create Claude Container
     name        : <pet name for the resulting ClaudeClient>
     filesystem  : <pet name of an FS capability in @host petstore>
     network     : egress | none           (default: egress)
     model       : <claude model id>       (optional)
     initialPrompt: <string>               (optional)
   ```

2. On form submission, the factory caplet:
   - Looks up `filesystem` by pet name on `@host`.
     If absent or not an FS-shaped object, replies to the form with an
     error and leaves no side effects.
   - Generates a session UUID; reserves a session directory.
   - `POST /v1/sessions` to the orchestrator (§6.1 of `DESIGN.md`).
     Receives `{ id, fsSocketPath, attachSocketPath, ... }`.
   - Binds the 9P bridge: serves 9P on `fsSocketPath`, backed by the
     resolved FS capability.
   - `POST /v1/sessions/:id/ready` once the bridge is listening.
   - Calls `E(hostAgent).makeUnconfined('@main',
     claude-client-module, { resultName: name, env: { ... } })` to
     provision a per-session `ClaudeClient` caplet under the requested
     pet name. The caplet's `env` carries `ORCHESTRATOR_SOCKET`,
     `SESSION_ID`, `ATTACH_SOCKET_PATH`, etc. — everything the exo
     needs to lazily connect to the orchestrator on each call.
     Because the exo is a formula of its env, it reincarnates after a
     daemon restart and re-attaches to a still-running session (this
     is the caplet-side half of R4 in §9).
   - Replies to the form with the pet name and a one-line status.

3. The user looks up the pet name and starts chatting:

   ```js
   const claude = await E(host).lookup('claude-1');
   const reader = await E(claude).send('Tell me a story.');
   for await (const event of makeRefIterator(reader)) {
     console.log(event);
   }
   ```

### 5.3 Teardown

`E(claude).terminate()` issues `DELETE /v1/sessions/:id` to the
orchestrator and removes the entry from the petstore.

If the factory caplet dies, in-flight sandboxes remain owned by the
orchestrator (which has its own session table and TTLs per
§11 of `DESIGN.md`).
Re-running `create-factory.sh` after a daemon restart is idempotent
and re-attaches the factory's name to a fresh caplet; existing
`ClaudeClient` exos become unreachable and the user discards them.

Better restart semantics (capability stitching across daemon restarts)
are roadmap (§9).

---

## 6. Wire-up Details

### 6.1 Factory ↔ orchestrator

Plain HTTP/1.1 over UDS, per `DESIGN.md` §6.1.
The factory uses Node's `http` module with a custom `socketPath`.

The orchestrator UDS path is supplied via env (`ORCHESTRATOR_SOCKET`).
The factory has no static configuration beyond this; everything else
flows through the form.

### 6.2 9P bridge

The 9P bridge lives in `src/fs-bridge-9p.js` (skeleton in this
commit).
It is constructed per-session with the resolved FS capability and a
UDS path:

```js
const bridge = makeFsBridge9p({
  fs,                  // ERef<FileSystem>
  socketPath,          // string — path the bridge listens on
});
await E(bridge).start();
// ... session runs ...
await E(bridge).stop();
```

The bridge serves a single 9P2000.L connection (the QEMU side
described in `DESIGN.md` §5.7) and translates each request into one
or more `E(fs).method(...)` calls.
9P chattiness × Endo eventual-send overhead is the dominant cost
component, addressed by the roadmap item in §9.

### 6.3 Attach stream → `claude -p`

The orchestrator's attach UDS frames stdio to the in-guest agent's
tmux session.
The factory writes prompts as `claude -p --input-format stream-json
--output-format stream-json` frames and reads back the JSON event
stream.

The shape of these events is documented at:
`https://docs.anthropic.com/en/docs/claude-code/sdk` (the section on
streaming JSON output).
v1 forwards them verbatim through the reader returned by
`E(claude).send(...)`.

---

## 7. Code layout (this package)

```
packages/claude-container/
├── DESIGN.md                       # microVM sandbox plan (committed first)
├── ENDO-INTEGRATION.md             # this document
├── README.md
├── package.json
├── scripts/
│   └── create-factory.sh           # one-shot factory provisioner
├── setup.js                        # ran by create-factory.sh
└── src/
    ├── claude-container-factory.js # the factory caplet
    ├── claude-client-module.js     # per-session ClaudeClient caplet
    │                               # (loaded by `makeUnconfined`)
    ├── claude-client.js            # ClaudeClient exo constructor
    ├── fs-bridge-module.js         # per-session 9P bridge caplet
    │                               # (loaded by `makeUnconfined`)
    ├── orchestrator-client.js      # HTTP-over-UDS client
    └── fs-bridge-9p.js             # 9P server backed by an Endo FS cap
```

This commit lands the design docs, the shell script, and runnable
skeletons for the four JS modules.
The skeletons compile under `tsc --checkJs` and expose the public
shapes documented above; the bodies are stubbed to the form-handling
loop, with the orchestrator HTTP client and 9P bridge marked TODO
against the milestones in `DESIGN.md` §10.

---

## 8. Open Questions

| Topic | Tentative answer |
|---|---|
| Where do credentials enter the picture? | v1 trusts the broker in `DESIGN.md`. The factory passes through `model`; the API key is the broker's concern. v2 may expose a `ClaudeCredentials` capability. |
| One factory per filesystem, or one factory + many sessions? | One factory, many sessions. Each form submission yields a new `ClaudeClient`. |
| What happens to the FS capability if the user revokes/renames? | Bridge holds the resolved reference; the petstore name decoupling means rename is fine. Revocation should terminate the session — wire to follower hook in roadmap. |
| Should `send()` accept tool capabilities? | v1: no. Tools come from inside the guest (Claude Code's own tool set). v2 could thread Endo capabilities through as MCP-like tools. |
| Does `ClaudeClient` survive daemon restart? | No. The exo lives in the factory's caplet; if the caplet dies the exo is gone. The microVM may survive depending on orchestrator state. Roadmap (§9). |

---

## 9. Roadmap

The items below extend `DESIGN.md` §12 with Endo-integration work.
Status legend: **Done** items are shipped on `master`; **In progress**
have partial work landed; everything else is open.

| Item | Status |
|---|---|
| R1 — Remote-friendly Filesystem capability | **Done** (`@endo/remote-fs` + 9P bridge consumes it) |
| R2 — Native 9P server (Rust) | Open |
| R2a — 9P-over-virtio-serial relay | **Done** |
| R3 — Credential capability | **Done** (`src/claude-credentials-factory.js`) |
| R4 — Restart-survivable ClaudeClient | **Done** (orchestrator persistence + per-session caplets + bridge re-attach) |
| R5 — Tools-as-capabilities (MCP via Endo) | Open |
| R6 — Factory permission scoping | Open |
| R7 — Snapshot/restore integration | Open (depends on `DESIGN.md` v2) |

### R1 — Remote-friendly Filesystem capability  (DONE)

Resolved by `@endo/remote-fs`. The 9P bridge in
`src/9p/server.js` now holds Node caps (`Directory` / `File` from
`@endo/remote-fs`) per fid, walks via a pipelined `lookup` chain,
streams bytes via `@endo/exo-stream`'s `PassableBytesReader` /
`PassableBytesWriter`, and produces qids from the caps' eager
state. Originally, the bridge:

**Problem (resolved)**: v1 adapted a generic Endo FS capability
into 9P at the caplet.
9P performs many small operations per directory traversal (walk +
getattr + readdir + clunk), and each one round-tripped through
CapTP's eventual-send queue.
When the FS capability is local to the caplet's daemon this is
fine.
When the FS sits on a remote daemon (the obvious case for "claude
sees my collaborator's workspace") every walk became O(depth) of
network round-trips.

**Goal**: a `RemoteFileSystem` capability surface designed for
microVM-scale workloads, with at minimum:

- Batched walks: `resolve(rootFid, path[]) → fid` instead of one walk
  per path segment.
- Range reads: `read(fid, offset, length) → bytes`, sized to negotiate
  with 9P `msize`.
- Subtree subscriptions: `watch(fid) → AsyncIterator<change>` so the
  bridge can keep a cache and serve stat/readdir locally.
- An explicit byte-stream variant: `makeWireBridge() → readable +
  writable` byte-streams over which the caplet can splice raw 9P
  frames without re-marshalling.
  This lets a remote daemon expose its filesystem natively as 9P (or
  a successor protocol) and the caplet to simply pipe bytes.

**Acceptance**: median latency of `git status` on a 10k-file workspace
served from a remote daemon is within 2× of the same workspace served
locally.

### R2 — Native 9P server (out of JS)

The JS 9P implementation in `nine-p` (referenced in `DESIGN.md` §5.7)
is fine for correctness but not for throughput.
A Rust implementation, linked the way `packages/daemon`'s endor
supervisor links into Node, would let large reads bypass V8 entirely.
Pair with R1 to make remote-FS performance acceptable.

### R2a — 9P-over-virtio-serial relay  (DONE)

The virtio-console driver only exports user-space file ops; v9fs
`trans=fd` uses kernel-mode read/write and gets "kernel write not
supported for file /vport0pN" if it's handed the virtio-port fd
directly.

Resolution shipped: bootstrap-init forks a tiny relay child that
bridges bytes between the virtio-port fd and one end of a
`socketpair(AF_UNIX, SOCK_STREAM)`; v9fs mounts via `trans=fd`
against the other end. SOCK_STREAM has kernel-mode read/write so
v9fs is happy. Zero kernel patches; preserves the cross-platform
chardev-only design from `DESIGN.md` §5.7.

Verified by `scripts/smoke-boot.sh` — Tversion/Tattach round-trip
end-to-end through the relay on Linux 6.18 + QEMU/KVM.

### R3 — Credential capability

Expose an Endo capability `ClaudeCredentials` with `issue(sessionId)`
and `rotate(sessionId)` shapes mirroring the credential broker
(`DESIGN.md` §5.5).
Lets users mint tightly-scoped Anthropic credentials and pass them
through forms the same way they pass filesystems today, replacing the
out-of-band broker config file.

### R4 — Restart-survivable ClaudeClient  (DONE)

All three sub-pieces shipped:

- **Orchestrator-side persistence**: session state journals to
  `$CLAUDE_ORCH_STATE_PATH` on every transition, and `main.js`
  reattaches to surviving QEMUs at startup via a `kill(pid, 0)` probe
  (alive → `unhealthy`, dead → `terminated` for forget).
- **Per-session ClaudeClient caplet**: each `ClaudeClient` is its own
  unconfined caplet, loaded by `makeUnconfined` on the host agent
  with session metadata in `env`. The exo is a pure function of `env`,
  so it reincarnates on daemon restart with the same identity and
  reconnects to the orchestrator on demand.
- **Per-session bridge caplet** (`src/fs-bridge-module.js`): each 9P
  bridge is also a formulated caplet under HOST petstore (pet name
  `bridge-for-<sessionId>`), parameterised by `FS_NAME` and
  `FS_SOCKET_PATH`. The module's `make()` eagerly looks up the FS by
  pet name on the host's namespace and starts the 9P listener before
  resolving. On daemon restart the formula reincarnates with the
  same `env`, re-resolves the FS, and re-binds the same UDS path —
  no factory coordination needed.

Verified by `test/factory-live.test.js`'s
`9P bridge reincarnates after Endo daemon restart` case: provision a
session, stop the daemon, confirm the UDS goes cold, restart the
daemon at the same `statePath`, look up the bridge by pet name, and
verify a fresh connect succeeds.

### R5 — Tools-as-capabilities

Pipe Endo capabilities into the guest as MCP tools so Claude can call
out to other Endo objects.
Requires an in-guest CapTP bridge — non-trivial; design TBD.

### R6 — Factory permission scoping

Today the factory caplet is unconfined.
Audit which orchestrator endpoints it actually needs, and run it as a
confined guest with a passthrough capability to a narrow
`OrchestratorAPI` exo that the host process owns.

### R7 — Snapshot/restore integration

When `DESIGN.md` milestone v2 lands QEMU snapshot/restore, expose it
on `ClaudeClient` as `snapshot() → SnapshotRef` and
`E(factory).restore(snapshotRef, filesystem)`.
Useful for forking a conversation.

---

## 10. References

- `DESIGN.md` — host-level orchestrator design (this package).
- `packages/fae/llm-provider-factory.js` — reference factory caplet
  pattern (form + submission loop).
- `packages/daemon/MULTIPLAYER.md` — how endo names/petstore composes
  across daemons; informs R4.
- Anthropic SDK reference: `https://docs.anthropic.com/en/docs/claude-code/sdk`.
- 9P2000.L spec: `https://github.com/chaos/diod/blob/master/protocol.md`.
