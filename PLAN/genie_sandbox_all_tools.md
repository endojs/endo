_Note for future readers_:
This document is the design for **extending the genie sandbox slice to
cover the rest of the tool surface** — the network tools (`webFetch`,
`webSearch`), the filesystem tools (`readFile` / `writeFile` /
`editFile` / `removeFile` / `stat` / `listDirectory` /
`makeDirectory` / `removeDirectory`), and the memory tools
(`memory_get` / `memory_set` / `memory_search`) which today run inside
the **daemon worker** with ambient host authority rather than inside
the bwrap / podman slice the way the command tools (`bash`, `exec`,
`git`) now do.

It was derived from
[`TODO/80_genie_sandbox_all_tools.md`](../TODO/80_genie_sandbox_all_tools.md),
which carried the first-pass operator notes plus the dream of having
a single pid-1 inside the slice that **mediates every tool call**
rather than only the spawn-style ones.
This file is the consolidated, opinion-bearing form.

The slice-mint capability surface that this design composes is
specified in
[`PLAN/endo_posix_sandbox.md`](./endo_posix_sandbox.md);
the genie-side wiring that it extends lives in
[`packages/genie/CLAUDE.md`](../packages/genie/CLAUDE.md) §
"Spawning rules" and § "Tools that need host fs access stay daemon-side".

# Genie Sandbox: Whole-Tool Confinement Plan

## Goal

1. Bring every genie tool — not just the spawn-shaped ones — under the
   slice's confinement envelope, so the genie cannot exfiltrate via a
   daemon-side tool what `bash` inside the slice is forbidden from
   reaching.
2. Eliminate the asymmetry called out by the TODO comment in
   [`packages/genie/src/tools/web-fetch.js`](../packages/genie/src/tools/web-fetch.js)
   around line 50:

   > `// TODO if genie is being ran in a sandbox, we'd like to force connection`
   > `// dialing down into its network namespace, otherwise this tool is`
   > `// strictly more powerful than say curl inside the sandbox`

3. Land the eventual "pid-1-mediates-everything" architecture without
   blocking on the parts of it that are still research — keep delivery
   incremental so each phase is independently mergeable.

## Non-goals

- Replacing the spawner abstraction.
  The `Spawner` seam in
  [`packages/genie/src/tools/spawner.js`](../packages/genie/src/tools/spawner.js)
  and the slice-backed adapter in
  [`packages/genie/src/tools/sandbox-spawner.js`](../packages/genie/src/tools/sandbox-spawner.js)
  remain the canonical channel for `bash` / `exec` / `git`.
  This plan extends the same model to the *other* tools.
- Forcing dev-repl into the in-slice runtime architecture before it
  has a daemon to host CapTP edges.
  Dev-repl keeps the daemon-free path described in
  [`packages/genie/CLAUDE.md`](../packages/genie/CLAUDE.md) §
  "Dev REPL local powers"; the new wiring is opt-in on that path.
- Pulling an Endo distribution into arbitrary `oci:<ref>` rootfses.
  Distribution-into-image is a build-time concern;
  this plan deals with bind-mount-shaped solutions and explicitly
  defers the image-bake variants to a follow-up.
- A `sandbox.spawn` / `sandbox.exec` tool surface for fine-grained
  slice control.
  That remains deferred under
  [`PLAN/endo_posix_sandbox.md`](./endo_posix_sandbox.md) § "Phase 7".

## Problem statement

Today's genie tool surface splits on a single axis: does the tool body
end in a process spawn?

| Tool                                         | Runs where             | Confined by         | Channel                                          |
| -------------------------------------------- | ---------------------- | ------------------- | ------------------------------------------------ |
| `bash`, `exec`, `git`                        | inside the slice       | bwrap / podman      | `E(handle).spawn(argv, opts)` via `Spawner`      |
| `readFile`, `writeFile`, `editFile`, …       | daemon worker          | Mount cap (partial) | direct `vfs.foo()`; cap path is opt-in           |
| `memory_get`, `memory_set`, `memory_search`  | daemon worker          | Mount cap (partial) | direct VFS + native SQLite at a host path        |
| `webFetch`, `webSearch`                      | daemon worker          | nothing             | host `fetch()` — bypasses the slice's `network`  |

