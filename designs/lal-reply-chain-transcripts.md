# Lal Reply Chain Transcripts

| | |
|---|---|
| **Date** | 2026-02-25 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## Motivation

The Lal agent currently maintains a single, flat, ever-growing LLM transcript.
Every incoming message — regardless of sender, topic, or conversational
context — appends to the same transcript. This means:

1. The LLM's context window fills with unrelated conversations.
2. Replying to an older message drags in all intervening, unrelated context.
3. There is no way to have multiple independent conversations with the agent.
4. Branching (replying to the same message twice to explore different
   directions) is impossible.

The Endo daemon already supports reply threading: every message carries a
`messageId` (256-bit hex) and an optional `replyTo` (the `messageId` of the
parent message). The daemon exposes `E(powers).reply(messageNumber, ...)` which
automatically sets `replyTo` on the outgoing message. Lal does not use any of
this.

**Goals:**

1. Each reply chain is an independent LLM transcript — replying to a message
   from the agent continues that transcript, not the global one.
2. A stand-alone message (no `replyTo`, or `replyTo` pointing to a message the
   agent did not send) creates a new transcript.
3. Multiple replies to the same agent message produce independent transcript
   branches, each sharing their common prefix without duplicating it in memory.
4. The agent uses `reply()` instead of `send()` when responding within a
   conversation, so the daemon sets `replyTo` and the UI can render threading.
5. Outgoing messages carry a count of accumulated transcript messages so the
   other party (and the UI) can display conversation depth.

## Data Model

### Transcript Node (Chain Link)

Rather than storing a full copy of the message array for each branch,
transcripts are represented as a singly-linked chain of nodes. Each node
stores only the messages appended at that step, plus a pointer to the
parent node. The full message array is assembled by walking the chain
from root to leaf only when presenting it to the LLM.

```js
/**
 * @typedef {object} TranscriptNode
 * @property {string} messageId - The messageId this node corresponds to
 *   (either an inbound or outbound message).
 * @property {string | null} parentMessageId - The messageId of the parent
 *   node, or null for root nodes.
 * @property {ChatMessage[]} messages - LLM messages appended at this step
 *   only (not the full chain). For a root node, this includes the system
 *   prompt.
 * @property {bigint} [lastInboxNumber] - The inbox message number of the
 *   most recent inbound message at this node (used for reply()).
 */
```

Branching is free: when two replies target the same parent `messageId`,
each creates a new node pointing to the same parent. The shared prefix
is stored once, in the parent chain.

```
Root Node (system prompt)
  messageId: "aaa..."
  parentMessageId: null
  messages: [{ role: 'system', content: systemPrompt }]
      │
      ▼
Node (user message M1 + assistant response)
  messageId: "bbb..."  ← agent's outbound messageId
  parentMessageId: "aaa..."
  messages: [{ role: 'user', ... }, { role: 'assistant', ... }]
      │               │
      ▼               ▼
Node (M3)          Node (M4)         ← two replies to M2: branches
  messageId: "ccc..."    messageId: "ddd..."
  parentMessageId: "bbb..."  parentMessageId: "bbb..."
```

### Assembling the Full Transcript

To present the transcript to the LLM, walk the chain from the leaf node
to the root, collecting each node's `messages` array, then concatenate
in root-to-leaf order:

```js
/**
 * @param {Map<string, TranscriptNode>} store
 * @param {string} leafMessageId
 * @returns {ChatMessage[]}
 */
const assembleTranscript = (store, leafMessageId) => {
  const chain = [];
  let current = leafMessageId;
  while (current !== null) {
    const node = store.get(current);
    if (node === undefined) break;
    chain.push(node.messages);
    current = node.parentMessageId;
  }
  chain.reverse();
  return chain.flat();
};
```

### Durable Storage

Transcript nodes are persisted in the agent's pet store using
`E(powers).storeValue(node, petName)`, where the pet name is derived from
the `messageId`:

```
transcript-<messageId>
```

For example: `transcript-a1b2c3d4...` (the full 256-bit hex `messageId`).

On startup, the agent does not eagerly load all transcript nodes. Instead,
it lazily loads them from the pet store when an inbound message's `replyTo`
references a known `messageId`. The in-memory `Map` serves as a cache; the
pet store is the source of truth.

