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

## Deliverables

- [ ] Audit `packages/daemon/src/mount.js` and `host.js` for the
  daemon-side bookkeeping that already records the host path of every
  `Mount` it mints.
  Identify whether the host path lives on the `Mount` formula record,
  on the pet-store, or only in the `mountFile` runtime closure.

- [ ] Decide whether `provideHostPath` ships as:
  - a method on the host agent / guest interface that takes a `Mount`
    capability and looks up the registered host path, or
  - a sibling power that the daemon hands to `make-unconfined`
    plugins like `@endo/sandbox` alongside `provideScratchMount`.

  Recommendation: a sibling power named `provideMountHostPath` (or
  `resolveMountHostPath`) so the host-paths surface stays narrow and
  off the public guest interface.
  Document the tradeoff in the resulting code review.

- [ ] Implement the resolver.
  The implementation must reject any `Mount` cap that the daemon did
  not mint — never trust an arbitrary remote object that quacks like a
  mount.
  Match the structured-error pattern used by the rest of the daemon
  (`makeError(X\`...${q(...)}\``)).

- [ ] Plumb the new power into the daemon's `make-unconfined` powers
  bundle for the sandbox plugin, mirroring how `provideScratchMount` is
  delivered today.
  No change to `@endo/sandbox`'s entry point should be required —
  the factory's `SandboxPowers` consumer already calls
  `E(scratchProvider).provideHostPath(cap)`.

- [ ] Replace the stub `provideHostPath` in
  [`packages/sandbox/test/bwrap.test.js`](../packages/sandbox/test/bwrap.test.js)
  and
  [`packages/sandbox/test/podman.test.js`](../packages/sandbox/test/podman.test.js)
  with a call into the real daemon resolver in the daemon-smoke test.
  Keep the stub as a unit-test fixture for backend-agnostic factory
  tests.

- [ ] Add a daemon test that exercises the round-trip:
  `provideMount(path)` → grant the mount cap to a sandbox plugin →
  `provideHostPath(cap)` returns the original path.

## Status notes

- This task does **not** need to wait for the genie integration; it
  unblocks every consumer of the sandbox plugin and is the lightest
  possible change to the daemon.
- Done when a fresh daemon can run
  `endo run --UNCONFINED packages/sandbox/src/agent.js` and the
  resulting factory's `make({ rootfs: <Mount cap>, mounts: [...] })`
  succeeds without the caller passing in a custom `provideHostPath`.

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
