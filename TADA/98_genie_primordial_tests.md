# Phase 2 sub-task: primordial test sweep + Phase 2 sign-off

Implements § 5 (status) of
[`TADA/92_genie_primordial.md`](../TADA/92_genie_primordial.md) and
the test-coverage entries from sub-tasks 93-97.  Final sub-task in
the Phase 2 chain.

## Goal

Land the integration test that exercises the full primordial →
`/model commit` → piAgent → restart-replays path end-to-end, plus
any unit-test gaps left by sub-tasks 93-97.  Then update
`PLAN/genie_in_bottle.md` to mark Phase 2 as **landed** and move
the parent task to `TADA/`.

## Files

- `packages/genie/test/boot/primordial.test.js` — *new* integration
  test, modelled on
  `packages/genie/test/boot/self-boot.test.js`.  Each test forks a
  full daemon and asserts on worker-log + inbox state.  Use
  `test.serial` to avoid resource contention.
  - Test 1 — "boots primordial when GENIE_MODEL absent" (folded in
    from sub-task 93 if convenient; otherwise a regression).
  - Test 2 — "primordial answers /help and /model list".
  - Test 3 — "/model set + /model show round-trips draft state".
  - Test 4 — "/model test reports AUTH on bogus credentials"
    (skip if no fake-provider harness; otherwise cover happy path
    against the ollama-stub).
  - Test 5 — "/model commit in primordial mode hands off to
    piAgent" (the headline case from sub-task 97).
  - Test 6 — "restart with persisted config reaches piAgent
    without /model" (the persistence-is-honoured case from
    sub-task 96).
  - Test 7 — "/model commit in piAgent mode persists then exits"
    (uses the daemon-restart fixture from
    `self-boot.test.js`'s daemon-restart case).
- `packages/genie/test/primordial/` — collect any unit tests not
  already landed by 93-97.
- `PLAN/genie_in_bottle.md`:
  - Top banner: change "Phase 2 (primordial genie + `/model`
    builtin) is the next unattempted phase" to a "landed" call-out.
  - § Implementation phases → Phase 2: change the heading to
    `### Phase 2 … — **landed**` mirroring Phase 1's format.
  - Add a pointer to the TADA file (see below).
- `TADA/` — move
  `TODO/92_genie_primordial.md` and the five sub-task files
  (93-97) into `TADA/` once the Phase-2 work has actually landed.
  This sub-task itself stays in `TODO/` until it lands and then
  joins them.
- `packages/genie/CLAUDE.md` — final pass: confirm the env-var
  description matches reality after sub-tasks 93/96 landed.

## Implementation notes

- The integration test reuses the per-test harness pattern from
  `self-boot.test.js`: `makeConfig()`, `start`, `purge`, `restart`,
  `stop` from `@endo/daemon`.  Sending `/model` commands uses an
  `endo accept`-style guest invitation pattern — see how
  `self-boot.test.js` constructs the second guest to send a
  message in.
- For Test 5 / Test 7 (which exercise `process.exit`), the test
  harness must allow worker exit and verify the daemon
  reincarnates the worker.  The reincarnation test in
  `self-boot.test.js` is the precedent.
- The fake-provider harness mentioned in Test 4 is *optional* —
  if pi-ai does not expose a way to register a stub provider,
  document the gap and skip the AUTH-error test for now.

## Acceptance

- Full Phase 2 test run passes:
  `npx ava packages/genie/test/boot/ packages/genie/test/primordial/
  packages/genie/test/loop/ --timeout=180s`.
- `PLAN/genie_in_bottle.md` Phase 2 banner reads "landed" and links
  to the moved TADA file.
- `TODO/92_genie_primordial.md` and sub-task files 93-97 (and 98
  itself, on this sub-task's land) are moved to `TADA/`.

## Non-goals

- Capability-based credential storage (still a separate phase per
  parent § 3g).
- Phase 3 (install story) — orthogonal.

## Status — landed 2026-04-28

- Sub-tasks 93-97 already covered each phase-2 surface with
  dedicated unit tests under `packages/genie/test/primordial/`
  (`automaton.test.js`, `model-handler.test.js`, `persistence.test.js`,
  `providers.test.js`).  The unit-test gap was empty by the time this
  sub-task started.
- The integration test plan in this file mapped onto the existing
  `packages/genie/test/boot/self-boot.test.js` harness:
  - Test 1 (primordial boot when `GENIE_MODEL` absent) — already
    landed by sub-task 93 as
    `'genie boots primordial when GENIE_MODEL absent'`.
  - Test 2 (specials dispatch in primordial mode) — added as
    `'primordial mode dispatches /help and /model list as specials'`
    so a regression that decoupled `/model` from the dispatcher in
    primordial mode would surface here.  The pre-existing
    `'primordial genie replies with a pointer at /help and /model'`
    test still covers the friendly-pointer plain-text reply.
  - Test 3 (`/model set` + `/model show` round-trip) — covered at
    the unit level by `model-handler.test.js`'s dedicated `/model
    set` and `/model show` blocks; an integration variant would have
    duplicated state-machine assertions without exercising new
    daemon plumbing.  Skipped.
  - Test 4 (`/model test` AUTH classification) — covered at the
    unit level (`/model test — routes scratch-agent construction
    failures through OTHER`) since pi-ai does not expose a fake
    provider hook to drive the AUTH branch end-to-end.  Documented
    as a gap until a future sub-task lands a stub-provider harness.
  - Test 5 (primordial `/model commit` → piAgent hand-off) — already
    landed by sub-task 97 as
    `'primordial /model commit hands off to piAgent without a worker
    restart'`.
  - Test 6 (restart with persisted config reaches piAgent without
    `/model`) — already landed by sub-tasks 96+97 as
    `'genie boots from a pre-seeded .genie/config.json without
    GENIE_MODEL'` and
    `'daemon restart after /model commit reaches piAgent without
    /model'`.
  - Test 7 (piAgent `/model commit` persists then exits) — added as
    `'piAgent /model commit persists, replies, and exits the
    worker'`.  Covers the `state.requestRestart` wire-up by waiting
    for the `/model commit triggered worker exit` log line and
    proving the daemon reincarnates the worker after a restart with
    the persisted config on disk.
- `PLAN/genie_in_bottle.md` Phase 2 banner now reads "landed" and
  links to `TADA/92_genie_primordial.md`.
- `packages/genie/CLAUDE.md` § "Env-var config" updated: the
  `GENIE_MODEL` blurb now describes the friendly-pointer reply path
  in primordial mode (sub-task 94's automaton) instead of the
  pre-Phase-2 placeholder.  The follow-up reference in §
  "Persisted model config" repointed at `TADA/92_genie_primordial.md`
  now that the parent task moved.
- Full Phase 2 test run (124 tests across `boot/`, `primordial/`,
  `loop/`) passes against the tree at this commit.
