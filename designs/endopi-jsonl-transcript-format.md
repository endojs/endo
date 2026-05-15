# EndoPi: Pi-Compatible JSONL Transcript Format

| | |
|---|---|
| **Created** | 2026-05-15 |
| **Updated** | 2026-05-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Parent** | [endopi](endopi.md) |

## Motivation

The maintainer's existing note on [endoclaw](endoclaw.md) § *Persistence
and Memory* names the desired shape: "whatever else we do internally,
message history (sessions) should get stored as Pi-compatible jsonl
files (openclaw and localgpt at least both do this, probably most of the
other too). This is at least for offline operator inspect-ability, but
also the claw itself can use these as a form of memory if within its
workspace."

The Lal reply-chain transcripts ([lal-reply-chain-transcripts](lal-reply-chain-transcripts.md))
already implement Pi's tree shape in memory. The gap is the on-disk
projection: an inspectable, append-only JSONL file the operator can
`cat`, `grep`, and `jq` without going through the daemon.

## Design

Add an on-disk JSONL projection of the Lal transcript graph, with the
file format documented in `packages/coding-agent/docs/session-format.md`
as the reference.

### File layout

```
$ENDO_STATE/sessions/<guest-id>/<timestamp>_<session-id>.jsonl
```

One file per session. Each line is a JSON object with a `type` field
(`header`, `message`, `compaction`, `branchSummary`, `custom`). Entries
form a tree via `id` / `parentId` linkage. The on-disk shape is
versioned in the header; v1 is Pi's v3 (named: `tree` + `custom`
unification).

### Entry shape (Pi-compatible subset)

```json
{
  "type": "header",
  "version": 3,
  "sessionId": "01975f...",
  "createdAt": 1715817600000,
  "cwd": "/home/user/proj"
}
{
  "type": "message",
  "id": "01975f...",
  "parentId": "01975e...",
  "message": {
    "role": "user",
    "content": "...",
    "timestamp": 1715817600000
  }
}
{
  "type": "message",
  "id": "01975g...",
  "parentId": "01975f...",
  "message": {
    "role": "assistant",
    "content": [...],
    "api": "anthropic",
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "usage": {...},
    "stopReason": "stop",
    "timestamp": 1715817601000
  }
}
```

Pi-foreign fields (the `details` slot on `toolResult`, Endo-specific
`replyTo` metadata, the `value`-typed messages from
[daemon-value-message](daemon-value-message.md)) go under a `custom`
entry type with an `endo:*` discriminator. Pi's spec already accommodates
extension-namespaced entries through the `custom` role.

### Writer

The writer is a guest-side concern, not a daemon-side concern. The Lal
agent (or Fae) opens the file lazily on first message in a given
session and appends one line per agent message. The file is mode 0600
under `$ENDO_STATE/sessions/`. On daemon restart, the file is reopened
in append mode.

Atomicity: the writer flushes `O_APPEND` writes; a partial line at EOF
is recovered on reopen by truncating to the last `\n`. Pi takes the same
approach.

### Reader

Two readers:

1. **The agent itself.** Lal can resume a session by reading its own
   JSONL file. This is the "claw uses these as a form of memory" path.
   Implementation: a `loadFromJsonl(path)` helper that returns the same
   transcript-node graph the in-memory model uses.

2. **The operator.** A new `endo session list` / `endo session show <id>`
   CLI verb walks `$ENDO_STATE/sessions/` and renders sessions. The
   files are usable with off-the-shelf JSONL tooling (`jq`, `fx`).

### Compaction interaction

When [endopi-iterative-compaction](endopi-iterative-compaction.md) runs,
it writes a `compaction` entry into the same file with a
`firstKeptEntryId` pointer, matching Pi's shape. The full history stays
in the file; the in-memory graph is rebuilt with the summary entry in
place of the elided ones.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [lal-reply-chain-transcripts](lal-reply-chain-transcripts.md) | Provides the tree the file projects |
| [endopi-iterative-compaction](endopi-iterative-compaction.md) | Writes `compaction` entries into the same file |
| [daemon-value-message](daemon-value-message.md) | Provides the `value` message shape that maps to Pi's `custom` |
| [endoclaw](endoclaw.md) | Source of the maintainer's directive ("Pi-compatible jsonl files") |

## Phased implementation

1. **Writer + reader for plain message entries.** Sessions can be
   serialized, listed, and resumed from disk. No compaction yet.
2. **`custom` entries for Endo-specific message kinds.** `value`
   messages, daemon-side metadata.
3. **CLI verb (`endo session ...`).** Operator-side inspection.
4. **Compaction integration.** Once
   [endopi-iterative-compaction](endopi-iterative-compaction.md)
   lands.

## Open questions

- Does the file live under `$ENDO_STATE/` (daemon state) or
  `$HOME/.pi/agent/sessions/` (Pi-compatible default)? The
  Pi-compatible path makes cross-harness tools work without
  configuration; the Endo path keeps state co-located. The default
  should be `$ENDO_STATE/sessions/` with an opt-in symlink or
  configuration for Pi compatibility.
- Should `id` be Pi's UUIDv7 or Endo's 256-bit formula ID? UUIDv7 keeps
  Pi tooling working; the 256-bit form is what the daemon already uses
  on `messageId`. Suggest: store both, with the Endo ID under a
  `endo:messageId` field.

## Citation

- [`packages/coding-agent/docs/session-format.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session-format.md)
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts)
- [`packages/coding-agent/src/core/messages.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/messages.ts)
- [`packages/ai/src/types.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/types.ts)

## Prompt

> Extracted from [endopi](endopi.md) § *Session model*. The maintainer's
> directive on endoclaw § *Persistence and Memory* names this as the
> shape: Pi-compatible JSONL on disk, both for operator inspect-ability
> and for the agent's own long-term memory.
