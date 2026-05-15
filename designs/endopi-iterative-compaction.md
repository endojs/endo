# EndoPi: Iterative Compaction with Structured Summary

| | |
|---|---|
| **Created** | 2026-05-15 |
| **Updated** | 2026-05-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed (partially satisfied) |
| **Parent** | [endopi](endopi.md) |

## Status

`packages/genie` already ships an iterative-compaction substrate that
implements a sibling shape to Pi's:

- An observer subagent (`packages/genie/src/observer/index.js`)
  compresses chat into prioritised observations (`memory/observations.md`)
  on a token-threshold (default 30k) plus idle-timer trigger. Runs as a
  background `PiAgent` with a focused tool set.
- A reflector subagent (`packages/genie/src/reflector/index.js`)
  consolidates observations into long-term knowledge
  (`memory/reflections.md`, `memory/profile.md`) on a 40k-token threshold
  plus daily heartbeat trigger; prunes stale low-priority entries; merges
  related observations.
- Both subagents are gated by `tool-gate.js` to ensure they actually call
  the memory-write tools they were dispatched for.

This satisfies the "iterative summary feeds next" axis of Pi's compaction
shape and the trigger-condition split (token threshold + idle). What
remains for this design is to harmonise that shipped implementation with
the Lal/Fae transcript graph: today the observer/reflector pair writes to
markdown files on disk, while Lal's transcripts are an in-memory graph.
The remaining work is the projection layer (run observer/reflector over
Lal transcripts; surface their output back into Lal's transcript graph
rather than to disk), plus the `keepRecentTokens` / `reserveTokens`
knobs and the structured-summary format pi-mono uses.

## Motivation

LLM context windows are finite. Without compaction, a long session
hits the model's limit and either fails outright or silently drops the
oldest messages. The [lal-transcript-memory-management](lal-transcript-memory-management.md)
design enumerates the problem; what is missing is a concrete algorithm.
Pi has one, refined across many releases, and worth importing as the
substrate.

## Design

Add an auto-compaction loop to the Lal transcript model, modeled on Pi's
`packages/coding-agent/src/core/compaction/compaction.ts`.

### Trigger conditions

Auto-compaction triggers when:

```
contextTokens > contextWindow - reserveTokens
```

`reserveTokens` defaults to 16384 (leaving room for the model's
response). Both knobs are configurable per-host in the settings store.

Manual compaction: a `/compact [instructions]` slash command in the Chat
UI compresses on demand. Optional instructions focus the summary
("preserve the bug-hunt thread, drop the API exploration").

### Algorithm (from Pi)

1. **Find cut point.** Walk backwards from the newest message,
   accumulating token-count estimates until `keepRecentTokens` (default
   20000) is reached. This is the boundary between "summarize" and
   "keep verbatim".
2. **Extract.** Collect messages from the previous compaction boundary
   (or session start) up to the cut point.
3. **Generate summary.** Call the same LLM the agent is using, with a
   structured prompt asking for:
   - Goals the user expressed
   - Decisions made
   - Files touched (cumulative, even those modified before the previous
     compaction)
   - Open threads
   - Code patterns established
   If a prior summary exists, pass it as iterative context so the new
   summary builds on it rather than starting fresh.
4. **Append entry.** Write a `compaction` entry to the JSONL session
   file (per [endopi-jsonl-transcript-format](endopi-jsonl-transcript-format.md))
   with `firstKeptEntryId` pointing at the cut point.
5. **Reload.** The in-memory transcript is rebuilt with the summary
   entry in place of the elided range.

### Iterative property

Each compaction's summary takes the *previous* summary as input, not
the *original* messages. This means a long session accumulates one
summary, not N summaries. Pi's structured format makes the summary
parseable enough that the next compaction can merge cleanly.

### File tracking

Pi maintains a cumulative file-operations record across compactions:
even if a file was last touched ten compactions ago, the current
summary still mentions it. The Endo equivalent observes the
`Dir`/`File` capabilities the agent invokes and tracks which paths it
touched. The list survives compactions because each summary carries it
forward.

### Compaction is lossy

The original messages remain in the JSONL file (per
[endopi-jsonl-transcript-format](endopi-jsonl-transcript-format.md)).
Compaction prunes the in-memory window the LLM sees, not the on-disk
record. An operator or the agent itself can recover detail by re-reading
the JSONL.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `compaction.enabled` | `true` | Auto-compaction on context overflow |
| `compaction.reserveTokens` | `16384` | Reserved for model response |
| `compaction.keepRecentTokens` | `20000` | Recent window kept verbatim |
| `compaction.customInstructions` | unset | Optional global instructions appended to the summary prompt |

Settings live in the same per-host store as the rest of Endo's settings.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [lal-reply-chain-transcripts](lal-reply-chain-transcripts.md) | Provides the transcript graph |
| [lal-transcript-memory-management](lal-transcript-memory-management.md) | Enumerates the problem this design solves |
| [endopi-jsonl-transcript-format](endopi-jsonl-transcript-format.md) | Stores `compaction` entries |

## Out of scope

- **Branch summarization on tree navigation.** Pi has this for `/tree`;
  Endo's reply-chain UI is different. Revisit if `/tree`-style
  navigation lands.
- **Multi-agent context sharing across compactions.** Compaction is per
  transcript; cross-guest context coordination is a separate problem.

## Citation

- [`packages/coding-agent/docs/compaction.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md)
- [`packages/coding-agent/src/core/compaction/compaction.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) (auto-compaction logic)
- [`packages/coding-agent/src/core/compaction/utils.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) (file tracking, serialization)

## Prompt

> Extracted from [endopi](endopi.md) § *Compaction*. The substrate the
> existing `lal-transcript-memory-management` problem statement asks
> for, in algorithmic form, matched to Pi's released implementation.
