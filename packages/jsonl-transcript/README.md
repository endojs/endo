# @endo/jsonl-transcript

An append-only, **Pi-compatible JSONL** projection of a Lal reply-chain
transcript graph.

Endo/Lal keeps a conversation as an in-memory tree of reply-chain nodes
(`packages/lal`, `@endo/conversation-tree`), and the daemon persists it in the
typed formula store. This package adds the **on-disk projection** the maintainer
asked for: a plain JSONL file per session that an operator can `cat`, `grep`, and
`jq` without going through the daemon, and that an agent can read back to resume
a session as a form of long-term memory.

The file format is documented in
[`docs/session-format.md`](./docs/session-format.md) and tracks Pi's
`coding-agent` session format.

## File layout

```
<ENDO_STATE>/sessions/<guest-id>/<timestamp>_<session-id>.jsonl
```

One directory per guest, one file per session; each line is one JSON entry, and
entries form a tree through `id` / `parentId` linkage.

## Usage

```js
import {
  makeSessionWriter,
  projectGraph,
  formatEntry,
  loadFromJsonl,
  loadTranscriptNodes,
  sessionFilePath,
} from '@endo/jsonl-transcript';

// Where the file lives.
const path = sessionFilePath(statePath, guestId, { timestamp, sessionId });

// Append the projection of the live transcript-node graph.
const writer = makeSessionWriter({ path });
await writer.writeHeader({ sessionId, createdAt: timestamp, 'endo:guestId': guestId });
await writer.appendMessage(message, { id, parentId, 'endo:messageId': messageId });
await writer.close();

// Read it back — as a graph, or as Lal transcript nodes to resume from.
const graph = loadFromJsonl(text);
const nodes = loadTranscriptNodes(graph.entries);
```

`projectGraph(nodes, header)` serializes a whole node map to an entry list; pair
it with `formatEntry` (or `makeSessionWriter`) to write, and `loadFromJsonl` /
`loadTranscriptNodes` to read.

## Scope

This package is the format, the writer, and the reader — the substrate. Wiring
the writer into the live Lal/Fae agent loop (capturing each message's daemon
`messageId` as it is sent) and the operator-facing `endo session` CLI verb are
later phases of the
[endopi-jsonl-transcript-format](https://github.com/endojs/endo-but-for-bots/blob/llm/designs/endopi-jsonl-transcript-format.md)
design.
