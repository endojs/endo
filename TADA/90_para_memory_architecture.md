# Research the "PARA" memory architecture

Noticed as part of paperclipsai:
- <https://github.com/paperclipai/paperclip/blob/master/skills/para-memory-files/references/schemas.md>
- <https://github.com/paperclipai/paperclip/blob/master/skills/para-memory-files/SKILL.md>

Seeming upstream: <https://fortelabs.com/blog/para/>

1. [x] search the internet more broadly for background info

2. [x] make notes here on how PARA is applied within agentic AI systems

3. [x] report here on what will be needed to implement such a system
   in endo/genie; update this task, write no code yet

---

## 1. Background: the PARA method

PARA is a personal knowledge management system created by Tiago
Forte ("Building a Second Brain").
The acronym stands for four top-level categories:

- **Projects** -- short-term efforts with a specific goal and
  deadline.  Examples: "Ship v2 dashboard", "Write grant proposal".
  A project is *done* when the goal is met; it then moves to
  Archives.

- **Areas** -- ongoing responsibilities with no end date that
  require continuous attention.  Examples: "Health", "Finances",
  "Engineering", "Direct Reports".

- **Resources** -- topics of interest you are learning about but
  that are not tied to a current commitment.  Examples:
  "Photography", "Rust language", "Breathwork".

- **Archives** -- inactive items from the three categories above,
  kept for future reference.

The organising principle is **actionability**: information is filed
by what you are doing with it right now, not by its academic topic.
This keeps relevant material clustered around active work.

