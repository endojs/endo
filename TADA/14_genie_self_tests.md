# Catalogue and update genie tests for the `@self` boot

Follow-up to `TODO/10_genie_self.md` § 3e risk 2.
Depends on tasks 11 + 12 (the new boot must exist before tests can assert
on it).

## Scope

Identify any test under `packages/genie/test/` that depends on the old
form-submission boot path and update it to the new direct-`@self` path.
Add at least one integration test that exercises the new flow end-to-end.

## Starting point — catalogue

Research for task 10 found that **most existing genie tests don't touch the
form-submission boot** — they target isolated subsystems (tool-gate,
fts5-backend, dom-parser, interval, observer, reflector, tools/*). The only
message-dispatch-adjacent test is `test/loop/run.test.js`, which drives
`runGenieLoop` with fake IO and is unlikely to depend on the launcher
shape. So the update surface is probably small. The first step of this
task is to confirm that by searching.

Do this scan as the first step and record results in this file:

- `rg -n 'setup-genie|provideGuest.*genie|controller-for-genie|profile-for-genie' packages/genie/test/`
- `rg -n 'form\\(|submit\\(' packages/genie/test/`
- `rg -n 'GENIE_MODEL|GENIE_WORKSPACE|GENIE_NAME' packages/genie/test/`
- Look for any test that invokes `setup.js` or `bottle.sh`.

Expected outcome: very few — possibly zero — tests to edit.

### Scan results (2026-04-23)

Ripgrep over `packages/genie/test/**/*.test.js`:

- `setup-genie | provideGuest.*genie | controller-for-genie | profile-for-genie`
  → **0 matches.** No test references any of the old form-submission guest
  names.
- `form(|submit(` → **0 matches** in `.test.js` files.
- `GENIE_MODEL | GENIE_WORKSPACE | GENIE_NAME` → matches only in
  `test/integration.sh` (a shell-level smoke harness that lives outside
  the AVA run) and `test/scenarios/*.sh`. No JavaScript AVA test depends
  on these env vars.
- `import.*@endo/daemon | makeEndoClient | start(config)` → **0 matches**.
  No existing genie AVA test forks a daemon.
- The `../setup.js` imports in every `.test.js` resolve to
  `packages/genie/test/setup.js` (a harden polyfill), NOT the
  package-root `setup.js`; they are unrelated to the form boot path.

**Net:** zero existing genie AVA tests need editing.  The full task
surface collapses to adding one new integration test that exercises the
new `@self` boot.

## Concrete changes

1. **Per affected test**, replace the form-submission assertions with
   equivalent assertions that the worker boots from `context.env` and the
   root handle receives messages directly.
2. **Add a new test** `packages/genie/test/boot/self-boot.test.js` (or
   similar) that:
   - Spins up a daemon (following `packages/daemon/test/endo.test.js`
     patterns) with `ENDO_ADDR=127.0.0.1:0`.
   - Invokes the equivalent of `setup.js` with `powersName: '@agent'` and
     an `env` block containing a test `GENIE_MODEL` (a stub model if a
     live one isn't available) and a throw-away `GENIE_WORKSPACE`.
   - Asserts that `E(hostAgent).has('main-genie')` becomes true.
   - Sends a message to the daemon host (i.e. `@self`) and asserts that
     the genie's piAgent receives it (e.g. via a test tool/logger the
     genie is configured with).
   - Uses `test.serial` (TODO/10 & project CLAUDE.md: gateway/daemon
     tests fork a full daemon per test and must not run in parallel).
3. **Restart-survival assertion** (optional but valuable — TODO/10 § 3e
   risk 4): restart the daemon within the test and assert the worker
   comes back without re-running setup.
4. **Clean-up.** Kill stray daemon processes between runs as documented
   in the project CLAUDE.md:
   `pkill -f "daemon-node.*packages/daemon/tmp"` +
   `rm -rf packages/daemon/tmp/`.

## Out of scope

- Refactoring `runGenieLoop` unit tests that already pass.
- End-to-end owner-edge tests that cross `endo invite owner`; those are
  worth writing but belong in a separate task focused on the owner
  handshake.

## Acceptance

- `cd packages/genie && npx ava --timeout=120s` is green.
- The new boot test exercises the `@self` path and fails if `setup.js`
  regresses to the form-submission shape.

## Status

- [x] scan `packages/genie/test/` for form-submission dependencies
      (results logged above — nothing to update)
- [x] update any affected tests (none required)
- [x] add `self-boot` integration test
      (`packages/genie/test/boot/self-boot.test.js`)
- [x] (optional) add daemon-restart survival assertion
      (second test in the same file: `main-genie survives a daemon
      restart without re-running setup.js`)
- [x] `npx ava` green in `packages/genie/` — 335 tests passing,
      including the two new self-boot tests (lint clean via
      `eslint test/boot/self-boot.test.js`)
