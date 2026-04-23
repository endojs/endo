# Collapse `packages/genie/setup.js` to a thin `makeUnconfined` launcher

Follow-up to `TODO/10_genie_self.md` § 3b.
Depends on task 11 (main.js must accept `context.env`).

## Scope

`setup.js` today (71 lines) does three things:

1. `E(hostAgent).provideGuest('setup-genie', { introducedNames: { '@agent':
   'host-agent' }, agentName: 'profile-for-genie' })` (lines 26-32).
2. `E(hostAgent).makeUnconfined('@main', genieSpecifier, { powersName:
   'profile-for-genie', resultName: 'controller-for-genie' })` (lines 34-37).
3. Form-watch + auto-submit loop (lines 50-69) that resolves the daemon-side
   form with `GENIE_MODEL`/`GENIE_WORKSPACE`/`GENIE_NAME`.

Collapse to step 2 only, with powers `@agent` and env forwarded.

## Concrete changes

1. **Delete** the `provideGuest('setup-genie', …)` call and the `hasGenie`
   guard that protects it.
2. **Delete** the form-watch loop (`makeRefIterator(E(hostAgent).followMessages())`)
   and the `submit` call.
3. **Replace** the `makeUnconfined` call with:

   ```js
   await E(hostAgent).makeUnconfined('@main', genieSpecifier, {
     powersName: '@agent',
     resultName: 'main-genie',
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

4. **Idempotency.** Guard with `E(hostAgent).has('main-genie')` so re-runs
   skip the `makeUnconfined` call when the root genie is already spawned.
   Log a short message on skip (so the operator knows why nothing new
   happened).
5. **Delete the "missing GENIE_MODEL → silent exit" path.** Validation moves
   into `main.js` at root-agent boot so the failure surfaces in the worker
   log, not in the launcher's terminal.
6. **Keep** the CLI-powers bootstrap shape (`export const main = async
   (powers) => { const hostAgent = await powers; … }`) — this file is still
   invoked via `endo run --UNCONFINED setup.js --powers @agent`.

## Out of scope

- Renaming `setup.js` to `launcher.js` (keeps the external contract
  stable — `bottle.sh invoke` still names `setup.js`).
- Removing `setup.js` entirely and inlining its contents into `bottle.sh`
  (`bottle.sh` would then need to know about `makeUnconfined`; keeping the
  JS wrapper preserves the separation).
- Changing `packages/fae`, `packages/lal`, `packages/jaine` — their
  `provideGuest` usage is intentional (see TODO/10 § 1d).

## Acceptance

- `node --check packages/genie/setup.js` passes.
- Re-running `bottle.sh invoke` twice in a row: first call spawns the
  worker, second call logs "already running" and exits cleanly.
- Daemon restart reincarnates the worker without a new `setup.js` invocation
  (the `resultName: 'main-genie'` makes the formula stable).

## Status

- [x] delete `provideGuest('setup-genie', …)` + `hasGenie` guard
- [x] delete form-watch + auto-submit loop
- [x] rewrite `makeUnconfined` call with `powersName: '@agent'` + env block
- [x] add `has('main-genie')` idempotency guard
- [x] move `GENIE_MODEL`/`GENIE_WORKSPACE` validation out (main.js owns it)

Done 2026-04-22.
`setup.js` is now a 52-line launcher: a single `has('main-genie')`
short-circuit, a single `makeUnconfined('@main', …, { powersName:
'@agent', resultName: 'main-genie', env: {...} })` call, and a
`harden(main)`.  `main.js` already validates `GENIE_MODEL` /
`GENIE_WORKSPACE` from `context.env` (task 11).  `node --check
packages/genie/setup.js` passes.