This avoids unbounded heap growth: only the actively-referenced nodes remain
in the cache. Idle conversation chains are evicted from the in-memory map
and survive only in the pet store. A simple LRU or size-bounded cache can
limit the in-memory set.

```js
/**
 * Look up a transcript node, loading from durable storage if needed.
 * @param {string} messageId
 * @returns {Promise<TranscriptNode | undefined>}
 */
const getNode = async (messageId) => {
  let node = nodeCache.get(messageId);
  if (node !== undefined) return node;

  const petName = `transcript-${messageId}`;
  if (await E(powers).has(petName)) {
    node = await E(powers).lookup(petName);
    nodeCache.set(messageId, node);
    return node;
  }
  return undefined;
};

/**
 * Store a transcript node both in cache and durable storage.
 * @param {TranscriptNode} node
 */
const putNode = async (node) => {
  nodeCache.set(node.messageId, node);
  const petName = `transcript-${node.messageId}`;
  await E(powers).storeValue(harden(node), petName);
};
```

### Transcript Depth on Messages

Each outgoing message from the agent includes a transcript depth indicator.
The depth is the count of conversational turns in the assembled transcript
(user + assistant messages, excluding system prompt and tool-call results).

The depth is communicated as a prefix in the first string fragment of the
outgoing message:

```
[depth:N] <actual message text>
```

This is a simple text convention that the UI can parse and extract for display
(e.g., "turn 12") or render verbatim if not parsed. No daemon schema changes
are required.

## Algorithm

### Message Arrival

```
on message(inboxMessage):
  { messageId, replyTo, number, from } = inboxMessage

  if from === selfId:
    // Own outbound message — index it for future replies.
    handleOwnMessage(inboxMessage)
    return

  parentNode = null
  if replyTo !== undefined:
    parentNode = await getNode(replyTo)

  if parentNode !== null:
    // Continue existing conversation.
    // Append user message to a new node chained to parentNode.
    node = {
      messageId,
      parentMessageId: replyTo,
      messages: [userMessageFromInbox(inboxMessage)],
      lastInboxNumber: number,
    }
  else:
    // New conversation — create root node with system prompt.
    rootMessageId = randomId()
    rootNode = {
      messageId: rootMessageId,
      parentMessageId: null,
      messages: [{ role: 'system', content: systemPrompt }],
    }
    await putNode(rootNode)

    node = {
      messageId,
      parentMessageId: rootMessageId,
      messages: [userMessageFromInbox(inboxMessage)],
      lastInboxNumber: number,
    }

  await putNode(node)
  await runAgenticLoop(node)
```

### Agentic Loop (per-node)

```
runAgenticLoop(leafNode):
  while continueLoop:
    transcript = assembleTranscript(store, leafNode.messageId)
    response = await chat(transcript)

    // Append assistant response to the leaf node's messages
    leafNode.messages.push(response.message)

    if response has tool_calls:
      results = await processToolCalls(response.tool_calls, leafNode)
      leafNode.messages.push(...results)
      await putNode(leafNode)  // persist after tool results
    else:
      await putNode(leafNode)  // persist final state
      continueLoop = false
```

### Handling Own Messages

When the agent sees its own outbound message in `followMessages()`:

```
handleOwnMessage(outboundMessage):
  { messageId, replyTo } = outboundMessage

  if replyTo !== undefined:
    parentNode = await getNode(replyTo)
    if parentNode !== null:
      // Create a lightweight index node so future replies
      // to this outbound message can find the chain.
      // The assistant's response content is already stored
      // in the parent node's messages array from the agentic loop.
      indexNode = {
        messageId,
        parentMessageId: replyTo,
        messages: [],  // no new LLM messages; content is on parent
        lastInboxNumber: parentNode.lastInboxNumber,
      }
      await putNode(indexNode)
```

Wait — this creates an asymmetry: the assistant's LLM messages live in the
inbound node, but the index for future replies is the outbound `messageId`.
When assembling the transcript, the outbound index node contributes no
messages, which is correct — the assistant messages are already appended
to the earlier node.

