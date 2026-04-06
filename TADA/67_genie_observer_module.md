# Genie memory: implement observer module

- [x] Implement observer module

## Details

The observer compresses conversation into prioritised observations.
It is a **separate PiAgent instance** created via `makePiAgent()`
with a focused system prompt, minimal tool set, and optionally a
different (faster/cheaper) model.

### Trigger conditions

1. **Token threshold:** unobserved message tokens exceed threshold
   (default 30k; configurable).
   This trigger needs to run fast — a non-reasoning,
   tool-optional model is ideal.
2. **Idle timer:** fire during conversational pauses.
   This mode can take longer and blurs into reflection;
   consider whether it should just be an early reflector trigger.

### Process

1. Read new (unobserved) messages + existing `observations.md`.
2. Extract discrete facts, decisions, preferences, current task.
3. Append new observations with emoji priority + timestamp.
4. Skip duplicates of existing entries.
5. Write updated `observations.md` via `memorySet`.
6. Advance the high-water mark for observed messages.

### Concurrency

The observer runs in the background while the main agent continues
serving chat.
This is safe because:
- Observer only writes to `observations.md` (via `memorySet`).
- The main agent does not read `observations.md` mid-conversation;
  it is injected at prompt assembly time.

### PiAgent configuration

```js
makePiAgent({
  model: options.observerModel ?? chatModel,
  systemPrompt: observerSystemPrompt,  // observation extraction only
  tools: [memoryGet, memorySet],       // minimal tool set
});
```

`makePiAgent()` already supports all of these via its options;
no factory changes are needed, just different arguments.

### System prompt guidance

The observer system prompt should instruct the agent to:
- Extract discrete, actionable facts from the conversation.
- Tag each with priority (🔴/🟡/🟢) and timestamp.
- Group by date with a "Current Context" header.
- Skip information already present in existing observations.
- Be concise — aim for 5–40× compression.

## Implementation

- **Module:** `src/observer/index.js`
- **Tests:** `test/observer.test.js` (17 tests, all passing)
- **Exports added to:** `src/index.js`

### Exported API

- `makeObserver(options)` — factory returning an `Observer` object
  with `check()`, `onIdle()`, `scheduleIdle()`, `resetIdleTimer()`,
  `stop()`, `isRunning()`, `highWaterMark()` methods.
- `OBSERVER_SYSTEM_PROMPT` — the focused system prompt.
- `DEFAULT_TOKEN_THRESHOLD` (30 000) and `DEFAULT_IDLE_DELAY_MS`
  (120 000).
- `estimateUnobservedTokens(messages, fromIndex)` — token count for
  a message slice.
- `serializeMessages(messages, fromIndex)` — convert messages to a
  text excerpt for the observer prompt.

## Dependencies

- `TODO/66_genie_memory_session_files.md` — session files must exist.
- `TODO/65_genie_expose_message_token_count.md` — token count
  exposure for trigger threshold.

## References

- `PLAN/genie_memory_session_layer.md` — observer details
- `PLAN/genie_memory_implementation.md` — Phase 1 tasks
- `src/agent/index.js` — `makePiAgent()` factory
- `src/tools/memory.js` — `memoryGet`, `memorySet` tools
