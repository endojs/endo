_Note for future readers_:
this document is the design for the **Endo POSIX sandbox plugin** —
an Endo capability that exposes a confined slice of a POSIX-like
system (process namespace, filesystem view, optional network) as one
or more `Exo` handles, with a primary near-term consumer of
`@endo/genie`'s workspace.
It was derived from
[`TODO/10_endo_posix_sandbox.md`](../TODO/10_endo_posix_sandbox.md),
which carried the first-pass research notes plus operator answers
to the open questions raised in that pass.
This file is the consolidated, opinion-bearing form;
the original research sketch in `TODO/` remains useful as a longer
reference for backends we considered but are deferring.

# Endo POSIX Sandbox: Plugin Plan

## Goal

Expose a "slice of a POSIX-like system" as an Endo capability surface
delivered through CapTP.
The slice is a confined process namespace plus a writable filesystem
view, optionally with a private network.
It is constructed from Endo `Mount` capabilities (granted by the
caller) and is GC-pinned by its handle — when the handle is released,
the inner processes die, scratch unmounts, and the slice goes away.

The first concrete consumer is `@endo/genie`:
the plan is to run a genie's entire workspace and `bash`/`exec`
tools _inside_ such a slice so a model that goes off the rails
cannot trivially exfiltrate from the host.

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
[`TODO/10_endo_posix_sandbox.md`](../TODO/10_endo_posix_sandbox.md)
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
  v1 ships a stub returning `notImplemented`; Phase 5 lands the real
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

| Driver  | OS      | External deps            | Phase |
|---------|---------|--------------------------|-------|
| `bwrap` | Linux   | `bwrap`, optional `pasta`| 1     |
| `podman`| Linux   | `podman` (rootless)      | 2     |
| `lima`  | macOS   | `lima` / `colima`        | 3     |
| `wsl`   | Windows | `wsl.exe`                | 4     |

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

Phase 5 lands real `fork()`; Phases 1–4 stub it as
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

### Phase 3 — macOS via lima

- Detect `limactl`.
- `prepareSlice` boots (or attaches to) a long-lived lima VM;
  mounts use virtiofs to share the cap-resolved host paths into the
  guest;
  inside the guest, the plugin runs the bwrap or podman driver
  unmodified.
- The host-side `SandboxHandle` is a thin proxy that forwards calls
  to the in-guest factory over SSH or WS-CapTP.

Exit criteria: same genie-in-a-slice acceptance test as Phase 1,
running on macOS, talking to a lima guest.

### Phase 4 — Windows via WSL2

- Detect `wsl.exe` and a registered distro the plugin can use.
- Same shape as Phase 3: a long-lived WSL2 distro, the plugin runs
  the bwrap / podman driver inside, host-side `SandboxHandle` is a
  proxy.

Exit criteria: the same acceptance test, on Windows, talking to a
WSL2 guest.

### Phase 5 — nested slices and apple containerization

- Implement `SandboxHandle.fork()` against the bwrap and podman
  drivers, with kernel-feature probing.
- Optional driver: Apple `Containerization.framework` on
  macOS 15+, gated behind a runtime check.
  Same `SandboxInterface`, faster cold-start than lima.

Exit criteria: a sandboxed genie can spawn a child genie in its own
sub-slice, on Linux; Apple driver passes the Phase 1 acceptance
test on macOS 15+ where available.

### Phase 6 — focused tools and renderer integration

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
  Decide alongside Phase 3.
- **Cgroup v2 delegation requirements** — rootless cgroup v2 needs
  `Delegate=` in the user systemd unit on some distros.
  Document the install prerequisite when Phase 1.5 lands resource
  caps.
