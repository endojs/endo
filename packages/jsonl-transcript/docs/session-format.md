# Session transcript format

This is the reference for the on-disk **session file**: an append-only,
Pi-compatible JSONL projection of an Endo/Lal reply-chain transcript graph. It
exists so an operator can `cat`, `grep`, and `jq` a conversation without going
through the daemon, and so an agent can resume a session from disk as a form of
long-term memory.

It is the Endo-side counterpart of Pi's
[`packages/coding-agent/docs/session-format.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session-format.md),
which is the format this projection tracks.

## File layout

```
<ENDO_STATE>/sessions/<guest-id>/<timestamp>_<session-id>.jsonl
```

- `<ENDO_STATE>` is the daemon state directory (`ENDO_STATE_PATH`).
- One directory per guest, one file per session.
- `<timestamp>` is epoch millis zero-padded to 14 digits, so the lexical order
  of file names matches chronological order (13-digit millis today pad to 14 and
  stay 14 digits until the year 2286, keeping the width fixed across that range).
- Files are mode `0600`.

`sessionFilePath(statePath, guestId, { timestamp, sessionId })` composes this
path; `sessionDirPath` and `sessionFileName` are its parts.

## Line format

Each line is one JSON object with a `type` field. Entries form a **tree**: every
entry after the header carries an `id` and a `parentId`, and a `parentId` shared
by two entries is a branch point. The tree mirrors the in-memory Lal reply-chain
transcript graph, whose nodes link by daemon `messageId` / `replyTo`.

`type` is one of `header`, `message`, `compaction`, `branchSummary`, `custom`.

This projection currently **constructs and reconstructs** `header`, `message`,
and `custom`. `compaction` and `branchSummary` are Pi format-level kinds
documented here for completeness: the reader passes them through unharmed (they
are preserved in the file), but this package does not yet emit them and
`loadTranscriptNodes` does not fold them back into the in-memory graph. Emitting
and reconstructing them arrives with the compaction wiring, a later phase of the
design.

`JSON.stringify` escapes any newline inside a string value, so every entry is a
single physical line and `\n` is an unambiguous record delimiter.

### `header`

The first line of a file.

```json
{
  "type": "header",
  "version": 3,
  "sessionId": "01975f...",
  "createdAt": 1715817600000,
  "cwd": "/home/user/proj",
  "endo:guestId": "b1946ac9..."
}
```

`version` is the on-disk schema version. v1 of this projection **is** Pi's v3
shape (the `tree` + `custom` unification), so `version` carries `3`.

### `message`

One LLM message, addressable by `id`, linked to its parent by `parentId`.

```json
{
  "type": "message",
  "id": "01975f...:0",
  "parentId": "01975e...:1",
  "message": {
    "role": "assistant",
    "content": [],
    "api": "anthropic",
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "usage": {},
    "stopReason": "stop",
    "timestamp": 1715817601000
  },
  "endo:messageId": "01975f...",
  "endo:parentMessageId": "01975e..."
}
```

`message` is the Pi-compatible message: `role`, `content` (a string or an array
of content blocks), an optional `timestamp`, and provider metadata (`api`,
`provider`, `model`, `usage`, `stopReason`, …).

A Lal transcript node bundles several LLM messages (a user turn, the assistant
response, tool results) under one daemon `messageId`. On disk each of those
messages is its own entry; the `id` is suffixed (`<messageId>:<index>`) to stay
unique, and every entry carries `endo:messageId` so the node can be
reconstructed. The **first** entry of a node also carries
`endo:parentMessageId`. Storing both the on-disk `id` and the daemon
`endo:messageId` follows the design's "store both" resolution: Pi tooling keeps
working off `id`, while replies (which reference the daemon messageId) resolve
to the right subtree.

### `compaction`

Reserved for iterative compaction (a later phase, not yet emitted by this
package). It would be written when compaction elides a run of entries.
`firstKeptEntryId` points at the oldest entry retained after the summary; the
elided entries stay in the file for offline inspection, while the in-memory
graph is rebuilt with the summary `message` in their place.

```json
{
  "type": "compaction",
  "id": "01976a...",
  "parentId": "01975f...:1",
  "firstKeptEntryId": "01975c...:0",
  "message": { "role": "assistant", "content": "Summary of earlier turns…" }
}
```

### `branchSummary`

A condensed stand-in for a pruned branch (also reserved for a later phase, not
yet emitted by this package).

```json
{
  "type": "branchSummary",
  "id": "01976b...",
  "parentId": "01975f...:1",
  "summary": "Explored the alternate approach; abandoned."
}
```

### `custom`

Pi's extension slot, for content Pi's own schema does not model: `value`-typed
daemon messages, `replyTo` metadata, and other Endo-specific kinds. The payload
carries an `endo:*` discriminator under `endo:kind`.

```json
{
  "type": "custom",
  "id": "01975f...:0",
  "parentId": "01975e...:1",
  "custom": {
    "endo:kind": "value",
    "endo:messageId": "01975f...",
    "message": { "role": "value", "content": [] }
  }
}
```

A message whose `role` is not one of `system` / `user` / `assistant` / `tool`
projects to a `custom` entry rather than a `message` entry. Pi's spec
accommodates extension-namespaced entries through the `custom` role, so these
files stay readable by off-the-shelf Pi tooling.

## Writing

`makeSessionWriter({ path })` returns an append-only writer:

- The file is created lazily on the first write, mode `0600`, under a
  `recursive`-created parent directory.
- Every write is an `O_APPEND` write (open flag `'a'`), so a reopen-and-append
  after a daemon restart is safe.
- `writeHeader` is a no-op when the file already had content on open, so
  resuming a session never doubles the header.
- **Torn-line recovery:** on reopen, a partial final line left by a crash
  mid-append is dropped by truncating the file back to its last newline. Pi
  takes the same approach.

## Reading

- `loadFromJsonl(text)` reconstructs the graph: the header, every entry, an
  `id → entry` map, and a `parentId → child ids` map. It tolerates a torn final
  line the same way the writer does.
- `assemblePath(graph, leafId)` walks the parent chain from a leaf to the root
  and returns the entries in root-to-leaf order — the material for presenting a
  branch to the LLM.
- `readSessionFile({ path })` reads a file from disk and returns its graph.
- `loadTranscriptNodes(entries)` is the inverse of the projection: it regroups
  entries by `endo:messageId` back into Lal transcript nodes, so an agent can
  resume from its own JSONL file.

## Relationship to the in-memory graph

The file is a *projection*; the in-memory Lal reply-chain graph
(`packages/lal`, `@endo/conversation-tree`) is the live model.
`projectGraph(nodes, header)` serializes a node map to an entry list (header
first, every node parent-before-child), and `loadTranscriptNodes` reverses it.
The round trip preserves message content and tree structure.
