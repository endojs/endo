# Expose message history token count from PiAgent

Phase 0 prerequisite for genie tiered memory (from
`PLAN/genie_memory_implementation.md`).

## Problem

PiAgent accumulates messages indefinitely in its `messages` array.
There is no API to query the current message count or estimated
token usage.
The observer trigger needs to read this value to fire at the
30k-token threshold.

## Tasks

- [x] Decide approach: (b) read `piAgent.state.messages` directly
  and estimate on demand — simpler for Phase 0, avoids wrapping
  PiAgent internals
- [x] Implement the chosen approach — `serializeMessage()` helper
  + `getMessageTokenCount(piAgent)` in `src/agent/index.js`
- [x] Expose a method or property (`getMessageTokenCount()`) that
  returns the estimated token count of the current message history
- [x] Depends on TODO/64 (`estimateTokens` utility) — completed

## Implementation

Approach (b): on-demand estimation by reading
`piAgent.state.messages`.

### Files changed

- `packages/genie/src/agent/index.js` — added
  `serializeMessage()` (internal helper) and
  `getMessageTokenCount(piAgent)` (exported).
  Imports `estimateTokens` from `../utils/tokens.js`.
- `packages/genie/src/index.js` — re-exports
  `getMessageTokenCount`.
- `packages/genie/test/message-token-count.test.js` — new test
  file covering empty history, string messages, content-block
  messages, thinking blocks, tool calls, tool results, and
  multi-message accumulation.

### How it works

`serializeMessage(message)` extracts text from the various
content shapes a pi-agent-core message can take (plain strings,
`text`/`thinking`/`toolCall`/`toolResult` content blocks, and
top-level `result` fields) and joins them into a single string.

`getMessageTokenCount(piAgent)` iterates over
`piAgent.state.messages`, serializes each message, and sums
the `estimateTokens()` results.

## Context

- `src/agent/index.js` — `makePiAgent()` creates a PiAgent;
  one instance is reused across all messages in a session.
  `runAgentRound()` streams events from a single prompt call.
- Option (b) is simpler for Phase 0 — just serialize
  `messages` and call `estimateTokens()`.
  Option (a) is more efficient long-term (avoids re-scanning
  the full history each time).

## References

- `PLAN/genie_memory_implementation.md` § Phase 0
- `PLAN/genie_memory_overview.md` § Processing pipeline
