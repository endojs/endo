# Phase 2 sub-task: primordial test sweep + Phase 2 sign-off

Implements § 5 (status) of
[`TODO/92_genie_primordial.md`](./92_genie_primordial.md) and the
test-coverage entries from sub-tasks 93-97.  Final sub-task in the
Phase 2 chain.

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
