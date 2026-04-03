# Genie Memory: Implementation Roadmap

See `PLAN/genie_memory_overview.md` for architecture summary and file layout.


## Phase 1 — Session layer (OM)

**Goal:** compress conversation into prioritised observations.
Lowest complexity, highest immediate value.

### Tasks

- [ ] Add `observations.md`, `reflections.md`, `profile.md` to `memory/`.
- [ ] Implement observer module:
  - should use a separate PiAgent instance from the genie agent:
   - so that we can limit tool surface
   - focus the observer's system prompt
   - and run concurrently to normal chat messages
  - Trigger on unobserved token threshold (default 30k).
  - Also trigger on idle timer during conversational pauses.
  - Read new messages + existing observations.
  - Extract facts, decisions, preferences, current task.
  - Append new observations with emoji priority + timestamp.
  - Advance high-water mark for observed messages.
- [ ] Implement reflector module:
  - should likewise use its own PiAgent instance, similar to the observer
  - Add `reflect` task to `HEARTBEAT.md`.
  - Merge related observations, remove stale 🟢 entries > 7 days.
  - Promote durable facts to `reflections.md`.
  - Regenerate `profile.md` when identity facts change.
- [ ] Rebuild FTS5 index after each observe/reflect cycle.
  - not necessary if the search index properly watches file changes?
  - should still modify search backend to provide a "just reindex everything" method anyhow?
- [ ] Start with main model for observer/reflector; benchmark cost.
  - provide an option for alternate `observerModel` and `refelectorModel`

See `PLAN/genie_memory_session_layer.md` for observer/reflector details.

## Phase 2 — Knowledge layer (PARA)

**Goal:** organise durable facts by entity.
Builds on working session layer.

### Tasks

- [ ] Create `memory/world/` directory structure (`projects/`, `areas/`, `resources/`, `archives/`).
  - maybe this is more of an agent workspace init process that we don't yet have?
  - or should the memory system just drop a `memory/README.md` and then just create directories as needed?
  - what's the benefit to creating ahead of time?
- [ ] Define entity file format: `summary.md` + `items.md` with YAML frontmatter.
- [ ] Add `js-yaml` dependency to genie's package.
- [ ] Extend reflector to extract entities from observations
  - (3+ mention threshold) and write to PARA directories.
- [ ] Implement entity lifecycle transitions (project → archive on completion).
- [ ] Extend FTS5 index to cover all entity files.

See `PLAN/genie_memory_knowledge_layer.md` for PARA entity structure.

## Phase 3 — Context injection

**Goal:** load hybrid memory into the prompt efficiently.

### Tasks

- [ ] Build a memory-agnostic context injection module that accepts memory sources with priority and token budget.
- [ ] Implement injection order: profile → PARA summaries → observations → raw messages.
- [ ] Add topic-based PARA entity selection (FTS5 ranking or keyword overlap).
- [ ] Validate prompt-cache hit rates with the stable-prefix layout.
- [ ] Add token budget configuration (default 60/40 obs/entities).

See `PLAN/genie_memory_context_injection.md` for prompt assembly strategy.

## Phase 4 — Decay and lifecycle

**Goal:** automatic memory hygiene.

### Tasks

- [ ] Track access metadata: last usage time, access count.
- [ ] Implement hot/warm/cold tiers based on access patterns.
- [ ] Automatic archival of cold entities.
- [ ] Automatic pruning of low-priority reflections that have not been accessed in 30+ days.

## Open questions

- **Observer model cost:**
  - main model vs lighter model for observation/reflection
  - start with main model, measure cost, switch if needed
  - memory system should take options for differing model strings
- **Token budget split:** 60% observations / 40% entity summaries
  is tentative.
  Needs real-world tuning.
- **Cross-agent sharing:** PARA layer is the sharing boundary.
  Workspace files for now; Endo pet-name space eventually.
- **FTS5 and BM25:** clarify whether existing FTS5 index already
  uses BM25 ranking (SQLite FTS5 supports BM25 natively via the
  `bm25()` function).
  If so, no additional search backend is needed for phase 1.