The right-hand column is the asymmetry: a model that finds `curl` in
the slice's `$PATH` is subject to the slice's `private` egress
filter, the kernel-level netns drop of host loopback / RFC 1918, and
the rest of the slice's hardening.
The same model invoking `webFetch` instead reaches the daemon's
ambient network stack with no filter at all — strictly more power
than the spawn channel.

The file and memory tools are subtler: they consume a `Mount`
capability (`workspaceMount` from `setup.js`) when one is wired in,
which lands on the same bytes the slice's `/workspace` bind-mount
sees.  But that path is **opt-in** today (the `workspaceMount`
parameter in `buildGenieTools` is undefined for several call sites),
and even when it is set the daemon-side write authority is
unattenuated relative to whatever access mode the slice itself was
granted.  A future "read-only-workspace genie" configuration would
expose the gap.

## Long-term shape: pid-1 as universal dispatcher

The operator's dream — quoted from
[`TODO/80`](../TODO/80_genie_sandbox_all_tools.md) — is that the
sleep-infinity process holding the slice open is replaced by an Endo
CapTP-speaking agent that mediates every tool call.  Concretely:

```
                    daemon worker (host realm)
                         │
                         │  CapTP via fd-pair / unix socket
                         ▼
        ┌──────────  slice pid 1 (in-slice realm) ──────────┐
        │  node /endo/agent.js                              │
        │    ├── spawn(argv)  → child processes in slice     │
        │    ├── readFile()   → fs.promises in slice         │
        │    ├── writeFile()  → fs.promises in slice         │
        │    ├── webFetch()   → fetch() in slice netns       │
        │    ├── webSearch()  → fetch() in slice netns       │
        │    └── memory.*     → sqlite inside slice          │
        └────────────────────────────────────────────────────┘
```

The daemon-side tool implementations become **stubs**: each one is a
thin proxy that does `await E(slicePidOne).readFile(path)` (or its
moral equivalent).  The slice's filesystem / network / pid namespace
are the kernel-level enforcement; CapTP is the application-level
attenuation.

This is the right end-state because:

- **One enforcement boundary.** Every tool call funnels through the
  same namespace.  No "is this tool the in-slice variant or the
  daemon-side variant" branching on the model's side.
- **Network profiles bind uniformly.** A `private` slice's egress
  filter applies to `webFetch` for free because the `fetch()` call
  literally runs in the slice's netns.
- **Mount caps unify with filesystem tools.** The in-slice agent
  reads and writes through ordinary `fs` against the slice's
  view — the bind-mount discipline established by the sandbox plugin
  becomes the single source of truth.
- **Future tools inherit confinement.** A new tool can be wired up by
  defining its in-slice method without revisiting the over-privilege
  asymmetry every time.

But getting there has three structural hurdles:

1. **Code distribution.**  The in-slice agent needs an Endo runtime
   reachable from inside the slice.  How that runtime lands inside
   the slice differs by backend — see § "Code distribution" below.
2. **Bootstrap channel.**  The daemon must hand a CapTP edge to pid-1
   without granting it network or host-fs power beyond what the slice
   already has.  The natural shape is a unix socket bind-mounted into
   the slice with one end held by the daemon worker.
3. **Lifetime and GC.**  Today's `sleep infinity` is trivially GC-
   pinned: the SandboxHandle pins it, the handle is pinned by the
   genie's main-genie formula, dispose kills the process.  The
   dispatcher pid-1 must offer the same guarantees while juggling
   many concurrent in-slice tool calls.

