# Genie Memory Architecture: Overview

Genie's memory is a hybrid of two complementary systems:

- **Session layer** (Observational Memory):
  - compresses recent conversation into prioritised observations.
- **Knowledge layer** (PARA):
  - organises durable facts by entity — projects, areas, resources, archives.

The session layer answers "what happened recently?"
The knowledge layer answers "what do I know about X?"

## File layout

```
memory/
  # Session layer (OM)
  observations.md        # prioritised recent observations (7-day rolling)
  reflections.md         # consolidated long-term observations
  profile.md             # stable user/project identity facts

  # Daily logs (raw source, existing)
  YYYY-MM-DD.md

  # Knowledge layer (PARA)
  world/
    projects/<slug>/     # active goal-oriented work
    areas/<slug>/        # ongoing responsibilities
    resources/<slug>/    # reference material
    archives/<slug>/     # completed/cold entities
    # Each entity dir contains summary.md + items.md

  # Search index (existing)
  memory-fts.db
```

## Processing pipeline

```
raw messages
  │
  ▼ observer (token-threshold trigger)
observations.md
  │
  ▼ reflector (daily heartbeat)
  ├─► reflections.md    (temporal consolidation)
  └─► world/…           (entity extraction → PARA)
```

## Context window injection

At prompt assembly time, genie loads memory in this order
(stable prefix first, for prompt-cache friendliness):

1. `profile.md` — always loaded, rarely changes.
2. Active PARA entity summaries — loaded when relevant to the
   current topic; semi-stable.
3. `observations.md` — recent observations; grows between
   observer runs.
4. Raw messages — the current conversation tail.

## References

- [Session layer details](genie_memory_session_layer.md)
- [Knowledge layer details](genie_memory_knowledge_layer.md)
- [Context injection details](genie_memory_context_injection.md)
- [Implementation roadmap](genie_memory_implementation.md)

## Upststream Sources

- the [PARA method](https://fortelabs.com/blog/para/) itself is separate from AI memory systems per-se
  - we noticed it as used by paperclipsai:
    - <https://github.com/paperclipai/paperclip/blob/master/skills/para-memory-files/references/schemas.md>
    - <https://github.com/paperclipai/paperclip/blob/master/skills/para-memory-files/SKILL.md>

- OM system comes originally from [Mastra.ai](https://mastra.ai/blog/observational-memory):
  - and has several adaptations:
    - <https://github.com/bkono/opencode-observational-memory>
    - <https://github.com/intertwine/observational-memory>