Actually, a cleaner design: each agentic loop iteration produces a node
that contains both the user message and the assistant's response(s) and
tool calls. The outbound `messageId` becomes the identity of that node
(replacing the inbound `messageId`). This way the node is keyed by the
message that the *next* reply will reference:

```
on message(inboxMessage):
  { messageId: inboundId, replyTo, number } = inboxMessage

  parentNode = replyTo ? await getNode(replyTo) : null

  if parentNode === null:
    // New conversation root
    rootId = randomId()
    rootNode = { messageId: rootId, parentMessageId: null,
                 messages: [{ role: 'system', content: systemPrompt }] }
    await putNode(rootNode)
    parentId = rootId
  else:
    parentId = replyTo

  // Create a working node for this turn
  turnNode = {
    messageId: inboundId,  // temporary; updated after reply
    parentMessageId: parentId,
    messages: [userMessageFromInbox(inboxMessage)],
    lastInboxNumber: number,
  }

  await runAgenticLoop(turnNode)
  // After the loop, turnNode.messages contains user + assistant + tools.
  // The outbound messageId is captured from the own-message handler
  // and the node is re-indexed. See below.
```

This is getting complex. Let's simplify:

### Revised: Two-Phase Node Lifecycle

**Phase 1 (on inbound message):** Create a node keyed by the inbound
`messageId`, chained to the parent. Append the user message. Run the
agentic loop, appending assistant and tool messages to this node.

**Phase 2 (on own outbound message):** Create an alias entry in the store
mapping the outbound `messageId` to the same node. Future replies from the
user will have `replyTo` set to the outbound `messageId`, so the alias
ensures they find the correct node.

```js
handleOwnMessage(outboundMessage):
  { messageId: outboundId, replyTo } = outboundMessage
  if replyTo === undefined: return

  // replyTo is the inbound messageId that triggered this response.
  // But actually, replyTo is the messageId of the message being replied to,
  // which is the inbound message's messageId.
  // Create an alias: outboundId → same node as replyTo.
  const node = await getNode(replyTo)
  if node !== undefined:
    // Store an alias so the outbound messageId resolves to this node
    nodeCache.set(outboundId, node)
    await E(powers).storeValue(harden(node), `transcript-${outboundId}`)
```

This duplicates the stored node under two keys, which is acceptable for
simplicity. The node is small (just the appended messages, not the full
chain).

## Changes to agent.js

### New: `reply` Tool

A new tool definition, parallel to `send`, but taking `messageNumber` instead
of `recipientName`:

```js
{
  type: 'function',
  function: {
    name: 'reply',
    description:
      'Reply to a message in your inbox, threading the response to the ' +
      'original message. Use this instead of send() when responding to a ' +
      'received message.',
    parameters: {
      type: 'object',
      properties: {
        messageNumber: {
          type: 'string',
          description:
            'The message number (BigInt) to reply to. SmallCaps: "+5".',
        },
        strings: { /* same as send */ },
        edgeNames: { /* same as send */ },
        petNames: { /* same as send */ },
      },
      required: ['messageNumber', 'strings', 'edgeNames', 'petNames'],
    },
  },
}
```

Execution calls `E(powers).reply(messageNumber, strings, edgeNames, petNames)`.

### Modified: `listMessages` Result

Preserve `messageId` and `replyTo` fields in the formatted output so the LLM
can reason about threading.

### Modified: System Prompt

- Use `reply()` (not `send()`) when responding to a received message.
- Use `send()` only for initiating new, unthreaded conversations.

### Modified: `runAgent()` Message Loop

Replace the single `transcript` array with a node-based transcript store.
The message loop dispatches inbound messages to the correct transcript chain
(or creates a new one) before calling `runAgenticLoop(node)`.

Own-messages (`fromId === selfId`) are no longer skipped — they are used to
create alias entries in the transcript store.

### Modified: `runAgenticLoop(node)`

Takes a `TranscriptNode` parameter. Assembles the full message array from the
chain on each LLM call. Appends assistant and tool messages to the node's
local `messages` array. Persists the node after each tool-call round and on
completion.

## Changes to Daemon Messaging

### Transcript Depth

