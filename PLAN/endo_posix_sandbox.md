_Note for future readers_:
This document is the design for the **Endo POSIX sandbox plugin** —
an Endo capability that exposes a confined slice of a POSIX-like
system (process namespace, filesystem view, optional network) as one
or more `Exo` handles, with a primary near-term consumer of
`@endo/genie`'s workspace.
It was derived from
[`TADA/10_endo_posix_sandbox.md`](../TADA/10_endo_posix_sandbox.md),
which carried the first-pass research notes plus operator answers
to the open questions raised in that pass.
This file is the consolidated, opinion-bearing form;
the original research sketch in `TADA/` remains useful as a longer
reference for backends we considered but are deferring.

# Endo POSIX Sandbox: Plugin Plan

## Goal

1. Expose a "slice of a POSIX-like system" as an Endo capability surface
   delivered through CapTP.
2. The slice is a confined process namespace plus a writable filesystem view,
   optionally with a private network.
3. It is constructed from Endo `Mount` capabilities (granted by the caller) and
   is GC-pinned by its handle — when the handle is released, the inner
   processes die, scratch unmounts, and the slice goes away.

The first concrete consumer is `@endo/genie`: the plan is to run a genie's
entire workspace and `bash`/`exec` tools _inside_ such a slice so a model that
goes off the rails cannot trivially exfiltrate from the host.

## Non-goals

- Replacing Endo's own confinement model.
  The sandbox plugin is _additional_ defense around inner processes;
  the daemon, workers, and CapTP graph remain the authoritative
  capability boundary.
- Shipping a rootfs with Endo.
  Consumers BYO their userland.
  Distributions like `@endo/familiar` may eventually add a rootfs to
  their own build, but that is out of scope for the plugin itself.
- Pulling OCI images directly.
  The podman driver delegates to `podman` for image work;
  the plugin does not embed a registry client of its own.
- Cross-platform parity in v1.
  v1 is Linux-only, with macOS and Windows landing in later phases by
  composing the same in-guest backends inside a Linux VM.
- Familiar / Electron renderer access.
  The plugin is reachable from worker-side code in v1.
  Renderer exposure and any new `protocol-handler` schemes for
  streaming sandboxed stdio into a webview are deferred — see
  [§ Familiar follow-up notes](#familiar-follow-up-notes).
- Replacing the existing `bash`/`exec`/`git` genie tools with new
  `sandbox.spawn` tools.
  The primary integration is to make the genie's _workspace_ live
  inside a slice so existing tools execute under confinement
  transparently.
  A focused `sandbox.spawn` tool may follow but is not in v1.

## Decisions

These resolve the open questions raised in
[`TADA/10_endo_posix_sandbox.md`](../TADA/10_endo_posix_sandbox.md)
§ "Responses to Open Questions".
They drive the rest of the design.

- **Pure-Node plugin, "require installed" external tools** — the
  plugin itself is a JS module loaded via `make-unconfined`.
  It shells out to `bwrap` / `podman` / `pasta` / `lima` / `wsl.exe`
  via `child_process` and fails fast with a structured error when its
  external tool is absent.
  No native helper, no setuid binary, no tarball ship-along.
- **No bundled rootfs** — every consumer brings its own rootfs.
  Phase 1 will support both "host-bind" (bind-mount the host
  `/usr`/`/etc`/etc. read-only, the Flatpak pattern) and "consumer
  rootfs" (caller passes a `Mount` capability rooted at a directory
  that already contains a userland tree).
  Future distributions may layer a built-in tarball of their own.
- **Network policy ladder** — three named profiles, picked at slice
  construction:
  1. `none` (default for `make()`-with-no-network-arg) — no network
     namespace usage of host net; loopback unreachable.
  2. `private` (recommended default for ergonomic use) — private
     network namespace via `pasta` / `slirp4netns`, NAT'd outbound,
     **explicit blocklist of RFC 1918** ranges and the host's
     loopback.
     Outbound to the public Internet works; inbound LAN, host
     loopback, and VPN/RFC 1918 ranges do not.
  3. `host-loopback` / `host-lan` / `host-net` — explicit opt-ins,
     each strictly less confined than the prior step.
     None of these are reachable without an explicit endowment from
     the caller (`{ network: 'host-loopback' }` etc.); there is no
     "auto-upgrade if private fails" path.