Each hurdle has different costs across the bwrap / podman / krun /
lima / wsl drivers, so the phased plan below front-loads the cheap
defenses and back-loads the in-slice runtime.

## Phased plan

### Phase A — host-side defense in depth (no in-slice runtime yet)

These phases close the **immediate** asymmetry — the one called out
in the `webFetch` TODO — without requiring an Endo distribution
inside the slice.  They are independently shippable and produce
measurable hardening today.

#### A.1 — Sandbox-aware `webFetch` / `webSearch`

When the genie is wired with a sandbox `Spawner`, **route web tools
through the slice's `bash` channel** rather than the daemon's ambient
`fetch()`.

Two sub-strategies, picked based on rootfs:

- **`host-bind` and most `oci:<ref>` images** — replace the
  daemon-side `webFetch` implementation with an in-slice `curl --max-
  filesize <limit> --max-time <timeout> -sSL <url>` invocation routed
  through the bound `Spawner`.  `webSearch` similarly invokes `curl`
  against the search-engine URL and runs the same DOMParser pass
  daemon-side on the returned HTML — the HTML parse is pure CPU and
  does not need confinement on its own.
- **`minimal` rootfs** — `curl` may be absent; refuse the tool with
  a structured error rather than falling back to daemon-side fetch.
  The error names `curl` as the missing dependency and points the
  operator at adding it to their rootfs or switching profiles.

Concretely the implementation lives in two new factories in
`packages/genie/src/tools/`:

- `web-fetch-via-spawner.js` — exports `makeWebFetchTool({ spawner })`
  that returns the same `webFetch` tool shape but with an
  `execute(...)` that builds a `curl` argv and delegates to the
  spawner.
- `web-search-via-spawner.js` — same shape for `webSearch`.

`registry.js` selects between the daemon-side and slice-side variant
based on whether a `Spawner` (sandbox spawner specifically) is
bound:

```js
if (groups.has('webFetch')) {
  tools.webFetch = spawner
    ? makeWebFetchTool({ spawner })
    : webFetch;  // daemon-side fall-through for dev-repl `--sandbox off`
}
```

The daemon-side `webFetch` / `webSearch` exports stay for the dev-
repl's `--sandbox off` path and any future host-only deployment, but
the *daemon-hosted* genie always picks the spawner-backed variant.

Acceptance:

- Existing `sandbox-slice` integration probe is extended with a step
  that calls `webFetch` against the slice's loopback and confirms it
  fails when the network profile is `private` (egress filter drops
  loopback), and another step against a public URL that succeeds
  with `private` and fails with `none`.
- Unit test in `packages/genie/test/tools/` that uses a stub
  `Spawner` and asserts the constructed argv matches the expected
  `curl` shape, including `--max-time`, `--max-filesize`, and the
  output capture path.

Exit criteria:

- `webFetch` reaches *exactly* what `curl` inside the slice reaches.
- The TODO comment on line 50 of `web-fetch.js` is removed (the
  daemon-side fetch path is no longer the production code path under
  the daemon-hosted genie).

#### A.2 — Make `workspaceMount` mandatory for daemon-side file tools

Today `buildGenieTools({ workspaceMount })` is the well-confined
shape but it is optional.  When the genie runs daemon-hosted with a
slice bound, every file tool **must** route through the mount cap;
falling through to ambient `vfs-node` should be a structured error.

Implementation:

- Add an `enforceMount: boolean` (default `false` for back-compat)
  to `buildGenieTools`.  `main.js` passes `enforceMount: true`
  whenever it has both a `spawner` (slice-backed) and a
  `workspaceMount`.
- When `enforceMount` is true and either `files` or `memory` is
  included but `workspaceMount` is absent, throw a structured error
  at registry build time naming the misconfiguration.

The actual `vfs-mount` path already exists; this phase only makes
sure it is the **only** path under the slice profile.  The Mount
cap minted by `setup.js` already lands on the same bytes the slice
sees, so this phase does not weaken or relax confinement — it
removes a configuration that could silently drift.

