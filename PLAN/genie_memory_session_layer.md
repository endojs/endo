# Genie Memory: Session Layer (Observational Memory)

The session layer compresses high-volume conversation into dense,
prioritised notes.
It is the first tier to implement because it is low-complexity and
delivers immediate value.

## Files

| File              | Retention     | Purpose                              |
|-------------------|---------------|--------------------------------------|
| `YYYY-MM-DD.md`   | indefinite    | Raw daily session logs (write-ahead) |
| `observations.md` | 7-day rolling | Compressed recent observations       |
| `reflections.md`  | indefinite    | Consolidated long-term observations  |
| `profile.md`      | indefinite    | Stable user/project identity         |

Daily logs and observations coexist.
Daily logs are the raw source; observations are the compressed
derivative.

## Observation format

Observations are date-grouped, timestamped, and priority-tagged:

```markdown
## 2026-04-02

### Current Context
- **Active task:** Implement observer module
- **Key entities:** genie, memory system

### Observations
- 🔴 14:10 User needs observer to fire at 30k unobserved tokens
- 🟡 14:12 Prefers markdown with YAML frontmatter for entity files
- 🟢 14:18 Mentioned js-yaml as dependency candidate
```

Priority levels:
- 🔴 critical — blocks current work or captures a key decision
- 🟡 contextual — relevant to active tasks
- 🟢 informational — nice to know, lowest retention priority

## Observer

**Trigger:** unobserved message tokens exceed threshold
(default 30k; configurable).
Also fires on idle timer during conversational pauses.

**Process:**
1. Read new (unobserved) messages + existing `observations.md`.
2. Extract discrete facts, decisions, preferences, current task.
3. Append new observations; skip duplicates of existing entries.
4. Write updated `observations.md`.
5. Mark messages as observed (advance the high-water mark).

## Reflector

**Trigger:** daily via heartbeat (add a `reflect` task to
`HEARTBEAT.md`).
Also fires when `observations.md` exceeds ~40k tokens.

**Process:**
1. Read `observations.md` + `reflections.md`.
2. Merge related observations.
3. Remove stale or low-priority (🟢) entries older than 7 days.
4. Promote durable facts to `reflections.md`.
5. Extract entity mentions (3+ occurrences) and bridge them to
   the PARA knowledge layer (see
   [knowledge layer](genie_memory_knowledge_layer.md)).
6. Regenerate `profile.md` from reflections if identity-level
   facts changed.

Typical compression: 5–40× reduction.

## Model choice (open question):

- Start with the main model, provide a config option for alternate model selection for either observer or reflector

- The upstream OM implementations typically use a separate model (e.g. a flash-tier model) to reduce cost.
- Most local models are already in the flash-tier or below, so we may need scale even further down to get fast observations

- Since the reflector runs every day, as a background task, and plays a
  critical role in forming long term knowledge, here we should use perhaps even
  a more capable model than the usual chat one; e.g. chat may not even use a
  reasoning model, but reflector probably wants to employ reasoning.

- Our observer has 2 different modes of urgency:
  - token limit-triggered observation needs to run fast; choosing a
    non-reasoning, and maybe even non-tool-capable model may be a good choice
  - but opportunistic observation during pauses may be able to take longer
    - this mode is basically staring to blue the line towards reflection
    - we could even use it to re-observer a broader scope of session than just
      the last token-limit-horizon normally would

## Integration with existing code

Genie already has:
- `memory.js` tools (get, set, search) — observer writes via these.
- `fts5-backend.js` — rebuild index after each observe/reflect cycle.
- `heartbeat/index.js` — schedule the reflector here.
- `interval/scheduler.js` — alternative scheduling once cron is added.
