# Genie Loop: Overview

## Goal

Converge `packages/genie/dev-repl.js` (in-process REPL) and
`packages/genie/main.js` (unconfined endo daemon plugin) onto a single,
factored "genie loop" so the plugin gains the features currently only in
dev-repl (observer/reflector integration, shared tool-gate, uniform
special-command dispatch), while preserving each deployment's
idiosyncrasies (IO surface, mail-message coalescing, form provisioning).

The ultimate target is a one-import `runGenieLoop({ io, config })` call that
both deployments can share — with the IO side (prompts in, chunks out)
abstracted so that:

- dev-repl wires it to readline + stdout,
- main.js wires it to `followMessages` + `reply`/`dismiss`, and
- a **future** "remote dev-repl" mode wires it to daemon mail
  messages aimed at a running genie plugin (see
  [`genie_loop_remote.md`](./genie_loop_remote.md) — deferred;
  no active tasks yet).

## Non-goals

- Changing the genie memory model (observer/reflector already designed
  in [`genie_memory_*`](./genie_memory_overview.md)).
- Swapping out pi-agent-core for a different LLM harness.
- Adding progressive tool-call / thinking visibility over endo mail
  (out of scope — daemon mail model does not yet support edits).

## Current state (2026-04-21)

Both entry points are structurally similar but diverge in ways that
make shared evolution painful:

| Aspect              | dev-repl.js                                                                 | main.js                                                                      |
|---------------------|-----------------------------------------------------------------------------|------------------------------------------------------------------------------|
| Prompt source       | readline (stdin)                                                            | `followMessages` (daemon inbox)                                              |
| Output surface      | stdout chunks                                                               | `reply`/`dismiss` + console                                                  |
| Special prefix      | `.` (dot-command)                                                           | `/` (slash-command)                                                          |
| Observer wiring     | `subscribe` + `mute`/`unmute` + explicit `.observe`                         | `check()`/`scheduleIdle()` only; no `subscribe`                              |
| Reflector wiring    | `subscribe` + explicit `.reflect`                                           | `checkAndRun()` after heartbeat; `/reflect` runs `run()` but no event stream |
| Background event UI | `makeBackgroundPrinter` (idle/busy FSM)                                     | none                                                                         |
| Tool registry       | built inline in `runMain`                                                   | built inline in `buildTools`                                                 |
| Tool-gate pattern   | observer has inline dup; reflector exports `makeToolGate` but is unexported | same (shared via `@endo/genie`)                                              |
| Streaming reply     | full ChatEvent rendering                                                    | single "Thinking…" then final message                                        |
| Heartbeat           | `.heartbeat` dot command + `heartbeatAgent`                                 | `/heartbeat <tickID>` self-sent + interval scheduler                         |

## Proposed architecture

Break the work into four layered concerns.
The detailed design for each lives in a peer document so the overview
stays skimmable:

