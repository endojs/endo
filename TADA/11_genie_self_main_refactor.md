# Rewrite `packages/genie/main.js` to run as the daemon's root agent

Follow-up to `TODO/10_genie_self.md` § 3a.
Read that file first for the design context (single-tenant bottle, genie owns
`@self`, three-layer→one-layer identity collapse).

## Scope

Replace the current form-submission boot path in `packages/genie/main.js` with
a direct `runRootAgent(powers, config)` that treats its first argument as the
daemon's root host agent and reads config from `context.env`.

## Concrete changes

1. **Entry point signature.**
   - Current: `export const make = (guestPowers, _context) => { … }` (line 102).
   - New: `export const make = (powers, context) => { … }` — rename the
     parameter to `powers` (no longer a guest), and actually use `context.env`.
     Keep the export named `make` so `makeUnconfined` still wires it up.
2. **Delete the form loop and form dispatch.**
   - Remove the `E(powers).form('@host', 'Configure Genie agent', fields)`
     call.
   - Remove the `for await … followMessages()` loop (lines 1143-1188) that
     watches for `type: 'value'` submissions on the form `messageId`.
   - Remove `lookupById(msg.valueId)` form-submission plumbing.
3. **Extract `runRootAgent(powers, config)`.**
   - Inline the body of `spawnAgent` (lines 870-1018) that is relevant to
     booting the root — `initWorkspace`, tool construction, `makeGenieAgents`,
     heartbeat scheduler, `runAgentLoop({ agentPowers: powers, … })`.
   - **Drop** the `E(powers).lookup('host-agent')` bounce — `powers` *is* the
     host agent now.
   - **Drop** the intermediate `provideGuest(agentName, { introducedNames:
     { 'workspace-mount': 'workspace' }, agentName: 'profile-for-<name>' })`
     step that `spawnAgent` does. The root agent has direct host powers; if a
     workspace mount is required, introduce it via a different mechanism
     (e.g. a host-level pet name set up by the launcher, or leave it to a
     future task — document whichever path is chosen).
4. **Env-based config.**
   - Read from `context.env`: `GENIE_MODEL`, `GENIE_WORKSPACE`, `GENIE_NAME`,
     `GENIE_HEARTBEAT_PERIOD`, `GENIE_HEARTBEAT_TIMEOUT`,
     `GENIE_OBSERVER_MODEL`, `GENIE_REFLECTOR_MODEL`,
     `GENIE_AGENT_DIRECTORY` (see `TODO/10_genie_self.md` § 3b for the full
     list forwarded by the new `setup.js`).
   - Fail fast with a clear error if `GENIE_MODEL` or `GENIE_WORKSPACE` is
     missing — this is the validation that used to live in the form's
     required-fields logic, now moved to boot.
5. **Heartbeat targeting.**
   - Self-sends already target `@self`; that now resolves to the daemon's
     root handle which *is* this worker's identity. No change needed, but
     add a brief JSDoc comment noting why it works.
6. **Keep but don't call on boot.**
   - `spawnAgent`, `removeChildAgent`, `listChildAgents` stay in the module
     (TODO/10 Clarification 2) so a future task can revive the sub-agent
     spawning UX. They are no longer invoked on boot.
7. **Drop the "announce ready to `@host`" send.**
   - Replace with `console.log` (or the existing logger if any) so
     readiness shows up in the worker log. `bottle.sh` watches
     `endo inbox` separately for operator-visible readiness.

## Out of scope

- Any change to `setup.js`, `bottle.sh`, README, or tests. Those live in
  tasks 12-14.
- The primordial-genie `/model` builtin (PLAN phase 2). Env-var config
  stays for now.
- Reintroducing sub-agent spawning under the new root. That is a separate
  future task.

## Acceptance

- `node --check packages/genie/main.js` passes.
- `yarn lint` in `packages/genie/` passes.
- With `setup.js` updated per task 12, `bottle.sh invoke` launches a worker
  whose inbox IS the daemon's `@self` inbox, and `endo send <label> hi`
  from the owner reaches the piAgent loop.

## Status

- [x] refactor `make` / extract `runRootAgent`
- [x] delete form loop & form dispatch
- [x] wire `context.env` → `AgentConfig`
  - Implementation note: env arrives as the **third** argument to
    `make(powers, context, { env })`, not on `context`.  See
    `packages/daemon/test/env-echo.js` for the canonical reader pattern
    and `packages/daemon/src/types.d.ts` (Context interface) for the
    shape of the `context` arg, which carries lifecycle hooks
    (`cancel`, `cancelled`, `disposed`, `onCancel`, …) but no `env`.
    The TODO body above describes intent ("read env from launcher");
    the actual destructuring follows the daemon's `make` API.
- [x] fail fast on missing required env
  - `GENIE_MODEL` / `GENIE_WORKSPACE` validated at top of `make`;
    throws synchronously so the worker log surfaces the failure rather
    than the launcher hanging on form input.
- [x] syntax + lint green
  - `node --check packages/genie/main.js` passes.
  - `yarn lint` in `packages/genie/` introduces no new errors or
    warnings on `main.js`; all remaining diagnostics in the file are
    pre-existing (import/no-unresolved on `@endo/genie`, the
    `processHeartbeat` `==`, the dispatcherIo `drain` generator, the
    legacy `++` in `spawnAgent`'s `makeTickId`, the trailing comma in
    spawnAgent's ready-message log, and the `safe-await-separator`
    warnings throughout).  The package as a whole still has unrelated
    errors in `src/workspace/init.js`, tests, and other tools that
    pre-date this task.

## Notes for follow-on tasks

- **Task 12 (`setup.js`)** must pass `env: { GENIE_MODEL, GENIE_WORKSPACE,
  GENIE_NAME, GENIE_HEARTBEAT_PERIOD, GENIE_HEARTBEAT_TIMEOUT,
  GENIE_OBSERVER_MODEL, GENIE_REFLECTOR_MODEL, GENIE_AGENT_DIRECTORY }`
  to `makeUnconfined`.  `main.js` reads these names verbatim; mismatches
  silently fall back to defaults (or fail fast for the two required
  vars).
- **Workspace mount.** This task drops the `provideGuest` step's
  `introducedNames: { 'workspace-mount': 'workspace' }` plumbing.  The
  root genie now uses the literal `GENIE_WORKSPACE` filesystem path
  passed via env.  If a future task wants a host-managed workspace
  mount (so the launcher can share a single mount across child agents
  via `spawnAgent`), it should add the mount at the host level under a
  pet name and have `runRootAgent` resolve it via `E(powers).lookup(...)`
  instead of (or in addition to) the env-var path.
- **`spawnAgent` retention.** `spawnAgent`, `removeChildAgent`, and
  `listChildAgents` are kept in the module behind `harden(...)` calls
  so a future child-agent UX can call them without re-introducing a
  module rewrite.  They are otherwise dead code today; revisiting
  whether the directory-tracking + `provideGuest` layout still makes
  sense after the root-agent collapse is left to the follow-on task.
- **Heartbeat ticker `@self` self-send.** Documented inline in
  `runHeartbeatTicker`'s JSDoc and at the `runRootAgent` call site:
  because `agentGuest === powers === @self`, the ticker's
  `E(agentGuest).send('@self', …)` is exactly the loop-back the runner
  expects, no special handling needed.
