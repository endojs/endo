
1. [x] refactor `runPrompt` in `packages/genie/dev-repl.js` according to the TODOs in it around lines 153-166
  - Extracted `runAgentEvents` as a pure renderer of `ChatEvent` streams into ANSI output chunks
  - `runPrompt` now delegates to `yield* runAgentEvents(...)` with a `collectMessages` tap for side-effect message collection
  - Fixed pre-existing missing `}` before `.observe` else-if branch

2. [x] finish implementing `runOnce` via `runOnceInternal` in `packages/genie/src/heartbeat/index.js`
  - `runOnceInternal(piAgent, prompt)` now drives `runAgentRound`, collects the final assistant text, and returns `[response, status]`
  - `runOnce(piAgent)` builds the heartbeat prompt (checking git status) and passes it to `runOnceInternal`
  - `start(piAgent)` threads the agent through to each scheduled tick
  - Added `import { runAgentRound }` and `import { access }` for git detection
  - Updated `HeartbeatRunner` typedef to reflect new signatures
