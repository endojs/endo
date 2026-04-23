
- [x] review the genie self changes from `TADA/10_genie_self.md` and its sub-tasks
  - `TADA/10_genie_self.md` § 5 Status — both checkboxes `[x]` (design plan
    + follow-up task files written).
  - `TADA/11_genie_self_main_refactor.md` — all five status items `[x]`;
    `main.js` now takes `make(powers, context, { env })`, reads `GENIE_*`
    from the third arg per the daemon's `make` API (the TADA body's
    "context.env" wording predates that detail — see the inline note on
    the env checkbox), validates `GENIE_MODEL`/`GENIE_WORKSPACE`
    synchronously, and lint/syntax-checks clean.  `spawnAgent` and the
    child-agent helpers are retained but dormant.
  - `TADA/12_genie_self_setup_launcher.md` — all five status items `[x]`;
    `setup.js` is a 52-line launcher that `has('main-genie')`-skips on
    re-run and calls `makeUnconfined('@main', …, { powersName: '@agent',
    resultName: 'main-genie', env })` with the full `GENIE_*` forwarding
    block.
  - `TADA/13_genie_self_bottle_narrative.md` — all three status items
    `[x]`; `bottle.sh` comments/help describe the `@self` boot with no
    `setup-genie` / `main-genie-guest` / `TODO(phase-1)` residue,
    `packages/genie/README.md` gained a "Boot model" section, and
    `packages/genie/CLAUDE.md` was created (identity model, single-tenant
    constraint, boot shape, env-var config, deferred sub-agent spawning).
  - `TADA/14_genie_self_tests.md` — all five status items `[x]`; scan
    confirmed zero existing AVA tests depended on the form-submission
    boot, and `packages/genie/test/boot/self-boot.test.js` covers both
    the boot (`E(hostAgent).has('main-genie')` + mail reaches the
    piAgent) and daemon-restart survival.  335 AVA tests green.
  - Residual stale references: one JSDoc line in `packages/genie/main.js`
    (≈ line 554) still reads "not setup-genie"; already logged in
    `TODO/92_genie_primordial.md` § Notes for pickup by the first Phase 2
    sub-task that touches `main.js`, so no new follow-up needed here.

- [x] revise the implementation plan within `PLAN/genie_in_bottle.md` accordingly
  - Already revised in-tree on 2026-04-22/23 (see the header note —
    "Phase 0 … and what is now Phase 1 … have landed", pointing at
    `TADA/81_genie_bottle_phase0_shell.md` and `TADA/10_genie_self.md`).
  - `§ Current state (2026-04-23)` table reflects the collapsed boot
    (`makeUnconfined('@main', main.js, { powersName: '@agent', resultName:
    'main-genie', env })`; no `setup-genie` form guest, no intermediate
    `main-genie` guest).
  - `§ Root genie (the R2b+R3 shape, as landed)` documents the R2b
    landing (not the earlier "R2 guest with introductions" draft) and
    keeps `spawnAgent` / `removeChildAgent` / `listChildAgents` as
    retained-but-dormant building blocks.
  - `§ Resolved decisions` names R2b + R3 as the committed shape and
    points at `§ Root genie` for detail.
  - `§ Implementation phases / Phase 1: genie as @self (R2b)` carries the
    `— **landed**` marker with a paragraph describing what actually
    shipped, and `§ Phase 2: primordial genie and /model builtin` is
    annotated `— **next**` with a pointer to `TODO/92_genie_primordial.md`.
  - No additional plan edits identified on this review pass.

- [x] create next `TODO/` tasks for the next phase of the genie bottle plan
  - `TODO/92_genie_primordial.md` exists as Phase 2's research + design
    task (credentialing, primordial automaton, `/model` builtin,
    persistence, hand-off to piAgent).
  - Its § 4 Follow-up tasks names a provisional decomposition into
    `TODO/93_genie_primordial_boot.md`,
    `TODO/94_genie_primordial_automaton.md`,
    `TODO/95_genie_model_builtin.md`,
    `TODO/96_genie_model_persistence.md`,
    `TODO/97_genie_primordial_transition.md`, and
    `TODO/98_genie_primordial_tests.md` — but those files are intentionally
    not created yet because § 5 Status item #3 explicitly gates their
    creation on "flesh out § 3 Design plan", to avoid locking in a
    decomposition before the research in § 1 resolves the open questions
    about provider plumbing, persistence schema, and credential hygiene.
  - No additional Phase-2 TODO files are created from this task; the
    next increment should come from working `TODO/92`'s § 1 + § 3 and
    then splitting § 4.

## Status

All three items resolved via prior work on 2026-04-22/23.
This task is effectively a confirmation pass; no code or additional
task-file changes were introduced by this pass itself.