- **Nested slices (`fork()`)** — yes, in scope.
  This is the "agent spawns a sub-agent in its own slice" pattern
  the genie loop will eventually want.
  v1 ships a stub returning `notImplemented`; Phase 3 lands the real
  implementation, behind a kernel-feature probe (uid_map size,
  `/proc/sys/user/max_user_namespaces`).
- **Genie integration shape — workspace, not new tools** — the v1
  consumer story is to run the genie's existing tool surface
  _inside_ a slice.
  `bash`/`exec`/`git` continue to work; what changes is that their
  cwd is a sandboxed view, not the host filesystem.
  A focused `sandbox.spawn` / `sandbox.exec` tool surface is
  deferred behind the workspace integration.
- **Familiar / Electron deferred** — the renderer does not need to
  reach the sandbox plugin in v1.
  All sandbox use is from the daemon side (genie worker, future
  build-sandbox formula).
  Notes on the eventual familiar wiring are kept in
  [§ Familiar follow-up notes](#familiar-follow-up-notes).
- **CI: Linux-only at first** — the plugin's CI exercises the
  `bwrap` and `podman` drivers on a Linux runner.
  macOS/Windows test matrix arrives alongside Phases 3–4 (lima/WSL2
  drivers) and stays optional at the project level until familiar
  needs it.

## Capability surface

The plugin exposes one root capability,
`makeSandboxes` (or similar), produced by the plugin's
`make(powers, context, { env })` entry point.
That root mints individual sandbox slices.
Each slice exposes a `SandboxHandle`, which in turn mints
`ProcessHandle` and `MountHandle` for the things running and mounted
inside it.

```
make-unconfined entry → SandboxFactory ──┐
                                         │ make({ rootfs, mounts, network })
                                         ▼
                                   SandboxHandle ──┐
                                         │         │ spawn(argv, opts)
                                         │         ▼
                                         │   ProcessHandle
                                         │         │ stdin / stdout / stderr
                                         │         │ wait() / kill()
                                         │
                                         │ mount(mountCap, innerPath, opts)
                                         ▼
                                   MountHandle
```

All three are `makeExo` objects with `M.interface()` guards.
`__getMethodNames__()` works automatically;
existing CapTP introspection patterns apply.

### `SandboxFactory`

```ts
SandboxFactory {
  help() -> string
  listBackends() -> Array<{ name, available, reason? }>
  make({
    rootfs: Mount | { kind: 'host-bind' } | { kind: 'minimal' },
    mounts: Array<{ cap: Mount, innerPath: string, mode: 'ro' | 'rw' }>,
    network: 'none' | 'private' | 'host-loopback' | 'host-lan' | 'host-net',
    backend?: 'auto' | 'bwrap' | 'podman' | 'lima' | 'wsl',
    seccomp?: 'default' | 'unconfined' | { profile: ... },
    env?: Record<string, string>,
    cwd?: string,
  }) -> SandboxHandle
}
```

### `SandboxHandle`

```ts
SandboxHandle {
  help() -> string
  spawn(argv: string[], opts?: {
    env?: Record<string, string>,
    cwd?: string,
    stdin?: ReaderRef,           // attach existing reader as stdin
    captureStdout?: boolean,     // default true → stdout via WriterRef
    captureStderr?: boolean,     // default true → stderr via WriterRef
  }) -> ProcessHandle
  mount(cap: Mount, innerPath: string, mode?: 'ro' | 'rw') -> MountHandle
  scratch(innerPath: string) -> MountHandle    // ephemeral, slice-lifetime
  open(innerPath: string) -> ReadableFile      // file capability
  fork(opts?) -> SandboxHandle                 // nested sub-slice
  reset() -> Promise<void>                     // teardown processes + scratch, keep mounts
  dispose() -> Promise<void>                   // full teardown
}
```

`mount(cap, …)` deliberately requires a `Mount` capability, not a
string path.
This is the "no string paths into the slice" rule from
[§ 7. Security boundary clarity](#7-security-boundary-clarity)
in the original research notes — keeping it forces consumers to go
through Endo's confinement model and prevents the sandbox from
becoming a confused-deputy escape hatch.

### `ProcessHandle`

```ts
ProcessHandle {
  help() -> string
  pid() -> number               // pid inside the slice
  stdin() -> WriterRef          // present when captureStdin was true
  stdout() -> ReaderRef         // present when captureStdout was true
  stderr() -> ReaderRef         // present when captureStderr was true
  wait() -> Promise<{ code, signal }>
  kill(signal?: string | number) -> Promise<void>
}
```

Stdio uses Endo's existing `reader-ref` / `writer-ref` plumbing, the
same way `mount.js` already streams file bytes.
This is the `genie/bash`/`exec` tool's existing channel — no JSON
transcoding of process bytes.

### `MountHandle`

```ts
MountHandle {
  help() -> string
  innerPath() -> string
  cap() -> Mount                // back-reference to the original capability
  mode() -> 'ro' | 'rw'
  unmount() -> Promise<void>
}
```

## Backend driver interface

A driver is a JS object the plugin loads at startup that knows how
to translate `SandboxHandle` operations into a particular runtime.

```ts
interface SandboxDriver {
  name: string
  probe(): Promise<{ available: boolean, reason?: string, version?: string }>
  prepareSlice(spec: SliceSpec): Promise<DriverSliceContext>
  spawn(slice: DriverSliceContext, argv: string[], opts: SpawnOpts):
    Promise<DriverProcess>
  teardown(slice: DriverSliceContext): Promise<void>
}
```

Drivers in scope:

| Driver           | OS      | External deps              | Phase |
|------------------|---------|----------------------------|-------|
| `bwrap`          | Linux   | `bwrap`, optional `pasta`  | 1     |
| `podman`         | Linux   | `podman` (rootless)        | 2     |
| `lima`           | macOS   | `lima` / `colima`          | 4     |
| `containerization`| macOS  | macOS 15+, Apple framework | 4     |
| `wsl`            | Windows | `wsl.exe`                  | 6     |

Drivers do **not** receive Endo capabilities directly.
The plugin layer is the single mediator: it resolves each granted
`Mount` to a host path on the daemon side, hands the driver a plain
`{ hostPath, innerPath, mode }` triple, and the driver does the
bind-mount / volume mapping.
This keeps drivers simple and keeps the capability boundary in one
place.

The "direct-syscall" backend (option E in the original research)
remains deferred.
It is only worth revisiting if `bwrap` becomes unavailable somewhere
we care about, or if Endo grows a single-binary distribution mode.

## Cross-cutting concerns

### Backend probe & advertisement

`SandboxFactory.listBackends()` returns each driver's probe result.
Probing is best-effort and fast (binary present? `--version` works?
kernel feature reachable?) and runs at first call so the daemon's
boot path stays cheap when no one uses the plugin.

### Stdio bridging

The factory wraps the driver's child stdio in `reader-ref` /
`writer-ref` adapters before exposing them through `ProcessHandle`.
Genie's existing tools already consume these adapters; no genie-side
change is needed.

### Cap-not-string mounts

`mount(cap: Mount, innerPath, mode)` is the only way to bind host
state into a slice.
String host paths are not accepted.
Specifically:

- The factory does **not** receive the daemon's host-paths power.
- `Mount` capabilities are resolved to host paths inside the
  factory's `prepareSlice` step, where the cap-to-path resolution
  is the only privileged operation.
- Read-only mounts are the default; `rw` is opt-in per mount.

### Garbage collection

A `SandboxHandle` formula pins, by reference:

- the rootfs source (`Mount` capability or marker for host-bind),
- every granted `Mount` cap,
- a `ScratchMount` for the writable upper layer (cleaned up by the
  daemon's existing scratch cleanup).

When the handle is unpinned:

1. `dispose()` runs.
2. Every live `ProcessHandle` is killed (`SIGTERM`, then `SIGKILL`
   after a grace).
3. Every `MountHandle` unmounts.
4. The driver's `teardown` cleans up the namespace / container.

`ScratchMount` removal piggy-backs on the daemon's existing scratch
GC — no new sweep loop needed.

### Network policy

The three default profiles map to driver behaviour:

- `none` — bwrap: omit `--share-net`.
  podman: `--network none`.
- `private` — bwrap: pair with `pasta` driving a private netns,
  applying an outbound nftables / iptables filter that rejects
  RFC 1918 (`10/8`, `172.16/12`, `192.168/16`),
  `100.64/10` (CGNAT), `169.254/16`, `fc00::/7`, and the host's
  loopback.
  podman: `--network slirp4netns:port_handler=...` plus the same
  egress filter expressed via `--network` driver options where
  available, otherwise applied inside the netns at startup.
- `host-loopback` — share host net namespace but install a
  policy that drops everything except `127.0.0.0/8` / `::1`.
  Useful for "talk to the daemon I'm running" cases.
- `host-lan` — share host net namespace, no extra filter on
  RFC 1918, still drop public Internet.
  Useful for offline LAN builds.
- `host-net` — share host net namespace, no extra filtering.
  This is the "I'm just using the sandbox for filesystem
  confinement" escape hatch; the consumer must explicitly pass it.

Profiles are validated at slice construction; an unknown profile is
a hard error, not a fall-through.

### Nested slices

`SandboxHandle.fork()` is implemented by recursively asking the same
backend for a slice _inside_ the parent's namespaces.
Two constraints:

- Linux: kernel must allow nested user namespaces and have a
  big-enough `uid_map`.
  Probe at first `fork()` call, return a structured error if the
  kernel says no.
- The forked slice's mounts are scoped to the parent's view —
  there is no way to grant a child slice a mount the parent does
  not already have.

Phase 3 lands real `fork()`; Phases 1, 1.5, and 2 stub it as
`notImplemented`.

### Plugin shape in Endo

A `make-unconfined` formula loaded from the daemon, mirroring the
shape of `lal`, `jaine`, and the existing networks plugins.

```js
// packages/sandbox/agent.js (sketch — not for implementation yet)
export const make = async (powers, _context, { env } = {}) => {
  const drivers = await loadDrivers({ env });
  return makeSandboxFactory({ drivers, scratchProvider: powers });
};
```

Powers needed:

- `child_process.spawn` of an allow-listed binary set
  (`bwrap`, `pasta`, `podman`, `lima`, `wsl.exe` — plus the
  rootfs caller's chosen interpreter, which we just pass through
  to the inner exec).
- Read access to a config dir (where probe results, optional
  pasta config, etc. live).
- Writable scratch path via the daemon's `provideScratchMount`.
- _Not_ the host-paths power.
  All host-path access is mediated through `Mount` capabilities
  the caller hands in.

### Security boundary clarity

Three rules, restated explicitly:

1. The plugin never accepts string host paths from the caller.
   Mounts are `Mount` capabilities or nothing.
2. The plugin does not receive the daemon's host-paths power
   transitively, even though it could nominally use it.
3. Network profiles are explicit and named.
   `'private'` does not accidentally upgrade to `'host-net'` on
   misconfiguration; misconfig is an error, not a relaxation.

## Implementation phases

Each phase is independently mergeable.
Phase 1 is the smallest thing that delivers value (genie running in a
bwrap slice on Linux); later phases broaden platform support and
harden the slice.

### Phase 0 — driver interface design

- Specify the `SandboxFactory` / `SandboxHandle` / `ProcessHandle` /
  `MountHandle` interfaces formally as `M.interface()` guards.
- Define the `SandboxDriver` adapter type and the `SliceSpec` shape
  drivers consume.
- Land in `packages/sandbox/src/types.d.ts` plus a stub
  `packages/sandbox/src/factory.js` that returns a "no driver
  available" factory.
- No production driver code yet.

Exit criteria: types compile under `// @ts-check`; the stub factory
loads inside a daemon and answers `listBackends()` with an empty
list.

### Phase 1 — bwrap driver on Linux

- Detection (`bwrap --version`).
- `prepareSlice`:
  - resolve granted `Mount` caps to host paths,
  - assemble bwrap argv (one `--ro-bind` / `--bind` per mount),
  - layer a `ScratchMount` as the writable upper,
  - apply `--unshare-all`, `--die-with-parent`,
    `--no-new-privileges`,
  - drop unnecessary capabilities,
  - install a baseline seccomp profile (the
    podman/docker default-deny set is a good starting point).
- `spawn`: run `bwrap … -- argv`, wrap stdio in
  `reader-ref` / `writer-ref`.
- Network: `none` and `private` (the latter via `pasta`,
  with the egress filter described above).
  `host-*` profiles return `notImplemented` until Phase 1.5.
- Tests: an in-tree test that spawns `/bin/echo hello` inside a
  slice rooted at the host's `/usr` (host-bind rootfs).
  Tests forge a daemon, mirroring the gateway-test pattern.

Exit criteria: a genie configured with
`GENIE_WORKSPACE` pointing at a `Mount`-rooted scratch slice can
invoke `bash` and see only the explicitly granted mounts.

### Phase 1.5 — bwrap hardening passes

- `host-loopback` / `host-lan` / `host-net` profiles.
- Landlock allowlist on Linux ≥ 5.13 (probed; absent kernel ⇒ slice
  still works, just without the extra layer).
- seccomp profile review against current podman/docker defaults.
- `prlimit` / cgroup v2 caps (rss, cpu, pids).

Exit criteria: a slice run with `network: 'private'` cannot reach
host loopback, RFC 1918 LAN, or VPN ranges, and Landlock is in the
slice's syscall trace where the kernel supports it.

### Phase 2 — podman driver

- Same `SandboxDriver` interface, backed by
  `podman create` / `podman start` / `podman exec`.
- Image story: caller supplies an OCI image reference;
  the driver pulls via `podman pull` if not present.
  The plugin does not wrap a registry client.
- Network profiles map to podman's `--network` flag plus the same
  egress filter as bwrap's `private` profile.
- Mounts: `--mount type=bind,...` from the same cap-resolution
  pipeline as bwrap.

Exit criteria: a slice configured with a Debian or Alpine image
runs `apt`/`apk` against its private rootfs without touching the
host system.

### Phase 3 — nested slices

(Was Phase 5; promoted ahead of multi-platform work so the
nested-slice pattern is in place before lima / WSL2 drivers are
asked to compose it.)

- Implement `SandboxHandle.fork()` against the bwrap and podman
  drivers, with kernel-feature probing
  (uid_map size, `/proc/sys/user/max_user_namespaces`).
- Forked slice's mounts are scoped to the parent's view; no way to
  grant a child a mount the parent does not have.
- Replace the Phase 1 / 1.5 / 2 `notImplemented` stub with the real
  implementation, returning a structured error if the kernel
  refuses nesting.

Exit criteria: on Linux, under both the bwrap and podman drivers,
`SandboxHandle.fork()` mints a sub-slice that

- inherits the parent's mount view (and only that view),
- runs at a network profile no broader than the parent's,
- is torn down before the parent is, and
- on a kernel that refuses nesting, fails with a structured probe
  error rather than a silent partial setup.

The acceptance test exercises both drivers and both the
"successful nest" and "kernel refused" paths.
No genie code is touched in this phase — the genie integration is
Phase 3.5.

### Phase 3.5 — genie integration

(New phase; written 2026-04-29 after the Phase 0 + Phase 1 (genie as
`@self`) + Phase 2 (primordial genie + `/model` builtin) work landed
on the genie side.
See [`PLAN/genie_in_bottle.md`](./genie_in_bottle.md) for the bottle
deployment shape and `packages/genie/CLAUDE.md` for the current root
genie identity model.)

This phase wires the sandbox plugin into `@endo/genie` as the first
real consumer of `SandboxHandle.fork()`.
It has two distinct surfaces, addressing two different deployment
shapes that the bottle work has split out since the original PLAN
was drafted.

#### 3.5a — root-genie workspace slice

**Landed** (2026-04 / 2026-05): the integration shipped against the
"tools spawn through the slice; worker stays on the host" intermediate
shape called out in the "Open" note below.
See
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
for the consolidated decision record (slice minted main-side, slice
formula owned by `packages/sandbox`) and sub-tasks
[`TADA/31_…workspace_mount`](../TADA/31_endo_genie_sandbox_workspace_mount.md),
[`TADA/32_…factory_register`](../TADA/32_endo_genie_sandbox_factory_register.md),
[`TADA/33_…persist_slice`](../TADA/33_endo_genie_sandbox_persist_slice.md),
[`TADA/34_…main_wiring`](../TADA/34_endo_genie_sandbox_main_wiring.md),
[`TADA/35_…tool_spawn`](../TADA/35_endo_genie_sandbox_tool_spawn.md),
[`TADA/36_…workspace_path`](../TADA/36_endo_genie_sandbox_workspace_path.md),
and
[`TADA/37_…host_worker_residual`](../TADA/37_endo_genie_sandbox_host_worker_residual.md)
for the per-deliverable landing notes.
The worker-inside-slice variant — the harder closure of the residual
host-side `eval` exposure — is filed as a follow-up under
[`TADA/24_…worker_inside_slice`](../TADA/24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md).

The "genie-as-workspace" integration originally sketched in
[§ Genie integration shape](#genie-integration-shape) was written
when the genie booted via a daemon-side configuration form into a
provisioned guest.
Phase 1 (genie self) collapsed that into a `makeUnconfined`
launcher: `setup.js` materialises `main.js` as the daemon's
`@self` worker directly via
`E(hostAgent).makeUnconfined('@main', main.js, { powersName:
'@agent', resultName: 'main-genie', env })`.
There is no intermediate guest, no form submission, no
`provideGuest` call on the boot path.

The workspace-slice integration therefore now lands as a
`setup.js` revision (or its successor, see "open" below):

- Before calling `makeUnconfined`, the launcher mints a
  `SandboxHandle` with the operator-granted workspace `Mount`,
  `network: 'private'`, and the operator's chosen extras.
- The handle is pinned in the host pet store under a stable name
  (e.g. `main-genie-sandbox`) so the daemon can reincarnate the
  slice on restart from the same spec, mirroring the existing
  `Mount` / `ScratchMount` formula pattern.
- `makeUnconfined` is then issued **inside** the slice (via a new
  `slice.makeUnconfined` or by passing the slice handle through to
  the launcher and routing the spawn through `SandboxHandle.spawn`
  — exact shape to be decided when this lands).
- The genie's existing `bash` / `exec` / `git` tools spawn through
  the slice unchanged externally; what changes is the daemon-side
  spawn channel.
- The bottle script (`bottle.sh invoke`) calls the new launcher
  unmodified — slice construction is invisible to the operator.

Open: `setup.js` / `main.js` today own the daemon's `@self`, so
making the worker itself live inside a slice requires the slice
handle to wrap the worker spawn — the simpler "tools spawn through
the slice but the worker stays on the host" shape may be a useful
intermediate step.
Decide during the Phase 3.5a sub-task.

#### 3.5b — sub-agent sandboxing (revives `provideGuest`)

The `spawnAgent`, `removeChildAgent`, and `listChildAgents` helpers
in `packages/genie/main.js` are retained but dormant — see
`packages/genie/CLAUDE.md` § "Sub-agent spawning (deferred)".
The `provideGuest`-backed boot path they used was removed in commit
`140c44122` (`feat(genie) embody the main agent, full @self ; RIP
provideGuest`), which collapsed the form-driven launcher chain
when the root genie became `@self`.
The helpers stayed in the tree on the explicit understanding that
a future capability would spawn child agents — and Phase 3.5b is
that future capability.

With Phase 3 in hand, child agents take their natural shape:

- The parent agent calls `SandboxHandle.fork(opts)` on its own
  slice to mint a child slice.
  The fork's mount attenuation expresses the child's workspace
  policy: a child sharing the parent's workspace mounts at a
  sub-path is a "scoped within parent" agent;
  a child whose only mount is a freshly-granted standalone
  `Mount` is a "wholly separate workspace" agent.
- The parent then re-introduces the dormant helper, but routed
  through the sandbox: `provideGuest(name, { introducedNames })`
  on the parent's host agent provisions the child's identity, and
  `slice.makeUnconfined` (or equivalent) lands `main.js` inside
  the forked slice under that identity.
- `agentDirectory` tracking (the parent records the child's
  locator under `<dir>/<name>` so siblings and external observers
  can discover via the pet namespace) is preserved verbatim from
  the dormant helper.
- The parent exposes the spawn surface as a CapTP method on the
  root genie's exo (or as a `/spawn` builtin in the specials
  dispatcher — decide at task-authoring time).
- Removal (`removeChildAgent`) tears down the sub-slice via the
  slice handle's GC pin, then removes the host-level guest;
  parent disposal cascades to children via Phase 3's GC ordering.

The two attenuation modes — "share parent's workspace" vs.
"wholly separate" — mirror the way fork's mount inheritance works:
the parent's mount view is the **upper bound**; what the parent
hands to the child is a (possibly empty) attenuation of that view
plus any newly-granted external `Mount` capabilities.
A child can never see a host path the parent does not.

Exit criteria: a Phase 3.5a-sandboxed root genie can

- accept a CapTP request to spawn a named sub-agent inside a
  forked sub-slice with operator-specified mount attenuation,
- run that sub-agent's `main.js` inside the sub-slice with its own
  guest identity, agent-directory entry, and reachable workspace,
- enumerate live sub-agents via the existing `listChildAgents`
  helper exposed as a CapTP method, and
- cleanly remove a sub-agent (sub-slice torn down, guest removed,
  directory entry cleared).

The acceptance test runs under both bwrap and podman, exercises
both attenuation modes, and asserts that a sub-agent cannot
escape into a parent-only mount.

### Phase 4 — macOS via lima and apple containerization

(Was Phase 3; combined with the Apple `Containerization.framework`
driver that previously lived in Phase 5, so the macOS story lands
as a single phase covering both the lima fallback and the modern
macOS 15+ upgrade.)

- Detect `limactl`.
- `prepareSlice` boots (or attaches to) a long-lived lima VM;
  mounts use virtiofs to share the cap-resolved host paths into the
  guest;
  inside the guest, the plugin runs the bwrap or podman driver
  unmodified.
- The host-side `SandboxHandle` is a thin proxy that forwards calls
  to the in-guest factory over SSH or WS-CapTP.
- Optional driver: Apple `Containerization.framework` on
  macOS 15+, gated behind a runtime check.
  Same `SandboxInterface`, faster cold-start than lima.

Exit criteria: same genie-in-a-slice acceptance test as Phase 1,
running on macOS, talking to a lima guest;
Apple driver passes the Phase 1 acceptance test on macOS 15+
where available.

### Phase 6 — Windows via WSL2

(Was Phase 4; deferred until after macOS lands, since the familiar
roadmap prioritises macOS over Windows and WSL2 support reuses the
same in-guest backend pattern lima establishes.)

- Detect `wsl.exe` and a registered distro the plugin can use.
- Same shape as Phase 4: a long-lived WSL2 distro, the plugin runs
  the bwrap / podman driver inside, host-side `SandboxHandle` is a
  proxy.

Exit criteria: the same acceptance test, on Windows, talking to a
WSL2 guest.

### Phase 7 — focused tools and renderer integration

Deferred follow-ups, scoped only after the workspace integration is
in production use:

- A genie-side `sandbox.spawn` / `sandbox.exec` tool surface for
  agents that want fine-grained slice control rather than a
  whole-workspace slice.
- Familiar / Electron renderer access — see
  [§ Familiar follow-up notes](#familiar-follow-up-notes).
- An OCI-pull rootfs source backed by `skopeo` rather than `podman`,
  so the bwrap driver can use OCI images without the podman daemon.
- Optional `sandbox-exec` defense-in-depth wrap around the daemon's
  own native worker on macOS.

## Genie integration shape

In v1 the genie consumes the sandbox plugin as a workspace, not as a
new tool surface.
The shape:

1. `setup-genie` (or its successor) calls `makeSandboxes.make(...)`
   with:
   - a `Mount` for the genie's persistent workspace
     (`MEMORY.md`, `HEARTBEAT.md`, `.genie/`),
   - `network: 'private'`,
   - any caller-granted extra mounts (e.g. a project the operator
     wants the genie to work on).
2. The returned `SandboxHandle` is passed into `main.js` alongside
   `powers`.
3. `main.js`'s tool registry constructs `bash`/`exec`/`git` such
   that they `spawn` through the handle instead of through
   `child_process.spawn` directly.
4. `GENIE_WORKSPACE` resolves to the slice-internal path
   (e.g. `/workspace`), which the handle exposes to the inner
   process.

Net result: existing genie tools unchanged externally; the
daemon-side wiring swaps the spawn channel.
The genie cannot exfiltrate via `bash` because the slice's network
profile drops RFC 1918, host loopback, and the host filesystem is
unreachable except through the explicitly granted mounts.

The handle is GC-pinned by the genie's `main-genie` formula, so a
daemon restart reincarnates the slice from the same rootfs / mounts /
network spec.
This is the same pattern `Mount` / `ScratchMount` already use.

## Familiar follow-up notes

Out of scope for v1, captured here so we don't lose context.

- **Renderer reach** — the renderer should reach the sandbox plugin
  only via the existing CapTP edge to its worker.
  Direct renderer ↔ plugin wiring would re-open the very
  exfiltration questions the sandbox is meant to close.
- **Stdio in webviews** — `protocol-handler.js` could grow a
  `endo-sandbox-stdio:` scheme that streams a `ReaderRef` into a
  webview, with `exfiltration-defense.js` narrowing what the page
  can do with the bytes.
  Worth scoping after Phase 1 ships.
- **Familiar-managed rootfs** — familiar's build is the right place
  to ship a small Alpine or busybox tarball, since familiar already
  has a packaging step.
  The sandbox plugin proper still does not ship one.
- **macOS / Windows familiar matrix** — when familiar starts caring
  about the sandbox, we revisit the Linux-only-CI decision and add
  cross-OS CI specifically for the familiar build.

## Open questions

The original open-questions round resolved the major decisions.
A handful of secondary questions remain, to be answered as the
phases land:

- **Default seccomp profile** — start with the podman/docker default
  set, or a tighter subset?
  Defer to Phase 1 implementation; whichever we pick, document the
  exact denylist and version it.
- **Egress filter mechanism for `private` network** — `pasta`'s
  built-in flags suffice for blocking RFC 1918 in some versions but
  not all; an in-netns nftables rule is the more portable answer.
  Confirm during Phase 1.5 against the current Debian / Ubuntu /
  Fedora `pasta` versions.
- **Long-lived guest VM lifecycle on macOS / Windows** —
  one VM per slice is too expensive; one VM per daemon is the
  obvious answer but raises cleanup questions when the daemon
  restarts.
  Decide alongside Phase 4 (lima / Apple containerization).
- **Cgroup v2 delegation requirements** — rootless cgroup v2 needs
  `Delegate=` in the user systemd unit on some distros.
  Document the install prerequisite when Phase 1.5 lands resource
  caps.
