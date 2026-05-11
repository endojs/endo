# Research the observational memory ( "OM" ) architecture

Upstream sources:
- <https://mastra.ai/blog/observational-memory>
- <https://github.com/bkono/opencode-observational-memory>
- <https://github.com/intertwine/observational-memory>

1. [x] compare and contrast this with the "PARA" memory architecture
   researched in `TADA/90_para_memory_architecture.md`

2. [x] make notes here on how genie's memory system can be designed to
   support notions from either the PARA approach or this OM approach

---

## 1. Observational Memory: summary of the architecture

Observational Memory (OM) was introduced by Mastra as a
context-window-native memory system.
Its core insight is biological: just as the brain distils millions of
sensory inputs into a handful of observations, an OM system compresses
high-volume conversation history into dense, prioritised notes.

### Design principles

- **Text is the universal interface.**
  All memory is stored as plain markdown—no vector DB, no graph DB.
  This is transparent, version-controllable, debuggable, and
  LLM-native.
- **Prompt-cache-friendly.**
  The context window is divided into two predictable blocks
  (observations + raw messages) whose structure is stable between
  compression cycles, maximising prompt cache hits.
- **Compression over retrieval.**
  Rather than retrieving from an external store at query time, OM
  keeps a running compressed summary in-context.
  Retrieval is implicit: everything the model needs is already in
  the prompt.

### Two-block context layout

| Block           | Content                          | Lifecycle                                 |
|-----------------|----------------------------------|-------------------------------------------|
| 1. Observations | Compressed, prioritised facts    | Grows via observer; shrinks via reflector |
| 2. Raw messages | Uncompressed recent conversation | Appended until threshold; then compressed |

### Processing agents

**Observer** (compression):
- Triggered when raw messages exceed ~30–70k tokens (configurable).
- Reads new messages + existing observations.
- Extracts discrete facts, decisions, preferences, current task.
- Appends new observations; does not duplicate existing ones.

**Reflector** (garbage collection / consolidation):
- Triggered when observation block exceeds ~40–50k tokens, or on a
  daily schedule (default 04:00).
- Merges related items, removes stale or low-priority entries.
- Typical compression: 5–40× reduction.

### Observation format

Observations are timestamped, date-grouped, and priority-tagged:

```
## 2026-01-15

### Current Context
- **Active task:** Build auth middleware
- **Key entities:** Acme Dashboard, Supabase

### Observations
- 🔴 12:10 User building Next.js app with Supabase auth, due Jan 22
- 🟡 12:12 Asked about middleware for protected routes
- 🟢 12:18 Prefers server components over client-only
```

Priority levels: 🔴 critical, 🟡 contextual, 🟢 informational.

### Five memory tiers (intertwine implementation)

| Tier             | File                       | Retention     | Purpose                                   |
|------------------|----------------------------|---------------|-------------------------------------------|
| Raw transcripts  | session files              | session-only  | Source material                           |
| Auto-memory      | mirrors source             | hourly scan   | External facts (e.g. Claude Code memory)  |
| Observations     | `observations.md`          | 7-day rolling | Recent detailed notes                     |
| Reflections      | `reflections.md`           | indefinite    | Long-term consolidated memory             |
| Startup profiles | `profile.md` + `active.md` | derived       | Compact context injected at session start |

### Search

Pluggable backends: BM25 (default), QMD FTS5, or hybrid
(BM25 + vector embeddings + LLM reranking).
Index rebuilt after each observe/reflect cycle.

### Performance

OM achieves state-of-the-art on LongMemEval:
- gpt-5-mini: 94.87% (3+ pts above prior SOTA)
- gpt-4o: 84.23% (exceeds oracle by 2 pts)

