# Endo POSIX Sandbox — Phase 0: driver interface design

Scope the formal interfaces and stub plugin shell for the
`@endo/sandbox` plugin described in
[`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
§ "Implementation phases" → "Phase 0".

This is interface-only work: no production driver code lands here.
The exit goal is a plugin that loads in a daemon, advertises an
empty backend list, and gives Phase 1 a typed surface to fill in.

**Status: complete.**
All deliverables landed in `packages/sandbox/`; the 12 ava tests
in `test/factory.test.js` and `test/daemon-smoke.test.js` pass,
`tsc` reports no errors, and `node --check` is clean across
`src/*.js`.

## Deliverables

- [x] **Package skeleton** — `packages/sandbox/` with `package.json`
  declaring it as a `@endo/*` workspace member.
  - `"type": "module"`, `"main": "./src/agent.js"`,
    `"workspace:^"` deps on `@endo/exo`, `@endo/patterns`,
    `@endo/errors`, `@endo/eventual-send`, and the daemon types.
  - `tsconfig.json` and `tsconfig.build.json` mirroring sibling
    packages (e.g. `packages/lal`, `packages/networks`).
  - `eslint` config inheriting `plugin:@endo/internal`.

- [x] **`src/types.d.ts`** — typedef-only file declaring:
  - `SandboxFactory`, `SandboxHandle`, `ProcessHandle`, `MountHandle`
    capability shapes (mirroring the `// @ts-check`/`@typedef` style
    used in `packages/daemon/src/types.js`).
  - `SliceSpec`, `SpawnOpts`, and the `SandboxDriver` adapter
    interface from PLAN § "Backend driver interface".
  - Network profile literal union
    (`'none' | 'private' | 'host-loopback' | 'host-lan' | 'host-net'`).
  - `BackendName` literal union and `BackendProbe` result type.

- [x] **`src/interfaces.js`** — `M.interface()` guards corresponding
  to each capability shape above.
  - Use `@endo/patterns` (`M.string()`, `M.arrayOf()`,
    `M.recordOf()`, `M.remotable()`, etc.) consistent with how
    `packages/daemon` defines its exo guards.
  - Each interface exports the `M.interface()` value and is
    `harden()`ed at module top level.

- [x] **`src/factory.js`** — stub `makeSandboxFactory` that:
  - Returns a `makeExo` instance bound to the `SandboxFactory`
    interface guard.
  - Implements `help()` (descriptive string) and
    `listBackends()` (returns `harden([])` for now).
  - `make({ ... })` throws a structured `makeError(X\`no backend
    available: ${q(name)}\`)` from `@endo/errors`.

- [x] **`src/agent.js`** — `make-unconfined` plugin entry point
  mirroring `packages/lal/agent.js`:
  - `export const make = async (powers, _context, { env } = {}) => { ... }`
  - Calls `makeSandboxFactory({ drivers: [], scratchProvider: powers })`.
  - `harden`-exports `make`.

- [x] **Tests** — `packages/sandbox/test/factory.test.js`:
  - `ava` test that imports `makeSandboxFactory`,
    asserts `listBackends()` returns `[]`,
    asserts `make({...})` throws the structured "no backend"
    error.
  - `M.interface()` guards pass shape checks for stubbed remotables.

- [x] **Daemon registration smoke test** — `test/daemon-smoke.test.js`
  drives the agent's `make-unconfined` entry point through the same
  surface a daemon would (`await import('../src/agent.js')`, then
  `await module.make(powers)`), exercises CapTP introspection
  (`__getMethodNames__()`), and confirms `listBackends()` round-trips
  `[]`. A full fork-a-daemon end-to-end test is deferred to Phase 1
  where a non-trivial backend list is available to round-trip;
  the docstring on `daemon-smoke.test.js` records that deferral.

## Out of scope (defer to Phase 1+)

- Any real spawn / mount / process logic.
- Driver probe results beyond an empty list.
- Network policy enforcement (only the literal union is defined).
- Genie integration wiring (workspace / `bash` re-pointing).
- Familiar / renderer access.

## Exit criteria

- `cd packages/sandbox && npx ava` passes the factory unit tests.
- `node --check` is clean across `src/*.js`.
- A locally running daemon can `make-unconfined` the plugin and
  `E(factory).listBackends()` returns `[]` over CapTP.
- Phase 1 work can begin by implementing a `SandboxDriver` against
  the stable typed surface this phase lands.

## References

- `PLAN/endo_posix_sandbox.md` § "Capability surface" and
  § "Backend driver interface".
- `packages/lal/src/agent.js` — closest precedent for a
  `make-unconfined` plugin shape.
- `packages/daemon/src/types.js` — typedef style to mirror.
- `CLAUDE.md` § "Hardened JavaScript (SES) Conventions".
