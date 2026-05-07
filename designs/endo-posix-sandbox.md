# Endo POSIX Sandbox

| | |
|---|---|
| **Created** | 2026-05-07 |
| **Updated** | 2026-05-07 |
| **Author** | Joshua T Corbin (PLAN) |
| **Author** | Kris Kowal (designs/ mirror) |
| **Status** | In Progress (Phase 3) |

## Source

This design mirrors and tracks
[`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md) on the
`packages/sandbox` working branch.
The PLAN is the authoritative phase-by-phase implementation log;
this design is the roadmap-aligned mirror for milestone-tracking
purposes (project velocity, ETD per milestone) per
[review comment 3203724907](https://github.com/endojs/endo-but-for-bots/pull/119#discussion_r3203724907)
on PR #119.

When the PLAN advances a phase, this design's Status row and the
Phase Progression table below should be updated to match.

## What is the Problem Being Solved?

Endo confines JavaScript code through hardened Compartments and the
CapTP graph, but native processes spawned by Endo workers (genie's
`bash`, `exec`, `git` tools; future build sandboxes; future renderer
helpers) run with the daemon user's full host authority.
A model that goes off the rails inside a genie loop can today
exfiltrate via `bash`, scan the host filesystem, or reach RFC 1918
LAN services without any added barrier.

The Endo POSIX Sandbox plugin exposes a "slice of a POSIX-like
system" as a CapTP capability surface.
A slice is a confined process namespace plus a writable filesystem
view, optionally with a private network, GC-pinned by its handle.
When the handle is released, inner processes die, scratch unmounts,
and the slice goes away.
The first concrete consumer is `@endo/genie`: the plan is to run a
genie's entire workspace and `bash`/`exec` tools _inside_ such a
slice so an off-the-rails model cannot trivially exfiltrate from
the host.

This is _additional_ defense around inner processes;
the daemon, workers, and CapTP graph remain the authoritative
capability boundary.
The plugin does not replace Endo's own confinement model.

## Relationship to `daemon-os-sandbox-plugin`

The earlier
[`daemon-os-sandbox-plugin`](daemon-os-sandbox-plugin.md) design
(2026-02-15, Not Started) sketched a single platform-detecting
plugin built around `sandbox-exec` on macOS and `bwrap` on Linux,
with an `Endowments` descriptor and a `Sandbox.run()` method.

This design supersedes that sketch in three ways:

1. The capability surface is split across `SandboxFactory` /
   `SandboxHandle` / `ProcessHandle` / `MountHandle` so a slice's
   lifetime, mounts, and processes are individually addressable
   (and individually GC-pinnable).
2. Mounts are `Mount` capabilities, never string host paths;
   the plugin does not receive the daemon's host-paths power.
3. The phase plan stages bwrap → podman → fork() → macOS → Windows,
   with macOS and Windows using the in-guest backend + host-side
   proxy pattern that lima establishes, rather than maintaining a
   parallel SBPL backend.

The older design remains in the index as the historical proposal;
new implementation work tracks against this document and the PLAN.

## Description of the Design

### Capability surface

The plugin exposes one root capability, `makeSandboxes`, produced
by the plugin's `make(powers, context, { env })` entry point.
That root mints individual sandbox slices.
Each slice exposes a `SandboxHandle`, which in turn mints
`ProcessHandle` and `MountHandle` objects.

```
make-unconfined entry → SandboxFactory ──┐
                                         │ make({ rootfs, mounts, network })
                                         ▼
                                   SandboxHandle ──┐
                                         │         │ spawn(argv, opts)
                                         │         ▼
                                         │   ProcessHandle
                                         │
                                         │ mount(mountCap, innerPath, opts)
                                         ▼
                                   MountHandle
```

All three are `makeExo` objects with `M.interface()` guards;
existing CapTP introspection patterns apply.

`SandboxFactory` exposes `listBackends()` and `make({ rootfs,
mounts, network, backend?, seccomp?, env?, cwd? })`.
`SandboxHandle` exposes `spawn(argv, opts)`, `mount(cap, innerPath,
mode)`, `scratch(innerPath)`, `open(innerPath)`, `fork(opts)`,
`reset()`, and `dispose()`.
`ProcessHandle` exposes `pid()`, `stdin()`, `stdout()`, `stderr()`,
`wait()`, and `kill(signal)`, with stdio streamed through Endo's
existing `reader-ref` / `writer-ref` plumbing.

### Cap-not-string mounts

`SandboxHandle.mount(cap, innerPath, mode)` is the only way to bind
host state into a slice.
String host paths are not accepted.
The factory does not receive the daemon's host-paths power;
`Mount` capabilities are resolved to host paths inside the
factory's `prepareSlice` step, where the cap-to-path resolution is
the only privileged operation.
Read-only mounts are the default; `rw` is opt-in per mount.

This rule keeps the capability boundary in one place and prevents
the sandbox from becoming a confused-deputy escape hatch.

### Network policy ladder

Three named profiles, picked at slice construction:

1. `none` (default) — no network namespace usage of host net;
   loopback unreachable.
2. `private` (recommended for ergonomic use) — private network
   namespace via `pasta` / `slirp4netns`, NAT'd outbound, with an
   explicit blocklist of RFC 1918 (`10/8`, `172.16/12`,
   `192.168/16`), `100.64/10` (CGNAT), `169.254/16`, `fc00::/7`,
   and the host's loopback.
   Outbound to the public Internet works; inbound LAN, host
   loopback, and VPN/RFC 1918 ranges do not.
3. `host-loopback` / `host-lan` / `host-net` — explicit opt-ins,
   each strictly less confined than the prior step.
   None of these are reachable without an explicit endowment from
   the caller; there is no "auto-upgrade if private fails" path.

Profiles are validated at slice construction; an unknown profile
is a hard error, not a fall-through.

### Backend driver interface

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
`Mount` to a host path on the daemon side, hands the driver a
plain `{ hostPath, innerPath, mode }` triple, and the driver does
the bind-mount / volume mapping.
This keeps drivers simple and keeps the capability boundary in one
place.

The "direct-syscall" backend remains deferred.
It is only worth revisiting if `bwrap` becomes unavailable
somewhere we care about, or if Endo grows a single-binary
distribution mode.

### Garbage collection

A `SandboxHandle` formula pins, by reference:

- the rootfs source (`Mount` capability or marker for host-bind),
- every granted `Mount` cap,
- a `ScratchMount` for the writable upper layer (cleaned up by the
  daemon's existing scratch cleanup).

When the handle is unpinned, `dispose()` runs.
Every live `ProcessHandle` is killed (`SIGTERM`, then `SIGKILL`
after a grace).
Every `MountHandle` unmounts.
The driver's `teardown` cleans up the namespace / container.
`ScratchMount` removal piggy-backs on the daemon's existing
scratch GC — no new sweep loop needed.

### Environment defaults

A slice's `$PATH` (and anything else the inner shell looks up by
short name) is synthesised from the rootfs shape when the caller
does not supply one explicitly:

- `host-bind` — start with the canonical Debian / Ubuntu order
  (`/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin`),
  then append survivors mined from the daemon's own `$PATH`
  (`/opt/...`, `/snap/bin`, `/var/lib/flatpak/exports/bin`, …).
  Survivors must be absolute paths, must not contain a `..`
  segment, and must not begin with `/home`, `/Users`, `/root`,
  `/tmp`, `/var/tmp`, or `/run/user`.
  Each survivor is bind-mounted read-only into the slice so the
  `$PATH` entry actually points at something inside the namespace.
- `mount` — probe the host rootfs for the canonical bin dirs that
  exist underneath it; use the slice-internal paths and fall back
  to the canonical default when the probe finds nothing.
- `minimal` — fall back to the canonical default.
- `oci` (podman driver) — the image's `Config.Env` PATH, probed
  once via `podman image inspect` and cached per image ref;
  falls back to the canonical default when the image declares no
  PATH.
  The resolved value is injected at `podman create` time as `-e
  PATH=…` so the slice's effective PATH is observable from the
  host regardless of whether the image declared one.

Caller-granted mounts whose `innerPath` ends in `/bin` or `/sbin`
are promoted to the synthesised `$PATH`, but land **after** the
rootfs-derived entries so a hostile mount cannot shadow `/usr/bin`
with a bin dir of its own.
A caller-supplied `env.PATH` always wins;
the synthesis only fires when the slice's `env` does not include
`PATH`.

### Plugin shape in Endo

A `make-unconfined` formula loaded from the daemon, mirroring the
shape of `lal`, `jaine`, and the existing networks plugins.

Powers needed:

- `child_process.spawn` of an allow-listed binary set (`bwrap`,
  `pasta`, `podman`, `lima`, `wsl.exe` — plus the rootfs caller's
  chosen interpreter).
- Read access to a config dir.
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

## Genie integration shape

In v1 the genie consumes the sandbox plugin as a workspace, not as
a new tool surface.

1. `setup-genie` (or its successor) calls
   `makeSandboxes.make(...)` with a `Mount` for the genie's
   persistent workspace (`MEMORY.md`, `HEARTBEAT.md`, `.genie/`),
   `network: 'private'`, and any caller-granted extra mounts.
2. The returned `SandboxHandle` is passed into `main.js` alongside
   `powers`.
3. `main.js`'s tool registry constructs `bash`/`exec`/`git` such
   that they `spawn` through the handle instead of through
   `child_process.spawn` directly.
4. `GENIE_WORKSPACE` resolves to the slice-internal path
   (e.g. `/workspace`).

Net result: existing genie tools unchanged externally;
the daemon-side wiring swaps the spawn channel.
The genie cannot exfiltrate via `bash` because the slice's network
profile drops RFC 1918, host loopback, and the host filesystem is
unreachable except through the explicitly granted mounts.

The handle is GC-pinned by the genie's `main-genie` formula, so a
daemon restart reincarnates the slice from the same rootfs / mounts /
network spec.
This is the same pattern `Mount` / `ScratchMount` already use.

## Phase progression

Each phase is independently mergeable.
Phase 1 is the smallest thing that delivers value (genie running
in a bwrap slice on Linux);
later phases broaden platform support and harden the slice.

The PLAN is the authoritative source for phase status; the table
below is the roadmap-aligned summary.

| Phase | Description                              | Status        |
|-------|------------------------------------------|---------------|
| 0     | Driver interface design                  | **Complete**  |
| 1     | bwrap driver on Linux                    | **Complete**  |
| 1.5   | bwrap hardening (Landlock, seccomp, cgroups) | Not Started |
| 2     | podman driver                            | In Progress   |
| 3     | Nested slices (`fork()`)                 | In Progress   |
| 4     | macOS via lima and Apple Containerization | Not Started   |
| 6     | Windows via WSL2                         | Not Started   |
| 7     | Focused tools and renderer integration   | Deferred      |

Phase 5 is intentionally absent;
the original Phase 5 (Apple Containerization) has been folded into
Phase 4, and the original Phase 4 (Windows / WSL2) was renumbered
to Phase 6 so macOS lands before Windows.

### Phase 0 — driver interface design

- Specify the `SandboxFactory` / `SandboxHandle` / `ProcessHandle`
  / `MountHandle` interfaces formally as `M.interface()` guards.
- Define the `SandboxDriver` adapter type and the `SliceSpec`
  shape drivers consume.
- Land in `packages/sandbox/src/types.d.ts` plus a stub
  `packages/sandbox/src/factory.js` that returns a "no driver
  available" factory.

Exit criteria: types compile under `// @ts-check`;
the stub factory loads inside a daemon and answers
`listBackends()` with an empty list.

### Phase 1 — bwrap driver on Linux

- Detection (`bwrap --version`).
- `prepareSlice`: resolve granted `Mount` caps to host paths;
  assemble bwrap argv (one `--ro-bind` / `--bind` per mount);
  layer a `ScratchMount` as the writable upper;
  apply `--unshare-all`, `--die-with-parent`,
  `--no-new-privileges`;
  drop unnecessary capabilities;
  install a baseline seccomp profile (the podman/docker default-deny
  set is a good starting point).
- `spawn`: run `bwrap … -- argv`, wrap stdio in `reader-ref` /
  `writer-ref`.
- Network: `none` and `private` (the latter via `pasta`, with the
  egress filter described above).
  `host-*` profiles return `notImplemented` until Phase 1.5.
- Tests: an in-tree test that spawns `/bin/echo hello` inside a
  slice rooted at the host's `/usr` (host-bind rootfs).

Exit criteria: a genie configured with `GENIE_WORKSPACE` pointing
at a `Mount`-rooted scratch slice can invoke `bash` and see only
the explicitly granted mounts.

### Phase 1.5 — bwrap hardening passes

- `host-loopback` / `host-lan` / `host-net` profiles.
- Landlock allowlist on Linux ≥ 5.13 (probed; absent kernel ⇒
  slice still works, just without the extra layer).
- seccomp profile review against current podman/docker defaults.
- `prlimit` / cgroup v2 caps (rss, cpu, pids).

Exit criteria: a slice run with `network: 'private'` cannot reach
host loopback, RFC 1918 LAN, or VPN ranges, and Landlock is in the
slice's syscall trace where the kernel supports it.

### Phase 2 — podman driver

- Same `SandboxDriver` interface, backed by `podman create` /
  `podman start` / `podman exec`.
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
  drivers, with kernel-feature probing (uid_map size,
  `/proc/sys/user/max_user_namespaces`).
- Forked slice's mounts are scoped to the parent's view;
  no way to grant a child a mount the parent does not have.
- Replace the Phase 1 / 1.5 / 2 `notImplemented` stub with the
  real implementation, returning a structured error if the kernel
  refuses nesting.

Exit criteria: a sandboxed genie can spawn a child genie in its
own sub-slice, on Linux, under both the bwrap and podman drivers.

### Phase 4 — macOS via lima and Apple Containerization

(Was Phase 3; combined with the Apple `Containerization.framework`
driver that previously lived in Phase 5, so the macOS story lands
as a single phase covering both the lima fallback and the modern
macOS 15+ upgrade.)

- Detect `limactl`.
- `prepareSlice` boots (or attaches to) a long-lived lima VM;
  mounts use virtiofs to share the cap-resolved host paths into
  the guest;
  inside the guest, the plugin runs the bwrap or podman driver
  unmodified.
- The host-side `SandboxHandle` is a thin proxy that forwards
  calls to the in-guest factory over SSH or WS-CapTP.
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
- Same shape as Phase 4: a long-lived WSL2 distro, the plugin
  runs the bwrap / podman driver inside, host-side `SandboxHandle`
  is a proxy.

Exit criteria: the same acceptance test, on Windows, talking to a
WSL2 guest.

### Phase 7 — focused tools and renderer integration

Deferred follow-ups, scoped only after the workspace integration
is in production use:

- A genie-side `sandbox.spawn` / `sandbox.exec` tool surface for
  agents that want fine-grained slice control rather than a
  whole-workspace slice.
- Familiar / Electron renderer access — see Familiar follow-up
  notes below.
- An OCI-pull rootfs source backed by `skopeo` rather than
  `podman`, so the bwrap driver can use OCI images without the
  podman daemon.
- Optional `sandbox-exec` defense-in-depth wrap around the
  daemon's own native worker on macOS.

## Affected Packages

- **`packages/sandbox`** — New package containing the plugin
  source: `src/types.d.ts`, `src/factory.js`, driver modules
  under `src/drivers/{bwrap,podman,lima,wsl}.js`, the shared
  `src/drivers/path.js` for the canonical default `$PATH`.
- **`packages/daemon`** — Plugin registration via
  `make-unconfined`; capability wiring through `provideScratchMount`.
- **`packages/genie`** — Workspace integration: `setup-genie` (or
  successor) constructs the slice and passes the
  `SandboxHandle` to `main.js`;
  the tool registry routes `bash`/`exec`/`git` through the handle.
- **`packages/familiar`** — Out of scope for v1;
  see Familiar follow-up notes.

## Non-goals

- Replacing Endo's own confinement model.
  The sandbox plugin is _additional_ defense around inner
  processes;
  the daemon, workers, and CapTP graph remain the authoritative
  capability boundary.
- Shipping a rootfs with Endo.
  Consumers BYO their userland.
- Pulling OCI images directly.
  The podman driver delegates to `podman` for image work;
  the plugin does not embed a registry client of its own.
- Cross-platform parity in v1.
  v1 is Linux-only, with macOS and Windows landing in later phases
  by composing the same in-guest backends inside a Linux VM.
- Familiar / Electron renderer access.
  The plugin is reachable from worker-side code in v1.
  Renderer exposure and any new `protocol-handler` schemes for
  streaming sandboxed stdio into a webview are deferred.
- Replacing the existing `bash`/`exec`/`git` genie tools with new
  `sandbox.spawn` tools.
  The primary integration is to make the genie's _workspace_ live
  inside a slice so existing tools execute under confinement
  transparently.

## Familiar follow-up notes

Out of scope for v1, captured here so the context is not lost.

- **Renderer reach** — the renderer should reach the sandbox
  plugin only via the existing CapTP edge to its worker.
  Direct renderer ↔ plugin wiring would re-open the very
  exfiltration questions the sandbox is meant to close.
- **Stdio in webviews** — `protocol-handler.js` could grow an
  `endo-sandbox-stdio:` scheme that streams a `ReaderRef` into a
  webview, with `exfiltration-defense.js` narrowing what the page
  can do with the bytes.
  Worth scoping after Phase 1 ships.
- **Familiar-managed rootfs** — familiar's build is the right
  place to ship a small Alpine or busybox tarball, since familiar
  already has a packaging step.
  The sandbox plugin proper still does not ship one.
- **macOS / Windows familiar matrix** — when familiar starts
  caring about the sandbox, revisit the Linux-only-CI decision
  and add cross-OS CI specifically for the familiar build.

## Open questions

The original open-questions round resolved the major decisions.
A handful of secondary questions remain, to be answered as the
phases land:

- **Default seccomp profile** — start with the podman/docker
  default set, or a tighter subset?
  Defer to Phase 1 implementation;
  whichever we pick, document the exact denylist and version it.
- **Egress filter mechanism for `private` network** — `pasta`'s
  built-in flags suffice for blocking RFC 1918 in some versions
  but not all;
  an in-netns nftables rule is the more portable answer.
  Confirm during Phase 1.5 against the current Debian / Ubuntu /
  Fedora `pasta` versions.
- **Long-lived guest VM lifecycle on macOS / Windows** — one VM
  per slice is too expensive;
  one VM per daemon is the obvious answer but raises cleanup
  questions when the daemon restarts.
  Decide alongside Phase 4.
- **Cgroup v2 delegation requirements** — rootless cgroup v2
  needs `Delegate=` in the user systemd unit on some distros.
  Document the install prerequisite when Phase 1.5 lands resource
  caps.

## Test Plan

Per phase, with the key acceptance tests already encoded as exit
criteria above.

Cross-phase invariants the test suite should preserve:

- The plugin layer never accepts a string host path from a caller.
- A `SandboxHandle` released by GC results in inner processes
  receiving `SIGTERM` and then `SIGKILL` after the grace period.
- A slice with `network: 'private'` cannot reach host loopback,
  RFC 1918, CGNAT, link-local, or fc00::/7.
- An unknown network profile is a hard error at slice construction.
- A caller-granted mount cannot shadow rootfs-derived `$PATH`
  entries.

CI is Linux-only at first;
the macOS/Windows test matrix arrives alongside Phases 4 and 6 and
stays optional at the project level until familiar needs it.

## Estimation note

The PLAN does not yet enumerate per-phase LOC or person-day
estimates;
revisit during Phase 3 wrap-up to backfill actuals and project
remaining phases.
For roadmap purposes, the design is sized **L-XL** in the
[Per-Design Estimates](README.md#per-design-estimates) table,
with the bulk of the remaining cost in Phases 4 and 6 (each a
distinct VM-bridging effort) and Phase 1.5 hardening.