Acceptance:

- A new test in `packages/genie/test/tools/registry.test.js` asserts
  that `buildGenieTools({ enforceMount: true, include: ['files'] })`
  (no `workspaceMount`) throws.
- The daemon-side path in `main.js` opts into `enforceMount: true`
  unconditionally when minting the registry for a slice-backed
  agent.

Exit criteria:

- The "daemon-side file tool sees workspace bytes that the slice
  cannot" failure mode is impossible by construction under the
  slice profile.

#### A.3 — Sandbox-aware memory backend

The memory tools (`memory_get` / `memory_set` / `memory_search`)
ride on top of the file tools for the markdown layer and on top of
`fts5-backend.js` (native SQLite) for the search layer.  Phase A.2
covers the markdown layer transitively.  The FTS5 SQLite database,
however, opens a native file descriptor against a host path that the
slice itself does not have raw `open(2)` authority over.

Three options, picked at Phase A.3 implementation time:

1. **Keep FTS5 daemon-side, gate on cap.**  The SQLite DB is treated
   as part of the workspace; daemon-side `better-sqlite3` opens it
   under the host path the mount cap resolves to.  Reads and writes
   the slice would never directly attempt are mediated by the search
   backend's own interface (`SearchBackendI` in
   [`packages/genie/src/tools/memory.js`](../packages/genie/src/tools/memory.js)).
   Document the asymmetry: the FTS5 file is *workspace state*, the
   slice has read-write access to the same bytes via its
   `/workspace` bind, and a hostile genie that smashes the file
   ruins its own search index but cannot escape the slice.
2. **Move FTS5 into the slice.**  Run an `sqlite3` binary inside the
   slice via the spawner and shuttle SQL over stdio.  Adds a fork
   per query; awkward for the index-on-write path.  Likely overkill.
3. **Move FTS5 into a sibling slice formula.**  A dedicated
   `fts5-genie` worker formula mounts the workspace cap read-write
   and exposes `SearchBackend` over CapTP.  Decoupled from the genie
   guest's tool registry.  This is the right end-state if FTS5 ever
   grows operator-visible state of its own.

Recommendation: ship **option 1** (status quo, document explicitly)
in Phase A.3, defer option 3 to Phase C.  The slice's bind-mount
already constrains *which bytes* the FTS5 file can reach;
daemon-side FTS5 does not over-grant authority beyond what the slice
already has.

Acceptance:

- A code comment in `fts5-backend.js` explicitly cites this PLAN
  document, naming the deferral and the option-3 follow-up.
- No code change beyond the documentation pass.

Exit criteria:

- The memory toolchain's confinement story is *written down*; future
  readers know which axis of attenuation is intentional.

#### A.4 — Optional: host-side network policy mirror

As a belt-and-suspenders measure, **the daemon-side `webFetch` fall-
through** (the one dev-repl uses with `--sandbox off`) can mirror the
sandbox plugin's egress filter — at minimum reject RFC 1918, host
loopback, and CGNAT before issuing the request.

This is "weaker but cheap" because it applies even when no slice is
present, e.g. for the dev-repl's `--sandbox off` path or for future
host-only deployments.

Defer to Phase A.4 only if operator feedback wants it.  The phase is
independent of the rest of the plan.

### Phase B — in-slice runtime under bwrap (and host-bind / mount rootfses)

This is where the long-term architecture starts landing.  Phase B is
scoped to the **bwrap** driver with **`host-bind` or `mount` rootfs**
because those two combinations make the Endo-distribution problem
trivial: the host's `node_modules/@endo/...` directory is already
reachable on the host side, and bwrap can `--ro-bind` it into the
slice without crossing a virtualisation boundary.

#### B.1 — Probe + ro-bind the Endo distribution into the slice

