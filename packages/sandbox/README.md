# `@endo/sandbox`

POSIX sandbox plugin for Endo.
Exposes a confined slice of a POSIX-like system (process namespace,
filesystem view, optional network) as one or more `Exo` handles, so a
caller-granted process tree runs under additional kernel-level
confinement on top of Endo's capability boundary.

The architecture is documented in
[`PLAN/endo_posix_sandbox.md`](../../PLAN/endo_posix_sandbox.md).

## Status

- **Phase 0** (`12_endo_posix_sandbox_phase0_interfaces.md`): typed
  contract, runtime guards, stub factory.
  Done.
- **Phase 1** (`13_endo_posix_sandbox_phase1_bwrap.md`): `bwrap`
  driver on Linux, `network: 'none'` and `network: 'private'`
  profiles, scratch-mount-backed writable upper layer, dispose
  semantics.
  Done — see "Status notes" in the Phase 1 TODO for what is
  intentionally deferred.
- **Phase 1.5** (`14_endo_posix_sandbox_phase1_5_bwrap_hardening.md`):
  `host-loopback` / `host-lan` / `host-net` profiles, Landlock probe
  (kernel ≥ 5.13), seccomp profile rebase against
  `containers/common`, `prlimit` resource caps, cgroup v2 detection,
  egress filter regression test, slice-level hardening report
  surfaced via `slice.help()`.
  Done — see § "Phase 1.5 status notes" below for what is
  intentionally deferred.
- **Phase 2** (`15_endo_posix_sandbox_phase2_podman.md`): rootless
  `podman` driver with OCI image rootfs, `--cap-drop ALL` +
  `no-new-privileges` + `--read-only` posture, slirp4netns / pasta
  rootless network backends, boot-time orphan-container sweep, and
  parametrised acceptance tests (alpine `/bin/echo`, `/bin/sh` write
  rejection, `apk update`).
  Done — see § "Phase 2 status notes" below for what is
  intentionally deferred.

## Operational prerequisites (Linux + bwrap driver)

The bwrap driver shells out to external tools.
`agent.js` registers it unconditionally; `probe()` reports
`available: false` when a tool is missing, and `make()` then refuses
the slice with a structured error rather than failing silently.

| Tool      | Phase   | Tested version | Notes                              |
| --------- | ------- | -------------- | ---------------------------------- |
| `bwrap`   | 1       | 0.11.2         | <https://github.com/containers/bubblewrap> |
| `pasta`   | 1 (TBD) | passt 2026_01  | Used for `network: 'private'` egress NAT |
| `nft`     | 1 (TBD) | nftables 1.x   | Loads `src/net/private-egress.nft` inside the netns |

Kernel requirements:

- Unprivileged user namespaces.
  On Debian-derived distros, check
  `/proc/sys/kernel/unprivileged_userns_clone == 1`.
  On Arch / Fedora this is enabled by default.
- For `network: 'private'` to behave correctly: kernel ≥ 5.10 and
  the `nftables` kmod loaded.
- For Phase 1.5 Landlock surfacing: kernel ≥ 5.13 with the
  `landlock` LSM enabled.  The probe reads
  `/sys/kernel/security/lsm`; absent kernels still construct
  slices, just without the extra layer (the probe surfaces this
  via `slice.help()` and `BackendProbe.details.landlock`).
- For Phase 1.5 cgroup v2 caps: rootless cgroup v2 with `Delegate=`
  set on the user systemd unit.  On distros that do not enable
  delegation by default, run `loginctl enable-linger $USER` and
  add a drop-in:

  ```ini
  # ~/.config/systemd/user.conf.d/delegate.conf
  [Service]
  Delegate=cpu cpuset io memory pids
  ```

  When delegation is unavailable, the slice still applies
  `prlimit` caps (which do not need cgroup writes); the
  `slice.help()` report explains which controllers are missing.

`bwrap` 0.11+ implies `--no-new-privileges` (the flag was removed),
so the driver does NOT pass `--no-new-privileges`.
Older bwrap versions are untested.

## Operational prerequisites (Linux + podman driver, Phase 2)

The podman driver shells out to a rootless `podman` binary.  The
driver `probe()` returns `available: false` when any of these is
missing; `make()` then refuses the slice with a structured error.

| Tool             | Phase | Tested version | Notes                                                                |
| ---------------- | ----- | -------------- | -------------------------------------------------------------------- |
| `podman`         | 2     | 5.8.x          | <https://podman.io>; rootful installs are rejected by the probe.     |
| `crun` / `runc`  | 2     | 1.x            | OCI runtime that supports `podman exec`.  See "OCI runtime" below.   |
| `slirp4netns`    | 2     | 1.x            | Default rootless network backend; required for `network: 'private'`. |
| `pasta`          | 2     | passt 2026_01  | Used as the fallback when `slirp4netns` is absent.                   |