Sources:
- [Forte Labs — The PARA Method](https://fortelabs.com/blog/para/)
- [Building a Second Brain](https://www.buildingasecondbrain.com/para)
- [1 Hour Guide — The PARA Method (2026)](https://www.1hourguide.co.za/para/)

---

## 2. PARA applied to agentic AI systems

### 2a. Paperclip's implementation

Paperclip (paperclipai/paperclip) is an open-source multi-agent
orchestration framework ("zero-human companies").
Its `para-memory-files` skill, contributed by Nat Eliason, layers
PARA onto a **three-tier file-based memory system**:

| Layer | Location | Purpose |
|-------|----------|---------|
| 1. Knowledge Graph | `$AGENT_HOME/life/{projects,areas,resources,archives}/<entity>/` | Entity-centric facts.  Each entity has `summary.md` (quick context, loaded first) and `items.yaml` (atomic facts, loaded on demand). |
| 2. Daily Notes | `$AGENT_HOME/memory/YYYY-MM-DD.md` | Chronological timeline written during conversations; source material for extracting durable facts. |
| 3. Tacit Knowledge | `$AGENT_HOME/MEMORY.md` | User-centric patterns, preferences, and lessons learned. |

**Atomic fact schema** (`items.yaml`):

```yaml
- id: entity-001
  fact: "The actual fact"
  category: relationship | milestone | status | preference
  timestamp: "YYYY-MM-DD"
  source: "YYYY-MM-DD"
  status: active | superseded
  superseded_by: null
  related_entities:
    - companies/acme
    - people/jeff
  last_accessed: "YYYY-MM-DD"
  access_count: 0
```

**Memory decay** (retrieval-based, not deletion):
- Hot (<=7 days): prioritised in summary.md.
- Warm (8-30 days): lower priority.
- Cold (30+ days): excluded from summaries but retained in
  items.yaml.

**Key design choices:**
- Facts are *never deleted*, only superseded with status markers.
- Entities are created when mentioned 3+ times or represent
  significant relationships.
- Daily notes are the write-ahead log; durable facts are extracted
  during periodic "heartbeat" synthesis cycles.
- Plans are stored in `plans/` at the project root, accessible to
  multiple agents.

### 2b. Broader landscape (2025-2026)

The AI agent memory space is converging on several patterns:

- **File-based over vector-DB**: Claude Code (CLAUDE.md), Paperclip,
  and many open-source agents use plain markdown files rather than
  vector databases.  This is transparent, version-controllable, and
  human-editable.

- **Hierarchical memory**: MAGMA (Multi-Graph Agentic Memory
  Architecture, Jan 2026) represents each memory item across
  orthogonal semantic, temporal, causal, and entity graphs.  A
  three-layer hierarchy (I/O, cache, memory) has been proposed for
  multi-agent systems.

- **Knowledge graph + daily logs**: the two-tier pattern (durable
  entity store + ephemeral session log) recurs across Paperclip,
  Anthropic's memory tool, the Knowledge Graph Memory MCP server,
  and Cognee's integration.

- **Decay and summarisation**: rather than deleting old facts,
  systems lower retrieval priority or compress into summaries,
  keeping raw data accessible for deep queries.

Sources:
- [Paperclip — PARA memory files skill](https://github.com/paperclipai/paperclip/blob/master/skills/para-memory-files/SKILL.md)
- [Paperclip — schemas](https://github.com/paperclipai/paperclip/blob/master/skills/para-memory-files/references/schemas.md)
- [Memory for AI Agents (The New Stack)](https://thenewstack.io/memory-for-ai-agents-a-new-paradigm-of-context-engineering/)
- [Agentic AI scaling requires new memory architecture](https://www.artificialintelligence-news.com/news/agentic-ai-scaling-requires-new-memory-architecture/)
- [MAGMA (arXiv)](https://arxiv.org/html/2601.03236v1)
- [Claude Code memory docs](https://code.claude.com/docs/en/memory)

---

## 3. What is needed to implement PARA in Endo/Genie

### 3a. Current state

Endo has **two independent persistence layers**:

1. **Daemon layer** (packages/daemon): formula graph + pet store.
   Capability-centric; survives restarts.  Formulas are immutable
   JSON (`{statePath}/formulas/{head}/{tail}.json`), pet names are
   files mapping human-readable names to formula IDs.

2. **Agent layer** (packages/genie): flat file-based memory.
   - `MEMORY.md` -- long-term curated knowledge.
   - `memory/YYYY-MM-DD.md` -- daily session logs.
   - `memory/topic.md` -- topic-specific notes.
   - `memory-fts.db` -- FTS5 full-text index (SQLite, BM25).
   - Interval scheduler (`.intervals/`) for periodic tasks.
   - Heartbeat runner loads tasks from `HEARTBEAT.md`.

Genie's memory is **flat** -- no hierarchical structure, no
project/area distinction, no archival lifecycle, no entity-level
knowledge graph.

### 3b. Required changes

#### Layer 1: Hierarchical knowledge graph (new)

Add PARA directory structure under genie's memory root:

```
memory/
  life/
    projects/<slug>/     # active projects
      summary.md
      items.yaml
    areas/<slug>/        # ongoing responsibilities
      summary.md
      items.yaml
    resources/<slug>/    # reference topics
      summary.md
      items.yaml
    archives/<slug>/     # completed/inactive items
      summary.md
      items.yaml
```

Each entity gets:
- `summary.md`: quick-load context (hot facts, current status).
- `items.yaml`: atomic facts with the schema from Paperclip
  (id, fact, category, timestamp, status, superseded_by,
  related_entities, access metadata).

**Implementation in genie:**
- Extend `src/tools/memory.js` with `memoryEntity` operations:
  create, read, update, archive, list.
- Add a `memoryArchive` tool to move entities between PARA
  categories (primarily project -> archive).
- Update `src/tools/fts5-backend.js` to index entity summaries
  and items alongside existing memory files.

#### Layer 2: Daily notes (already exists)

Genie already writes `memory/YYYY-MM-DD.md`.  No structural change
needed, but add:
- A **synthesis step** in the heartbeat runner that extracts durable
  facts from recent daily notes into the knowledge graph.
- Configurable extraction frequency (default: once per session end
  or on heartbeat).

#### Layer 3: Tacit knowledge (already exists)

`MEMORY.md` already serves this role.  Refine by:
- Distinguishing "facts about the world" from "facts about the
  user" (currently mixed).
- Adding a section header convention so the system prompt builder
  can selectively load relevant sections.

#### Memory decay

Add access tracking to items.yaml entries:
- Bump `last_accessed` and `access_count` on read.
- During synthesis, apply decay tiers (hot/warm/cold) to decide
  what appears in `summary.md`.
- Cold facts stay in `items.yaml` but drop out of summaries.

#### System prompt integration

Extend `src/system/index.js` to:
- Load active project summaries into context automatically.
- Load relevant area summaries based on conversation topic.
- Keep resource/archive summaries out of context unless
  explicitly queried.

#### Cross-agent shared memory

If multiple genie agents (or jaine channels) need shared knowledge:
- Option A: Elevate shared entities to daemon-level pet-named
  formulas (e.g., a "knowledge" guest whose pet store maps entity
  names to formula IDs pointing at stored blobs).
- Option B: Shared `life/` directory with file-level locking or
  copy-on-write semantics.
- Option A fits Endo's capability model better but requires new
  formula types; Option B is simpler to prototype.

#### Search upgrades

- Extend FTS5 index to cover `life/**/*.md` and `life/**/*.yaml`.
- Add PARA-aware query filtering: "search only in projects",
  "search archived items".
- Consider adding the `qmd` semantic search backend that Paperclip
  uses (reranking + BM25 + vector similarity) as an optional
  upgrade path.

### 3c. Implementation plan (rough ordering)

1. **Define schemas**: items.yaml format, summary.md conventions,
   PARA directory layout.  Write as a spec doc.
2. **Entity CRUD tools**: `memoryEntity` create/read/update/list,
   `memoryArchive` for lifecycle transitions.  Add to genie's tool
   registry.
3. **FTS5 expansion**: index the new `life/` tree.
4. **Synthesis heartbeat**: extract facts from daily notes into
   entity items.yaml during heartbeat cycles.
5. **System prompt loading**: auto-load project/area summaries
   into context.
6. **Decay logic**: access tracking + summary curation.
7. **Cross-agent sharing**: design shared knowledge formulas or
   shared directory approach.

### 3d. Open questions

- Should the PARA categories be hard-coded or user-configurable?
  Paperclip hard-codes them; Forte says the four categories are
  universal.
- How much of the synthesis step should be LLM-driven (extract
  facts from prose) vs. rule-based (move tagged items)?
- Should items.yaml use YAML (human-friendly) or JSON (native to
  Endo's formula system)?  YAML is conventional in Paperclip but
  JSON avoids a new parser dependency.
- Integration with Jaine: should channel agents share a single
  knowledge graph or maintain per-channel views?
- Endo's `harden()` requirement: memory data structures loaded
  into agent context must be hardened.  The tools should return
  hardened objects.
