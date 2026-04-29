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
- **Phase 1.5+**: host-* network profiles, full pasta + nftables
  wiring, Landlock / cgroups / prlimit.
  Not yet started.

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

The Phase 1 daemon does not yet ship a wiring for `provideHostPath`
out of the box; callers grant it explicitly when constructing the
plugin.
The test stub in
[`test/bwrap.test.js`](./test/bwrap.test.js) is the canonical
example.
Phase 1.5+ will add a `provideMountHostPath`-shaped power to
`@endo/daemon` that the entry point can pick up automatically.

## Network profiles

| Profile         | Phase 1 status                                    |
| --------------- | ------------------------------------------------- |
| `none`          | implemented; bwrap unshares net, no `lo` reach to outside |
| `private`       | accepts the slice; pasta + nft wiring TBD (see TODO) |
| `host-loopback` | rejected with structured `Phase 1.5` error        |
| `host-lan`      | rejected with structured `Phase 1.5` error        |
| `host-net`      | rejected with structured `Phase 1.5` error        |

The egress filter for `private` lives in
[`src/net/private-egress.nft`](./src/net/private-egress.nft).
It is loaded inside the slice's netns via `nft -f`; the driver does
not parse or transform it.
The blocked CIDR ranges are documented at the top of that file.

## Seccomp

`SeccompPolicy` accepts:

- `'default'` — the JSON profile in
  [`src/seccomp/default.json`](./src/seccomp/default.json) is the
  documented allow-list.
  **Not loaded by the bwrap driver in Phase 1**: bwrap's
  `--seccomp <fd>` expects a fully-compiled BPF program, and the
  package does not bundle a native `libseccomp` binding.
  See `src/seccomp/default.json.md` for the source provenance.
- `'unconfined'` — disable seccomp entirely (escape hatch).
- `{ profile: <Buffer> }` — caller supplies a precompiled BPF blob.
  Phase 1 does not yet plumb the fd through to bwrap (placeholder
  in `prepareSlice`); a future patch will memfd-write the blob and
  pass `--seccomp <fd>`.

## Tests

Two test suites:

- [`test/factory.test.js`](./test/factory.test.js) — Phase 0 typed
  contract; backend-agnostic.
- [`test/daemon-smoke.test.js`](./test/daemon-smoke.test.js) —
  Phase 0 / 1 plugin entry-point smoke test.
- [`test/bwrap.test.js`](./test/bwrap.test.js) — Phase 1 driver
  acceptance tests.
  Each case probes `bwrap --version` first; if bwrap is unavailable
  the case `t.pass()`-skips so CI matrix runs on non-Linux hosts
  remain green.

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

## Next steps

See `TODO/13_endo_posix_sandbox_phase1_bwrap.md` for the
checklist of Phase 1 work and the "Status notes" section listing
deferred items (full pasta wiring, BPF compilation, host-* net
profiles).