At slice-mint time, the genie's `mintGenieSlice` helper adds two
mount arguments to the spec:

- The daemon's `node` binary (whatever `process.execPath` is)
  bind-mounted to a stable inner path like `/endo/bin/node`.
- The daemon's `node_modules/@endo/` (and the immediate transitive
  deps a minimal Endo agent needs) bind-mounted at `/endo/lib/`.

Both binds are read-only.  `path.js` in the sandbox driver is
updated to surface `/endo/bin` in the slice's `$PATH` so the in-slice
agent and any inner `bash` invocation can call `node` directly.

This is feasible under bwrap because bwrap's mount story is "give me
host paths and inner paths and I will bind them".  The daemon
already has read access to its own `node_modules/`.

For `host-bind` rootfs: the host's `/usr/bin/node` is already
reachable; the additional `/endo` bind just provides a stable path
and the Endo libraries.  For `mount` rootfs (the operator brought
their own userland tree): we still bind the daemon's node and
Endo dist because the user's rootfs may not contain node at all.

#### B.2 — Boot a CapTP edge through a bind-mounted socket

The slice's mount spec adds a single `tmpfs` scratch dir at
`/run/endo/`, into which the daemon worker pre-creates a unix socket
(`/run/endo/agent.sock`) before forking pid-1.  Pid-1 is no longer
`sleep infinity` but `node /endo/lib/@endo/sandbox/agent-pid1.js
/run/endo/agent.sock`.  The agent.js script:

1. Connects to `/run/endo/agent.sock` (the listener end is the daemon
   worker).
2. Performs the standard WS-CapTP / fd-pair bootstrap, just as a
   spawned daemon worker would.
3. Exports a `SliceAgent` exo with methods for each tool the daemon
   wants to delegate (`readFile`, `writeFile`, `webFetch`,
   `spawnChild`, …).

The socket is `chmod 0600` and owned by the slice's uid; no other
process inside the slice can connect because pid-1 holds the only
client end (`accept(2)` would block on the daemon side anyway).

The daemon worker pins the listener fd; when the SandboxHandle is
disposed, the listener closes, pid-1 sees EOF, and exits.  Process
GC stays trivial because it composes with the existing dispose path.

Network: this is **not** a network connection from the slice's
point of view — `/run/endo/agent.sock` is a unix domain socket, not
an AF_INET socket.  `network: 'none'` slices can still bootstrap.

#### B.3 — Rewire tool implementations as in-slice proxies

The genie tools become two-line stubs that delegate to the in-slice
agent:

```js
const webFetch = makeTool('webFetch', {
  // …schema…
  async execute({ url, timeout }) {
    return E(sliceAgent).webFetch({ url, timeout });
  },
});
```