Rootless prerequisites:

- `/etc/subuid` and `/etc/subgid` ranges configured for the running
  user.  `newuidmap` and `newgidmap` setuid helpers must be
  installed (`uidmap` package on Debian-derived distros).
- `~/.local/share/containers/storage` is the user-private image
  store podman writes to.  The driver `podman pull`s images on
  first use and otherwise leaves them alone; callers can prune the
  store with `podman image prune` outside the slice.
- For `network: 'private'`: either `slirp4netns` or `pasta` must be
  on PATH.  The driver auto-detects which one is present and
  surfaces the choice via `slice.help()`'s `rootless-net:` row.

### OCI runtime

`podman` ships with a default OCI runtime that varies across distros.
Some Bazzite / Universal Blue images default to `krun` (libkrun
microVM) which does not implement `podman exec`; the driver detects
that case at probe time and transparently switches to `crun` or
`runc` so the slice's spawn surface keeps working.  The override is
visible from `podman info --format '{{.Host.OCIRuntime.Name}}'` and
in the `--runtime` flag the driver prepends to every podman call.
The override is opt-out via `makePodmanDriver({ ociRuntime: 'krun' })`
when callers know what they are doing.

## Driver auto-registration

`packages/sandbox/src/agent.js` is the `make-unconfined` entry point.
On `make(powers, _ctx, options)` it:

1. Constructs `makeBwrapDriver({ env: options.env })`.
   Construction is cheap and does not probe the binary.
2. Constructs `makePodmanDriver({ env: options.env })` (Phase 2).
   Same probe-gated pattern: a missing podman binary or rootful-only
   install is reported via `listBackends()`, never surfaces as a
   daemon boot failure.
3. Wraps the driver list in `makeSandboxFactory({ drivers, scratchProvider: powers })`.
4. Returns the factory.

The factory's `listBackends()` runs each driver's `probe()` lazily on
first call, so a daemon with no `bwrap` / `podman` binary still boots
cleanly — `listBackends()` simply returns
`[{ name: 'bwrap', available: false, reason: '...' }, …]`, and
`make()` rejects with `"no backend available"`.

The `'auto'` selector picks the first available driver in
registration order.  Bwrap is registered first, so callers asking
for OCI image rootfs must opt in via `make({ backend: 'podman',
rootfs: { kind: 'oci', ref: 'docker.io/library/alpine:3.19' } })`.

## Capability surface

Mirrors `PLAN/endo_posix_sandbox.md` § "Capability surface":

- `SandboxFactory` — root cap; `help`, `listBackends`, `make`.
- `SandboxHandle` — one slice; `spawn`, `mount`, `scratch`, `open`,
  `fork`, `reset`, `dispose`.
- `ProcessHandle` — one process inside a slice; `pid`, `stdin`,
  `stdout`, `stderr`, `wait`, `kill`.
- `MountHandle` — one bind into a slice; `innerPath`, `cap`, `mode`,
  `unmount`.

All four are `makeExo()` objects with `M.interface()` guards, so
`__getMethodNames__()` and other CapTP introspection patterns work.

### `SandboxPowers.provideHostPath`

The factory does NOT receive the daemon's host-paths power.
Instead, the powers object passed to the entry point must expose:

```ts
provideHostPath(cap: MountCap): Promise<string>
```

This is the privileged operation that bridges the Endo capability
graph and the kernel's bind-mount surface.
Drivers never call it — only the factory does, when assembling a
`SliceSpec`.

The current daemon does not yet ship a wiring for `provideHostPath`
out of the box; callers grant it explicitly when constructing the
plugin.
The test stub in
[`test/bwrap.test.js`](./test/bwrap.test.js) is the canonical
example.
A future patch will add a `provideMountHostPath`-shaped power to
`@endo/daemon` that the entry point can pick up automatically.

## Network profiles

| Profile         | Status                                            |
| --------------- | ------------------------------------------------- |
| `none`          | implemented; bwrap unshares net, only `lo` inside |
| `private`       | implemented; private netns, egress nft documented |
| `host-loopback` | implemented; shares host netns (filtering = ops)  |
| `host-lan`      | implemented; shares host netns (filtering = ops)  |
| `host-net`      | implemented; shares host netns, no extra filter   |

