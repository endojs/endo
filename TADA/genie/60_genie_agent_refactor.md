# Work on @endo/genie — refactor the agent module

## Status: DONE

Refactored `packages/genie/src/agent/index.js` and its consumers.

### What changed

1. **`src/agent/index.js`** — Replaced the monolithic `makeAgent()` (which
   returned `{ chatRound }`) with two focused exports:
   - `makePiAgent(options)` — one-time setup: resolves model, builds
     system prompt, converts tools, creates and returns a `PiAgent`
     instance.
   - `runAgentRound(piAgent, input)` — per-round streaming: takes an
     existing `PiAgent` + `{ prompt, messages? }`, yields `ChatEvent`
     objects.  Seeds conversation history via `piAgent.updateState()`.
   - Removed `beforeSend` / `afterSend` hook options — callers handle
     pre/post-processing themselves (verbose logging in dev-repl,
     nothing in daemon main).

2. **`src/index.js`** — Updated package exports: `makePiAgent`,
   `runAgentRound` replace the old `makeAgent` default export.

3. **`dev-repl.js`** — Creates the `PiAgent` once in `runAgent()` and
   passes it into each `runPrompt()` call.  Verbose debug logging
   (previously in beforeSend/afterSend hooks) is now inline in
   `runPrompt`.

4. **`main.js`** — Creates the `PiAgent` promise once at module scope
   and awaits it per inbound message, passing it to `runAgentRound`.
