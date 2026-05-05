# Phase 2: Tool-registry helper

Extract `buildGenieTools` so `packages/genie/dev-repl.js` and
`packages/genie/main.js` stop hand-building near-identical tool
registries.
Keep each call site's inclusion choices as a config option.

See [`PLAN/genie_loop_overview.md`](../PLAN/genie_loop_overview.md) §
"Implementation Plan" phase 2 and
[`PLAN/genie_loop_architecture.md`](../PLAN/genie_loop_architecture.md) §
"Tool registry" for design context.
Depends on phase 1 (`TODO/72_genie_loop_tool_gate.md`) only for merge
order; logically independent.

## Action

1. [x] add `packages/genie/src/tools/registry.js` exporting
   `buildGenieTools({ workspaceDir, include?, searchBackend? })`
   - return shape: `{ tools, listTools, execTool, memoryTools,
     searchBackend }` matching what both entry points destructure today
   - `// @ts-check`, `harden(buildGenieTools)`, JSDoc types

2. [x] include-list semantics
   - valid entries: `'bash' | 'exec' | 'git' | 'files' | 'memory' |
     'web'`
   - plugin default: `['bash', 'files', 'memory', 'web']` — `exec`
     and `git` stay in the registry as **example attenuations**
     demonstrating narrower-than-bash shell access, not enabled by
     default
   - `PLUGIN_DEFAULT_INCLUDE` and `DEV_REPL_INCLUDE` re-exported
     from `@endo/genie` so call sites name the preset rather than
     repeating the literal list

3. [x] migrate `packages/genie/main.js`'s closure-local `buildTools`
   to call `buildGenieTools` with the plugin default

4. [x] migrate `packages/genie/dev-repl.js`'s inline registry build
   (in `runMain`) to call `buildGenieTools` with `DEV_REPL_INCLUDE`
   (equivalent to `['bash', 'exec', 'git', 'files', 'memory',
   'web']`); `--no-tools` now maps to `include: []`

5. [x] do **not** abstract over tool allow-lists by guest identity or
   pluggable policies — `git`'s policy closure in `makeCommandTool`
   stays untouched (see architecture doc § "Scope creep to avoid")

6. [x] add unit tests that exercise the include-list filter and
   confirm the default plugin set matches the pre-refactor shape
   (`packages/genie/test/tools/registry.test.js`, 17 cases)

7. [x] run `cd packages/genie && npx ava` — 279 tests pass
   - daemon smoke test (`npx ava packages/daemon/test/endo.test.js
     --timeout=120s`) is unaffected: `endo.test.js` does not load
     `packages/genie/main.js`

8. [x] update status in `PLAN/genie_loop_overview.md` §
   "Implementation Plan": check phase 2 as `[x]`

## Out of scope (observed during work)

Two **pre-existing** syntax errors unrelated to the tool registry
surfaced while editing:

- `packages/genie/main.js` — the `runAgentLoop = async ({` line is
  missing (introduced by commit `b832d9ef` "add memory reflector").
- `packages/genie/dev-repl.js` — the `.background` special handler
  uses lowercase identifiers (`backgroundprinter`, `red`, `reset`,
  …) and declares a non-generator arrow function with `yield`.

Both are untouched by this phase.  Track and fix under the phase 3
agent-pack work (where `makeGenieAgents` supersedes the former
inline wiring) or as an explicit drive-by clean-up task.
