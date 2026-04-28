# Endo POSIX Sandbox — Phase 1: bwrap driver on Linux

Implement the first production driver for the `@endo/sandbox`
plugin against `bubblewrap` (`bwrap`) on Linux, fulfilling the
Phase 1 scope from [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md).

Depends on Phase 0
([`12_endo_posix_sandbox_phase0_interfaces.md`](./12_endo_posix_sandbox_phase0_interfaces.md))
landing the typed `SandboxDriver` surface and stub factory.

The exit goal is a Linux genie whose entire workspace lives inside
a bwrap slice: existing `bash` / `exec` / `git` tools spawn through
the slice, see only the granted mounts, and have either no network
or a `private` NAT'd network with the public-Internet egress filter.

## Deliverables

- [ ] **`src/drivers/bwrap.js`** — `SandboxDriver` implementation:
  - `name: 'bwrap'`.
  - `probe()` runs `bwrap --version`, returns
    `{ available: true, version }` on success or
    `{ available: false, reason }` with a structured `makeError`
    cause on `ENOENT` / non-zero exit / parse failure.
  - `prepareSlice(spec)` produces a `DriverSliceContext` containing
    the assembled bwrap argv and the mount table.

- [ ] **Mount-cap resolution** — within the factory layer (not the
  driver), resolve each granted `Mount` cap to a host path using
  the daemon's existing mount-resolution power.
  Hand the driver a plain `{ hostPath, innerPath, mode }` triple,
  preserving the "no string paths into the slice" rule from PLAN
  § "Security boundary clarity".

- [ ] **Bwrap argv assembly**:
  - One `--ro-bind` or `--bind` per resolved mount (read-only by
    default; `rw` opt-in per mount).
  - `ScratchMount` provided by `powers.provideScratchMount` layered
    as the writable upper directory.
  - `--unshare-all`, `--die-with-parent`, `--no-new-privileges`.
  - Drop unneeded capabilities via `--cap-drop ALL`.
  - Baseline seccomp profile: ship the podman/docker default-deny
    set as a JSON resource under `src/seccomp/default.json`,
    install via `--seccomp <fd>`.
    Document the exact denylist version in a comment header.

- [ ] **Spawn / stdio bridge** — `driver.spawn(slice, argv, opts)`:
  - `child_process.spawn('bwrap', [...sliceArgv, '--', ...argv], { stdio: 'pipe' })`.
  - Wrap `child.stdin` / `stdout` / `stderr` in
    `reader-ref` / `writer-ref` adapters consistent with how
    `packages/daemon/src/mount.js` exposes file streams.
  - `wait()` resolves with `{ code, signal }`; `kill(sig)` forwards
    to the child PID.

- [ ] **Network profiles** (Phase 1 subset):
  - `none`: omit `--share-net`; verify loopback unreachable via
    test.
  - `private`: spawn `pasta` driving a private netns, install an
    in-netns nftables egress rule blocking
    `10/8`, `172.16/12`, `192.168/16`, `100.64/10`, `169.254/16`,
    `fc00::/7`, and the host's loopback (`127/8`, `::1`).
    Egress rule lives in `src/net/private-egress.nft`.
  - `host-loopback` / `host-lan` / `host-net` return the
    Phase 1.5 `notImplemented` structured error.

- [ ] **`fork()` stub** — `SandboxHandle.fork()` throws
  `makeError(X\`fork not implemented before Phase 3\`)`.

- [ ] **GC / dispose semantics** — on `SandboxHandle.dispose()`:
  1. SIGTERM every live `ProcessHandle`, escalate to SIGKILL
     after a grace timeout.
  2. Unmount each `MountHandle`.
  3. Driver `teardown` cleans up the netns and the pasta
     subprocess.
  4. `ScratchMount` cleanup piggybacks on the daemon's existing
     scratch GC.
  Verify the formula-pinning behaviour matches the rest of the
  sandbox spec in PLAN § "Garbage collection".

- [ ] **Tests** — `packages/sandbox/test/bwrap.test.js`:
  - `test.serial` ava cases (gateway-test pattern: fork a daemon
    per test, set `ENDO_ADDR=127.0.0.1:0`).
  - Skip the suite when `bwrap --version` is unavailable on the
    runner (CI matrix gates Linux+bwrap).
  - Acceptance test: spawn `/bin/echo hello` in a slice rooted
    at host `/usr` (host-bind rootfs), assert stdout, assert exit
    code 0, assert the slice's `/proc/self/status` shows the
    expected uid/gid map.
  - Negative test: a granted read-only `Mount` rejects writes
    from inside the slice.
  - `network: 'none'` test: an inner curl/wget to `127.0.0.1`
    fails with the expected error.

## Out of scope (defer to Phase 1.5+)

- `host-loopback` / `host-lan` / `host-net` profiles.
- Landlock allowlists.
- `prlimit` / cgroup v2 caps.
- Real `fork()` (Phase 3).
- podman driver (Phase 2).
- macOS / Windows.

## Exit criteria

- A genie configured with `GENIE_WORKSPACE` pointing at a
  `Mount`-rooted scratch slice can invoke `bash` and see only
  the explicitly granted mounts.
- The acceptance test in `bwrap.test.js` passes on a Linux host
  with `bwrap` and `pasta` installed.
- `network: 'private'` slice can `curl https://example.com` but
  cannot reach `127.0.0.1`, `10.x`, `192.168.x`, or `172.16.x`.
- `cd packages/sandbox && npx ava` is green.

## Operational prerequisites (document in package README)

- `bwrap` ≥ a tested minimum (capture version during
  implementation).
- `pasta` (or `slirp4netns` fallback) for the `private` profile.
- Kernel with user namespaces enabled
  (`/proc/sys/kernel/unprivileged_userns_clone == 1` on Debian
  derivatives).

## References

- `PLAN/endo_posix_sandbox.md` § "Phase 1 — bwrap driver on Linux"
  and § "Network policy".
- `packages/daemon/src/mount.js` — `reader-ref` / `writer-ref`
  precedent.
- `packages/familiar` test conventions for forking a daemon
  per test (see `CLAUDE.md` § "Familiar (Electron shell)").
