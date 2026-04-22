# Genie as the daemon's `@self` agent

Okay so the genie main plugin:
- primary source in `packages/genie/main.js`
- as carried by `packages/genie/setup.js`
- and especially as integrated by `packages/genie/scripts/bottle.sh`

- we need to elevate the main genie agent to be responsible for `@agent` and
  `@self` main message inbox
- so there should be no initial setup form anymore, just make one main/root
  genie agent, and attach it to the main powers of the daemon agent aka `@self`

## 1. Research

### 1a. How the daemon resolves `@agent` / `@self` / `@host`

- `packages/daemon/src/host.js:174-188` declares the special-name map for the
  **host** (the daemon's root agent):
  - `@agent` → `hostId`   — the host formula itself (`EndoHost`)
  - `@self`  → `handleId` — the handle peers send mail to
  - `@host`  → `hostHandleId ?? handleId` — parent host handle, or self if
    top-level
  - plus `@main`, `@endo`, `@nets`, `@pins`, `@info`, `@none`, `@mail`.
- `packages/daemon/src/guest.js` uses a narrower map for confined guests:
  `@agent` → the guest's own agent, `@self` → the guest's handle,
  `@host` → the parent host handle (see daemon `CLAUDE.md` § "Special names").
- `packages/daemon/src/daemon.js:3340-3425` shows the daemon's bootstrap: a
  single top-level host formula with one keypair, one mailbox store, one
  pet-store — this is the identity every `endo send`/`endo inbox` talks to and
  what `endo invite owner` hands out over CapTP.

### 1b. How `endo run --UNCONFINED … --powers @agent` wires powers

- `packages/cli/src/commands/run.js:26-69`:
  `--powers @agent` (and the legacy `@host`/`AGENT` aliases) resolve to the
  CLI's bootstrapped `agent` reference, i.e. **the daemon's root host agent**.
  That reference is passed as the first argument to the module's exported
  `main(powersP, ...args)`.
- For **persistent** (worker-hosted) plugins, callers go through
  `E(hostAgent).makeUnconfined(workerName, specifier, { powersName, env, resultName })`:
  `packages/daemon/src/host.js:443-526`.  `assertPowersName` (host.js:37) accepts
  `@none`, `@agent`, `@endo`, or any pet name — **so `powersName: '@agent'` is
  legal and hands the worker the daemon's root host directly**, no intermediate
  guest required.
- The worker's `makeUnconfined` in `packages/daemon/src/worker.js:85-92` imports
  the module and calls `namespace.make(powersP, contextP, { env })` — this is
  the export `main.js` already provides today.
- `env` for `makeUnconfined` is opt-in per-call; `process.env` inside the
  worker is NOT inherited from the `endo run` invocation unless explicitly
  forwarded.  (This is why `setup.js` today re-reads `process.env` in its own
  ephemeral CLI process and hand-builds form values.)

### 1c. The current genie boot chain

1. `bottle.sh invoke` → `endo run --UNCONFINED packages/genie/setup.js --powers @agent -E GENIE_MODEL=… -E GENIE_WORKSPACE=…`.
2. `setup.js` runs in the CLI process with the daemon host as powers:
   - `provideGuest('setup-genie', { introducedNames: { '@agent': 'host-agent' }, agentName: 'profile-for-genie' })`
     — creates a confined guest that can reach the host via the name
     `host-agent`.
   - `makeUnconfined('@main', main.js, { powersName: 'profile-for-genie', resultName: 'controller-for-genie' })`
     — spawns the persistent main.js worker with the guest's powers.
   - Watches the CLI process's own inbox for the form message from
     `setup-genie` and auto-submits `GENIE_MODEL`/`GENIE_WORKSPACE`/`GENIE_NAME`.
   - Then exits; the daemon-side worker keeps running.
3. `main.js:make(guestPowers, …)` runs inside the worker:
   - `E(powers).lookup('host-agent')` → retrieves the host handle.
   - `E(powers).form('@host', 'Configure Genie agent', fields)` — posts the
     config form.
   - For each form submission, `spawnAgent(hostAgent, agentName, config)`:
     - `provideGuest(agentName, { introducedNames: { 'workspace-mount': 'workspace' }, agentName: 'profile-for-<name>' })`
       — **yet another** confined guest, one per agent (default `main-genie`).
     - Runs `runAgentLoop` against that agent-guest's inbox; heartbeat ticks,
       observer, reflector, FTS backend all attach under that identity.
   - `spawnAgent`/`removeChildAgent`/`listChildAgents` also manage sub-agent
     entries in a child `genie/` directory inside the parent guest, for the
     multi-agent-spawning UX.

Net effect today: **three layers of identity** between the daemon's root
agent and the genie loop — CLI launcher, `setup-genie` form guest, and a
`main-genie` per-agent guest.  The operator who accepts `endo invite owner`
gets a peer-host edge to the daemon's `@self`, but that `@self` is an empty
inbox — every message they send has to be delivered to `main-genie` (via
`endo send main-genie …`), not to `@self`.

### 1d. Existing plans that overlap

- `PLAN/genie_in_bottle.md` §§ "Root genie (the R2+R3 shape)" and
  "Implementation phases / Phase 1: --owner flag in setup.js (R2)" already
  call for collapsing the form step and putting one elevated genie at the
  root.  But it proposes a **`root-genie` guest** with `@agent`+`@host`
  introduced, still a level of indirection short of "genie *is* `@self`".
- `PLAN/genie_in_bottle.md` § "Credentialing and the primordial genie"
  (Phase 2) replaces the env-var model config with a `/model` builtin over
  the invite edge; this task is compatible with that (env vars stay as the
  Phase 0/1 bring-up shape, the primordial genie evolves on top).
- Other packages that use the same `provideGuest({ '@agent': 'host-agent' })`
  pattern: `packages/fae/setup*.js`, `packages/lal/setup.js`,
  `packages/jaine/*setup*.js`.  Those are *not* single-tenant bottles — they
  deliberately want confined guest identities.  **The design here only
  applies to genie**; the shared pattern survives for other plugins.

## 2. Clarifications

Assumptions encoded in the plan below — call them out if any are wrong:

1. **Single-tenant bottle is the target shape.**
   The bottle daemon exists solely to host one genie.  Collapsing genie into
   `@self` means every mail hitting the daemon's root agent is the genie's;
   there is no expectation of running a non-genie agent on the same daemon.
2. **Multi-agent spawning is deferred, not deleted.**
   The current `spawnAgent` / `listChildAgents` / `removeChildAgent` surface
   is out-of-scope for this task; it stays in the codebase but is no longer
   the boot path.  A follow-up task (not this one) can reintroduce
   "genie spawns sub-agents under itself" once `@self` is the root — at that
   point sub-agents would be guests created *by* the root genie, not by a
   setup driver.
3. **Env-var config stays the Phase 0/1 bring-up shape.**
   `GENIE_MODEL`, `GENIE_WORKSPACE`, and the optional observer/reflector
   model selections come in through `makeUnconfined`'s `env` option.  The
   primordial-genie `/model` builtin (PLAN Phase 2) supersedes them later.
4. **`bottle.sh invoke` stays the external contract.**
   Operators run `bottle.sh invoke` (or the `endo run … setup.js` command
   it wraps); the script signature does not change.  Internally setup.js
   becomes a thin launcher.

## 3. Design plan

### 3a. `main.js` — become the daemon's root agent

- Rename the boot entry.  Today `make(guestPowers, _context)` expects a
  guest; rename to signal "this is the root agent worker" and read the env
  from `context.env` (forwarded by `makeUnconfined`).
- **Delete** the form loop (`runLoop` function) and the form-submission
  dispatch.  The worker no longer posts a form to `@host`; it reads config
  from `env` at start.
- **Delete** the `spawnAgent(hostAgent, …)` codepath as the boot path, and
  **inline its body** into a single `runRootAgent(powers, config)` that:
  - Uses `powers` directly (it *is* the daemon host agent).  Drop the
    `E(powers).lookup('host-agent')` bounce.
  - Calls `initWorkspace(workspaceDir)`, builds tools, builds PiAgents
    (`makeGenieAgents`), sets up the heartbeat scheduler, and starts
    `runAgentLoop({ agentPowers: powers, … })`.
  - Replaces the old "announce ready to `@host`" send with a plain
    `console.log`.  (Owner readiness is signalled separately by
    `bottle.sh` watching `endo inbox`.)
- Heartbeat self-sends continue to target `@self` — that still resolves to
  the daemon root handle, which is genie itself.  No change needed.
- `spawnAgent`, `removeChildAgent`, `listChildAgents` stay in the module so
  the root agent can still spawn sub-agents once that surface is revived
  (see Clarification 2), but they are **not** invoked on boot.
- Drop the now-unused `lookupById(msg.valueId)` form-submission handling
  and related message-loop scaffolding.
- `AgentConfig` keeps the same fields; they are now read from `env` instead
  of a submitted form value.

### 3b. `setup.js` — collapse to a thin launcher

- Delete the `provideGuest('setup-genie', …)` step entirely.
- Delete the form-watching auto-submit loop.
- Replace the body with a single `makeUnconfined` call that points powers at
  `@agent` directly and forwards env:

  ```js
  await E(hostAgent).makeUnconfined('@main', genieSpecifier, {
    powersName: '@agent',
    resultName: 'main-genie',   // stable pet name for the root-agent result
    env: {
      GENIE_MODEL: process.env.GENIE_MODEL ?? '',
      GENIE_WORKSPACE: process.env.GENIE_WORKSPACE ?? '',
      GENIE_NAME: process.env.GENIE_NAME ?? 'main-genie',
      GENIE_HEARTBEAT_PERIOD: process.env.GENIE_HEARTBEAT_PERIOD ?? '',
      GENIE_HEARTBEAT_TIMEOUT: process.env.GENIE_HEARTBEAT_TIMEOUT ?? '',
      GENIE_OBSERVER_MODEL: process.env.GENIE_OBSERVER_MODEL ?? '',
      GENIE_REFLECTOR_MODEL: process.env.GENIE_REFLECTOR_MODEL ?? '',
      GENIE_AGENT_DIRECTORY: process.env.GENIE_AGENT_DIRECTORY ?? 'genie',
    },
  });
  ```

  Idempotency: guard the `makeUnconfined` call with
  `E(hostAgent).has('main-genie')` so a re-run of `bottle.sh invoke` doesn't
  attempt to overwrite the running worker.  If the name already exists we
  either skip, or use a separate `endo eval`-style "reattach" (out of scope
  here — the skip path is enough for Phase 0).
- `setup.js` stops exiting immediately if `GENIE_MODEL` is missing; that
  validation moves into `main.js` at root-agent boot (so the failure is
  visible in worker logs rather than a silent skip in the launcher).

### 3c. `bottle.sh` — adjust the surrounding narrative only

- Phase 3 of `invoke` still calls `endo run --UNCONFINED setup.js --powers @agent -E …`.
  The env-var contract is unchanged from the operator's point of view.
- Update the comment block above Phase 3 to say "launches the genie as the
  daemon's root agent" instead of "form-submission workflow".
- Delete the TODO(phase-1) comment about `--owner`: this task *is* the
  Phase 1 move (plus the extra step of eliminating the `root-genie` guest
  in favour of using the daemon host directly), so the comment is obsolete
  once the setup.js change lands.

### 3d. Owner-edge interaction

- `endo invite owner` still runs at the *host* level in `bottle.sh`.  The
  acceptor becomes a peer-host in the daemon's pet store.  Post-handshake:
  - Owner's outbound `endo send <bottle-label> "hi"` → lands in the daemon
    root agent's inbox.
  - Our `runAgentLoop` on `agentPowers = @agent` picks that up via
    `followMessages()` and processes it through the piAgent — **this is the
    new main flow**.
  - Genie's `reply`/`send` use the same powers, so replies originate from
    `@self`, which the owner already has labelled as `<bottle-label>`.
- `bottle.sh` Phase 5 (wait-for-owner) still works: `endo inbox` shows the
  first non-self message regardless of whether the downstream consumer is
  a `main-genie` guest or the root agent itself.

### 3e. Risks / things to watch

- **Other plugins co-hosted on the same daemon** (fae, lal, jaine) rely on
  `@agent` being the root host and use their own guests.  They still work
  — this change only affects genie's own boot.  But once the genie owns
  `@self`, any other plugin that tries to *read* mail from `@self` would
  collide.  In the bottle context there are none; document this
  constraint in `packages/genie/CLAUDE.md`.
- **Test suites** under `packages/genie/test/` that spin up a daemon and
  drive the current form-submission path will break.  The follow-up task
  (§ 4) catalogues those and updates them.
- **Back-compat for "just the genie package, no bottle":** running
  `yarn setup` outside a bottle used to present a form that a human could
  manually fill.  Post-change, the launcher requires env vars.  Update
  `packages/genie/README.md` and the `yarn setup` script description.
- **`makeUnconfined` restart-across-daemon-restart behaviour.**  The
  `resultName: 'main-genie'` makes the formula stable so a daemon restart
  will reincarnate the genie worker automatically.  Confirm in an
  end-to-end test (daemon restart should not require re-running setup.js).

## 4. Follow-up tasks

Written as separate files in `TODO/` (see task 2 in this file).

- `TODO/11_genie_self_main_refactor.md` — rewrite `main.js` to run as the
  root agent (§ 3a).
- `TODO/12_genie_self_setup_launcher.md` — collapse `setup.js` to a thin
  `makeUnconfined` launcher (§ 3b).
- `TODO/13_genie_self_bottle_narrative.md` — update `bottle.sh` comments,
  `packages/genie/README.md`, and `packages/genie/CLAUDE.md` to describe
  the new single-identity boot (§§ 3c, 3e).
- `TODO/14_genie_self_tests.md` — catalogue and update genie tests that
  assume the form-submission boot path (§ 3e risk 2).

## 5. Status

- [x] update this task with research, clarifications, and design plan
- [x] write follow up task(s) in `TODO/` to implement this plan, do not wait
      for feedback