1. [**Tool gate & tool registry**](./genie_loop_architecture.md#tool-gate)
   — factor `makeToolGate` into a first-class module, fix its bugs,
   reuse it inside the observer, and build a single
   `buildGenieTools({ workspaceDir, include, searchBackend })` helper.
2. [**Agent pack**](./genie_loop_architecture.md#agent-pack) — a
   `makeGenieAgents({ workspaceDir, tools, config })` factory that
   returns `{ piAgent, observer, reflector, heartbeat }` with all
   sub-agents pre-wired.
   Owned state (hwm, running flags, subscribers) stays inside each
   sub-agent; the pack is just the bag of references.
3. [**Specials dispatcher**](./genie_loop_architecture.md#specials)
   — parameterise the prefix character (`.` vs `/`) and expose a
   common registry of built-in specials
   (`heartbeat`/`observe`/`reflect`/`help`/`tools`/`clear`/`exit`)
   that both entry points can mount.
4. [**IO adapter**](./genie_loop_architecture.md#io-adapter) — each
   deployment supplies its own `{ prompts, writeChunk, reply,
   dismiss, onIdle, onBusy }` and the shared loop stays the same.

The fifth concern — using the dev-repl as an integration-test client
against a live genie plugin over endo mail — has its own document:
[`genie_loop_remote.md`](./genie_loop_remote.md).
That document is **deferred future work**; no implementation tasks
are scheduled yet.

## Implementation Plan

Rough implementation order, each phase independently mergeable.
Phases 1–5 each have a task file under `TODO/`; tasks track the
detailed checklist and update the `[ ]`/`[x]` marker here on
completion.

1. [x] **Tool-gate extraction** — move `makeToolGate` to
   `src/agent/tool-gate.js`, export it, fix its bugs, rewrite observer's inline
   gate to use it.
   See [`TODO/72_genie_loop_tool_gate.md`](../TODO/72_genie_loop_tool_gate.md).
2. [x] **Tool-registry helper** — extract `buildGenieTools` from
   dev-repl/main.js; keep each call-site's inclusion choices as a config
   option.
   Plugin default: `['bash']` only — `exec` and `git` stay as example
   attenuations for granting narrower access than full `bash` (see
   [Decisions](#decisions)).
   See [`TODO/73_genie_loop_tool_registry.md`](../TODO/73_genie_loop_tool_registry.md).
3. [x] **Agent-pack factory** — introduce `makeGenieAgents` as a pure bundling
   helper; migrate dev-repl first, then main.js.
   The factory accepts per-sub-agent model overrides
   (`model` / `observerModel` / `reflectorModel` / `heartbeatModel`)
   so both deployments can tune independently — no hard-coded
   "main model for all" fallback at the pack layer.
   See [`TODO/74_genie_loop_agent_pack.md`](../TODO/74_genie_loop_agent_pack.md).
4. [x] **Specials dispatcher** — introduce the prefix-parameterised registry;
   migrate dev-repl's `.`-commands first, then main.js's `/`-commands.
   Keep today's prefix characters (`/` in daemon mail, `.` in REPL);
   the integration tests added in step 5 will reveal whether `/` is
   acceptable over endo mail, and we revisit only if it is not.
   See [`TODO/75_genie_loop_specials_dispatcher.md`](../TODO/75_genie_loop_specials_dispatcher.md).
5. [ ] **Shared loop runner** — collapse the two near-identical
   message-dispatch loops into one `runGenieLoop({ io })`.
   See [`TODO/76_genie_loop_shared_runner.md`](../TODO/76_genie_loop_shared_runner.md).
6. [ ] **Observer/reflector parity in main.js** — wire `subscribe` into a
   daemon-side background adapter (currently stubbed out as `console.log`-only;
   see
   [`genie_loop_architecture.md`](./genie_loop_architecture.md#observer-reflector-parity)).
   The heartbeat sub-agent joins the same adapter so its tool calls
   and text become visible on heartbeat ticks, matching observer and
   reflector.
7. [ ] ~~**Remote-mode dev-repl**~~ — **deferred**.
   See [`genie_loop_remote.md`](./genie_loop_remote.md); no
   implementation tasks are scheduled yet.

## Decisions

Previously-open questions, now resolved.
Each decision is also reflected in-context in the detailed docs.

- **Prefix character for daemon specials** — keep `/` in daemon mail
  and `.` in the REPL for now.
  The integration test suite (step 5+) will show whether `/` is
  carried through the endo mail system acceptably; if not, we revisit
  and make the prefix a per-deployment config option.
  Dispatcher is parameterised on `prefix` either way, so the change
  is cheap if needed.

- **Tool subset for the daemon-hosted genie** — just `bash` is the
  default for the plugin.
  `exec` and `git` remain in the registry as example attenuations
  demonstrating how to grant lesser access than full `bash`; they are
  not enabled by default for the plugin.
  dev-repl continues to include the full set.

- **Sub-agent model selection granularity** — don't hard-code.
  `makeGenieAgents` accepts `{ model, observerModel, reflectorModel,
  heartbeatModel }`; each falls back to `model` when unset.
  dev-repl surfaces flags (or inherits the main model) symmetrically
  with main.js's configuration form.

- **Heartbeat ownership** — dedicated heartbeat agent (matching
  dev-repl's current choice).
  The heartbeat sub-agent should converge toward the shape of the
  observer and reflector sub-agents: its events feed the same
  background-event adapter so heartbeat tool calls and text are
  visible during ticks.
  Dedicated-agent is the default, controlled by
  `config.dedicatedHeartbeatAgent` (default `true`) so the old
  shared-agent behaviour stays reachable for debugging.

- **Remote-mode feature ceiling** — deferred.
  Remote mode stays documented in
  [`genie_loop_remote.md`](./genie_loop_remote.md) as future work;
  no tasks are scheduled until the in-process refactor (steps 1–6)
  lands and demonstrates value.
