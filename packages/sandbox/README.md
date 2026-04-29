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

## Driver auto-registration

`packages/sandbox/src/agent.js` is the `make-unconfined` entry point.
On `make(powers, _ctx, options)` it:

1. Constructs `makeBwrapDriver({ env: options.env })`.
   Construction is cheap and does not probe the binary.
2. Wraps the driver list in `makeSandboxFactory({ drivers, scratchProvider: powers })`.
3. Returns the factory.

The factory's `listBackends()` runs each driver's `probe()` lazily on
first call, so a daemon with no `bwrap` binary still boots cleanly —
`listBackends()` simply returns `[{ name: 'bwrap', available: false, reason: '...' }]`,
and `make()` rejects with `"no backend available"`.

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

## Next steps

See `TODO/14_endo_posix_sandbox_phase1_5_bwrap_hardening.md` for
the deliverables checklist.  Phase 2 (`TODO/15_*.md`) carries the
podman driver.