The egress filter for `private` lives in
[`src/net/private-egress.nft`](./src/net/private-egress.nft).
It is loaded inside the slice's netns via `nft -f`; the driver does
not parse or transform it.
The blocked CIDR ranges are exported as
[`PRIVATE_BLOCKED_RANGES`](./src/net/blocked-ranges.js) and a
unit test
([`test/blocked-ranges.test.js`](./test/blocked-ranges.test.js))
keeps the documented list and the nft ruleset in lockstep.

### Host network profiles

`host-loopback` / `host-lan` / `host-net` all share the host's
network namespace via `bwrap --share-net`.  Per-profile filtering
(drop everything except `127.0.0.0/8` / `::1` for `host-loopback`,
drop public Internet for `host-lan`) is the **operator's**
responsibility because rootless slices do not hold `CAP_NET_ADMIN`
and therefore cannot install host-firewall rules from inside the
slice.  The blocklist / allowlist used by these profiles is
exported alongside `PRIVATE_BLOCKED_RANGES`:

- `HOST_LOOPBACK_ALLOWED_RANGES` — operators install firewall rules
  that drop everything except these ranges.
- `HOST_LAN_ALLOWED_RANGES` — operators install rules that drop
  public Internet but allow these.
- `host-net` is the explicit "no extra filtering" escape hatch.
  The driver enforces that this is never auto-selected; callers
  must pass `network: 'host-net'` explicitly.

These exports give operators a single source of truth they can
feed into `firewalld` / `ufw` / `nftables` rules on the host.

## Seccomp

`SeccompPolicy` accepts:

- `'default'` — the JSON profile in
  [`src/seccomp/default.json`](./src/seccomp/default.json) is the
  documented allow-list.
  **Not loaded by the bwrap driver**: bwrap's
  `--seccomp <fd>` expects a fully-compiled BPF program, and the
  package does not bundle a native `libseccomp` binding.
  See `src/seccomp/default.json.md` for the source provenance.
  Phase 1.5 rebased the snapshot against
  `containers/common@2026-04-29` and added a fixture-hash unit
  test ([`test/seccomp-fixture.test.js`](./test/seccomp-fixture.test.js))
  so any future drift goes through code review.
- `'unconfined'` — disable seccomp entirely (escape hatch).
- `{ profile: <Buffer> }` — caller supplies a precompiled BPF blob.
  The driver does not yet plumb the fd through to bwrap
  (placeholder in `prepareSlice`); a future patch will memfd-write
  the blob and pass `--seccomp <fd>`.

## $PATH semantics

A slice's `$PATH` is synthesised at slice construction so that
unqualified commands (`echo`, `sh`, `apk`, …) resolve under the
configured rootfs without the caller having to spell out the path
explicitly.
A caller-supplied `env.PATH` always wins; the synthesis only fires
when the slice spec's `env` does not already include `PATH`.

The default is constructed per-rootfs:

| Rootfs       | Default `$PATH`                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `host-bind`  | `/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin` plus operator-installed survivors    |
| `mount`      | the subset of the canonical bin dirs that exist under the host rootfs, falling back to the default  |
| `minimal`    | the canonical default                                                                               |
| `oci`        | the image's `Config.Env` PATH (Phase 2 podman driver), falling back to the canonical default        |

The canonical default is sourced from
[`src/drivers/path.js`](./src/drivers/path.js) and is shared between
the bwrap and podman drivers so the two backends do not drift.
The order is the Debian / Ubuntu interactive-shell order
(user bin dirs first, administrative dirs last) — flipped from the
Phase 1 order, which put `/sbin` first.

### Ambient `$PATH` mining (host-bind)