Sources:
- [Mastra blog post](https://mastra.ai/blog/observational-memory)
- [opencode-observational-memory](https://github.com/bkono/opencode-observational-memory)
- [intertwine/observational-memory](https://github.com/intertwine/observational-memory)

---

## 2. Comparison: OM vs PARA

### Organising principle

| Dimension               | PARA                                                                                        | OM                                                                            |
|-------------------------|---------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| **Primary axis**        | Actionability (what am I doing with this?)                                                  | Temporality (when was this observed?)                                         |
| **Top-level structure** | 4 fixed categories: Projects, Areas, Resources, Archives                                    | 2–5 temporal tiers: raw → observations → reflections → profile                |
| **Entity model**        | Entity-centric: each project/area/resource is a named directory with summary + atomic facts | Event-centric: observations are date-grouped entries, not entity-grouped      |
| **Lifecycle**           | Explicit transitions: Project → Archive when done                                           | Implicit decay: observations age out after 7 days; reflections are indefinite |

### Storage format

|                     | PARA (Paperclip)                                                                                          | OM                                                  |
|---------------------|-----------------------------------------------------------------------------------------------------------|-----------------------------------------------------|
| **Facts**           | `items.yaml` with structured schema (id, category, status, superseded_by, related_entities, access_count) | Markdown lines with emoji priority + timestamp      |
| **Summaries**       | `summary.md` per entity                                                                                   | `profile.md` + `active.md` (global, not per-entity) |
| **Daily logs**      | `memory/YYYY-MM-DD.md`                                                                                    | Raw transcripts → compressed into `observations.md` |
| **Schema rigidity** | High (YAML with typed fields)                                                                             | Low (free-form markdown with conventions)           |

### Context window strategy

|                        | PARA                                                 | OM                                              |
|------------------------|------------------------------------------------------|-------------------------------------------------|
| **Injection**          | Selectively load relevant project/area summaries     | Load full observation + reflection blocks       |
| **Retrieval**          | Query-time: search FTS index, load matching entities | Compression-time: everything already in context |
| **Cache friendliness** | Variable (depends on which entities are loaded)      | High (stable two-block layout)                  |

### Strengths and weaknesses

**PARA strengths:**
- Rich entity relationships (related_entities, cross-references).
- Explicit lifecycle management (active → archived).
- Natural fit for multi-project, multi-area work.
- Supports selective context loading (only load relevant entities).
- Fact supersession tracking (never lose history).

**PARA weaknesses:**
- Requires LLM-driven synthesis to extract entities from conversation.
- More complex tooling (CRUD operations, archive transitions).
- Entity proliferation risk without disciplined pruning.
- Less cache-friendly (different entity sets loaded per query).

**OM strengths:**
- Simple, low-overhead architecture.
- Excellent prompt cache behaviour.
- Proven benchmark performance (LongMemEval SOTA).
- No external dependencies (no vector DB, no graph DB).
- Graceful degradation (just grows observations until reflected).

**OM weaknesses:**
- No entity-level organisation; cross-cutting concerns are scattered
  across dated entries.
- Global context injection doesn't scale to many concurrent projects.
- Priority system (emoji) is informal; no structured query filtering.
- 7-day observation window may lose detail too aggressively for
  long-running projects.
- No explicit "this project is done" lifecycle signal.

### Complementarity

The two systems address orthogonal concerns:
- **PARA** answers: "What do I know about entity X?"
  (entity-centric knowledge graph)
- **OM** answers: "What happened recently that matters?"
  (temporal compression of working context)

A hybrid system can use OM's temporal compression for the
**session layer** and PARA's entity graph for the
**durable knowledge layer**.

---

## 3. Design notes for genie's memory system

### 3a. Current genie memory (baseline)

Genie already has:
- `MEMORY.md` — long-term curated knowledge (≈ OM's `profile.md` + `reflections.md`).
- `memory/YYYY-MM-DD.md` — daily session logs (≈ OM's raw transcripts).
- `memory/topic.md` — topic-specific notes (proto-entity, but flat).
- `memory-fts.db` — FTS5 full-text index.
- Heartbeat runner + interval scheduler for periodic tasks.

### 3b. Hybrid architecture: OM session layer + PARA knowledge layer

The proposal is to combine OM's temporal compression with PARA's
entity-centric knowledge graph, rather than choosing one over the
other.

```
┌─────────────────────────────────────────────────────┐
│                   Context Window                     │
│                                                      │
│  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │ Block 1:         │  │ Block 2:                 │  │
│  │ Observations     │  │ Raw messages             │  │
│  │ (OM compressed)  │  │ (recent conversation)    │  │
│  └────────┬─────────┘  └─────────────────────────┘  │
│           │                                          │
└───────────┼──────────────────────────────────────────┘
            │ observer extracts
            ▼
┌─────────────────────────────────────────────────────┐
│              Durable Storage                         │
│                                                      │
│  ┌─────────────┐  ┌──────────────────────────────┐  │
│  │ Session Log  │  │ PARA Knowledge Graph         │  │
│  │ (OM tiers)   │  │                              │  │
│  │              │  │  projects/<slug>/summary+items│  │
│  │ observations │  │  areas/<slug>/summary+items  │  │
│  │ reflections  │  │  resources/<slug>/summary    │  │
│  │ profile      │  │  archives/<slug>/summary     │  │
│  └──────┬───────┘  └──────────────┬───────────────┘  │
│         │                         │                   │
│         └────────┬────────────────┘                   │
│                  ▼                                    │
│         ┌──────────────┐                             │
│         │  FTS5 Index  │                             │
│         └──────────────┘                             │
└─────────────────────────────────────────────────────┘
```

### 3c. How the layers interact

1. **During conversation** (OM-style):
   - Raw messages accumulate in Block 2.
   - When token threshold is reached, the observer compresses them
     into observations (Block 1).
   - Observations are persisted to `observations.md`.

2. **At session end or heartbeat** (PARA-style extraction):
   - A synthesis step scans recent observations for entity mentions.
   - New facts are extracted and filed into the appropriate PARA
     entity (`projects/`, `areas/`, `resources/`).
   - Entity `summary.md` files are regenerated from hot/warm items.

3. **At session start** (hybrid injection):
   - Load `profile.md` (stable user facts — OM style).
   - Load active project summaries (PARA style — only projects
     relevant to current context).
   - Load recent observations if continuing a previous session.

4. **On reflection** (daily, OM-style):
   - Reflector consolidates observations older than N days.
   - Promotes durable facts to PARA entities if not already there.
   - Demotes/archives PARA projects that have gone cold.

### 3d. Concrete file layout

```
memory/
  # OM session layer
  observations.md          # recent prioritised observations (7-day)
  reflections.md           # consolidated long-term observations
  profile.md               # stable user/project identity
  YYYY-MM-DD.md            # daily session logs (existing)

  # PARA knowledge layer
  world/
    projects/<slug>/
      summary.md            # hot facts, current status
      items.yaml            # atomic facts with schema
    areas/<slug>/
      summary.md
      items.yaml
    resources/<slug>/
      summary.md
      items.yaml
    archives/<slug>/
      summary.md
      items.yaml

  # Search
  memory-fts.db            # FTS5 index (existing, expanded)
```

### 3e. Key design decisions

**Observation format**:
- adopt OM's emoji-priority + timestamp convention for `observations.md`.
- It is lightweight, LLM-native, and easy to parse.

**Entity fact schema**:
- adopt Paperclip's structured YAML for `items.yaml` in the PARA layer.
- The structured format enables programmatic queries (e.g., "all active facts
  about project X") that free-form markdown cannot support.

**Observer trigger**:
- token-count-based, as in OM, but with an idle timer that triggers
  opportunistic observations during conversational pauses.
- Genie already tracks token usage; hook the observer to fire when unobserved
  message tokens exceed a configurable threshold (default: 30k for genie's
  smaller context budgets).

**Reflector schedule**:
- daily via heartbeat runner (already exists).
- Add a `reflect` task to `HEARTBEAT.md` that consolidates observations and
  promotes facts to PARA entities.
- Eventually ehen we add a rigid cron system, the reflector task would be
  better placed there for higher reliability.

**Synthesis (OM → PARA bridge)**: LLM-driven.
- The reflector prompt should include instructions to:
  - Identify entities mentioned 3+ times in recent observations.
  - Create or update PARA entity files for those entities.
  - Move completed projects to archives.
- This is the key integration point between the two systems.

**Context injection strategy**:
- Always inject: `profile.md` + `observations.md` (OM layer).
- Conditionally inject: active project summaries from PARA layer,
  selected by relevance to the current conversation topic.
- Never auto-inject: archived entities, cold resources.

**Prompt cache optimisation**:
- follow OM's two-block layout.
- Place observations block first (stable prefix), then raw messages (appended).
- PARA entity summaries go between the system prompt and the observation block
  (semi-stable; changes only when project set changes).

### 3f. Implementation priorities

1. **OM session layer first** — lower complexity, immediate value.
  - Add observer/reflector to genie's heartbeat system.
  - Store observations.md + reflections.md + profile.md.

2. **PARA knowledge graph second** — build on top of working OM.
  - Add entity `world/` directory structure, synthesis step in reflector; don't
    need any special tools, since file tool should suffice.

3. **Search expansion** — extend FTS5 to index all new files.
  - clarification: are we already using BM25 with FTS5? or are those different things?

4. **Context injection** — update system prompt builder
  - to load the hybrid context
  - system prompt module integration should be as agnostic as possible to
    memory module specifics

5. **Decay + lifecycle** —
  - access tracking: last usage time, count, etc
  - hot/warm/cold tiers
  - automatic archival

### 3g. Open questions (carried forward + new)

- **Token budget allocation**:
  - how to split the context window between OM observations and PARA entity summaries?
  - Tentative: 60% observations, 40% entity summaries, adjustable.
- **Observer model**:
  - should genie use itself (the main LLM) for observation/reflection, or a
    smaller/cheaper model?
  - OM implementations use separate models (e.g., Gemini Flash for
    observation).
  - Genie could use a lighter model to reduce cost.
- **Cross-agent sharing**:
  - OM is session-scoped; PARA entities are potentially shared.
  - The PARA layer is the natural sharing boundary.
  - Use a shared directory, in workspace ( real files ) for now, but eventually
    move into endo pet name space
- **Observation vs. daily log**:
  - `observations.md` replace `memory/YYYY-MM-DD.md` should coexist
  - Daily logs are the raw write-ahead log
  - Observations are the compressed derivative.
- **YAML vs JSON for items**: OM uses markdown; PARA uses YAML.
  - for genie's entity knowledge files (the PARA connection) use Markdown files
    with YAML frontmatter
  - this will allow arbitrary elaborative content after the front matter
  - while supporting structured schematized data up front
  - we'll need a library like `js-yaml` as a dependency only in genie's package.
