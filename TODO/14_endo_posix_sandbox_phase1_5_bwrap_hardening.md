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

## Deliverables

- [ ] **`host-loopback` / `host-lan` / `host-net` profiles**:
  - `host-loopback`: share host net namespace, install nftables
    rule that drops everything except `127.0.0.0/8` and `::1`.
  - `host-lan`: share host net namespace, drop public Internet
    (no extra filter on RFC 1918).
  - `host-net`: share host net namespace, no filtering.
    Caller must opt in explicitly; the factory enforces this is
    not auto-selected.
  - All three replace the Phase 1 `notImplemented` stubs.

- [ ] **Landlock allowlist** (Linux ≥ 5.13):
  - Probe `prctl(PR_GET_NO_NEW_PRIVS)` + `landlock_create_ruleset`
    via a tiny Node helper or by parsing `/proc/sys/kernel/...`.
  - When supported, install a Landlock ruleset that allows the
    granted mount paths and denies everything else.
  - Absent kernel ⇒ slice still works; record probe outcome in
    `listBackends()` detail.

- [ ] **seccomp profile review**:
  - Diff Phase 1's baseline seccomp JSON against the current
    podman / docker default-deny set; lift any new denials
    (e.g. `io_uring_*` if relevant).
  - Document the rebased denylist version in the seccomp resource
    header.
  - Add a unit test that asserts the JSON matches a checked-in
    fixture (so changes are deliberate).

- [ ] **Resource caps**:
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

- [ ] **Egress filter robustness**:
  - Confirm pasta / slirp4netns versions in current Debian /
    Ubuntu / Fedora actually honour the in-netns nftables rules
    (the secondary open question in PLAN § "Open questions").
  - Add a regression test that walks the documented blocklist and
    verifies each range is unreachable from inside a `private`
    slice.

- [ ] **Tests** — extend `packages/sandbox/test/bwrap.test.js`:
  - `host-loopback`: `curl http://127.0.0.1:<port>` succeeds when
    the daemon is bound there; `curl https://example.com` fails.
  - `host-lan`: a LAN HTTP server is reachable; public DNS / HTTP
    fails.
  - Landlock probe test: assert `slice.help()` reports the
    Landlock layer when the kernel supports it.
  - Resource cap test: a `:(){ :|:& };:` style fork-bomb hits
    `pids.max` instead of taking out the host.

## Out of scope

- podman driver hardening (Phase 2 carries its own analogous
  passes).
- Real `fork()` (Phase 3).
- macOS / Windows.

## Exit criteria

- A slice run with `network: 'private'` cannot reach host
  loopback, RFC 1918 LAN, CGNAT, link-local, or VPN ranges.
- Landlock appears in the slice's syscall trace where the kernel
  supports it; absent-kernel paths still pass the Phase 1
  acceptance test.
- Resource caps prevent a documented set of DoS shapes
  (fork bomb, OOM, file-descriptor exhaustion) from impacting the
  host.
- `cd packages/sandbox && npx ava` is green on a Linux host with
  the full toolchain installed.

## Operational prerequisites (update package README)

- Kernel ≥ 5.13 to enable Landlock (older kernels still work,
  documented as a soft requirement).
- cgroup v2 with user-namespace delegation; document the
  `loginctl enable-linger` / systemd `Delegate=` knob for distros
  that need it.
- `nft` / `iptables` available inside the netns (most distros
  ship one or the other; document the version floor).

## References

- `PLAN/endo_posix_sandbox.md` § "Phase 1.5 — bwrap hardening
  passes", § "Network policy", § "Open questions" (egress filter,
  cgroup v2 delegation).
- Phase 1 TODO for the driver surface this hardens.