The bwrap driver also mines the daemon's own `process.env.PATH`
(or the constructor's `env.PATH` if one was passed) for distro-shaped
extras such as `/opt/...`, `/snap/bin`, or
`/var/lib/flatpak/exports/bin`.
A survivor must:

- be an absolute path,
- not contain a `..` segment,
- not begin with one of `/home`, `/Users`, `/root`, `/tmp`,
  `/var/tmp`, or `/run/user` — these would either point at
  user-private state or world-writable scratch where another local
  user could plant a binary,
- not be one of the canonical bin dirs already covered by the
  default,
- exist on disk (best-effort `fs.existsSync` probe — the
  `--ro-bind-try` mount itself tolerates a missing path).

Survivors are bind-mounted read-only into the slice and appended
to `$PATH` in their daemon-PATH order.
**`/home`-prefixed entries are deliberately dropped** so a daemon
running out of an operator's home directory does not leak the home
layout into the slice.

### Caller-mount bin-dir promotion

When the caller grants a mount whose `innerPath` ends in `/bin` or
`/sbin`, or whose host directory contains a `bin/` (or `sbin/`)
subdirectory, the inner-side bin path is appended to `$PATH`.
These promoted entries land **after** the rootfs-derived defaults so
a hostile caller cannot shadow `/usr/bin` with a bin dir of their
own.

### Cross-driver consistency

The podman driver (Phase 2) follows the same precedence rule the
bwrap driver uses for `host-bind`:

1. caller-supplied `spec.env.PATH` always wins,
2. otherwise the OCI image's declared `PATH` from `Config.Env`
   (probed once via `podman image inspect --format '{{json .Config.Env}}'`
   and cached per ref for the driver's lifetime),
3. otherwise the shared canonical default.

The injection happens at `podman create` time as `-e PATH=…`, so the
slice's effective `PATH` is observable from the host even when the
image declared one of its own.  The chosen value and its source
(`env` / `image` / `fallback`) are surfaced via the `slice.help()`
"Hardening layers in effect" report:

```text
  path: /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin (source: image)
```

This makes "why can't my slice find `apk`" debuggable without having
to spawn `printenv PATH` inside the container.

The shared canonical default lives in `src/drivers/path.js` so the
podman driver's fall-back and the bwrap driver's `minimal`-rootfs
fall-back stay aligned.

## Hardening layers

Phase 1.5 surfaces three additional confinement knobs the slice
inherits on top of bwrap's namespacing:

- **Landlock** — kernel-feature probe in
  [`src/landlock.js`](./src/landlock.js) reads
  `/sys/kernel/security/lsm` to determine whether the LSM is
  registered.  The probe outcome appears in
  `BackendProbe.details.landlock` and in the per-slice
  `slice.help()` "Hardening layers in effect" report.  Actual
  ruleset installation (a future patch) will run inside the
  slice's child after bwrap execs the slice's init.
- **Resource caps** — `prlimit` wrappers around the bwrap exec set
  RLIMIT_AS / RLIMIT_NPROC / RLIMIT_NOFILE / RLIMIT_CORE
  (and optionally RLIMIT_CPU / RLIMIT_FSIZE).
  Defaults live in [`src/limits.js`](./src/limits.js) and are
  caller-overridable via `SandboxFactory.make({ limits: { ... } })`.
  An nproc cap acceptance test
  ([`test/bwrap.test.js`](./test/bwrap.test.js))
  verifies a `:(){ :|:& };:` shape would hit the cap rather than
  taking out the host.
- **cgroup v2 detection** — same module probes
  `/proc/self/cgroup` + `cgroup.controllers` so callers can tell
  whether `pids.max` / `memory.max` / `cpu.max` are usable.  When
  delegation is missing the slice still applies the `prlimit`
  caps; the help report calls out which controllers are absent so
  operators can fix the systemd unit.

## Tests

The test suite covers:

- [`test/factory.test.js`](./test/factory.test.js) — Phase 0 typed
  contract; backend-agnostic.
- [`test/daemon-smoke.test.js`](./test/daemon-smoke.test.js) —
  Phase 0 / 1 plugin entry-point smoke test.
- [`test/bwrap.test.js`](./test/bwrap.test.js) — Phase 1 + 1.5
  driver acceptance tests including the host-* network profiles,
  the prlimit nproc cap, and the slice runtime report rendered by
  `help()`.
  Each case probes `bwrap --version` first; if bwrap is unavailable
  the case `t.pass()`-skips so CI matrix runs on non-Linux hosts
  remain green.
- [`test/landlock.test.js`](./test/landlock.test.js) — Phase 1.5
  Landlock probe, fully stubbed `fs` so it runs on any OS.
- [`test/limits.test.js`](./test/limits.test.js) — Phase 1.5
  resource-cap helpers (`resolveLimits`, `assemblePrlimitArgv`,
  cgroup v2 detection).  Stubbed `fs` so it runs on any OS.
- [`test/seccomp-fixture.test.js`](./test/seccomp-fixture.test.js)
  — Phase 1.5 fixture-hash regression test for the
  rebased seccomp profile.
- [`test/blocked-ranges.test.js`](./test/blocked-ranges.test.js) —
  Phase 1.5 regression test that keeps `blocked-ranges.js` and
  `private-egress.nft` in lockstep.
- [`test/podman.test.js`](./test/podman.test.js) — Phase 2 podman
  driver acceptance tests on an Alpine OCI image: `/bin/echo`
  smoke test, read-only mount rejection, `network: 'none'` /
  `'private'` interface inventory, `apk update` (skipped on
  air-gapped CI), boot-time orphan-container reap, and the
  rootless / rootless-net rows of the `slice.help()` runtime
  report.  Each case skips gracefully when `podman` or the
  `docker.io/library/alpine:3.19` image is not present.

Run them with:

```sh
cd packages/sandbox
npx corepack yarn install   # if not already
npx corepack yarn ava --timeout=120s
```

Lint:

```sh
cd packages/sandbox
npx corepack yarn lint
```

The bwrap test suite uses a stub `provideHostPath` that maps a stub
`Mount` exo to a real tmpdir, so tests can exercise mount caps
without the daemon's full mount-resolution wiring.

## Phase 1.5 status notes

Items that landed:

- `host-loopback` / `host-lan` / `host-net` profiles accepted by
  the driver, with `host-net` requiring an explicit opt-in.
- Landlock probe wired into `BackendProbe.details.landlock` and
  `slice.help()`.
- Seccomp profile rebased against `containers/common@2026-04-29`
  with a fixture-hash unit test.
- `prlimit` resource caps (RLIMIT_AS / RLIMIT_NPROC / RLIMIT_NOFILE
  / RLIMIT_CORE by default; RLIMIT_CPU / RLIMIT_FSIZE opt-in) plus
  an acceptance test that verifies the slice observes the cap.
- cgroup v2 + delegation detection surfaced via the same
  `slice.help()` report.
- Egress-filter regression test that holds the documented
  `PRIVATE_BLOCKED_RANGES` and `private-egress.nft` in lockstep.

Items intentionally deferred:

- **Full pasta + nftables wiring** for `network: 'private'`.  The
  egress filter is documented and the driver accepts the profile;
  the actual pasta subprocess + `nft -f` invocation lands
  alongside the genie workspace integration that needs it.
- **In-slice Landlock ruleset installation.**  The probe is wired;
  the call-site that runs `landlock_create_ruleset` inside the
  slice's child (after bwrap execs the slice's init) is a focused
  follow-up patch.
- **cgroup v2 writes** (`pids.max`, `memory.max`, `cpu.max`).
  Detection lands in this phase; the actual cgroup writes are a
  follow-up that needs the daemon's user systemd-unit Delegate=
  story to be settled first.
- **Per-profile host firewall installation** for `host-loopback` /
  `host-lan`.  These need `CAP_NET_ADMIN` outside the slice; the
  README documents the operator-side responsibility.

## Phase 2 status notes

Items that landed:

- Rootless `podman` driver with `--cap-drop ALL`,
  `--security-opt no-new-privileges`, `--read-only` upper layer,
  and the same scratch-mount-backed writable `/scratch` contract
  as the bwrap driver.
- `rootfs: { kind: 'oci', ref }` materialises the slice from any
  podman-pullable OCI image reference; first-use pulls go to the
  user's `~/.local/share/containers/storage` and are reused on
  subsequent slice creations.
- Network profiles map to `--network none` (`'none'`),
  `slirp4netns` / `pasta` (`'private'`) with auto-detection, and
  `--network host` for the `host-*` family (per-profile filtering
  remains the operator's responsibility, same as the bwrap
  driver — see § "Host network profiles").
- Boot-time orphan-container sweep: containers whose names start
  with `endo-sandbox-` are removed at first probe so a daemon
  restart never trips over leftovers from a crashed run.
- OCI-runtime auto-fallback (`krun` → `crun` → `runc`) so the
  driver's `podman exec`-based spawn surface keeps working on
  hosts that default to a microVM runtime.
- `slice.help()` runtime report extended with `rootless:` and
  `rootless-net:` rows so callers can confirm which hardening
  layers are in effect on a per-slice basis.
- Acceptance tests covering `apk update` inside an Alpine slice
  (with a graceful skip on air-gapped CI), read-only mount
  rejection, network-profile interface inventory, and the
  orphan-reap path.

Items intentionally deferred:

- **`skopeo`-backed OCI pulls** — Phase 7.  Today the driver
  shells out to `podman pull`, which is sufficient for local
  workstations and CI hosts that already trust the registry.
- **In-slice `landlock_create_ruleset`** — same follow-up as the
  bwrap driver.  Surface-level Landlock probing is bwrap-only;
  the podman runtime applies its own LSM hooks already.
- **`fork()`** — Phase 3.  The current stub matches the bwrap
  driver and rejects with the same `notImplemented` error.
- **macOS / Windows** — bare-metal Linux only.  Containerization
  on macOS and WSL2 on Windows are tracked as Phase 4–5.

## Next steps

See the per-phase TODO files for the next deliverables checklist.
Phase 3 lands `fork()` once the daemon's userns-nesting story is
settled.
