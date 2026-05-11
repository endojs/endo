# Genie: add `/reflect` special command

From `TADA/62_genie_memory_phase1_review.md` item 2:

The plan calls for wiring the heartbeat to `reflector.run()` but that
is a future-phase concern.
For now, add a `/reflect` command so the user can trigger reflection
manually.

## Special command infrastructure

There is no existing pattern for `/` commands in the main agent loop.
The current REPL (`dev-repl.js`) uses dot-commands (`.exit`, `.help`,
`.clear`, `.tools`) intercepted in `runAgent()` around line 297.

- [x] Decide on command prefix convention: adopt `/` for user-facing
  commands (distinct from `.` dot-commands which are REPL-internal)
- [x] Add `/` command dispatch in `runAgent()` (dev-repl.js ~line 297)
  and in `runAgentLoop()` (main.js) so that recognized `/` commands
  are handled directly and never forwarded to the Pi agent LLM
- [x] Implement `/reflect` handler that calls `reflector.run()` and
  prints a summary of what was reflected on
- [x] Also added `/observe` to trigger observation on demand

## Implementation details

### Files modified

- **`packages/genie/src/index.js`** — Added exports for
  `makeObserver` (from `./observer/index.js`) and `makeReflector`
  (from `./reflector/index.js`) so they are part of the public
  `@endo/genie` API.

- **`packages/genie/dev-repl.js`** — Imported `makeReflector` and
  `makeObserver`.  Created instances in `runMain()` when tools are
  enabled (`--no-tools` disables them).  Extended `runAgent()` to
  accept `reflector` and `observer` options and added three new
  command handlers:
  - `/reflect` — calls `reflector.run()` unconditionally, reports
    success/failure.
  - `/observe` — triggers observation via `observer.check()` then
    falls back to `observer.onIdle()` if below threshold; reports
    whether observation was triggered or there were no unobserved
    messages.
  - Unrecognized `/` commands print an error and point to `.help`.
  - `.help` updated to list the new slash commands.

- **`packages/genie/main.js`** — Added slash-command interception in
  `runAgentLoop()`, before `processMessage()` is called.  Both
  `/reflect` and `/observe` send status replies via
  `E(agentPowers).reply()`, dismiss the message, and `continue` the
  loop — the prompt is never forwarded to the LLM.

### Design decisions

- `/` prefix is used for user-facing commands to distinguish from
  `.` dot-commands which are REPL-internal control commands.
- Slash command dispatch happens *before* the prompt reaches the LLM,
  so the agent never sees these messages.
- Both commands guard against concurrent runs via `isRunning()`.
- In `main.js`, `reflector` and `observer` are already in scope in
  `runAgentLoop()` (passed as parameters from `spawnAgent()`), so no
  plumbing changes were needed.
- The observer has no simple `run()` method; we use `check()` + 
  `onIdle()` fallback to force a cycle regardless of threshold.
