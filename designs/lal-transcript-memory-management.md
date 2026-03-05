# Lal Transcript Memory Management

| | |
|---|---|
| **Created** | 2026-03-05 |
| **Updated** | 2026-03-05 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The Lal agent participates in conversations via Endo messages. Each message
has a `messageId` and an optional `replyTo`, forming reply chains. The agent
must maintain a durable conversation tree — a mapping from message identifiers
to transcript nodes — so that replying to any message reliably reconstructs
the full conversation context for the LLM.

Endo messages are ephemeral from the user's perspective: they can be dismissed
from the inbox at any time. But the conversation history they represent must
outlive the messages themselves. If a user dismisses old messages and later
replies to one of the agent's responses, the agent must still be able to walk
the transcript tree back to the root and assemble the complete conversation.

This design ensures that every Endo message the agent processes is mapped to
a durable transcript node, and that these nodes form a reliable tree that
persists independently of the inbox.

## Predecessor

This design was extracted from Phase 5 of
[lal-reply-chain-transcripts](lal-reply-chain-transcripts.md), which
implemented the transcript chain data model (Phases 1-4) and deferred durable
persistence concerns as future work.

### Existing Infrastructure

The following are already in place:

- **`TranscriptNode`** — a node in the conversation tree, containing a
  `messageId`, a `parentMessageId` (or null for roots), and the LLM messages
  appended at that step.
- **`nodeCache`** — an in-memory `Map<string, TranscriptNode>` used as a
  write-through cache.
- **`getNode(messageId)`** — checks the in-memory cache, falls back to
  `E(powers).lookup('transcript-<messageId>')` in durable storage.
- **`putNode(node)`** — writes to both the in-memory cache and durable storage
  via `E(powers).storeValue()`.
- **`assembleTranscript(leafMessageId)`** — walks the chain from leaf to root,
  collects each node's `messages` array, reverses, and flattens into the full
  LLM transcript.
- **Alias entries** — when the agent sends a reply, the outbound `messageId`
  is stored as an alias pointing to the same node, so future replies to the
  agent's message find the correct chain.

## Description of the Design

### Message-to-Node Mapping

Every Endo message the agent processes — inbound or outbound — must be mapped
to a transcript node in durable storage. The mapping is keyed by `messageId`
and stored under the pet name `transcript-<messageId>`.

**Inbound messages** (from other parties) create a new node containing the
user's message content. If the inbound message has a `replyTo` that resolves
to an existing node, the new node chains to it. Otherwise, a fresh root node
(containing the system prompt) is created first.

**Outbound messages** (the agent's own replies, observed via
`followMessages()`) create alias entries. The alias maps the outbound
`messageId` to the node that contains the conversation turn, so that when
another party replies to the agent's message, `getNode(replyTo)` finds the
correct chain.

### Durability Beyond Message Lifecycle

Transcript nodes are stored in the agent's pet store, not in the inbox.
Dismissing inbox messages does not affect transcript nodes. This means:

- A user can dismiss all messages in a conversation and later reply to the
  agent's last response. The agent reconstructs the full transcript from
  durable nodes.
- Transcript nodes accumulate over the agent's lifetime. This is intentional —
  they are the agent's memory of past conversations.
- If a user wants to reclaim storage, they can discard the agent entirely or
  use another agent to export transcripts (e.g., to JSONL) before cleanup.

### Reliable Assembly

`assembleTranscript()` walks the node chain from leaf to root. Every node in
the chain must be resolvable — either from the in-memory cache or from durable
storage. If any node in the chain is missing (e.g., due to data corruption),
assembly fails and the agent should report the broken chain rather than
producing a partial transcript.

## Files

### To Modify

- `packages/lal/agent.js` — Ensure all message processing paths correctly
  create and persist transcript nodes; ensure `assembleTranscript()` reports
  broken chains.

## Security Considerations

- Transcript nodes may contain sensitive conversation content. They inherit the
  security posture of the agent's pet store (confined to the agent's authority).

## Test Plan

- Process a sequence of inbound messages with `replyTo` threading. Verify each
  produces a durable transcript node resolvable by `messageId`.
- Dismiss all inbox messages. Reply to the agent's last outbound `messageId`.
  Verify the full transcript is assembled from durable nodes.
- Branch a conversation (two replies to the same agent message). Verify each
  branch assembles independently with a shared prefix.
- Simulate a missing node in the chain. Verify the agent reports the broken
  chain rather than silently truncating.

## Decisions

| Aspect | Decision |
|--------|----------|
| Node lifetime | Persists for the lifetime of the agent |
| Relationship to inbox | Independent; nodes outlive dismissed messages |
| Missing node handling | Error, not silent truncation |
| Storage cleanup | User-initiated (discard agent or export) |

## Out of Scope

- **Token budget enforcement** — the LLM provider will reject over-long
  transcripts; we do not yet have reliable inputs to predict this.
- **Automatic summarization or compression** — user-initiated, not automatic.
- **Garbage collection** — storage is cheap; users can discard the agent.
- **Transcript export tooling** — a useful companion feature, but a separate
  design concern.