No daemon schema changes. The depth is encoded as a text prefix
`[depth:N] ` in the first string fragment of outgoing `Package` messages.
The chat UI can optionally parse and display it.

### Capturing Outbound messageId

The agent observes its own messages via `followMessages()`. Outbound messages
arrive with `from === selfId` and carry both `messageId` and `replyTo`. The
agent uses `replyTo` to locate the parent node and creates an alias under the
outbound `messageId`. No daemon API changes required.

## Implementation Phases

### Phase 1: Reply Tool and Threading

- Add the `reply` tool definition and `case 'reply'` to `executeTool()`.
- Update `listMessages` formatting to include `messageId` and `replyTo`.
- Update system prompt to prefer `reply()` over `send()`.
- Agent still uses a single transcript (no branching yet).

### Phase 2: Node-Based Transcript Store

- Define `TranscriptNode` type.
- Replace module-level `transcript` with node creation/lookup.
- Route inbound messages to the correct chain based on `replyTo`.
- Create new root nodes for stand-alone messages.
- Assemble full transcript from chain on each LLM call.
- Handle own-messages to create aliases.

### Phase 3: Durable Storage

- Persist nodes via `E(powers).storeValue()` under `transcript-<messageId>`.
- Lazy-load nodes from pet store on cache miss.
- Add bounded cache eviction for in-memory nodes.

### Phase 4: Depth Indicator

- Compute depth from assembled transcript.
- Prepend `[depth:N]` to outgoing reply strings.

### Phase 5: Memory Management (Future)

- Sliding window or summarization for long chains.
- Garbage collection of transcript nodes when all related inbox messages
  are dismissed.

## Alternatives Considered

### Full Transcript Copy Per Branch

Store a complete copy of the message array for each branch.

- Simpler to implement (no chain walking).
- Wasteful: long conversations with many branches duplicate the entire prefix.
- Rejected in favor of the chain structure.

### Single Transcript with Context Tags

Keep one transcript but tag messages with chain IDs. Use prompt engineering to
focus the LLM on messages for a specific chain.

- Fragile: LLM may confuse contexts. Wastes context window.
- Rejected.

### Depth as a Structured Message Field

Add `metadata: { depth: number }` to `MessageBase` in daemon types.

- Cleaner API, queryable by UI.
- Requires daemon schema changes, migration, validation.
- Deferred; text prefix is sufficient initially.

## Files

### To Modify

- `packages/lal/agent.js` — Add `reply` tool, node-based transcript store,
  per-chain routing, durable storage, depth prepending, updated system prompt.
- `packages/lal/agent.types.d.ts` — Add `TranscriptNode` type.

### No Daemon Changes Required

The daemon already supports `reply()`, `storeValue()`, `messageId`/`replyTo`
on messages, and `followMessages()` including own messages. All needed
infrastructure exists.

## Decisions Made

| Aspect | Decision |
|--------|----------|
| Transcript structure | Linked chain of nodes, not full array copies |
| Node identity | Keyed by `messageId` |
| Branching | New node pointing to same parent; shared prefix stored once |
| Durable storage | `storeValue()` under `transcript-<messageId>` pet names |
| Reply tool | New `reply` tool calling `E(powers).reply()` |
| Own-message handling | Create alias entries, not skip |
| Depth communication | Text prefix `[depth:N]` in first string fragment |
| Outbound messageId | Captured via `followMessages()`, no daemon changes |

## Tentative Decisions (may adjust during implementation)

| Aspect | Tentative Decision |
|--------|-------------------|
| In-memory cache | Unbounded initially; add LRU eviction in Phase 5 |
| Transcript assembly | Walk chain and `flat()` on every LLM call |
| Node granularity | One node per inbound message + its agentic loop output |
| Alias storage | Duplicate node under both inbound and outbound messageIds |

## Out of Scope

- **Transcript summarization or sliding window** — future memory management.
- **Chat UI rendering of depth badges** — `[depth:N]` is human-readable.
- **Reply chain visualization** — covered by `chat-reply-chain-visualization.md`.
- **Concurrent agentic loops** — agent processes one message at a time.
- **Garbage collection of stored transcript nodes** — future work.
