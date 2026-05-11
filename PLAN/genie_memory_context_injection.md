# Genie Memory: Context Injection

Context injection is how genie loads memory into the prompt at the
start of each turn.
The design optimises for prompt-cache hit rate by placing stable
content first and volatile content last.

## Injection order

```
┌─────────────────────────────────────────────┐
│ System prompt (stable)                      │  ← rarely changes
├─────────────────────────────────────────────┤
│ 1. profile.md                               │  ← stable identity
├─────────────────────────────────────────────┤
│ 2. Active PARA entity summaries             │  ← semi-stable
├─────────────────────────────────────────────┤
│ 3. observations.md                          │  ← grows between
│                                             │     observer runs
├─────────────────────────────────────────────┤
│ 4. Raw messages (current conversation)      │  ← appended each turn
└─────────────────────────────────────────────┘
```

Blocks 1–2 form a stable prefix that survives across turns,
maximising prompt-cache reuse.
Block 3 changes only when the observer runs.
Block 4 grows every turn.

## What to load

| Source                | When loaded                     | Budget share |
|-----------------------|---------------------------------|--------------|
| `profile.md`          | Always                          | ~5%          |
| PARA entity summaries | When relevant to current topic  | ~35%         |
| `observations.md`     | Always (recent 7-day window)    | ~60%         |
| `reflections.md`      | Only on explicit recall queries | on-demand    |
| Archived entities     | Never auto-injected             | on-demand    |

Budget shares are tentative starting points.
The 60/40 split between observations and entity summaries is
adjustable per deployment.

## Selecting relevant PARA entities

Not all entities should be loaded every turn.
Selection strategy:

1. **Topic matching:** compare the current message against entity
   summaries using keyword overlap or FTS5 ranking.
2. **Recency:** prefer entities updated in the last 7 days.
3. **Status:** only load `active` entities by default; `archived`
   entities require explicit recall.
4. **Budget cap:** stop adding entities when the allocated token
   budget is exhausted, preferring higher-ranked matches.

## System prompt module integration

The context injection module should be agnostic to memory internals.
It should:

- Accept a list of memory sources (each with content + priority).
- Sort by injection order (stable → volatile).
- Truncate to fit the token budget.
- Return a single assembled string for the system prompt.

This keeps the prompt builder independent of whether memory comes
from OM observations, PARA entities, or future memory backends.

## Prompt-cache considerations

- Minimise churn in the stable prefix.
  Only regenerate `profile.md` when identity facts change (rare).
- Batch PARA entity summary updates to the reflect cycle, not
  mid-conversation.
- When the observer rewrites `observations.md`, the cache
  invalidates from block 3 onward — this is expected and acceptable
  since observations change infrequently relative to raw messages.
