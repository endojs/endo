# Phase 3: Agent-pack factory

Introduce `makeGenieAgents` as a pure bundling helper that returns the
bag of pre-wired `{ piAgent, heartbeatAgent, observer, reflector }`
references.
Migrate `dev-repl.js` first, then `main.js`.

See [`PLAN/genie_loop_overview.md`](../PLAN/genie_loop_overview.md) §
"Implementation Plan" phase 3 and
[`PLAN/genie_loop_architecture.md`](../PLAN/genie_loop_architecture.md) §
"Agent pack" for design context.
Depends on phase 2 (`TODO/73_genie_loop_tool_registry.md`) because the
pack takes `tools` from `buildGenieTools`.

## Action

1. [x] add `packages/genie/src/loop/agents.js` exporting
   `makeGenieAgents({ hostname, workspaceDir, tools, config })`
   - `tools` is the return value of `buildGenieTools` from phase 2
   - `config` accepts `{ model?, observerModel?, reflectorModel?,
     heartbeatModel?, dedicatedHeartbeatAgent? }`
   - `// @ts-check`, `harden(makeGenieAgents)`, JSDoc types; prefer
     `makeExo` with `M.interface()` if any returned objects need it
     (per `CLAUDE.md`)

2. [x] per-sub-agent model overrides
   - each of `observerModel` / `reflectorModel` / `heartbeatModel`
     falls back to `model` when unset
   - do **not** hard-code "main model for all" at the pack layer —
     dev-repl and main.js should both surface the override surface
     symmetrically

3. [x] heartbeat ownership
   - `config.dedicatedHeartbeatAgent` default `true` (matches
     dev-repl); `false` falls back to the shared-agent behaviour for
     debugging parity with today's main.js
   - see architecture doc § "Heartbeat ownership" for rationale

4. [x] pack responsibilities (scope guardrails)
   - pack guarantees every sub-agent sees the same `workspaceDir`,
     `tools`, `searchBackend` and applies per-agent model overrides
     consistently
   - pack does **not** own the loop, message dispatch, heartbeat
     interval scheduler (daemon-only), form provisioning (daemon-
     only), or any background-event printer

5. [x] migrate `dev-repl.js` to build its agents via `makeGenieAgents`
   - verify `.heartbeat`, `.observe`, `.reflect` dot-commands still
     behave identically
   - drive-by fix: the `.background` dot-command had a pre-existing
     lowercase-identifier + non-generator arrow-fn bug that blocked
     the whole module from parsing as ESM; fixed here so the migrated
     file loads.

6. [x] migrate `main.js` to build its agents via `makeGenieAgents`
   - verify `/heartbeat`, `/observe`, `/reflect` mail commands still
     behave identically
   - `runAgentLoop` now takes `heartbeatAgent` and routes
     `/heartbeat` through it so dedicated-heartbeat-agent is the
     default in the daemon too
   - drive-by fix: restored the missing `const runAgentLoop = async ({`
     declaration that had gotten dropped in an earlier commit and
     made the file unparseable as ESM

7. [x] unit tests under `packages/genie/test/` covering
   - all four sub-agents receive shared workspaceDir / tools /
     searchBackend
   - model-override precedence (baseline vs per-sub-agent)
   - `dedicatedHeartbeatAgent: false` returns the main piAgent as
     heartbeatAgent
   - see `packages/genie/test/loop/agents.test.js` (10 tests)
   - factory gained optional `makeAgent` / `makeObserverAgent` /
     `makeReflectorAgent` deps so tests can stub without hitting the
     model registry or filesystem

8. [x] run `cd packages/genie && npx ava` and
   `npx ava packages/daemon/test/endo.test.js --timeout=120s`
   - genie: 289 tests passed
   - daemon: 141 tests passed (CapTP client exceptions printed during
     cancellation paths are normal background noise, not test failures)

9. [x] update status in `PLAN/genie_loop_overview.md` §
   "Implementation Plan": check phase 3 as `[x]`
