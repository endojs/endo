# Extract slice probe / mint / dispose into a shared helper

Refactor `packages/genie/main.js`'s `spawnAgent` so the
sandbox-specific portion (probe → validate backend → call
`factory.make` → register dispose) lives in a reusable helper
consumable by both `main.js` and `dev-repl.js`.

This is a **no-functional-change refactor** of the daemon path, so
the integration test (`yarn test:integration:sandbox-slice`) is the
gating signal.

## Today's shape (in `main.js`)

The slice-mint sequence sits inline in `spawnAgent`:

- Form-side validation lives in `parseRootfsValue` and
  `assertRootfsBackendCompatible` (already exported from `main.js`).
- The probe / select / mint / dispose code spans roughly lines
  1399–1481 and is intermixed with daemon-only concerns (the
  agent's `cancelledP` kit, agent-specific log prefixes, the
  workspace-mount lookup that consumes either an absolute host path
  or a pet name introduced into the agent guest's namespace).

The pet-name resolution and `provideHostPath` bridging are
daemon-specific; everything from "probe backends" onward is not.

## Status

Done in this slice:

- The helper module lives at
  [`packages/genie/src/sandbox/slice.js`](../packages/genie/src/sandbox/slice.js)
  and exports `mintGenieSlice`, the `parseRootfsValue` /
  `assertRootfsBackendCompatible` form-side parsers, the
  `ALLOWED_NETWORK_PROFILES` / `ALLOWED_BACKENDS` /
  `ALLOWED_ROOTFS_KINDS` constants (and their default + predicate
  siblings), and the `SLICE_WORKSPACE_PATH = '/workspace'` constant.
- [`packages/genie/main.js`](../packages/genie/main.js) imports the
  symbols from the helper, re-exports the form-side surface
  (`ALLOWED_ROOTFS_KINDS`, `isAllowedRootfsKind`, `parseRootfsValue`,
  `assertRootfsBackendCompatible`) so existing tests and downstream
  consumers continue to import them from `main.js`, and `spawnAgent`
  now calls `mintGenieSlice({ ..., onLog: msg =>
  console.log('[genie:agentName] ' + msg) })` instead of the inline
  probe / mint / dispose block (~lines 1268-1288).  Per-agent log
  prefixes ride the `onLog` callback exactly as the TODO calls for.
- The dev-repl harness (TODO/54) is not yet wired up, but the helper's
  signature already accommodates it: `cancelledP` and `onLog` are
  optional, and `agentName` is purely cosmetic.

## Acceptance check (run on this slice)

- `git grep -n "E(sandboxFactory).make"` in `packages/genie` returns
  one code call (in `src/sandbox/slice.js` ~line 354); the other
  matches are docstrings and a CLAUDE.md reference.
- `git grep -n "listBackends"` in `packages/genie` returns one code
  call (in `src/sandbox/slice.js` ~line 327); other matches are docs.
- `corepack yarn lint` is clean for the slice helper (0 errors; the
  remaining warnings are pre-existing `@jessie.js/safe-await-separator`
  notes in `setup.js`, `tools/command.js`, and `tools/vfs-mount.js`).
- `corepack yarn ava` reports 327 tests passing — including the full
  `rootfs-form` suite (16/16) which exercises the form-side parsers
  in their new location.  The 3 uncaught exceptions in the run are
  pre-existing SES bootstrap drift in the memory / filesystem / fts5
  test setup, not caused by this refactor.
- `yarn test:integration` and `yarn test:integration:sandbox-slice`
  not yet rerun in this environment (they require a Linux host with
  bubblewrap and the daemon side-effects fixture); rerun before
  landing.

## Scope

- [x] Create `packages/genie/src/sandbox/slice.js` exporting:
  - `mintGenieSlice({ sandboxFactory, agentName, workspaceMount,
    workspaceDir, backend, network, rootfs, env, cancelledP, onLog })`
    → `Promise<{ slice, spawner, resolvedBackend, sliceLabel }>`.
    - `agentName` participates only in error messages and log lines
      so the dev-repl can pass `'dev-repl'`.
    - `cancelledP` is optional; when provided, `slice.dispose()` is
      registered on its resolution.  When omitted, the caller is
      expected to call `slice.dispose()` itself (the dev-repl path,
      where teardown is REPL-driven — see TODO/54).
    - `onLog` is optional and defaults to `console.log`; the
      daemon path passes `(msg) => console.log('[genie:agentName]
      ' + msg)`, the dev-repl passes a dim-formatted writer.
    - `sliceLabel` is the `"backend: …, network: …, rootfs: …"`
      string the daemon uses in its readiness announcement; both
      callers can reuse it for diagnostics.
- [x] Move `parseRootfsValue` and `assertRootfsBackendCompatible`
  to live alongside it (or re-export from there) so `dev-repl.js`
  doesn't have to import them from `main.js`.  `main.js` keeps a
  re-export to preserve the existing public surface.
- [x] Move the `ALLOWED_NETWORK_PROFILES` / `ALLOWED_BACKENDS` /
  `ALLOWED_ROOTFS_KINDS` constants to the same module (already
  exported, just relocate).
- [x] Refactor `spawnAgent` to call `mintGenieSlice(...)` and
  delete the inline probe / mint / dispose blocks.  Per-agent log
  prefixes ("[genie:agentName]") move into the `onLog` callback.
- [ ] Rerun `yarn test:integration` and
  `yarn test:integration:sandbox-slice` (Linux + bubblewrap) and
  the genie unit tests — no behavioural change expected.  Genie
  unit tests rerun and pass; integration scenarios still need a
  Linux + bubblewrap host pass before landing.

## What stays in `main.js`

Daemon-only concerns:

- Looking up `workspace` / `sandboxes` pet names from `powers`.
- Pet-name → Mount cap resolution (`E(agentGuest).lookup`,
  `__getMethodNames__` validation).
- `defaultWorkspaceMount` plumbing through `provideHostPath` to
  derive `workspaceDir` for the daemon-side memory / FTS5 tools.
- The cancellation kit + heartbeat ticker wiring.

Those are the parts the dev-repl does **not** need; the helper
boundary is the line between "I have a `MountCap` for the workspace
and a `SandboxFactory`" and "now mint a confined slice for me".

## Acceptance

- `git grep -n "E(sandboxFactory).make"` returns a single hit (in
  the new helper).
- `git grep -n "listBackends"` in `packages/genie` returns a single
  hit (in the new helper).
- The daemon-hosted genie's slice mint logs the same fields it
  logged before (`backend: bwrap, network: private, rootfs:
  host-bind` etc.); `setup-genie` form replies are byte-identical.

## Out of scope

- Adding new knobs (`limits`, `seccomp`).  Forwarded as-is.
- Changing the form-side error wording.  The helper's structured
  errors must reproduce the existing wording verbatim — operators
  may grep for those strings.
