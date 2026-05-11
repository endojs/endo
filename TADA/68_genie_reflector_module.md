# Genie memory: implement reflector module

- [x] Implement reflector module
  - Created `packages/genie/src/reflector/index.js`
  - Exports: `makeReflector`, `REFLECTOR_SYSTEM_PROMPT`,
    `DEFAULT_REFLECTION_THRESHOLD`, `estimateFileTokens`
  - Added re-exports in `packages/genie/src/index.js`

## Details

The reflector consolidates observations into long-term knowledge.
It is a **separate PiAgent instance** — same pattern as observer
but with a broader tool set and potentially a more capable model
(reasoning model recommended).

### Trigger conditions

1. **Daily heartbeat:** add a `reflect` task to `HEARTBEAT.md`.
2. **Size threshold:** fire when `observations.md` exceeds ~40k
   tokens.

### Process

1. Read `observations.md` + `reflections.md`.
2. Merge related observations.
3. Remove stale or low-priority (🟢) entries older than 7 days.
4. Promote durable facts to `reflections.md`.
5. Extract entity mentions (3+ occurrences) and bridge them to
   the PARA knowledge layer (Phase 2 — stub the bridge for now).
6. Regenerate `profile.md` from reflections if identity-level
   facts changed.

Typical compression: 5–40× reduction.

### PiAgent configuration

```js
makePiAgent({
  model: options.reflectorModel ?? chatModel,
  systemPrompt: reflectorSystemPrompt,
  tools: [memoryGet, memorySet, memorySearch],  // broader set
});
```

Since the reflector runs daily as a background task and plays a
critical role in forming long-term knowledge, it should use a
capable model — even a reasoning model if chat does not use one.

### Heartbeat integration

The reflector should be scheduled through `src/heartbeat/index.js`.
Add a `reflect` task entry to `HEARTBEAT.md` so the heartbeat
picks it up on its daily cycle.

### System prompt guidance

The reflector system prompt should instruct the agent to:
- Identify patterns and consolidate related observations.
- Prune stale 🟢 entries older than 7 days.
- Promote repeatedly-observed facts to `reflections.md`.
- Flag entities mentioned 3+ times for PARA extraction (Phase 2).
- Update `profile.md` only when identity-level facts change.

## Dependencies

- `TODO/66_genie_memory_session_files.md` — session files must exist.
- `TODO/67_genie_observer_module.md` — observations must be
  generated before they can be reflected upon.

## References

- `PLAN/genie_memory_session_layer.md` — reflector details
- `PLAN/genie_memory_implementation.md` — Phase 1 tasks
- `src/heartbeat/index.js` — heartbeat scheduling
- `src/tools/memory.js` — memory tools
