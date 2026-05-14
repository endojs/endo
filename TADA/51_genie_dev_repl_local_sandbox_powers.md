# Local `SandboxPowers` for daemon-free callers

A small in-process implementation of `SandboxPowers` so callers
without an Endo daemon (the dev-repl, future scripted harnesses,
unit tests outside the sandbox package) can construct a
`SandboxFactory` directly and mint slices.

This is a **no-op landing**: the new module ships with unit tests
but no consumer yet — TODO/53 wires it into `dev-repl.js`.

## Status

**Landed.**  See `packages/genie/src/sandbox/local-powers.js` and
`packages/genie/test/local-sandbox-powers.test.js`.  Five unit tests
pass; prettier, eslint, and `tsc --checkJs` are clean on the new
files.

## Background

`@endo/sandbox`'s `makeSandboxFactory` requires a `scratchProvider`
of shape `SandboxPowers` (see `packages/sandbox/src/types.d.ts`):

```ts
type SandboxPowers = ERef<{
  provideScratchMount(petName: string): Promise<MountCap>;
  provideHostPath(cap: MountCap): Promise<string>;
}>;
```

Inside the daemon, `host.js` provides this via the daemon's existing
mount machinery.  Outside the daemon, callers either build a stub
(every test in `packages/sandbox/test/*.test.js` does this — see
`makeStubScratchProvider` in `bwrap.test.js`) or go without slice
support entirely.  The dev-repl needs the former.

## Scope

- [x] Add `packages/genie/src/sandbox/local-powers.js` exporting:
  - `makeLocalSandboxPowers()` → `{ powers, makeMountCapForPath, dispose }`
    - `powers`: a `SandboxPowers`-shaped exo built with `makeExo` +
      a small `M.interface()` guard so CapTP introspection works
      (see `packages/genie/CLAUDE.md` § "Modules and exports" on
      `makeExo` vs `Far`).
    - `makeMountCapForPath(hostPath)`: returns a `Mount`-shaped exo
      pointing at the given host path; the cap is wired into the
      same `WeakMap<cap, hostPath>` `provideHostPath` consults.
      Used by callers to mint a workspace Mount they can pass to
      `factory.make({ mounts })`.
    - `dispose()`: `await rm` every tmpdir minted via
      `provideScratchMount`.  Called by the caller on REPL exit.
- [x] Mirror the stub-Mount surface used in
  `packages/sandbox/test/bwrap.test.js` so the factory's
  `resolveHostPath` path works without modification.  Required
  methods on the Mount exo are dictated by the Mount-cap surface
  the factory consumes — at minimum `help`, plus whatever is needed
  for the workspace-mount path through `buildGenieTools`
  (`readText`, `writeText`, `makeDirectory`, `has`, `list` — see
  the Mount validation in `main.js` `spawnAgent`).  All six
  methods are backed by `node:fs` so a future consumer (TODO/53)
  can drive the cap end-to-end without further wiring.
- [x] Unit tests in `packages/genie/test/local-sandbox-powers.test.js`:
  - `provideScratchMount` mints distinct tmpdirs per call.
  - `provideHostPath` round-trips a cap minted by
    `makeMountCapForPath`.  Also pins the
    `__getMethodNames__()` surface against accidental method-name
    regression.
  - `provideHostPath` rejects an unknown cap with a structured
    error (`/not a local-minted mount/`, mirroring the daemon's
    `not a daemon-minted mount`).  Covers `Far`-minted strangers,
    caps from a sibling `makeLocalSandboxPowers` instance, and
    non-object inputs.
  - `dispose()` rms every tmpdir; second call is a no-op.  An
    additional test pins the asymmetry that `dispose()` does **not**
    delete operator-supplied paths from `makeMountCapForPath`.
- [x] No external consumer yet — this is a foundation.  The unit
  tests are the only proof of life.

## Open question

Should this live in `@endo/genie` (current proposal) or move into
`@endo/sandbox` as an exported helper (e.g.
`@endo/sandbox/local-powers.js`)?  The genie home keeps the
sandbox plugin's surface minimal and lets the genie tailor the
Mount-cap method set to whatever `buildGenieTools` actually needs.
A future migration is easy because the file has no genie-specific
imports.

Default: ship under `@endo/genie` for now; revisit when a second
non-genie caller surfaces.

## Out of scope

- Honouring the genuine Endo `provideMount` semantics (refusing to
  mount paths outside a chrooted realm, etc.).  The dev-repl owns
  its workspace and trusts the operator-supplied path; the local
  powers are deliberately a thinner abstraction than the daemon's.
- Reusing existing tmpdirs across runs.  Each REPL session mints
  fresh scratch and disposes on exit.
