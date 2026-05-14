# Document the dev-repl sandbox path

Update operator-facing and contributor-facing docs once the
dev-repl is wired through `@endo/sandbox`.

Depends on TODO/53 / TODO/54 / TODO/55 having landed.

## Scope

### `packages/genie/README.md`

- [x] Add a "Dev REPL: sandboxed workspace" subsection near the
  existing "Sandboxed workspace" operator section.  Cover:
  - The new CLI flags (`--sandbox` / `--network` / `--rootfs`).
  - The default (`auto`) and how it falls back to host spawning
    on platforms without a backend.
  - The macOS / non-Linux contributor recommendation
    (`--sandbox off` quiets the warning).
  - A worked example: `node packages/genie/dev-repl.js -w
    /tmp/foo --sandbox bwrap -c "..."`.
- [x] Mirror the rootfs / backend-compatibility table from the
  daemon section so operators do not have to flip back and forth.

### `packages/genie/CLAUDE.md`

- [x] Add a "Dev REPL local powers" subsection under "Capabilities
  the genie guest receives" explaining that the dev-repl
  constructs an in-process `SandboxPowers` (TODO/51) rather than
  going through `host-agent.provideMount` / `provideHostPath`,
  and that the workspace Mount cap is owned by the REPL itself.
- [x] Cross-reference the slice-helper module (TODO/52) so future
  contributors know both call sites share the same probe / mint /
  dispose code.
- [x] Update the "Testing protocol" section to list
  `test:integration:dev-repl-sandbox` alongside the existing
  `test:integration:sandbox-slice`.

### Code-level docstrings

- [x] Update `dev-repl.js`'s file-level JSDoc to mention the
  `--sandbox` flag.
- [x] Update `src/sandbox/local-powers.js`'s file-level JSDoc to
  point readers at the daemon-side counterpart (`host.js`'s
  `provideHostPath`) for the daemon analogue.
- [x] Update `src/sandbox/slice.js`'s file-level JSDoc to
  document both call sites (daemon `spawnAgent`, dev-repl
  `runMain`) and what they pull through.

## Acceptance

- `yarn docs` (or `tsc --build`) is clean.
- `git grep -n -- '--sandbox'` covers the README, CLAUDE.md, and
  the dev-repl JSDoc.
- New contributors can answer "how do I make the dev-repl run
  bash inside a slice?" by reading the README alone.

## Status

Done.  All checklist items above landed during the rollout of
TODO/53 / TODO/54 / TODO/55:

- README.md § "Dev REPL: sandboxed workspace" (line ~267) covers
  the three CLI flags, the `auto` default and host-spawn
  fallback, the `--sandbox off` macOS recommendation, and the
  worked `-w /tmp/foo --sandbox bwrap -c "..."` example.
- README.md § "Backend / rootfs compatibility (dev-repl)" (line
  ~332) mirrors the daemon section's rootfs/backend matrix.
- CLAUDE.md § "Dev REPL local powers" pins the
  daemon-vs-dev-repl asymmetry table and cross-references
  `mintGenieSlice` / TODO/52.
- CLAUDE.md § "Testing protocol" lists
  `test:integration:dev-repl-sandbox` alongside
  `test:integration:sandbox-slice`.
- `dev-repl.js`, `src/sandbox/local-powers.js`, and
  `src/sandbox/slice.js` carry file-level JSDoc that names the
  `--sandbox` flag, points at `host.js`'s `provideHostPath`, and
  identifies both call sites of `mintGenieSlice` respectively.

`git grep -n -- '--sandbox' packages/genie/` covers README.md,
CLAUDE.md, dev-repl.js, and the dev-repl-sandbox AVA test, so the
acceptance grep also passes.

## Out of scope

- Renaming any existing flags (`--workspace`, `-w`, etc.).
- Migrating older docs that still describe the pre-sandbox dev-repl
  behaviour.  The README rewrites the relevant sections; older
  references in `TADA/` and `PLAN/` stay as historical record.