The daemon-side `fetch()` body (and the `curl`-via-spawner body
introduced in Phase A.1) become the in-slice agent's
implementations.  The choice between them is now an in-slice
optimisation: the agent uses native `fetch()` (running in the
slice's netns) because that is the cheapest path; `curl` shells
become unnecessary.

The Phase A.1 `makeWebFetchTool({ spawner })` factory is retained
as a fallback when the in-slice agent is unavailable (rootfs
incompatibility, see Phase C).  `registry.js` picks between the
three variants:

1. Daemon-side `webFetch` — dev-repl `--sandbox off`.
2. Spawner-backed `webFetch` (Phase A.1) — when a slice is present
   but the in-slice agent could not boot.
3. Slice-agent `webFetch` (Phase B.3) — preferred.

The same three-way choice applies to file and memory tools.

#### B.4 — Acceptance and rollout

- A new integration test `test:integration:slice-agent` boots the
  bwrap slice with the in-slice agent and confirms every tool routes
  through it (via a log line the agent emits on each call).
- The existing `sandbox-slice` integration test is **not** retired;
  it continues to exercise the spawner path so the Phase A.1
  fallback is covered.
- Feature-flag: a form-field `sliceAgent: 'auto' | 'on' | 'off'`
  selects between the three registry variants.  `auto` picks
  slice-agent when feasible, falls back to spawner-backed, falls
  back to daemon-side.  Operators tuning a misbehaving genie can
  pin `off`.

Exit criteria:

- All daemon-hosted genies on `bwrap` + `host-bind`/`mount` rootfs
  run their entire tool surface inside the slice by default.
- `webFetch` against the slice's loopback fails with `network:
  'private'`, succeeds with `network: 'host-loopback'`, and behaves
  identically whether the model invokes `webFetch` directly or
  `bash -c 'curl …'`.

### Phase C — cross-driver distribution

Phase C extends the in-slice runtime to drivers where the Endo
distribution does not bind-mount trivially.

#### C.1 — podman driver with `host-bind` and `mount` rootfses

Same as Phase B mechanically: podman accepts bind-mounts via
`--mount type=bind,...`.  The driver hands the slice spec the same
two binds (`/endo/bin/node`, `/endo/lib/...`) plus the unix socket
scratch mount.

One wrinkle: podman's rootless mount story sometimes requires the
host path to be inside the user's `subuid`-mapped tree.  The
daemon's `node_modules/` typically is (it lives under the user's
home), so this is usually fine; document the prerequisite in the
sandbox README alongside the existing rootless prereqs.

Exit criteria: same as Phase B but the integration test runs against
the podman backend as well.

#### C.2 — podman driver with `oci:<ref>` rootfs

Three concrete sub-options, picked at Phase C.2 design time:

- **C.2.a — Bake Endo into a sibling rootfs.**  Operators who want
  in-slice tools build a thin OCI layer atop their work image that
  copies an `@endo/agent` tarball to `/endo/`.  The genie's form
  picks this image.  Trade-off: operator burden, but works in any
  podman / docker setup.
- **C.2.b — Bind the daemon's node binary into the slice anyway.**
  Risk: the daemon's node was linked against the host's libc;
  Alpine-based images use musl and crash at startup.  Probe and
  refuse if the image's libc disagrees with the daemon's.
- **C.2.c — Ship a static-linked endo-agent binary.**  A separate
  build step (deferred) produces `@endo/sandbox-agent` as a single
  static binary that can run on any rootfs.  This is the
  general-purpose answer but is out of scope until someone wants
  to fund the build.

Phase C.2 selects between C.2.a and C.2.b based on probe results,
falls back to the Phase A.1 spawner-backed tools when neither is
feasible.

#### C.3 — krun / micro-VM backends under podman

`podman --runtime krun` swaps crun for a Wasmedge / krun runtime
that boots a lightweight VM per container.  Bind-mounts cross the
VM boundary via virtiofs.  In principle the same `/endo/...` binds
work; in practice we need to confirm that:

- The krun rootfs has a node-compatible userland (or the daemon's
  node + libs bind into a minimal VM image).
- The unix socket bind crosses virtiofs cleanly — virtiofs
  typically forwards `connect(2)` but the kernel-version matrix on
  this is murky.

Defer Phase C.3 until the krun acceptance test is needed.  The Phase
A.1 spawner-backed fallback continues to work in the meantime: krun
still runs the slice's process tree, so `curl` inside that tree
still routes through the krun-managed network namespace.

#### C.4 — lima (macOS) and WSL2 (Windows) backends

These are inherently "Endo on the host talks to a Linux guest over
SSH or WS-CapTP", per
[`PLAN/endo_posix_sandbox.md`](./endo_posix_sandbox.md) § "Phase 4"
and § "Phase 6".  The in-slice agent story collapses to:

- The host-side Endo daemon already speaks WS-CapTP to the in-guest
  Endo daemon (the lima / WSL2 driver bootstrap).
- The in-guest daemon mints slices via its own bwrap / podman
  driver and binds an in-slice agent the same way Phase B does.
- The slice agent's CapTP edge crosses three boundaries: in-slice
  socket → in-guest daemon → host daemon worker.  CapTP handles
  proxying transparently.

No new design work — composing Phases B + (existing lima/WSL2 plan)
is sufficient.  Document the composition once Phase 4 lands.

### Phase D — followups deferred behind in-slice agent landing

- **`sandbox.spawn` / `sandbox.exec` tool surface.**  Once the
  in-slice agent owns process spawning, exposing finer-grained tool
  shapes (e.g. "spawn into the same slice but with a different
  user-perceived cwd") is a small refactor of the slice-agent's exo
  interface.  Sequenced after Phase B.3.
- **Per-tool egress filters.**  The slice's nftables rules can be
  augmented per-tool: `webFetch` may want a stricter filter than the
  slice's default `private` profile.  Defer until operator demand.
- **Slice-agent observability.**  Surface a `help()` line on the
  slice agent listing the tool-call rate / last error / etc., for
  debugging.  Defer.

## Code distribution

Pulling out the cross-driver story into one place, since it is the
single biggest unknown:

| Driver         | Rootfs shape                         | Phase | Distribution approach                                           |
| -------------- | ------------------------------------ | ----- | --------------------------------------------------------------- |
| `bwrap`        | `host-bind`                          | B.1   | `--ro-bind` daemon's node + Endo libs into `/endo`              |
| `bwrap`        | `mount` (caller-supplied root)       | B.1   | Same as above; rootfs need not contain node                     |
| `bwrap`        | `minimal`                            | B.1   | Same as above; `/endo/bin/node` is the only node in the slice   |
| `podman`       | `host-bind` / `mount` / `minimal`    | C.1   | `--mount type=bind` daemon's node + Endo libs into `/endo`      |
| `podman`       | `oci:<ref>`                          | C.2   | Bake into a sibling layer (preferred) or bind w/ libc probe     |
| `podman+krun`  | any                                  | C.3   | virtiofs bind; deferred until kernel matrix confirmed           |
| `lima`         | (Linux guest's bwrap / podman)       | C.4   | Compose Phase B inside the guest                                |
| `wsl2`         | (Linux guest's bwrap / podman)       | C.4   | Compose Phase B inside the guest                                |

The three knobs that this matrix has to navigate are:

1. **Is a compatible node binary already inside the slice?** If yes
   (e.g. `host-bind` on a host with a recent enough node), skip the
   node binary bind and reuse the slice-native one.  If no, bind the
   daemon's node and accept the libc compatibility risk.
2. **Can the daemon's `node_modules/@endo/...` be bind-mounted?** Yes
   for bwrap / podman / lima / wsl with a host path; no for
   pre-built OCI images without a sibling layer.
3. **Can a unix socket be bind-mounted into the slice?** Yes for all
   in-tree drivers; the krun virtiofs question is what blocks C.3.

The Phase A.1 spawner-backed fallback shields the genie from all of
these — it lets the daemon-hosted genie ship "today" with sandboxed
`webFetch` / `webSearch` without taking on any of the distribution
problems.  Phase B and Phase C are progressive improvements, not
prerequisites.

## Bootstrap and lifetime

A few details that recur across phases:

- **CapTP transport.**  Reuse the daemon's existing fd-pair / unix
  socket bootstrap; the in-slice agent is functionally another
  worker.  No new wire format.
- **Pid-1 vs not.**  Pid-1 is structurally convenient because bwrap
  reaps pid-1's children automatically when pid-1 exits.  Keep the
  in-slice agent as pid-1 (replacing `sleep infinity`).
- **GC.**  The SandboxHandle pins the slice; the slice pins pid-1;
  pid-1's only outbound capability is the CapTP edge to the daemon
  worker.  Disposing the handle closes the daemon side of the
  socket; pid-1 sees EOF and exits; bwrap reaps any leftover
  children; teardown completes.
- **Concurrency.**  Multiple tool calls in flight at once are
  handled by CapTP's normal promise-pipelining.  The in-slice agent
  is a single-threaded JS process, same as a daemon worker; one
  long-running tool can starve others if it does not yield.  If
  this matters operationally, pid-1 can fork sub-workers (`fork()`
  in
  [`PLAN/endo_posix_sandbox.md`](./endo_posix_sandbox.md) §
  "Nested slices" arrives in `@endo/sandbox` Phase 3 and would be
  the right substrate).
- **Daemon restart.**  The SandboxHandle is reincarnated by the
  same formula machinery `Mount` / `ScratchMount` already use.  On
  restart, the slice's `dispose` ran (the old pid-1 is gone), the
  formula re-mints a fresh slice, and the new pid-1 reconnects.
  Tool calls that were in flight when the daemon died are lost;
  this is the existing semantics for any tool call against a
  daemon-side state and does not regress.

## Open questions

- **Should the in-slice agent be a `@endo/sandbox` export or a
  `@endo/genie` one?**  Argument for `@endo/sandbox`: the slice
  factory is the natural owner; the same agent could serve any
  caller, not just genies.  Argument for `@endo/genie`: the tool
  surface is genie-specific.  Lean toward `@endo/sandbox` exporting
  a generic `SliceAgent` interface (`spawn`, `readFile`,
  `writeFile`, `fetch`) and `@endo/genie` defining the tool-level
  wrappers on top.  Decide at Phase B.3 implementation time.

- **Is the spawner channel retained for `bash` / `exec` / `git`,
  or do they too become "send argv to pid-1"?**  Mechanically the
  latter is cleaner (one channel for everything).  But the existing
  spawner abstraction is well-tested and decouples the genie from
  the in-slice agent.  Lean toward retaining the spawner channel
  for bash/exec/git and adding the in-slice agent *alongside* it.
  Revisit if the maintenance overhead of two channels becomes
  noticeable.

- **How does the in-slice agent handle file-tools timing windows?**
  If the slice is read-write for the bind-mounted workspace, two
  concurrent `writeFile` calls (one from daemon-side, one from
  in-slice) could race.  Phase B.3 settles this by **deprecating
  daemon-side writes against the workspace** under the slice-agent
  variant — every write goes through pid-1.  No race because there
  is one writer.

- **What is the minimum Endo subset the in-slice agent needs?**
  Probably `@endo/captp`, `@endo/eventual-send`, `@endo/marshal`,
  `@endo/init`, `@endo/exo`, `@endo/patterns`, plus the
  `agent-pid1.js` script.  An audit at Phase B.1 time produces the
  exact list and any "bind these too" entries get added to the
  driver's mount spec.

- **Should `webSearch`'s HTML parse run in-slice or daemon-side?**
  Mechanically either works.  Daemon-side parse is the status quo
  (DOMParser is portable JS).  In-slice parse would be slightly
  more confined but is unnecessary — the HTML bytes are
  already-loaded data, and parsing them does not reach the network.
  Keep daemon-side.

## See also

- [`PLAN/endo_posix_sandbox.md`](./endo_posix_sandbox.md) — the
  slice-mint capability surface, network profiles, and operator
  prerequisites that this plan composes.
- [`packages/genie/CLAUDE.md`](../packages/genie/CLAUDE.md) §
  "Spawning rules" — the spawner abstraction the in-slice agent
  composes with.
- [`packages/genie/CLAUDE.md`](../packages/genie/CLAUDE.md) §
  "Tools that need host fs access stay daemon-side" — the current
  convention this plan revises (in Phase B.3 onwards, tools no
  longer "stay daemon-side"; they move into the slice agent).
- [`packages/genie/src/tools/web-fetch.js`](../packages/genie/src/tools/web-fetch.js)
  line 50 — the TODO this plan resolves.
