# Update `bottle.sh`, README, and create `packages/genie/CLAUDE.md`

Follow-up to `TODO/10_genie_self.md` §§ 3c, 3e.
Depends on tasks 11 + 12 having landed (the narrative change must match
the actual boot behaviour).

## Scope

Update the prose/comments that describe how genie boots, now that it runs
as the daemon's `@self` / `@agent` rather than behind a `setup-genie` form
guest + `main-genie` agent guest.

## Concrete changes

### 1. `packages/genie/scripts/bottle.sh`

- Around the Phase 3 comment block (currently lines 552-560):
  - **Delete** the `TODO(phase-1): add an --owner flag here …` comment
    block.  That phase-1 move is what this series of tasks accomplished;
    the TODO is obsolete.
  - **Rewrite** the Phase 3 header comment to say the setup.js launch
    "spawns the root genie directly on the daemon's host agent — the
    worker's inbox is `@self`, no intermediate guest or form-submission
    step".
- Do NOT change the actual `endo run --UNCONFINED setup.js --powers @agent
  -E GENIE_MODEL=… -E GENIE_WORKSPACE=…` line — operator contract is stable.
- If any later phase references "the main-genie guest" in comments, fix
  those too (search for `main-genie` and `setup-genie` in `bottle.sh`).

### 2. `packages/genie/README.md`

- Currently does not mention `yarn setup` (verified), so the back-compat
  concern noted in TODO/10 § 3e is minimal.
- Add a short "Boot model" subsection (or extend an existing one) that
  states: the genie runs as the daemon's root agent; config comes from
  env vars at `makeUnconfined` time; stable pet name is `main-genie`;
  restarting the daemon reincarnates the worker automatically.

### 3. **Create** `packages/genie/CLAUDE.md` (does not exist yet)

Minimum contents:

- **Identity model.** Genie is the daemon's `@self`. Every message to the
  bottle daemon's root handle reaches the genie's piAgent. `@agent` and
  `@self` both refer to the genie worker.
- **Single-tenant constraint.** Any other plugin that tries to *read* mail
  from `@self` on the same daemon will collide with the genie. Co-hosted
  plugins (fae, lal, jaine) use their own guests and are fine as long as
  they don't claim `@self`.
- **Boot shape.** `bottle.sh invoke` → `endo run setup.js --powers @agent`
  → `makeUnconfined('@main', main.js, { powersName: '@agent', env: … })`.
  One identity, one worker.
- **Env-var config.** List the `GENIE_*` env vars that `main.js` reads at
  boot. Required vs. optional. Point at `main.js` for the authoritative
  list so this doc doesn't drift.
- **Sub-agent spawning (deferred).** `spawnAgent` / `removeChildAgent` /
  `listChildAgents` live in `main.js` but are not invoked on boot. A future
  task may expose them through a capability held by the root genie.
- Follow `CLAUDE.md` convention from other packages (e.g.
  `packages/daemon/CLAUDE.md`) for format and section structure.

## Out of scope

- Changes to other plugins' docs (fae/lal/jaine).
- Changes to the top-level `CLAUDE.md` — only the genie-specific doc and
  the package README.
- Any `PLAN/genie_in_bottle.md` edits. That plan describes a longer arc;
  updating it to reference this task's outcome is a separate action if
  desired.

## Acceptance

- `bottle.sh` comments match actual behaviour; no stale TODO(phase-1).
- `packages/genie/CLAUDE.md` exists, renders cleanly, and passes the
  project's markdown line-wrapping convention (80-100 columns, one
  sentence per line — see top-level `CLAUDE.md` § "Markdown Style").
- A newcomer reading `packages/genie/CLAUDE.md` + `README.md` + running
  `bottle.sh invoke --help` can reconstruct the boot flow without reading
  source.

## Status

- [x] bottle.sh Phase 3 comment rewrite + TODO(phase-1) removal
      (already landed as part of tasks 11/12: leading `invoke` help text
      and the Phase 3 header both describe the `@self` / `makeUnconfined`
      boot flow; no `TODO(phase-1)`, `main-genie guest`, or `setup-genie`
      references remain in `bottle.sh`).
- [x] README "Boot model" subsection
      (added a "Boot model" heading to `packages/genie/README.md`
      covering the `setup.js` → `makeUnconfined` flow, `@self`/`@agent`
      aliasing, env-var configuration, and restart reincarnation; points
      at `main.js` for the authoritative env list).
- [x] create `packages/genie/CLAUDE.md`
      (new file covering identity model, single-tenant constraint, boot
      shape, env-var config, and the deferred sub-agent spawning
      helpers; follows the terse style of
      `packages/{fae,lal}/CLAUDE.md`).
