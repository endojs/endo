# @endo/claude-sandbox — design & status

This document records the as-built architecture, what has been verified
end-to-end, the environment gotchas worth knowing, and the known bugs /
future work.
It complements [`README.md`](./README.md) (usage) and [`DEMO.md`](./DEMO.md)
(runbook).

> Status: experimental.
> The provisioning, credentials, and host-9P-mount paths are verified live on
> Linux.
> Claude Code has been run inside a rootless podman slice (without an API key).
> Each session is now a first-class `claude-client` formula, so the form-driven
> store path works and survives daemon restarts; both it and the remote-peer
> send/adopt session-request path are covered against a real daemon (including a
> two-daemon mesh test) by
> [`test/live-daemon.test.js`](./test/live-daemon.test.js) — see
> [Known issues](#known-issues--future-work).

## Goal

Run Claude Code inside an [`@endo/sandbox`](../sandbox/README.md) rootless
**podman** slice, projecting the agent's workspace from an Endo `Filesystem`
capability and exposing the session to other Endo agents as a `ClaudeClient`.

The intended deployment is a **host daemon on a Linux machine** that lets
**remote peers** bring two capabilities of their own — a `Filesystem` (their
project files) and a `ClaudeCredentials` (their Claude auth) — and run Claude
Code against them in a container on the host.
The peer's long-lived auth stays on the peer's machine; the host receives only
the short-lived per-session secret the credential cap mints (see
`ClaudeCredentials` above).
The sibling [`@endo/claude-container`](../claude-container) (PR #328) explores
the same goal with a heavier QEMU-microVM substrate; this package is the
lighter rootless-podman path with the same capability shape.

## Architecture

Four pieces, all unconfined caplets minted by [`setup-host.js`](./setup-host.js)
(sandbox factory + infra) and [`setup-peer.js`](./setup-peer.js) (credentials
factory):

- **`ClaudeSandboxFactory`** (`src/claude-sandbox-factory.js`) — presents the
  "Create Claude Sandbox" form on `@host`; on submission it projects the
  workspace and mints the slice + client.
- **`ClaudeClient`** (`src/claude-client.js`) — one Claude Code session bound to
  one slice; `send()` spawns a fresh `claude -p … --output-format stream-json`
  per turn and parses the newline-delimited JSON.
- **`ClaudeCredentials`** (`src/claude-credentials-*.js`) — single-shot
  credential wrapper backed by a `0600` sidecar file; the secret never enters
  the formula store.
  It advertises a `kind()` — `apiKey` or `oauthToken` — so the factory injects
  the materialised secret as `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`
  respectively.
  Because `issue()` / `materialise()` are eventual-sends, the cap can live on a
  remote **peer**: the peer holds the long-lived auth (e.g. an OAuth refresh
  token) and mints a short-lived `oauthToken` per session, so the host daemon
  only ever sees the short-lived bytes.
  This mirrors the R3 `ClaudeCredentials` contract in `@endo/claude-container`
  (PR #328).
- **`parse-rootfs.js`** — maps the `rootfs` form field to a `RootfsSpec`.

It leans on two upstream caplets: the `@endo/sandbox` podman driver and the
`@endo/9p-server` mount caplet (`fs-mounter`).

### Workspace projection ("plan B")

Rootless podman cannot run `mount -t 9p` (it needs `CAP_SYS_ADMIN`), so the 9P
mount happens on the **host** and the container bind-mounts the result:

```
Filesystem cap ──E(fsMounter).mount(fs,P)──▶ 9P bridge + host `mount -t 9p` at P
        P ──E(host).provideMount(P)──▶ workspace Mount cap
  Mount cap ──mounts:[cap → /workspace]──▶ podman slice (E(sandboxFactory).make)
      slice ──E(slice).spawn(claude -p …)──▶ stream-json on stdout
```

This reconciles two opposing privilege models: the daemon runs as a **non-root**
user so the podman probe reports rootless, and the privileged `mount(2)` is
delegated through `sudo` via `NINEP_SUDO=1`.

## Session lifecycle, teardown & GC

Each session is a first-class `claude-client` formula. Two things govern its
lifetime: **who roots it** (whether it is collected) and **the cancellation
context** (how it tears down).

### Two create paths — who supplies the caps

The caps a session needs (`Filesystem`, `ClaudeCredentials`) must be endowed
into the per-session powers **by name**, because `evaluate` endows by name and a
remote formula id is a valid endowment. The constraint is how a caller's cap
acquires a host name — and a cap **cannot** be passed as a method argument
across a daemon boundary (it arrives as a bare CapTP presence with no formula
id: `No corresponding formula`), so there is no cap-argument entry point. Both
create paths are therefore mailbox-based and **host-rooted**:

- **A remote peer (or any agent) `send`s a session-request package** to the
  host: a `package` message with a `filesystem` (+ optional `credentials`) edge
  and a JSON config in `strings[0]` marked `kind: "claude-sandbox-session"` (the
  marker keeps the loop from hijacking unrelated `filesystem`-edged host
  traffic). The factory's host-mailbox loop (`handleSessionRequest`) **`adopt`s**
  the caps into the host namespace — which both gives them a name the powers can
  endow *and* marks them as tracked imports (`thisDiesIfThatDies`; `storeLocator`
  would do neither) — formulates the session under the factory directory, and
  **replies** with a `client` edge the peer `adopt`s, then **`dismiss`es** the
  request so a daemon restart's `followMessages` replay does not re-create the
  session. The session is host-rooted under a factory-minted, `Date.now()`-
  bearing leaf (`<dir>/session-<slug>-<ts>-<n>`, never the peer's raw name,
  which could otherwise clobber a host name). A failure at any step cleans up
  the adopted temp names, leaving no host residue.
- **The "Create Claude Sandbox" form on `@host`** — the operator path. Fields
  are existing host pet-name strings, resolved with the operator's own authority
  and endowed **directly by name** (no `storeValue`, no temp names — the
  operator's names are durable). The client is stored under `resultName`.

Delivery dictates rooting: a `reply` / `send` can only attach a cap **by pet
name** (`Mail.reply(number, strings, edgeNames, petNamesOrPaths)`), so a session
handed back through the mailbox is necessarily host-rooted — there is no
caller-held cap to drop. Destroy a session with `E(host).remove(name)`. A
peer-initiated destroy message — so a peer can tear down its own session without
operator action (e.g. by `send`ing a "remove" request, or by unnaming the
client after the peer adopts so the peer's retention becomes the only root) — is
the natural follow-up to restore peer-controlled lifetime.

### Teardown — the cancellation context

The client module wires `context.whenCancelled()` (the pattern `@endo/9p-server`
and genie use). When the formula is cancelled or collected, the session tears
down: dispose the slice (kills the container) then unmount the 9P workspace.
`terminate()` does the same and is a no-op when nothing was provisioned, so a
never-used session cancels for free.

- **`cancel`** (explicit `E(host).cancel(name)`, **and every daemon shutdown**)
  is _transient_: the formula stays on disk and **reincarnates**, re-provisioning
  a fresh container on the next `send()` (the workspace and conversation persist
  in the `Filesystem` cap; `claude --continue` resumes).
- **`remove`/collection** additionally **deletes** the formula. Because teardown
  is wired to the same `whenCancelled` signal, removal is a clean delete with no
  leftover container or mount — _"remove == delete, no further cleanup."_

### Distributed GC (validated against the daemon source)

Collection is reachability mark-and-sweep from roots = **pet-name edges** +
**pins** + **retention edges** (a remote peer holding a cap). The peer-drop →
collection chain, verified end-to-end:

1. the peer's retention-set `remove` delta → `formulaGraph.removeRetention(...)`
   (`daemon.js`),
2. → `removeGroupEdge` decrements the refcount; at zero → `maybeCollect`
   (`graph.js`),
3. → if refcount 0 **and not a root**, collect → `onCollect`,
4. → `deleteFormula` **and** `controller.context.cancel(...)` — which fires our
   `whenCancelled` teardown.

Caveats worth knowing:

- GC is on by default (`gcEnabled = true`) but can be disabled.
- "Not otherwise rooted" is load-bearing: both create paths store the client
  under a host pet name, so a session stays rooted until the operator `remove`s
  that name — a peer dropping its adopted copy of the `client` cap does **not**
  collect it. (A peer-initiated destroy that unroots the host name is the
  follow-up that would restore peer-controlled collection.)
- A _transient disconnect_ does **not** drop a known peer's retention; retentions
  are durable (SQLite) and reconciled only when the peer **reconnects** without
  the reference. So "offline" ≠ "collected"; an explicit `remove` is what
  destroys the session.

### Destroying a session

- Both create paths are **host-rooted**: `E(host).remove(name)` — cancellation
  fires the `whenCancelled` teardown and the formula is deleted.
- **Stop without destroying:** `E(client).terminate()` disposes the container +
  unmounts but leaves the formula (it will re-provision on the next `send`).

## Turn model — the floot session shape

A _session_ is one `ClaudeClient`; a _turn_ is one `claude -p … --output-format
stream-json` process spawned in the slice, whose parsed stdout is streamed to
the caller through a buffered reply reader. The turn model mirrors the **floot
session** (`packages/floot` on the `llm-kumavis-floot` branch) so the two share
one interface guard: both consume `makeBufferedReader` from
`@endo/exo-stream/buffered-channel.js` (the buffered-channel consolidation,
`designs/buffered-channel-exo-stream-consolidation.md`).

### How floot does it (three layers)

1. **Buffered reply channel** (`floot/src/buffered-channel.js` → `makeBufferedReader`):
   a `Far` reader (`next`/`return`/`throw`) fed by an imperative `push`/`writer`,
   buffering so a producer can run ahead of a slow consumer. When the **consumer
   stops pulling** (`return`/`throw`), `finalize()` fires an **`onClose`** hook.
2. **Turn runner + abort** (`floot/agent.js` `converse`/`runTurn`): each turn
   gets an `AbortController`; the reply channel's `onClose` calls
   `controller.abort()`, and the turn threads `signal` into the provider and
   bails on `signal.aborted`. So **closing the reply reader aborts the in-flight
   turn** — there is no separate `interrupt()`; closing the reader _is_ the
   interrupt (UI "Stop" / barge-in).
3. **Turn serialization** (`turnChain`): `converse` chains each turn after the
   previous (`turnChain.then(() => runTurn(...))`), so concurrent calls **queue**
   and run one at a time over the shared conversation rather than racing.

"Queued messages, submitted as an interrupt" = `turnChain` queues turns, and a
new submission closes the current reply reader (abort/barge-in) before
enqueuing, so it preempts the in-flight turn cleanly.

### Mapping onto this package (implemented)

The analogy is exact; only the _abort action_ differs (floot aborts a fetch
stream; here we **kill the `claude -p` OS process** in the slice):

| floot                              | claude-sandbox                          |
| ---------------------------------- | --------------------------------------- |
| `converse(input) → replyReader`    | `send(prompt) → replyReader`            |
| a turn = provider HTTP stream      | a turn = `claude -p` process            |
| abort = `controller.abort()`       | abort = `E(proc).kill()` (on `onClose`) |
| `turnChain` serializes turns       | `turnChain` serializes turns            |
| reply channel `onClose → abort`    | reply channel `onClose → kill`          |

`send()` returns the buffered reader immediately; the turn queues on `turnChain`
and the reader yields the parsed stream-json events then a terminal
`{ type: 'end' }` (clean) or `{ type: 'abort', reason }` (error). Closing the
reader — or `interrupt()`, which closes the current reader — kills the in-flight
process (a still-queued turn bails before it spawns). The shared-primitive question is
resolved: `makeBufferedReader` now lives in `@endo/exo-stream` and both floot
and this package import it (see the §"LLM backend layer" open questions).

## LLM backend layer — one Session interface over container _or_ API

The longer-term goal is a backend-agnostic **Session**: the same capability
surface whether a session is powered by the **container** (this package — the
`claude` CLI in a podman slice over a workspace) or by the **API** (a direct
Anthropic-API agent, as in `packages/floot`). A consumer holds a `Session` cap
and never learns which backend is underneath.

### The key structural fact: the backends sit at different levels

This is why "where to layer" is subtle — the two are _not_ the same kind of
object:

- **API backend = agent-over-provider.** Floot owns the agent loop
  (conversation tree, tool discovery/execution, `turnChain`) and calls a dumb,
  swappable **`StreamingProvider`** (`providers/index.js`:
  `chat(messages, tools)` / `chatStream(messages, tools, onToken?, signal?)`).
  The provider is the LLM completion; the agent is floot. Floot already has two
  providers behind this seam (streaming Anthropic, and `@endo/lal` adapted).
- **Container backend = the agent _is_ claude-code.** claude-code owns its loop,
  its memory (its own session files in the workspace), and its tools (file edit,
  bash, MCP) inside the container. This package only spawns `claude -p` and
  streams stdout. There is no "provider" seam to swap — the whole agent is the
  backend.

So you **cannot** unify them at the provider level (claude-code is not a
completion provider; it is an entire agent). The only common seam is the
**Session**.

### The common Session interface

Synthesised from floot's `FlootSession` (`converse(input) → replyReader`,
`getHistory`, `getUsage`, `getInfo`) and this package's `ClaudeClient`
(`send`/`interrupt`/`terminate`/`status`):

```
Session:
  send(input) → ReplyReader      // input: string | streaming reader
  interrupt()                    // and/or: closing the ReplyReader aborts the turn
  history() → Message[]          // replay the conversation
  status() → { id, model, backend, createdAt, usage, ... }
  terminate()
  help()
```

The stream uses floot's normalized **`ReplyEvent`** vocabulary
(`phase | delta | final | tool_call | tool_result | usage | end | abort`,
`src/stream.js`) over the shared `makeBufferedReader`, with the floot turn model
([Turn model](#turn-model--the-floot-session-shape)): one buffered
reply reader per turn, `turnChain` serialization, and reader-close ⇒ abort.

### Two backend adapters under that interface

- **`makeApiSession({ provider, store, tools })`** — floot's agent, generalised:
  runs the loop over a `StreamingProvider`, owns the conversation tree + Endo
  capability tools, emits `ReplyEvent`. Interrupt = `AbortController` signal. No
  `Filesystem` required.
- **`makeContainerSession({ slice, workspacePath, model })`** — this package's
  `ClaudeClient`, refactored to **normalise stream-json → `ReplyEvent`** and
  surface the same interface. claude-code owns memory (the workspace) and tools.
  Interrupt = `E(proc).kill()`.

Stream-json → `ReplyEvent` normalisation:

| claude-code `stream-json`     | `ReplyEvent`              |
| ----------------------------- | ------------------------- |
| `system`/`init`               | `phase` + status metadata |
| `assistant` (text)            | `delta`                   |
| `assistant` final / `result`  | `final`                   |
| `tool_use`                    | `tool_call`               |
| `tool_result`                 | `tool_result`             |
| `result` (usage)              | `usage`                   |
| process exit 0                | `end`                     |
| error / non-zero / killed     | `abort`                   |

### Impedance mismatches the interface must paper over (or expose honestly)

- **Memory & `history()`.** Container = an _opaque_ claude-code session in the
  workspace fs (`--continue` resumes; the interface can replay but not edit or
  branch it). API = an explicit, editable conversation tree. Expose the
  lowest-common-denominator (read-only replay) on `Session`; tree editing is an
  API-only extension.
- **Tools / authority.** Same interface, very different _powers_: container =
  claude-code's built-in tools bounded by the slice + workspace + network
  profile; API = Endo-capability tools. A consumer cannot assume a given tool
  exists — only that it can converse.
- **Interrupt cleanliness.** API aborts a fetch mid-token; container kills
  `claude -p`, so partial tool side-effects already written to the workspace
  persist (a "dirtier" stop).
- **Streaming granularity.** API yields true token deltas; claude-code yields
  coarser structured-event deltas. Both map onto `delta`/`tool_call`.
- **Auth.** Both take a `ClaudeCredentials` cap. Container injects it as env
  (`CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY`); API threads it into the
  provider. Uniform at the cap boundary.
- **Cost/latency envelope.** Container pays per-turn container boot + claude/node
  start; API pays just the HTTP round-trip. Same interface, different
  performance.

### Recommended layering

```
            Session  (uniform cap: send / interrupt / history / status / terminate)
              ▲                              ▲
   makeContainerSession(slice)      makeApiSession(provider, store, tools)
              │                              │
        claude-code agent            StreamingProvider  ← { anthropic, lal, … }
        (claude -p in slice)
```

- `@endo/exo-stream` owns `makeBufferedReader` (landed); a shared module for
  the `ReplyEvent` writer + the `Session` contract remains open.
- The API backend keeps its sub-seam (`StreamingProvider`, swappable across
  hosts); the container backend has none (claude-code is monolithic) — note the
  asymmetry rather than forcing a fake provider around the CLI.
- A `backend` selector (mirroring floot's `createStreamingProvider`) returns a
  `Session` from config: container (needs a slice + `Filesystem` + credential) or
  API (needs provider config + credential, no fs). The composition point is
  exactly the bring-your-own-{filesystem, auth} boundary this package already
  has — the API backend simply drops the `Filesystem` input.

Open questions: whether the shared Session/stream primitives live in a new
package or are ported per-consumer; how much of floot's agent is extracted vs.
left in `packages/floot`; and whether `history()`/tools differences are smoothed
into one interface or exposed as backend-tagged capabilities.

## Verified status

Validated in a privileged Docker container (`node:22-bookworm`, Docker Desktop
LinuxKit kernel 6.12, aarch64) — see [DEMO.md](./DEMO.md).

### Phase 1 — provisioning, credentials, host 9P mount (root daemon)

- `setup-host.js` mints `claude-sandbox/` (`sandbox-factory`, `fs-mounter`,
  `service`, `profile`, `handle`, `readme`) on the container host;
  `setup-peer.js` mints `claude-credentials/` (`service`, `profile`,
  `handle`, `readme`) on the credential holder's machine — so the host root
  stays uncluttered and each directory's `readme` documents its objects + the
  security of sharing each. Both forms land in `@host`'s inbox.
- Credentials form → `0600` sidecar in a `0700` dir;
  `E(c).issue(tag)` then `.materialise()` round-trips the key through the daemon.
- `fs-mounter` performs a real kernel 9P mount
  (`… type 9p (rw,trans=unix)`); read and write-through both work;
  `provideMount(path, petName)` and clean `unmount()` verified.

### Phase 2 — Claude Code in a rootless podman slice

- Daemon runs as a non-root user (uid 1000) with `/etc/subuid`+`/etc/subgid`;
  `podman info` reports `Rootless: true`; `crun`; `cgroupfs` manager.
- `NINEP_SUDO=1` + a narrow `sudoers` entry (`mount`, `umount` only) lets the
  unprivileged daemon do the host 9P mount.
- `sandbox-factory.listBackends()` → `podman available: true (v4.3.1)`.
- Built a `localhost/claude-demo` image (`node:22-bookworm-slim` +
  `@anthropic-ai/claude-code`, claude `2.1.183`).
- The form submission mounted the workspace over 9P and started a rootless
  podman slice with the workspace bound at `/workspace`.
- `claude` runs in the slice. With **no API key** it fails gracefully:
  - `claude --version` → `2.1.183 (Claude Code)`, exit 0;
  - `claude -p "…" --output-format stream-json --verbose` emits valid
    stream-json — a `system/init` event (`"apiKeySource":"none"`,
    `cwd:"/workspace"`), an `assistant` event
    (`"Not logged in · Please run /login"`, `error:"authentication_failed"`),
    and a `result` event (`is_error:true`), exit 1;
  - `ClaudeClient.send()` parsed those same three events via
    `parseStreamJsonLines`, validating the client path against real output.

## Environment gotchas

- **Use the `vfs` storage driver under nested Docker, not `fuse-overlayfs`.**
  On the Docker Desktop LinuxKit kernel, every in-container `execve` from a
  `fuse-overlayfs` rootfs failed with `EINVAL`
  (`exec /bin/sh: invalid argument`), independent of OCI runtime (crun 1.8.1 and
  1.28, and runc 1.1.5 all reproduced it).
  Setting podman's storage driver to `vfs` fixed it completely.
  Upgrading crun was a red herring.
- **uid/gid 1000.**
  The 9P server synthesizes uid/gid 1000; under rootless podman's uid mapping
  workspace files may appear owned by `root`/`nobody` inside the container.
- **`claude -p` stdin.**
  Without a redirected stdin, claude prints
  `Warning: no stdin data received in 3s, proceeding without it.`
  before running; pass `stdin` from `/dev/null` to silence it.
- **podman rootfs is OCI-only.**
  The podman driver only accepts `rootfs: { kind: 'oci', ref }`; `host-bind` and
  `minimal` are bwrap-only and throw at `make()` — even though the form help
  still advertises them (see future work).
- **Unix socket path length on CI.**
  A daemon's Unix domain socket path must stay under the ~108-char `sun_path`
  limit. Under a deep CI checkout path
  (`/home/runner/work/endo-but-for-bots/endo-but-for-bots/…`) the live-daemon
  test's per-test socket path overran it for the longer test names, so
  [`test/live-daemon.test.js`](./test/live-daemon.test.js) anchors the socket in
  the OS temp dir with a short random name rather than under the package's
  `test/tmp/<name>/`.

## Known issues & future work

### 1. `storeValue` could not persist the `ClaudeClient` — FIXED

Originally the form path built the `ClaudeClient` as a `makeExo` inside the
factory worker and called `E(hostAgent).storeValue(client, name)`, which threw
`No corresponding formula for Object [Alleged: ClaudeClient]`
(`packages/daemon/src/host.js`): a worker-local exo — and the slice / mount
handles it wrapped — have no daemon **formula** identity, so
`formulateMarshalValue` cannot store a reference and the pet name pointed at a
non-existent formula.
The dependency-injected unit tests masked this because the mock `storeValue`
just recorded the object.

**Fixed: each session is now a first-class `claude-client` formula.**
The factory formulates the session via
`E(hostAgent).makeUnconfined('@main', claude-client-module.js, { resultName,
powersName: '@agent', env })`, so the stored `ClaudeClient` has a real daemon
identity and reincarnates across restarts.

Because an `@endo/sandbox` slice (`makeExo('SandboxHandle', …)` minted inside
the sandbox-factory's worker, `packages/sandbox/src/factory.js`) and the 9P
mount handle are worker-local and cannot cross a formula boundary, the client
formula **owns its slice and mount**:
[`src/claude-client-module.js`](./src/claude-client-module.js) provisions them
lazily from its `env` on first use — looking up the `sandbox-factory` /
`fs-mounter` / `Filesystem` / `ClaudeCredentials` caps by pet name, mounting the
workspace, registering the Mount cap, and minting the slice.
On reincarnation it re-mounts and re-mints a fresh container; the workspace and
the conversation persist in the `Filesystem` cap, and the (possibly
peer-hosted) credential is re-materialised at spawn time — so no secret ever
enters the formula `env`.

The per-session client worker runs as the attenuated `sandbox-powers` cap, not
`@agent` — see [§8 Least authority for the client worker](#8-least-authority-for-the-client-worker--fixed).

### 2. Factory error path leaks the slice and the 9P mount — FIXED (structurally)

Originally, on any failure after the mount / slice were created the factory's
`catch` only replied with the error message, leaving a running `endo-sandbox-*`
container and a mounted 9P filesystem behind.

**Fixed.**
With issue #1's refactor the factory no longer mounts or mints anything — the
client formula owns that lifecycle — so the factory cannot leak.
The client module provisions atomically: if the slice mint fails after the
mount, it unmounts the workspace before rejecting (covered by the
`a slice-mint failure unmounts the workspace` test in
`test/claude-client-module.test.js`), and `terminate()` disposes the slice and
unmounts.

### 3. Integration-test gap — ADDRESSED

The pure mocks could not catch the formula-identity constraint in #1.
[`test/integration.test.js`](./test/integration.test.js) is a podman-gated test
(skips when podman/rootless or the image is unavailable) that exercises a real
`@endo/sandbox` podman slice, a real bind-mounted workspace, and a real
process's stdout flowing over the `@endo/exo-stream` wire protocol into
`parseStreamJsonLines` — the layer the unit mocks fake.
A second case (gated on `CLAUDE_SANDBOX_TEST_IMAGE`) drives a real `claude`
through `ClaudeClient.send`.

The real **host-side 9P projection** — the "plan B" path the integration test
above deliberately skips by bind-mounting a plain tmpdir — is now covered
end-to-end by [`test/ninep-flow.test.js`](./test/ninep-flow.test.js)
(`yarn test:ninep`, run in CI in the `claude-sandbox-integration` job with
`NINEP_REQUIRE=1 NINEP_SUDO=1`). It mounts a `node-fs` `Filesystem` cap over
real kernel 9P via the unmodified `mount-caplet`, reads it back through the
mountpoint, then bind-mounts that 9P mountpoint into an `@endo/sandbox` podman
slice and reads the file from inside the container as stream-json. A throwaway
matrix probe across `ubuntu-22.04`/`24.04`/`latest` confirmed (all three green)
that GitHub-hosted runner kernels ship `CONFIG_9P_FS` and grant passwordless
`sudo mount -t 9p`, so this runs on stock CI rather than needing a self-hosted
runner. (One footgun it surfaced: a **synchronous** read of a 9P mount served by
an **in-process** bridge deadlocks the event loop — the read must be async so
libuv services the bridge concurrently.)

The formula-identity constraint itself is now covered against a real daemon by
[`test/live-daemon.test.js`](./test/live-daemon.test.js) (`yarn test:live`, run
in CI in the `claude-sandbox-integration` job). It boots an Endo daemon via
`@endo/daemon`'s `start`/`makeEndoClient`, mints a real Node-backed
`Filesystem` cap, provisions the factory on `@host`, and validates both session
paths end to end:

- **The remote-peer send/adopt path** — a real **two-daemon** mesh test (over
  the daemon's loopback-TCP transport): a peer mints its own `Filesystem`, sends
  a session-request package to the host, the factory `adopt`s the cap and
  formulates a `claude-client` with a real daemon identity that the peer reaches
  by `adopt`ing the reply's `client` edge (`status()` resolves across the mesh).
  This is the direct end-to-end proof of #1 (a worker-local remotable could not
  survive the formula boundary) *and* of the cross-peer cap-passing.
- **The `@host` form path** drives `form → submit → makeUnconfined → stored
  ClaudeClient`, exercising the `@agent` powers wiring that only runs against a
  real daemon.

These cases stop short of `send()` so they need no podman/9p (`status()` and a
never-used `terminate()` do not provision a container). The lifecycle teardown is
unit-tested via the cancellation context in `test/claude-client-module.test.js`.
(The 9P
provision, previously listed here as not-runnable, is now covered by
`ninep-flow.test.js` above.)

### 4. Other follow-ups

- Exercise the **live path with a real credential** — both an
  `ANTHROPIC_API_KEY` and an `oauthToken` (`CLAUDE_CODE_OAUTH_TOKEN` from
  `claude setup-token`). Only the no-credential path is validated live so far;
  the credential-kind → env-var wiring is unit-tested but not yet run against a
  real `claude`.
- Token refresh for long-lived sessions: a short-lived `oauthToken` is injected
  into the slice env at creation, but each `send()` spawns a fresh `claude`
  reading that fixed env, so the token is not refreshed mid-session. For
  long-running sessions, re-materialise the credential per `send()` (per-spawn
  env) or push a rotated token in, mirroring `@endo/claude-container`'s
  `RotateCreds`.
- Validate `network` profiles beyond `none` (`private` etc. need
  `slirp4netns`/`pasta` reachable from the daemon's user). Note Claude Code must
  reach `api.anthropic.com`, so a usable session needs an egress-capable profile
  — `none` blocks the API entirely; the default is `private`.
- Reconcile the form's `rootfs` help with the podman driver: either drop
  `host-bind`/`minimal` from the advertised options under the podman backend or
  document that they require `bwrap`.
- Redirect `claude -p` stdin from `/dev/null` to drop the stdin warning.

### 5. Turn-lifecycle defects (from code review) — FIXED

These were symptoms of the missing floot layers; the
[Turn model](#turn-model--the-floot-session-shape) refactor fixed
them. `send()` now returns a buffered reply reader
(`@endo/exo-stream/buffered-channel.js`) and queues the turn on a `turnChain`.

1. **Closing a reader did not kill the turn** — FIXED. The reply reader's
   `onClose` (fired on `return`/`throw`, and by `interrupt()`/`terminate()`)
   kills the in-flight `claude -p` process; a still-queued turn checks `closed`
   and bails before it spawns.
2. **Overlapping `send()`s raced** — FIXED. Turns serialize on `turnChain`
   (queue semantics — the floot default), so two `claude -p` processes never
   race the same workspace conversation.
3. **Provision rejection was memoized with no retry** — FIXED. `ensureProvisioned`
   drops a memoized *rejected* `provisioned` so a later turn retries; the
   client-module `provision` revokes the issued credential grant on failure and
   returns a `revoke` thunk that `terminate()` calls, so grants no longer leak.

A turn's reader now yields the parsed stream-json events followed by a terminal
`{ type: 'end' }` (clean) or `{ type: 'abort', reason }` (spawn/stream error);
errors surface as `abort` events, not `send()` rejections.

### 6. Smaller defects (from code review) — FIXED

- **Loose form-reply guard** — FIXED. Both factories now require
  `formMessageId !== undefined` before matching `msg.replyTo === formMessageId`.
- **`sessionId` collision** — FIXED. A monotonic per-worker counter is appended
  to `slug-${Date.now()}` so same-name same-ms requests get distinct ids
  (and mountpoints / workspace pet names).
- **Credential trailing-newline strip** — FIXED. The sidecar read now strips all
  trailing `CR`/`LF` (`/[\r\n]+$/`).
- **Integration test self-skips green** — FIXED. With
  `CLAUDE_SANDBOX_REQUIRE_INTEGRATION=1` (set by the CI job, which pre-pulls the
  image) the slice case `t.fail()`s instead of `t.pass()`ing when its
  prerequisites are absent.

### 7. Other follow-ups

- Decide and document session lifecycle across daemon restarts. The client is a
  pure-`env` formula that **reincarnates** (re-provisioning a fresh container on
  the next `send()`); the podman driver sweeps `endo-sandbox-*` orphans at boot.

### 8. Least authority for the client worker — FIXED

**Caps as arguments.**
The per-session `claude-client` formula does not run with `@agent`. The factory
builds a **per-session powers** cap for each session (via `E(hostAgent).evaluate`,
`buildSessionPowersSource` in `claude-sandbox-factory.js`) that is a **total
attenuation**: it closes over the four caps the client needs — resolved once, by
reference, from the endowed pet names — and `@agent`, and exposes only

- `sandboxFactory()` / `fsMounter()` / `filesystem()` / `credentials()` —
  accessors returning the bundled caps (no name lookup; `credentials()` is a
  baked `null` when the session has none). Note: the `filesystem` and
  `credentials` endowments are single host names, so they are pinned to a
  formula id at `evaluate` time. The infra endowments (`sandbox-factory` /
  `fs-mounter`) are now **path** endowments (under the factory's
  `SANDBOX_NAMESPACE` directory), which the daemon resolves with a `lookup`
  formula against the **live** host directory on each incarnation — so a
  reincarnated session re-resolves the current infra caps rather than stale
  ids. This is benign (rebinding `<ns>/sandbox-factory` requires full host
  authority, above the factory in the TCB) but is a deliberate asymmetry with
  the eagerly-pinned `filesystem` / `credentials`;
- `provideMount(path, name)` — bounded to **exactly this session's** workspace
  mountpoint, so a client cannot `provideMount('/etc', …)` (or any other path)
  and recover host paths through a slice.

There is **no `lookup`** and nothing else of the host surface, so a client worker
cannot resolve any host name beyond its own four caps, nor reach `makeUnconfined`
/ `provideHostPath` / `provideGuest` / `remove` / `store` / `evaluate`. This is
the "caps as arguments" shape: the client receives its authority as object
references, not as names it resolves.

The client module's call sites changed from `E(powers).lookup(name)` to the
accessors; the cap-name env vars (`FILESYSTEM_NAME`, `SANDBOX_FACTORY_NAME`,
`FS_MOUNTER_NAME`, `CREDENTIALS_NAME`) are gone — the caps ride through `powers`,
not `env`.

**Leak-free, even though the powers must be host-named.** `makeUnconfined` is
**Host-only** (the `EndoGuest` interface has `evaluate` / `lookup` / `storeValue`
but **not** `makeUnconfined` / `provideMount`) and resolves `powersName` against
the **host** petstore, so the per-session powers must be named to be used. The
factory therefore **unnames it immediately after `makeUnconfined`**: the
`make-unconfined` formula declares `['powers', …]` as a dependency
(`daemon.js`), which `onFormulaAdded` turns into a group **reachability** edge
client→powers (`graph.js`). So once the client references it, dropping the pet
name leaves the powers rooted **only** by that edge — it stays alive for exactly
the client's lifetime and is collected **with** the client. No per-session
host-petstore residue. `test/live-daemon.test.js` proves this end to end: after a
session is formulated the client's `status()` still resolves (so the unname did
not collect its powers) yet **no `*-powers` (or adopted `*-fscap`/`*-credcap`)
pet name survives**.

Why per-session and not a shared cap: a shared powers would have to expose a
generic `lookup` (it cannot know each session's `Filesystem` / credential names),
which re-grants "resolve any host name". Per-session powers bind the exact caps,
so even that over-grant is gone — at no GC cost, thanks to the unname.

**The factory stays the trust root, by necessity.** The factory is the
irreducible TCB: its job is to `makeUnconfined` the client workers, and
`makeUnconfined` *is* the authority to run unconfined Node (arbitrary code), so
it cannot be attenuated below that while it is the thing spawning workers. The
per-session powers is a strict subset of the factory's `host-agent`, but it only
scopes the **client**, not the factory. Treat the factory's source as part of the
trusted compute base.

Bring-your-own-caps, resolved. The peer no longer names its `Filesystem` /
`ClaudeCredentials` on the host: it `send`s them to the host as a session-request
package and the factory `adopt`s them (see § "Two create paths — who supplies
the caps").
A cap cannot be passed as a plain method argument across a daemon boundary — it
would arrive as an unadoptable presence — so `send`/`adopt` (which also marks the
cap as a tracked import via `thisDiesIfThatDies`) is the mechanism, not
cap-arguments. The infra caps (`sandbox-factory` / `fs-mounter`) remain
host-named by construction (they are the host's own).

### 9. Credential exposure through the sandbox environment

Where the secret goes, and what can read it.

At spawn time `claude-client-module.js` materialises the credential and injects
it as a process environment variable into the container:

```
kind = await E(credCap).kind()            // 'apiKey' | 'oauthToken'
issued = await E(credCap).issue(sessionId)
credentialEnv[ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN] = await E(issued).materialise()
E(sandboxFactory).make({ env: credentialEnv, … })   // → container env
```

So inside the slice `claude` runs with the secret in its environment.
The risk to reason about is **exfiltration by the very agent the sandbox is
running**: `claude` executes model-directed work — Bash tool calls, MCP
servers, hooks, subprocesses — and a child process **inherits the parent's
environment by default**.
A prompt-injected or adversarial turn can therefore attempt to read the secret
(`echo $ANTHROPIC_API_KEY`, read `/proc/self/environ`, etc.) and ship it
somewhere.

**Do not rely on `claude` masking the variable from tool subprocesses.**
Claude Code does not strip `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` from
the environment of commands it runs via tool calls.
Process environment variables are inherited by child processes in standard POSIX
semantics; Claude Code's Bash tool, MCP server workers, and hook subprocesses
all receive the full parent environment.
There is no verified env-scrubbing layer inside the `claude` binary between the
parent process and its tool subprocesses.
The security of this package does not depend on in-process masking — that
would be a defense-in-depth nicety applied by the thing we are confining, which
is an insufficient guarantee.
Treat the secret as **reachable by any code the agent runs inside the slice**,
including tool subcommands, MCP server code, and hooks.

The containment therefore lives at the **sandbox boundary**, not in the agent:

- **No host networking; the `network` profile controls egress.** This package
  offers only two profiles (the `@endo/sandbox` `host-loopback` / `host-lan` /
  `host-net` profiles, which share the host's net namespace, are deliberately
  **not** exposed — bridging a session onto the host network is what this
  package exists to avoid):
  - `none` — no network at all (Claude can't reach the Anthropic API or
    package registries).
  - `private` (**default**) — a private net namespace with NAT'd **outbound
    internet**, but RFC 1918 (LAN) and loopback are blocklisted. So Claude can
    call the API and `npm`/`pip`-install dependencies, while the container has
    **no route to the host** or its LAN. A credential materialised inside a
    `private` session can still be *sent* to the public internet, so pair it
    with the short-lived, revocable secret below rather than a long-lived key.
- **Short-lived, revocable secrets.** The credential cap mints a **per-session**
  secret (`issue(sessionId)` → `materialise()`) and supports `revoke(sessionId)`;
  the long-lived auth never leaves the **peer** (`setup-peer.js`), so the host
  only ever holds a short-lived materialised token, and the client revokes the
  grant on teardown / provisioning failure. Prefer `oauthToken` (short TTL,
  revocable) over a raw `apiKey` where the account supports it.
- **The secret is env-only, not workspace-persisted.** It is never written to
  the 9P-mounted `Filesystem`, so it does not survive in the peer's workspace —
  **unless the agent itself writes it there**. An agent that copies the key into
  a workspace file persists it into the peer's `Filesystem` cap; nothing in the
  sandbox prevents that, which is a further reason egress control + revocation,
  not in-container masking, are the real boundary.

Net: the credential is exposed to the agent's own execution by construction;
the package's job is to make that exposure **cheap to contain** (no-egress
network + short-lived revocable secret + peer-held long-lived auth), not to
hide the secret from the code running inside the box.
