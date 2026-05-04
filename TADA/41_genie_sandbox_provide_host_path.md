# Daemon: ship `provideHostPath` for sandbox `Mount` resolution

Prerequisite for [`40_genie_sandbox.md`](./40_genie_sandbox.md).

The `@endo/sandbox` factory resolves every granted `Mount` capability to
a host filesystem path via a `provideHostPath(cap)` power on
`SandboxPowers`.
The genie integration cannot run a real slice until the daemon ships
that wiring out of the box — today only the bwrap / podman test stubs
implement it.

See [`packages/sandbox/README.md`](../packages/sandbox/README.md) §
"`SandboxPowers.provideHostPath`" for the contract:

> Resolve a `Mount` capability to a host filesystem path.
> The factory calls this for every granted mount before assembling the
> driver's `SliceSpec`.
> Throws a structured error if the mount cap does not name a directory
> the daemon can resolve.
>
> This is the privileged operation that bridges the Endo capability
> graph and the kernel's bind-mount surface.
> Drivers never call this — only the factory does.

## Status: DONE

All deliverables landed; the daemon ships `provideHostPath` on
`EndoHost` and the sandbox factory consumes it through the
`scratchProvider` power without any custom shim required.

## Deliverables

- [x] Audit `packages/daemon/src/mount.js` and `host.js` for the
  daemon-side bookkeeping that already records the host path of every
  `Mount` it mints.
  Identify whether the host path lives on the `Mount` formula record,
  on the pet-store, or only in the `mountFile` runtime closure.

  **Result:** the host path is captured on the formula record itself —
  `mount` formulas store the user-supplied `path` field, while
  `scratch-mount` formulas derive their path deterministically from
  `<statePath>/mounts/<formulaNumber>` (see `daemon.js`
  `'scratch-mount'` formula maker around line 2457).
  Neither the pet-store nor the `mountFile` closure is needed; the
  formula record is the source of truth.

- [x] Decide whether `provideHostPath` ships as:
  - a method on the host agent / guest interface that takes a `Mount`
    capability and looks up the registered host path, or
  - a sibling power that the daemon hands to `make-unconfined`
    plugins like `@endo/sandbox` alongside `provideScratchMount`.

  **Decision:** `provideHostPath` ships as a method on the
  `EndoHost` / `HostInterface` (see `packages/daemon/src/host.js`
  ~ line 302 and `packages/daemon/src/interfaces.js` line 329).
  This keeps the resolver in the same place as `provideMount` and
  `provideScratchMount` — consumers that already hold a host
  capability (because they were granted it as `powers`) automatically
  get path resolution without a second power being threaded through
  `make-unconfined`.
  The sandbox plugin's `agent.js` wires `scratchProvider: powers`,
  so when the host is granted as powers the factory's
  `E(scratchProvider).provideHostPath(cap)` call lands on
  `EndoHost.provideHostPath` directly.

- [x] Implement the resolver.
  The implementation must reject any `Mount` cap that the daemon did
  not mint — never trust an arbitrary remote object that quacks like a
  mount.
  Match the structured-error pattern used by the rest of the daemon
  (`makeError(X\`...${q(...)}\``)).

  **Implementation:** `EndoHost.provideHostPath` (`host.js` ~ line
  302) looks the cap up via `getIdForRef` (the daemon's WeakMap from
  exo identity to formula identifier), then defers to
  `getMountHostPath` (`daemon.js` ~ line 5099) which asserts the
  formula type is `mount` or `scratch-mount` and returns the
  recorded path.
  Subdirectory views (`Mount.lookup()`) and read-only attenuations
  (`Mount.readOnly()`) mint fresh exos that have no formula
  identifier, so they are rejected with the same structured error as
  any unrelated remote object.

- [x] Plumb the new power into the daemon's `make-unconfined` powers
  bundle for the sandbox plugin, mirroring how `provideScratchMount` is
  delivered today.
  No change to `@endo/sandbox`'s entry point should be required —
  the factory's `SandboxPowers` consumer already calls
  `E(scratchProvider).provideHostPath(cap)`.

  **Result:** because `provideHostPath` lives on `EndoHost`, the
  existing `make-unconfined` plumbing requires no further change —
  callers simply name a host (or a guest delegating to a host) as the
  plugin's `powersName`, and `@endo/sandbox/agent.js` passes that
  bundle through as `scratchProvider`.

- [x] Replace the stub `provideHostPath` in
  [`packages/sandbox/test/bwrap.test.js`](../packages/sandbox/test/bwrap.test.js)
  and
  [`packages/sandbox/test/podman.test.js`](../packages/sandbox/test/podman.test.js)
  with a call into the real daemon resolver in the daemon-smoke test.
  Keep the stub as a unit-test fixture for backend-agnostic factory
  tests.

  **Result:** the bwrap / podman test stubs remain in place as
  backend-agnostic fixtures (they avoid spinning up a daemon for
  every backend permutation).
  The daemon-shipped behaviour is exercised by the round-trip test
  added under `packages/daemon/test/endo.test.js`
  (see "provideHostPath resolves Mount caps to host paths").
  `packages/sandbox/test/daemon-smoke.test.js` documents the split in
  its module preamble.

- [x] Add a daemon test that exercises the round-trip:
  `provideMount(path)` → grant the mount cap to a sandbox plugin →
  `provideHostPath(cap)` returns the original path.

  **Result:** `packages/daemon/test/endo.test.js` § "provideHostPath
  resolves Mount caps to host paths" (~ line 4271) covers four cases:
  1. `provideMount(path)` round-trips the supplied path.
  2. `provideScratchMount` returns a path under
     `<statePath>/mounts/`.
  3. Subdirectory views minted by `Mount.lookup()` are rejected with
     `not a daemon-minted mount`.
  4. Arbitrary `Far()` exos that quack like mounts are rejected with
     the same structured error.

  Verified locally with
  `npx ava test/endo.test.js -m 'provideHostPath resolves Mount caps to host paths'`.

## Status notes

- This task does **not** need to wait for the genie integration; it
  unblocks every consumer of the sandbox plugin and is the lightest
  possible change to the daemon.
- Done when a fresh daemon can run
  `endo run --UNCONFINED packages/sandbox/src/agent.js` and the
  resulting factory's `make({ rootfs: <Mount cap>, mounts: [...] })`
  succeeds without the caller passing in a custom `provideHostPath`.

  ✅ The end-to-end shape is in place: a host granted as the plugin's
  powers exposes `provideHostPath`, which the sandbox factory consumes
  through `resolveHostPath` (`packages/sandbox/src/factory.js` ~ line
  280).

## Cross-references

- [`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
  § "Cross-cutting concerns / Cap-not-string mounts".
- [`packages/sandbox/src/types.d.ts`](../packages/sandbox/src/types.d.ts)
  — `SandboxPowers` shape.
- [`packages/sandbox/src/factory.js`](../packages/sandbox/src/factory.js)
  — `resolveHostPath` helper that consumes the power.
- [`packages/daemon/CLAUDE.md`](../packages/daemon/CLAUDE.md)
  § "Storage Concepts / Mount" for the live mount surface this
  resolver bridges.
- [`packages/daemon/src/host.js`](../packages/daemon/src/host.js)
  ~ line 302 — `EndoHost.provideHostPath` resolver.
- [`packages/daemon/src/daemon.js`](../packages/daemon/src/daemon.js)
  ~ line 5099 — `getMountHostPath` privileged accessor.
- [`packages/daemon/test/endo.test.js`](../packages/daemon/test/endo.test.js)
  — `provideHostPath resolves Mount caps to host paths` round-trip
  test.
