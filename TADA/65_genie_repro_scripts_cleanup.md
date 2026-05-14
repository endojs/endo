# Genie: drop or relocate `tmp-repro-sandbox*.mjs`

Follow-up from
[`60_genie_sandbox_review.md`](./60_genie_sandbox_review.md)
juror **must-fix** finding.

Three debugging-reproduction scripts landed in commit `3c6d6b477`
alongside the bug-hunt that produced TADA/57-62.  They are committed,
not gitignored, `console.log` at top level, and are not referenced by
any other flow:

- `packages/genie/tmp-repro-sandbox.mjs`
- `packages/genie/tmp-repro-sandbox2.mjs`
- `packages/genie/tmp-repro-sandbox3.mjs`

Confirm their current presence with `ls packages/genie/tmp-repro*.mjs`.

## Plan — pick one

- [x] **Option A (preferred): delete.**  The bug they were chasing was
  fixed in TADA/57-62 and is now covered by
  `test:integration:sandbox-slice` and
  `test:integration:dev-repl-sandbox`.  If a future regression needs
  one of these scripts, `git log -- packages/genie/tmp-repro-sandbox.mjs`
  will surface them from history.

- [ ] **Option B: relocate to `packages/genie/test/repro/`.**  Each
  script gets a one-line header comment naming the bug it pins (TADA
  reference + symptom + the test that now covers it).  Add a
  `packages/genie/test/repro/README.md` explaining the directory's
  policy: "ad-hoc reproducers retained as live documentation; they are
  **not** run in CI, so do not rely on them as regression tests — add
  an AVA case before checking the symptom in here".

Pick A unless an operator argues a specific script remains uniquely
informative.  Either way, land the change in the same commit that
fixes the underlying bug — the must-fix posture is "these should not
land alongside the boundary fix that produced them".

## Resolution

2026-05-14: Chose Option A.  Verified no in-tree references outside the
scripts and TADA/TODO docs; verified both replacement integration
tests (`test:integration:sandbox-slice`,
`test:integration:dev-repl-sandbox`) are wired in
`packages/genie/package.json`.  Removed via `git rm`:

- `packages/genie/tmp-repro-sandbox.mjs`
- `packages/genie/tmp-repro-sandbox2.mjs`
- `packages/genie/tmp-repro-sandbox3.mjs`

Deletions staged on branch `dev.eonarc`; the must-fix posture asks that
they land in the same commit as the underlying boundary fix, which has
already shipped — this is the unavoidable lagging follow-up rather than
a co-landed change.  Recoverable from history via
`git log -- packages/genie/tmp-repro-sandbox.mjs` if needed.

## Out of scope

- Adding repro-script hygiene to `.gitignore` patterns generally;
  per-package conventions are enough.
- Re-running the integration scenarios as part of this task; they
  already cover the failure modes the repros were investigating.
