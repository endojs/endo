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

- [x] **`src/drivers/bwrap.js`** — `SandboxDriver` implementation:
  - `name: 'bwrap'`.
  - `probe()` runs `bwrap --version`, returns
    `{ available: true, version }` on success or
    `{ available: false, reason }` with a structured `makeError`
    cause on `ENOENT` / non-zero exit / parse failure.
  - `prepareSlice(spec)` produces a `DriverSliceContext` containing
    the assembled bwrap argv and the mount table.

- [x] **Mount-cap resolution** — within the factory layer (not the
  driver), resolve each granted `Mount` cap to a host path via the
  `provideHostPath(cap)` method on `SandboxPowers`.
  The factory hands the driver a plain `{ hostPath, innerPath, mode }`
  triple, preserving the "no string paths into the slice" rule from
  PLAN § "Security boundary clarity".
  See `Status notes` for the daemon-side wiring deferred to Phase 1.5+.

- [x] **Bwrap argv assembly**:
  - One `--ro-bind` or `--bind` per resolved mount (read-only by
    default; `rw` opt-in per mount).
  - `ScratchMount` minted via `provideScratchMount` and bound into
    the slice at `/scratch`.
  - `--unshare-all`, `--die-with-parent`.
    NOTE: `--no-new-privileges` was REMOVED — bwrap 0.11+ implies
    `no_new_privs` and rejects the flag.
  - Drop unneeded capabilities via `--cap-drop ALL`.
  - Baseline seccomp profile shipped as a JSON resource under
    `src/seccomp/default.json` with provenance noted in
    `src/seccomp/default.json.md`.
    NOT loaded by default — see `Status notes` (no native libseccomp
    binding bundled).
    `SeccompPolicy = { profile: <Buffer> }` is plumbed through the
    factory but the bwrap driver's `--seccomp <fd>` plumbing is
    placeholdered (see `Status notes`).

- [x] **Spawn / stdio bridge** — `driver.spawn(slice, argv, opts)`:
  - `child_process.spawn('bwrap', [...sliceArgv, '--', ...argv], { stdio: 'pipe' })`.
  - The driver exposes `stdout` / `stderr` as
    `AsyncIterable<Uint8Array>` and stdin via private
    `writeStdin(chunk)` / `closeStdin()` closures (raw Node streams
    are non-hardenable).
  - The factory wraps these into `makeExo`-based reader / writer
    refs that consumers see on `ProcessHandle.stdout()` etc.
  - `wait()` resolves with `{ code, signal }`; `kill(sig)` forwards
    to the child PID.

- [x] **Network profiles** (Phase 1 subset):
  - [x] `none`: bwrap's `--unshare-all` provides a private netns
    with no external interfaces.  Verified by
    `test/bwrap.test.js` (no non-loopback interfaces visible
    inside the slice; outbound TCP returns ENETUNREACH).
  - [~] `private`: slice construction is accepted, but the
    end-to-end pasta + nft wiring is NOT yet hooked up (see
    `Status notes`).  The egress nftables ruleset is shipped in
    `src/net/private-egress.nft`.
  - [x] `host-loopback` / `host-lan` / `host-net` return the
    Phase 1.5 `notImplemented` structured error.

- [x] **`fork()` stub** — `SandboxHandle.fork()` throws
  `makeError(X\`fork not implemented before Phase 3\`)`.

- [x] **GC / dispose semantics** — on `SandboxHandle.dispose()`:
  1. SIGTERM every live `ProcessHandle`, escalate to SIGKILL
     after a 5s grace timeout.
  2. Unmount each `MountHandle` (best-effort).
  3. Driver `teardown` reaps stragglers, kills any pasta
     subprocess, and unlinks any seccomp temp file.
  4. `ScratchMount` cleanup piggybacks on the daemon's existing
     scratch GC.

- [x] **Tests** — `packages/sandbox/test/bwrap.test.js`:
  - [x] `test.serial` ava cases that probe `bwrap --version` once
    in `test.serial.before`.
    Each case `t.pass()`-skips when bwrap is unavailable so the
    suite stays green on macOS / Windows CI runners.
  - [x] Probe test: `listBackends()` reports `bwrap` available with
    a version string.
  - [x] Acceptance test: spawn `/bin/echo hello` in a `host-bind`
    slice, await `wait()`, assert stdout starts with "hello",
    assert exit code 0.
  - [x] Negative test: a granted read-only `Mount` rejects writes
    from inside the slice.
  - [x] `network: 'none'` test: outbound TCP returns blocked, only
    `lo` is visible inside the slice.
  - [x] `host-net` profile rejects with Phase 1.5 error.
  - [x] `fork()` rejects with Phase 3 error.
  - The full daemon-fork pattern from `gateway.test.js` was not
    necessary because the driver and factory are testable in
    isolation with a stub `SandboxPowers`.  A daemon-side
    integration test is deferred to the genie-workspace
    integration patch.

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

## Status notes

What landed in this Phase-1 patch and what is intentionally left for
Phase 1.5+:

- **`provideHostPath` plumbing in `@endo/daemon`** — the factory
  expects a `provideHostPath(cap)` method on `SandboxPowers`.
  This patch defines the contract on the plugin side and ships a
  test stub that maps stub `Mount` exos to real tmpdirs.
  The daemon-side wiring (a `provideMountHostPath` power on the
  daemon's host / guest) is **not** added in this patch — adding
  daemon code was out of scope per the working brief.
  Consumers wiring the plugin into their daemon must grant a
  `provideHostPath` themselves until Phase 1.5+ adds the daemon-side
  default.

- **Native seccomp BPF compilation** — Endo does not currently
  bundle `node-libseccomp` or any other native seccomp binding,
  and adding one is explicitly out of scope per the working brief.
  As a result the bwrap driver does **not** load
  `src/seccomp/default.json` by default; the JSON profile is
  shipped as documentation and as the syscall denylist of
  record.
  Callers who need seccomp can supply a precompiled BPF blob via
  `SeccompPolicy = { profile: <Buffer> }`; the factory carries
  the blob through to `SliceSpec.seccompProfile`, but the bwrap
  driver still needs the memfd-write + `--seccomp <fd>` plumbing
  to actually load it (placeholder in `prepareSlice`).
  Phase 1.5 should either add an optional native binding or land
  the memfd-fd path so caller-supplied blobs work end-to-end.

- **`network: 'private'` end-to-end** — slice construction accepts
  the profile, the egress rules are shipped in
  `src/net/private-egress.nft`, and `teardown` knows how to reap
  a pasta subprocess.
  The actual `pasta --netns` + `nft -f` orchestration that joins
  pasta's netns to the bwrap slice is not yet wired.
  Doing it correctly requires a userns-block-fd handshake between
  bwrap and pasta plus a per-slice netns lifecycle, neither of
  which has a settled design across the bwrap / pasta version
  matrix we care about.
  This will land alongside the genie-workspace integration that
  needs `private` networking (Phase 1.5).

- **Daemon-fork test pattern** — the working brief mentioned
  forking a real daemon per test (gateway-test pattern) for the
  bwrap suite.
  Phase 1 tests instead exercise the driver and factory directly
  with a stub `SandboxPowers`, which is sufficient for the
  acceptance criteria (echo, ro reject, network: none) and avoids
  flakiness from background daemons.
  A daemon-fork end-to-end test will land alongside the genie
  workspace patch that actually wires the plugin into a daemon
  config.
