# Genie Memory: Implementation Roadmap

See `PLAN/genie_memory_overview.md` for architecture summary and file layout.

## Code reality check (as of 2026-04-03)

Before diving into phases, here is a grounding summary of where the
genie codebase currently stands, so that the plan stays rooted in
reality.

**What exists:**
- `src/agent/index.js` — `makePiAgent()` creates a PiAgent with
  system prompt, model, and tools.
  One instance is reused across all messages in a session.
  `runAgentRound()` streams events from a single prompt call.
- `src/tools/memory.js` — `memoryGet`, `memorySet`, `memorySearch`
  tools with pluggable `SearchBackend`.
  `memorySet` already calls `searchBackend.index()` to keep the
  index in sync on writes.
- `src/tools/fts5-backend.js` — SQLite FTS5 backend with BM25
  ranking, porter stemming, and prefix queries.
  **This answers the BM25 open question: yes, FTS5 already provides
  BM25 via `bm25()` — no additional search backend needed.**
- `src/heartbeat/index.js` — periodic heartbeat with workspace lock,
  event emitter, and configurable interval.
  The reflector can be scheduled through this.
- `src/system/index.js` — `buildSystemPrompt()` generator, already
  supports parameterised tool lists and policy sections.

**What does not exist (gaps to fill):**
- **No message history management.**
  PiAgent accumulates messages indefinitely in its `messages` array.
  There is no truncation, summarization, or windowing.
  Long conversations *will* exceed the context window silently.
  This is the most urgent problem Phase 1 solves.
- **No token counting.**
  There is no way to measure how many tokens the message history
  consumes.
  The observer's 30k-token trigger requires a token estimator
  (even a rough chars÷4 heuristic would suffice for Phase 1).
- **No `convertToLlm` intelligence.**
  Currently `convertToLlm` is a role filter only — it does not
  truncate or window.
  Context injection (Phase 3) will need to replace this with a
  budget-aware assembler.
- **Search index initialization is a TODO** (memory.js line 145).
  On startup, files in `watchPaths` are not indexed until the first
  `memorySet`.
  Phase 1 should close this gap.

## Phase 0 — Prerequisites

**Goal:** close existing gaps that Phase 1 depends on.

### Tasks

See individual TODO files for details:

- [x] `TODO/63_genie_search_index_init.md` — Implement search index
  initialization in `makeMemoryTools` (the TODO at memory.js:145):
  traverse `watchPaths`, index each file, prune stale entries,
  expose an `indexing` promise.
- [x] `TODO/64_genie_token_estimation.md` — Add a token estimation
  utility (`estimateTokens(text)`, chars ÷ 4).
  Needed for the observer trigger threshold and later for context
  budget management.
- [x] `TODO/65_genie_expose_message_token_count.md` — Expose message
  history length/token count from the PiAgent wrapper so the
  observer trigger can read it.
  Depends on TODO/64.

## Phase 1 — Session layer (OM)

**Goal:** compress conversation into prioritised observations.
Lowest complexity, highest immediate value.

### Tasks

See individual TODO files for details:

- [ ] `TODO/66_genie_memory_session_files.md` — Add `observations.md`,
  `reflections.md`, `profile.md` to `memory/`.
- [ ] `TODO/67_genie_observer_module.md` — Implement observer module:
  separate PiAgent instance with focused system prompt, minimal
  tool set (`memoryGet`, `memorySet`), token threshold trigger
  (default 30k), idle timer trigger, background concurrency.
- [ ] `TODO/68_genie_reflector_module.md` — Implement reflector module:
  separate PiAgent instance with broader tool set, daily heartbeat
  trigger, observation consolidation, entity extraction bridging,
  `profile.md` regeneration.
- [ ] `TODO/69_genie_fts5_sync_after_cycles.md` — Add
  `SearchBackend.sync()` call at end of each observe/reflect cycle
  as a safety net (index already stays in sync via `memorySet`).
- [ ] `TODO/70_genie_observer_reflector_model_options.md` — Provide
  configurable `observerModel` and `reflectorModel` options.
  Start with main model; benchmark cost.

See `PLAN/genie_memory_session_layer.md` for observer/reflector details.

### Model selection strategy for Phase 1

The plan correctly identifies that observer and reflector have
different performance profiles:

1. **Observer (token-limit triggered):** needs to run fast,
   non-blocking.
   A non-reasoning, tool-optional model is ideal.
   On local Ollama, this might be the same model as chat (already
   in the flash tier), so the savings come from a shorter prompt
   and fewer tools rather than a different model.

2. **Observer (idle/opportunistic):** can take longer.
   Could use the same model as the reflector, or re-observe a
   broader scope.
   This mode blurs into reflection — consider whether it should
   just be an early reflector trigger rather than a separate mode.

