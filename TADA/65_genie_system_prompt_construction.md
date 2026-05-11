# Genie: system prompt override is fragile

From `TADA/62_genie_memory_phase1_review.md` item 1:

Both observer and reflector create a PiAgent then mutate
`state.systemPrompt` directly after construction.
This is fragile because it relies on internal state shape.

- [x] Add a `systemPrompt` parameter to `makePiAgent` so the override
  happens at construction time rather than via post-hoc mutation
- [x] Update observer (`src/observer/index.js`) to pass system prompt
  at construction
- [x] Update reflector (`src/reflector/index.js`) to pass system
  prompt at construction
- [x] Verify no other callers rely on mutating `state.systemPrompt`
  directly
