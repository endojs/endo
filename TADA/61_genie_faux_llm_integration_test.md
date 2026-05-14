# Replace ollama dependency in dev-repl sandbox integration tests with `pi-ai`'s `faux` provider

## Context

`packages/genie/test:integration:dev-repl-sandbox` (and the
daemon-side `test:integration:sandbox-slice`) currently shell out to
the dev-repl with `-m ollama/llama3.2`, then probe the slice from
inside an LLM round-trip.  This works on a developer laptop with
ollama running, but the tests skip cleanly (`SKIP:` log line +
`t.pass()`) when:

- Ollama isn't installed.
- `localhost:11434` isn't listening.
- The configured model isn't pulled.
- Anything in between makes the round-trip flake (the SKIP is
  permissive because we don't want the test suite to block CI on an
  external service).

The skip is so permissive that the TODO/57 audit found real tool
failures hiding behind it: the test exited 0 because the LLM probe
flaked, the tool errors never landed in an assertion, and the
regression sat undiscovered until the operator ran the dev-repl by
hand.

## Plan: use `pi-ai`'s existing `faux` provider

`@mariozechner/pi-ai` already ships a faux provider — see
`node_modules/.../pi-ai/dist/providers/faux.js` and the public
helpers:

```ts
import {
  fauxAssistantMessage,
  fauxToolCall,
  fauxText,
  registerFauxProvider,
} from '@mariozechner/pi-ai/providers/faux';
```

`registerFauxProvider({ api, provider, models })` returns a handle
whose `setResponses([…])` queues up the assistant messages the agent
will see on successive turns.  Each step can be either a static
`AssistantMessage` or a factory `(context, opts, state, model) =>
AssistantMessage` so canned scripts can branch on the current call
count or the most recent tool result.

This is exactly the shape the genie agent's `runAgentRound` consumes
— pi-agent-core invokes the registered provider just like any other
provider, so no changes are needed in `agent/index.js`, the
`buildGenieTools` wiring, or the dev-repl loop.

## Design decisions (recorded mid-implementation)

The dev-repl test spawns `dev-repl.js` as a **child process**, so a
faux provider registered in the AVA parent will not be visible to
the child.  The integration scenario goes a step further — the
provider would need to be registered inside the genie worker that
the daemon forks per agent.  Both cases need a way to ship the
`registerFauxProvider(...).setResponses([...])` call into a process
other than the test runner.

The chosen mechanism is a **`GENIE_FAUX_SCRIPT` env var** pointing
at an ESM module.  When the dev-repl (or, eventually, the genie
worker) sees that env var, it dynamically imports the module and
calls its default export, which:

- Calls `registerFauxProvider({ api, provider, models })`.
- Queues the desired step sequence with `setResponses([...])`.
- Returns the `Model<…>` object to use as the agent's model
  (passed directly into `makePiAgent` via the `model:` option —
  `makePiAgent` already accepts a pre-built `Model<…>` instead of
  a `provider/modelId` string).

The `_helpers/faux.js` module exposes a `writeFauxScriptModule()`
helper that writes the script's source to a temp file and returns
the absolute path.  Test authors compose the script source as a
template string — function-valued factory steps can't be marshaled
across a child-process boundary, so the script source has to be
self-contained code rather than a closure captured in the parent.

The faux-step factories defined inside the script file *can*
inspect the previous tool result via `context.messages`, so a
multi-turn probe (bash call → factory that reads stdout → final
assistant text) still works end-to-end without needing to ship
parent-side closures into the child.

## Scope split — this task and a follow-up

- **In scope here** (sub-tasks 1, 2, 3, 5-partial): the dev-repl
  side — helper module, `GENIE_FAUX_SCRIPT` plumbing in
  `dev-repl.js`, and the AVA test conversion.
- **Follow-up TODO** (sub-task 4): mirror the conversion in the
  daemon-side `sandbox-slice.sh` scenario.  That needs:
  - `setup.js` (or `main.js`) to honour `GENIE_FAUX_SCRIPT` and
    pass it into the worker the daemon forks for the genie agent.
  - The genie unconfined caplet to import the script and register
    the faux provider before `makeGenieAgents` resolves its model.
  - `integration.sh` to thread the env var through.
  See `TODO/62` (to be filed) for the daemon-side mirror.

## Tasks

1. [x] Add a thin helper under `packages/genie/test/_helpers/faux.js`
   (new file) that:
   - Exposes `writeFauxScriptModule({ dir, source })` for child-
     process tests (the dev-repl path).
   - Re-exports the `fauxAssistantMessage` / `fauxToolCall` /
     `fauxText` builders for tests that embed the script source as
     a template string and need the symbols documented.

