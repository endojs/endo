# Endo POSIX Sandbox — Phase 2: podman driver

Add a second production driver for the `@endo/sandbox` plugin
backed by rootless `podman`, fulfilling the Phase 2 scope from
[`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md).

Depends on Phase 1
([`13_endo_posix_sandbox_phase1_bwrap.md`](./13_endo_posix_sandbox_phase1_bwrap.md))
proving out the cap-resolution pipeline, the network-profile
plumbing, and the stdio bridging.
Phase 1.5 is *not* a strict prerequisite — Phase 2 may land in
parallel — but the egress-filter work from 1.5 should be reused
here when available.

The exit goal is a slice configured with a Debian or Alpine OCI
image that runs `apt` / `apk` against its private rootfs without
touching the host system, and that exposes the same
`SandboxHandle` surface as the bwrap driver.

## Deliverables

- [ ] **`src/drivers/podman.js`** — `SandboxDriver` implementation:
  - `name: 'podman'`.
  - `probe()` runs `podman --version` and verifies rootless mode
    is available
    (`podman info --format '{{.Host.Security.Rootless}}'`).
    Returns `{ available: false, reason }` on missing binary,
    rootful-only install, or unsupported version.

- [ ] **Image story** (delegated, not embedded):
  - `make({ rootfs: { kind: 'oci', ref } })` accepts an OCI image
    reference (e.g. `docker.io/library/alpine:3.19`).
  - Driver runs `podman pull <ref>` if the image is not already
    present in the user's storage.
  - The plugin does **not** embed a registry client; the
    `skopeo` alternative is deferred to Phase 7.
  - Document the image-storage location
    (`~/.local/share/containers/storage`) as caller-relevant
    state.

- [ ] **`prepareSlice` mapping**:
  - `podman create --name <slice-id> --replace=false ...` with:
    - `--security-opt no-new-privileges`,
    - `--cap-drop ALL`,
    - `--read-only` on the upper rootfs (writes go to the
      `ScratchMount`-backed volume),
    - `--mount type=bind,source=<hostPath>,target=<innerPath>,readonly?`
      from the same cap-resolution pipeline as the bwrap driver,
    - `--security-opt seccomp=<path>` pointing at the same
      baseline JSON Phase 1 ships
      (or podman's default if the JSON exactly matches).
  - `podman start <slice-id>` defers to first `spawn`; subsequent
    spawns use `podman exec`.

- [ ] **Network profiles** map to podman:
  - `none`: `--network none`.
  - `private`: `--network slirp4netns:port_handler=slirp4netns`
    plus the in-netns egress filter from Phase 1 / 1.5
    (reuse `src/net/private-egress.nft`).
    Confirm the rule applies cleanly inside podman's netns; if
    podman's userns mapping rejects raw nftables, fall back to
    `--network=pasta` and document the version floor.
  - `host-loopback` / `host-lan` / `host-net`: `--network host`
    with the same nftables overlays Phase 1.5 installs.
  - Reject unknown profiles at slice construction (no fall-through).

- [ ] **`spawn` / `exec` bridge**:
  - `child_process.spawn('podman', ['exec', '-i', slice.id, ...argv])`.
  - Wrap stdio in `reader-ref` / `writer-ref` exactly like Phase 1.
  - `kill(sig)` translates to `podman kill --signal <sig> <slice.id>`
    or per-pid kill via `podman exec`'s child PID, whichever is
    cleaner under rootless namespacing.
  - `wait()` polls `podman wait` or attaches to the exec child
    directly (prefer the latter for latency).

- [ ] **Teardown / GC**:
  - `dispose()` runs `podman stop --time 5 <slice-id>` then
    `podman rm <slice-id>`.
  - `ScratchMount` cleanup piggybacks on the daemon's existing
    scratch GC, same as bwrap.
  - On daemon restart, orphaned containers (matched by a
    `endo-sandbox-` name prefix) are reaped by the factory's
    boot-time sweep.

- [ ] **`fork()` stub** — same `notImplemented` structured error as
  Phase 1; real implementation is Phase 3.

- [ ] **Tests** — `packages/sandbox/test/podman.test.js`:
  - `test.serial`, gateway-test pattern, skip when `podman` is
    unavailable.
  - Acceptance test: spawn `apk add curl` in an Alpine slice;
    assert exit 0; assert the upgraded package list lives in the
    slice's scratch volume, not the host.
  - Mount test: a granted read-only `Mount` rejects writes from
    inside the container.
  - Network test mirroring Phase 1's `none` and `private` cases.
  - Orphan-reap test: pre-create a `endo-sandbox-stale` container,
    boot the factory, assert it gets removed.

## Out of scope

- `skopeo`-backed OCI pulls (Phase 7).
- Real `fork()` (Phase 3).
- Image build pipelines — callers BYO images via `podman pull` or
  `podman build` outside the sandbox.
- macOS / Windows.

## Exit criteria

- A slice configured with a Debian or Alpine OCI image runs
  `apt update` / `apk update` cleanly, with package metadata
  written to the slice's scratch volume only.
- All `SandboxHandle` methods behave equivalently between the
  bwrap and podman drivers (parametrised acceptance test runs
  against both).
- `cd packages/sandbox && npx ava` is green on a Linux host with
  rootless podman configured.

## Operational prerequisites (update package README)

- `podman` ≥ a tested minimum (capture during implementation).
- Rootless mode configured: `/etc/subuid`, `/etc/subgid` ranges
  for the running user; `newuidmap` / `newgidmap` setuid helpers
  installed.
- `slirp4netns` or `pasta` available for the `private` profile.
- Network egress filter prerequisites carry over from Phase 1.5.

## References

- `PLAN/endo_posix_sandbox.md` § "Phase 2 — podman driver",
  § "Backend driver interface", § "Network policy".
- `13_endo_posix_sandbox_phase1_bwrap.md` for the cap-resolution
  pipeline and stdio bridge this driver reuses.
- `14_endo_posix_sandbox_phase1_5_bwrap_hardening.md` for the
  egress filter and cgroup v2 delegation notes that apply here
  too.
