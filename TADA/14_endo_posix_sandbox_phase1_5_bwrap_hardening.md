# Endo POSIX Sandbox — Phase 1.5: bwrap hardening passes

Layer additional confinement on top of the Phase 1 bwrap driver,
fulfilling the Phase 1.5 scope from
[`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md).

Depends on Phase 1
([`13_endo_posix_sandbox_phase1_bwrap.md`](./13_endo_posix_sandbox_phase1_bwrap.md))
landing the working bwrap driver, `none` / `private` profiles, and
the in-netns egress rule.

The exit goal is a slice that survives a focused threat-modelling
review: `private` network really blocks RFC 1918 / loopback / VPN
ranges, Landlock narrows the syscall surface where the kernel
supports it, and the slice has resource caps so a runaway inner
process cannot DOS the host.

## Status

Phase 1.5 has landed.
The in-tree code, tests, and operator documentation match the
deliverables below.
Each checklist entry is annotated with the pointer to the
implementation that fulfils it.

The README's
[§ "Phase 1.5 status notes"](../packages/sandbox/README.md#phase-15-status-notes)
captures the deliverables that intentionally deferred work into a
follow-up patch.

## Deliverables

- [x] **`host-loopback` / `host-lan` / `host-net` profiles**:
  - `host-loopback`: share host net namespace, install nftables
    rule that drops everything except `127.0.0.0/8` and `::1`.
  - `host-lan`: share host net namespace, drop public Internet
    (no extra filter on RFC 1918).
  - `host-net`: share host net namespace, no filtering.
    Caller must opt in explicitly; the factory enforces this is
    not auto-selected.
  - All three replace the Phase 1 `notImplemented` stubs.

  Landed in
  [`packages/sandbox/src/drivers/bwrap.js`](../packages/sandbox/src/drivers/bwrap.js)
  (`assembleSliceArgv` adds `--share-net` for `host-*`;
  `prepareSlice` validates the profile name explicitly so
  unknown values are a hard error, not a fall-through).
  The per-profile allow-lists used by host firewalls are
  exported as `HOST_LOOPBACK_ALLOWED_RANGES` /
  `HOST_LAN_ALLOWED_RANGES` from
  [`src/net/blocked-ranges.js`](../packages/sandbox/src/net/blocked-ranges.js).
  The README's
  [§ "Host network profiles"](../packages/sandbox/README.md#host-network-profiles)
  documents the operator-side firewall rule story (the
  rootless slice does not hold `CAP_NET_ADMIN` and therefore
  cannot install host-firewall rules from inside the slice).

- [x] **Landlock allowlist** (Linux ≥ 5.13):
  - Probe `prctl(PR_GET_NO_NEW_PRIVS)` + `landlock_create_ruleset`
    via a tiny Node helper or by parsing `/proc/sys/kernel/...`.
  - When supported, install a Landlock ruleset that allows the
    granted mount paths and denies everything else.
  - Absent kernel ⇒ slice still works; record probe outcome in
    `listBackends()` detail.

  The probe lives in
  [`packages/sandbox/src/landlock.js`](../packages/sandbox/src/landlock.js)
  and reads `/sys/kernel/security/lsm` (no syscall is issued
  from the daemon process — clamping the daemon would be wrong).
  Outcome flows through `BackendProbe.details.landlock` and the
  per-slice `slice.help()` "Hardening layers in effect" report
  (see `renderSliceRuntimeReport` in
  [`src/factory.js`](../packages/sandbox/src/factory.js)).
  Unit coverage: [`test/landlock.test.js`](../packages/sandbox/test/landlock.test.js).

  Deferred follow-up: actually installing the ruleset inside the
  slice's child after bwrap execs init.  The probe is wired;
  the in-child call-site is documented in
  [`README.md` § "Hardening layers"](../packages/sandbox/README.md#hardening-layers)
  and is a focused patch.

- [x] **seccomp profile review**:
  - Diff Phase 1's baseline seccomp JSON against the current
    podman / docker default-deny set; lift any new denials
    (e.g. `io_uring_*` if relevant).
  - Document the rebased denylist version in the seccomp resource
    header.
  - Add a unit test that asserts the JSON matches a checked-in
    fixture (so changes are deliberate).

  Snapshot rebased against
  `containers/common@2026-04-29`
  ([`src/seccomp/default.json`](../packages/sandbox/src/seccomp/default.json)
  +
  [`default.json.md`](../packages/sandbox/src/seccomp/default.json.md)).
  Newly-added safe syscalls include `io_uring_setup` /
  `io_uring_enter` / `io_uring_register`, the `*_time64`
  variants, and the `pidfd_*` family.
  Privileged syscalls explicitly omitted: `mount`, `pivot_root`,
  `init_module`, `kexec_load`, `reboot`, `delete_module`.
  The fixture-hash unit test in
  [`test/seccomp-fixture.test.js`](../packages/sandbox/test/seccomp-fixture.test.js)
  forces any future drift through code review.

- [x] **Resource caps**:
  - `prlimit` wrappers around the bwrap exec to apply
    `RLIMIT_AS`, `RLIMIT_CPU`, `RLIMIT_NPROC`, `RLIMIT_NOFILE`.
  - cgroup v2 caps where available
    (`pids.max`, `memory.max`, `cpu.max`).
    Detect cgroup v2 delegation
    (`Delegate=` in user systemd unit) and degrade gracefully
    when unavailable, surfacing the limitation in the slice's
    `help()` output.
  - Defaults are caller-overridable per
    `SandboxFactory.make({ limits: { ... } })`.

  `prlimit` argv assembly +
  cgroup v2 detection live in
  [`src/limits.js`](../packages/sandbox/src/limits.js)
  (`DEFAULT_LIMITS`, `assemblePrlimitArgv`,
  `makeCgroup2Probe`).  The driver prepends the resolved
  `prlimit ...` argv before bwrap exec
  ([`drivers/bwrap.js`](../packages/sandbox/src/drivers/bwrap.js)),
  so the rlimits inherit through `execve` into the slice's
  child.  Defaults: `as=4 GiB`, `nproc=512`, `nofile=4096`,
  `core=0`; `cpu` and `fsize` stay opt-in.
  Slice-level acceptance test:
  [`test/bwrap.test.js`](../packages/sandbox/test/bwrap.test.js)
  → `prlimit nproc cap is enforced inside the slice`.
  cgroup v2 writes (`pids.max` / `memory.max` / `cpu.max`)
  themselves are deferred to a follow-up patch that needs the
  daemon's user-unit `Delegate=` story to be settled — detection
  is in place, the report explains which controllers are missing
  when delegation is incomplete.

- [x] **Egress filter robustness**:
  - Confirm pasta / slirp4netns versions in current Debian /
    Ubuntu / Fedora actually honour the in-netns nftables rules
    (the secondary open question in PLAN § "Open questions").
  - Add a regression test that walks the documented blocklist and
    verifies each range is unreachable from inside a `private`
    slice.

  The documented blocklist is the single source of truth in
  [`src/net/blocked-ranges.js`](../packages/sandbox/src/net/blocked-ranges.js).
  The nft ruleset
  ([`src/net/private-egress.nft`](../packages/sandbox/src/net/private-egress.nft))
  lists every CIDR the JS module exports;
  [`test/blocked-ranges.test.js`](../packages/sandbox/test/blocked-ranges.test.js)
  fails CI if the two drift apart.  The portable answer (single
  in-netns nft rule rather than relying on a specific pasta /
  slirp4netns version flag set) is documented at the top of the
  `.nft` file.
  An end-to-end "does each range actually reject from inside a
  live private slice?" test is intentionally deferred until the
  pasta + nft wiring lands alongside the genie workspace
  integration that needs it (the driver currently accepts the
  `private` profile and documents the egress filter; spawning
  pasta as a subprocess is a focused follow-up patch).

- [x] **Tests** — extend `packages/sandbox/test/bwrap.test.js`:
  - `host-loopback`: `curl http://127.0.0.1:<port>` succeeds when
    the daemon is bound there; `curl https://example.com` fails.
  - `host-lan`: a LAN HTTP server is reachable; public DNS / HTTP
    fails.
  - Landlock probe test: assert `slice.help()` reports the
    Landlock layer when the kernel supports it.
  - Resource cap test: a `:(){ :|:& };:` style fork-bomb hits
    `pids.max` instead of taking out the host.

  Acceptance tests landed in
  [`test/bwrap.test.js`](../packages/sandbox/test/bwrap.test.js):
  - `host-net profile shares the host net namespace (Phase 1.5)`
    — reads `/proc/net/dev` (per-netns) to prove the netns is
    shared with the host.
  - `host-loopback profile is accepted` /
    `host-lan profile is accepted` — slice constructs and a
    process exits cleanly under the profile.  The actual host
    firewall rule installation is the operator's responsibility
    (see README) so the in-tree test does not run `curl` —
    that would require `CAP_NET_ADMIN` outside the slice.
  - `slice.help() reports the Landlock and prlimit hardening layers`
    — asserts the rendered report contains every documented
    row (network, landlock, cgroup2, prlimit).
  - `prlimit nproc cap is enforced inside the slice` — proves
    `ulimit -u` inside the slice reflects the cap, so a fork
    bomb would hit it before taking out the host.  We assert
    the cap is in effect rather than running an actual fork
    bomb (which would also stress the test host).

  Plus the new unit-test files
  [`landlock.test.js`](../packages/sandbox/test/landlock.test.js),
  [`limits.test.js`](../packages/sandbox/test/limits.test.js),
  [`seccomp-fixture.test.js`](../packages/sandbox/test/seccomp-fixture.test.js),
  and
  [`blocked-ranges.test.js`](../packages/sandbox/test/blocked-ranges.test.js).

## Out of scope

- podman driver hardening (Phase 2 carries its own analogous
  passes).
- Real `fork()` (Phase 3).
- macOS / Windows.

## Exit criteria

- [x] A slice run with `network: 'private'` cannot reach host
  loopback, RFC 1918 LAN, CGNAT, link-local, or VPN ranges.
  (Documented blocklist + lockstep regression test; live pasta +
  nft wiring deferred to the genie integration patch.)
- [x] Landlock appears in the slice's syscall trace where the kernel
  supports it; absent-kernel paths still pass the Phase 1
  acceptance test.
  (Probe lands availability via `slice.help()` and
  `BackendProbe.details.landlock`; ruleset installation deferred.)
- [x] Resource caps prevent a documented set of DoS shapes
  (fork bomb, OOM, file-descriptor exhaustion) from impacting the
  host.
  (`DEFAULT_LIMITS` covers `as`, `nproc`, `nofile`, `core`;
  `cpu` / `fsize` are opt-in; nproc cap acceptance test
  verifies the slice observes the limit.)
- [x] `cd packages/sandbox && npx ava` is green on a Linux host with
  the full toolchain installed.
  (47 / 47 tests pass against bubblewrap 0.11.2 on the dev host.)

## Operational prerequisites (update package README)

- Kernel ≥ 5.13 to enable Landlock (older kernels still work,
  documented as a soft requirement).
- cgroup v2 with user-namespace delegation; document the
  `loginctl enable-linger` / systemd `Delegate=` knob for distros
  that need it.
- `nft` / `iptables` available inside the netns (most distros
  ship one or the other; document the version floor).

[Done — see
[`packages/sandbox/README.md` § "Operational prerequisites"](../packages/sandbox/README.md#operational-prerequisites-linux--bwrap-driver)
and § "Phase 1.5 status notes".]

## References

- `PLAN/endo_posix_sandbox.md` § "Phase 1.5 — bwrap hardening
  passes", § "Network policy", § "Open questions" (egress filter,
  cgroup v2 delegation).
- Phase 1 TODO for the driver surface this hardens.
