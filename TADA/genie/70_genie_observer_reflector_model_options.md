# Genie memory: observer/reflector model options

- [x] Provide configurable model options for observer and reflector
  PiAgent instances.

## Details

Start with the main chat model for both observer and reflector.
Provide configuration options so users can specify alternate models
optimised for each role:

```js
{
  observerModel: 'ollama/llama3.2',        // default: same as chat model
  reflectorModel: 'anthropic/claude-sonnet', // default: same as chat model
}
```

### Model selection rationale

1. **Observer (token-limit triggered):** needs to run fast,
   non-blocking.
   A non-reasoning, tool-optional model is ideal.
   On local Ollama, this might be the same model as chat.

2. **Observer (idle/opportunistic):** can take longer.
   Could use the same model as the reflector.

3. **Reflector:** runs daily, quality matters more than speed.
   A reasoning-capable model is appropriate even if chat does
   not use one.

### Implementation

The memory system's options bag should accept `observerModel` and
`reflectorModel` strings.
These are passed through to `makePiAgent()` which already accepts
a `model` option.

Benchmark cost after initial deployment with the main model and
adjust defaults based on real-world usage patterns.

## Completed

Changes in `packages/genie/main.js`:

1. **AgentConfig typedef** extended with optional `observerModel`
   and `reflectorModel` string properties.
2. **Configuration form** gains two new optional fields so users
   can specify alternate models via the Endo daemon UI.
3. **`buildTools()`** now returns `memoryTools` and `searchBackend`
   so observer/reflector can share the same memory tooling as the
   main agent.
4. **`spawnAgent()`** instantiates `makeObserver()` and
   `makeReflector()` with the configured (or defaulted) model
   strings and passes them to `runAgentLoop()`.
5. **`runAgentLoop()`** accepts optional `observer` and `reflector`
   parameters:
   - After each user message: resets the observer idle timer,
     calls `observer.check()` for threshold-triggered observation,
     and schedules an idle observation via `observer.scheduleIdle()`.
   - After each heartbeat: calls `reflector.checkAndRun()` to
     consolidate observations when the token threshold is exceeded.

Both default to the main chat model when not explicitly configured.

## Dependencies

- `TODO/67_genie_observer_module.md` — observer must exist.
- `TODO/68_genie_reflector_module.md` — reflector must exist.

## References

- `PLAN/genie_memory_session_layer.md` — model choice discussion
- `PLAN/genie_memory_implementation.md` — Phase 1 model strategy
- `src/agent/index.js` — `makePiAgent()` accepts `model` option