2. [x] Convert `test/dev-repl-sandbox.test.js` to spawn the dev-repl
   with the faux model instead of `ollama/llama3.2`:
   - The first step emits a single `bash` tool call that probes
     `pwd && uname -a && ls /workspace`.
   - The second step (factory) reads the bash output from the
     conversation context and emits a final assistant text the test
     can grep for.
   - The test asserts the bash result's `cwd` is `/workspace`, the
     `uname` output contains a Linux kernel string under the slice
     test, and the workspace mount is visible.  The off-mode test
     asserts the host workspace path instead of `/workspace`.

3. [x] Drop the `SKIP:` fallback for "no ollama / model unreachable".
   The bwrap-unavailable skip stays (`bwrap --version` failure /
   kernel without unprivileged user namespaces) because that's a
   genuine host capability gap.

4. [ ] (follow-up — out of scope here) Mirror the conversion in
   `test/scenarios/sandbox-slice.sh` (daemon path).  See "Scope
   split" above.

5. [x] Verify the test suite still passes when:
   - Ollama is running — verified by inspection: the converted test
     never sets `OLLAMA_HOST`, never imports anything ollama-shaped,
     and the dev-repl child's spawn-env loop no longer forwards
     `OLLAMA_HOST` (compare with the pre-conversion test, which did).
     The faux model's `Model<…>` object short-circuits `resolveModel`
     entirely in `agent/index.js`.
   - Ollama is not running — verified by running the tests with no
     ollama daemon on this host: both tests pass (the `--sandbox
     bwrap` case in ~1.3s, the `--sandbox off` case in ~0.2s) with
     real assertions firing (cwd check, `Linux <kernel>` uname
     check, `.genie-workspace-init` seed-marker check).
   - `bwrap` is missing — the slice-path test still skips on its
     `probeBwrap` rail; the host-path test no longer skips at all
     (the model-reachability rail that previously paired with it is
     gone), so contributors on macOS / non-Linux laptops will see
     the off-path test exercise the host-spawn fall-through every
     run.

## Implementation details

Files touched:

- `packages/genie/test/_helpers/faux.js` (new) — exposes
  `writeFauxScriptModule({ dir, source })`.
- `packages/genie/dev-repl.js` — added the `loadFauxScript()` helper
  that imports `GENIE_FAUX_SCRIPT` when set and threads the returned
  `Model<…>` into `makeGenieAgents`.  Banner shows
  `Model: faux (api/id)` so the operator can see when a faux script
  is overriding the CLI `-m` flag.
- `packages/genie/src/agent/index.js` — widened `makePiAgent`'s
  `model:` parameter to `string | Model<Api>` (already supported
  Model objects at runtime; the JSDoc was narrower than the code).
- `packages/genie/src/loop/agents.js` — widened
  `GenieAgentsConfig.model` (and the sibling override fields) to
  `string | Model<Api>` so the dev-repl can hand the faux Model
  through.
- `packages/genie/src/observer/index.js`,
  `packages/genie/src/reflector/index.js` — sibling type widening
  so the observer / reflector accept a Model object from
  `GenieAgentsConfig.{observerModel,reflectorModel}`.
- `packages/genie/test/dev-repl-sandbox.test.js` — full rewrite.
  Removed the model-reachability probe and the three LLM-flake
  SKIP rails (no bash call, marker absent, `$(pwd)` unexpanded).
  Now drives the dev-repl through a faux script that emits exactly
  one bash tool call and one summary message; the assertions check
  the cwd, kernel string, and workspace seed marker.

Two child-process boundary gotchas worth pinning for the daemon
mirror task:

1. The faux script lives in a `mkdtemp` directory outside any
   `node_modules` hierarchy, so the generated module imports
   `@mariozechner/pi-ai` via the absolute file URL the parent
   resolves via `import.meta.resolve('@mariozechner/pi-ai')`.  The
   CJS `require.resolve` path does *not* work because the package
   ships `exports` without a `package.json` subpath.
2. The bash tool's parameter schema is `{ args: string[] }`, not
   `{ command: string }`.  With `shell: true` (the bash tool's
   default), the host spawner joins `args` with spaces and feeds
   the result to `/bin/sh -c`, so a one-element array carrying the
   full pipeline is the canonical shape.

## Notes

- The faux provider runs entirely in-process, so the tests stay fast
  and deterministic (no network, no model download).
- Because the provider is registered globally with pi-ai's api
  registry, parallel AVA files could trample each other — keep the
  faux-driven tests `test.serial` and unregister between tests, or
  give each test a unique `api` / `provider` name.
- The "canned response" surface is rich enough to test multi-turn
  conversations: the second step's factory can inspect
  `context.messages` to see the prior `toolResult` and branch on it.
  Use this to write probes that drive a sequence of tool calls,
  not just a single round.

## Acceptance

- Both `test:integration:dev-repl-sandbox` and
  `test:integration:sandbox-slice` run without ollama installed.
- The probes inside those tests assert real outcomes (slice's
  `/workspace` bind, host kernel string, etc.) and fail loudly when
  the tool / spawner regresses.
- The TODO/58-style "failure" of an LLM mis-quoting an argv element
  becomes a non-issue in CI because the scripted assistant never
  mis-quotes.