3. **Reflector:** runs daily, quality matters more than speed.
   A reasoning-capable model is appropriate even if chat does not
   use one.
   On cloud providers this may be the most expensive call — but
   it runs once a day, so total cost is bounded.

**Implementation:** `makePiAgent()` already takes a `model` option
(string or Model object).
The memory system should accept an options bag:
```js
{
  observerModel: 'ollama/llama3.2',   // default: same as chat model
  reflectorModel: 'anthropic/claude-sonnet', // default: same as chat model
}
```

## Phase 2 — Knowledge layer (PARA)

**Goal:** organise durable facts by entity.
Builds on working session layer.

### Tasks

- [ ] Create `memory/world/` directory structure.
  - **Resolution:** create directories lazily as needed.
    `memorySet` already calls `vfs.mkdir(dir, { recursive: true })`
    before writing, so no upfront scaffolding is required.
    Drop a `memory/world/README.md` on first entity creation to
    signal the directory's purpose.
- [ ] Define entity file format: `summary.md` + `items.md` with YAML frontmatter.
- [ ] Add `js-yaml` dependency to genie's package.
- [ ] Extend reflector to extract entities from observations
  (3+ mention threshold) and write to PARA directories.
- [ ] Implement entity lifecycle transitions (project → archive on completion).
- [ ] Extend FTS5 index to cover all entity files.
  - The FTS5 backend already indexes arbitrary paths via `index()`.
    Just ensure `memory/world/` is included in `watchPaths` or
    that entity writes go through `memorySet`.

See `PLAN/genie_memory_knowledge_layer.md` for PARA entity structure.

## Phase 3 — Context injection

**Goal:** load hybrid memory into the prompt efficiently.

### Tasks

- [ ] Build a memory-agnostic context injection module that accepts
  memory sources with priority and token budget.
- [ ] Implement injection order: profile → PARA summaries →
  observations → raw messages.
- [ ] **Replace the current `convertToLlm` in `makePiAgent`** with a
  budget-aware assembler.
  Currently `convertToLlm` is a simple role filter.
  The new version must:
  - Accept a token budget (context window minus reserved response
    tokens — see the TODO at agent/index.js:103).
  - Inject memory layers in stable-prefix order.
  - Truncate raw messages from the oldest end to fit budget.
- [ ] Add topic-based PARA entity selection (FTS5 BM25 ranking).
- [ ] Validate prompt-cache hit rates with the stable-prefix layout.
- [ ] Add token budget configuration (default 60/40 obs/entities).

See `PLAN/genie_memory_context_injection.md` for prompt assembly strategy.

## Phase 4 — Decay and lifecycle

**Goal:** automatic memory hygiene.

### Tasks

- [ ] Track access metadata: last usage time, access count.
- [ ] Implement hot/warm/cold tiers based on access patterns.
- [ ] Automatic archival of cold entities.
- [ ] Automatic pruning of low-priority reflections that have not
  been accessed in 30+ days.

## Resolved questions

- **FTS5 and BM25:** ✅ Confirmed. `fts5-backend.js` already uses
  SQLite FTS5 with `bm25()` ranking.
  No additional search backend is needed.
- **FTS5 index rebuild after observe/reflect:** ✅ Not needed as a
  separate step if observer/reflector write through `memorySet`,
  which calls `searchBackend.index()` on every write.
- **PARA directory creation:** ✅ Create lazily. `memorySet` already
  handles `mkdir -p` via VFS.
- **Separate PiAgent instances:** ✅ Confirmed feasible. `makePiAgent`
  already accepts all the knobs needed (model, tools, system prompt).
  No factory changes required — just different arguments.

## Open questions

- **Observer model cost:**
  Start with main model, measure cost, switch if needed.
  Memory system should take options for differing model strings
  (`observerModel`, `reflectorModel`).
- **Idle observer vs. early reflector:**
  The "opportunistic observation during pauses" mode described in
  the session layer doc overlaps significantly with reflection.
  Consider whether this should be a single "idle reflector" trigger
  rather than two separate mechanisms.
- **Token budget split:** 60% observations / 40% entity summaries
  is tentative.
  Needs real-world tuning.
- **Cross-agent sharing:** PARA layer is the sharing boundary.
  Workspace files for now; Endo pet-name space eventually.
- **Message history eviction strategy:**
  Once the observer compresses messages into observations,
  old messages can be dropped from PiAgent's `messages` array.
  Need to decide: (a) drop all observed messages immediately,
  (b) keep a trailing window of N recent messages even if observed,
  or (c) keep all messages until context budget pressure forces
  eviction (Phase 3).
  Recommendation: (c) — let Phase 3's budget-aware assembler
  handle eviction, and don't mutate PiAgent's message array
  directly in Phase 1.
