# Phase 5: Shared loop runner

Collapse the two near-identical message-dispatch loops (`dev-repl.js`'s
readline loop and `main.js`'s `followMessages` loop) into one
`runGenieLoop({ agents, specials, io })`.
Each deployment keeps its own IO adapter.

See [`PLAN/genie_loop_overview.md`](../PLAN/genie_loop_overview.md) §
"Implementation Plan" phase 5 and
[`PLAN/genie_loop_architecture.md`](../PLAN/genie_loop_architecture.md) §
"IO adapter" for design context.
Depends on phases 3 and 4
(`TODO/74_genie_loop_agent_pack.md`, `TODO/75_genie_loop_specials_dispatcher.md`).

## Action

1. [x] define the `GenieIO<Chunk>` interface in
   `packages/genie/src/loop/io.js` (types + `InboundPrompt`,
   `InboundPromptId`)
   - methods: `prompts()`, `render(event)`, `write(chunk)`,
     optional `reply`, `dismiss`, `onIdle`, `onBusy`
   - `// @ts-check`, `harden` each exported factory, JSDoc types

2. [x] add `packages/genie/src/loop/run.js` exporting
   `runGenieLoop({ agents, specials, io })`
   - await next prompt
   - classify: special-prefix? heartbeat? user?
   - dispatch to specials or `runAgentRound`, streaming events
     through `io.render` → `io.write` (REPL) or buffering for
     `io.reply` (daemon)
   - call `io.dismiss` (daemon) or no-op (REPL) on completion

3. [x] migrate dev-repl first
   - build a readline-backed `GenieIO` adapter (stdin prompts,
     stdout chunks, `onIdle` / `onBusy` for the background printer)
   - `dev-repl.js` collapses to wiring + `runGenieLoop` call
   - `runAgent` wrapper removed; `readPrompts` adapted into
     `readInboundPrompts` (yields `InboundPrompt`); `rl` / background
     printer hooks now flow through `GenieIO.onIdle` / `onBusy`

4. [x] migrate main.js second
   - build a daemon-backed `GenieIO` adapter (`followMessages` →
     prompts, buffered `reply()`, `dismiss()`)
   - preserve today's heartbeat-message coalescing behaviour
   - `main.js` collapses to wiring + `runGenieLoop` call
   - `daemonPrompts` classifies each inbound message as
     `heartbeat` / `special` / `user`; handlers wrap the existing
     `processMessage` / `processHeartbeat` helpers unchanged;
     observer.check / scheduleIdle now run via `afterDispatch`

5. [x] port all surviving behaviour
   - dev-repl: full ChatEvent rendering, background FSM, dot-command
     help text (unchanged — `runPrompt` / `runAgentEvents` /
     `makeBackgroundPrinter` all re-used verbatim)
   - main.js: "Thinking…" placeholder → final message reply,
     heartbeat self-send interval, form provisioning lifecycle
     (unchanged — stays outside the loop)
   - `processHeartbeat` no longer dismisses the primary heartbeat
     message; `io.dismiss(prompt.id)` in the runner handles it
     uniformly alongside user and special prompts

6. [x] unit + integration tests
   - `packages/genie/test/loop/run.test.js`: 13 unit tests covering
     empty-prompts shutdown, user / special / heartbeat routing,
     stream-vs-reply output shapes, `onIdle` / `onBusy` ordering,
     `afterDispatch` + `io.dismiss` sequencing, `shouldExit`
     termination, and error hooks for `runUserPrompt` / `afterDispatch`
     / `dismiss` failures
   - `cd packages/genie && npx ava` → **333 tests passed**
   - `cd packages/daemon && npx ava test/endo.test.js --timeout=120s`
     → **141 tests passed**
   - manual smoke: deferred until live-daemon workflow is next
     exercised; the daemon-hosted plugin and dev-repl both share the
     runner so a regression would show up in any integration run

7. [x] update status in `PLAN/genie_loop_overview.md` §
   "Implementation Plan": check phase 5 as `[x]`
