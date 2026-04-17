# Daemon Message Streaming

|             |                          |
|-------------|--------------------------|
| **Created** | 2026-03-26               |
| **Updated** | 2026-04-13               |
| **Author**  | Joshua T Corbin, Kris Kowal (evoked) |
| **Status**  | Not Started              |

## Motivation

The Genie agent (and similar AI-powered guests) produces output incrementally:
reasoning tokens stream in as the LLM thinks, tool call notifications arrive
mid-turn, and the final assistant response is assembled token-by-token.
Today the daemon's mail system only supports discrete, immutable messages —
there is no way for a guest to progressively update a response or signal
ephemeral status like "thinking".

This forces the Genie main module to use a workaround:

1. Send a "Thinking …" status message while the LLM reasons.
2. Send a "Calling tool X …" message on each tool invocation.
3. Buffer all response tokens and send the full text as a single final
   message.

This is functional but produces a choppy UX — the recipient sees several
separate messages rather than a single response that builds up in real time.

## Three Verbs: Send, Act, Edit

We adopt the same three-verb model, mapped to the daemon's mail system:

| Verb     | Purpose                          | Durable? |
|----------|----------------------------------|----------|
| **send** | Create a new message             | Yes      |
| **act**  | Ephemeral status indicator       | No       |
| **edit** | Revise an existing message       | Yes      |

**send** already exists as `send` and `reply` on the Mail interface.
These continue to work exactly as they do today for creating messages.

**act** is new.
It broadcasts an ephemeral action to the recipient — "thinking",
"calling tool X", "typing" — that the UI can render as a transient
indicator.
Actions are not persisted and do not appear in the message ledger.

**edit** is new.
It replaces the content of an existing message.
This serves double duty: streaming (the sender edits the message
repeatedly, appending tokens to the accumulated text) and editorial
revision (the sender corrects a typo or updates a response after the
fact).
From the protocol's perspective these are the same operation.

Reactji are deliberately excluded from this protocol.
Small messages consisting only of emoji reactions are better handled as
a presentation concern — the Chat UI can fold them into compact visual
indicators without burdening the messaging layer with reaction semantics.

## Mutable Messages

Today, messages are immutable: a `Package` is created with its `strings`,
`names`, and `ids` and never changes.
To support `edit`, messages must become mutable.

### Append-only update ledger

Each message gains an append-only ledger of updates.
The ledger records every revision to the message's content.
The current state of the message is the latest entry in the ledger.

```ts
type MessageUpdate = {
  /** ISO 8601 timestamp of this revision. */
  date: string;
  /** The complete message content as of this revision. */
  strings: Array<string>;
  /**
   * Edge names for capabilities, same semantics as Package.
   * Empty array if the edit does not alter capabilities.
   */
  names: Array<Name>;
  /** Formula identifiers corresponding to names. */
  ids: Array<FormulaIdentifier>;
};
```

Each update contains the **full content** of the message at that revision,
not a delta.
This keeps the model simple — any consumer can read the latest entry
without replaying a chain of patches.
The ledger preserves history for auditing and for UIs that want to show
revision indicators.

### Revised message types

The `Package` type gains an `updates` field:

```ts
type Package = MessageBase & {
  type: 'package';
  strings: Array<string>;
  names: Array<Name>;
  ids: Array<FormulaIdentifier>;
  /** Append-only ledger of revisions. Empty for unedited messages. */
  updates: Array<MessageUpdate>;
};
```

The initial `strings`/`names`/`ids` remain the original content.
`updates` is empty for messages that have never been edited.
The "current" content of a message is the latest entry in `updates`,
or the top-level `strings`/`names`/`ids` if `updates` is empty.

Other message types (`request`, `eval-request`, `form`, `value`) are not
editable.
Only `package` messages support `edit`.

## Interface Changes

### `act` — ephemeral status

```js
/**
 * Broadcast an ephemeral action indicator to a recipient.
 *
 * Actions are not persisted.  They are delivered to the recipient's
 * message-following subscription and rendered as transient UI
 * indicators (e.g. a "thinking…" badge).
 *
 * @param {string | string[]} recipientNameOrPath
 * @param {string} action - The action label, e.g. "thinking",
 *   "calling-tool", "typing".
 */
E(powers).act(recipientNameOrPath, action)
```

### `edit` — revise a message

```js
/**
 * Edit an existing message.  Appends a new revision to the message's
 * update ledger.
 *
 * Only the original sender of a message may edit it.
 *
 * For streaming, the sender calls edit repeatedly, each time with the
 * accumulated text so far.  For editorial revision, the sender calls
 * edit once with the corrected content.
 *
 * @param {bigint} messageNumber - The message to edit.
 * @param {Array<string>} strings - The complete revised text.
 * @param {Array<string>} edgeNames - Edge names (may be empty).
 * @param {Array<string | string[]>} petNamesOrPaths - Capabilities
 *   (may be empty).
 */
E(powers).edit(messageNumber, strings, edgeNames, petNamesOrPaths)
```

The signature mirrors `reply` so the sender can attach or revise
capabilities in an edit, though for streaming use cases `edgeNames` and
`petNamesOrPaths` will typically be empty until the final edit.

### Streaming usage pattern

A guest that wants to stream a response does the following:

```js
// 1. Signal that work is in progress.
await E(powers).act(recipientName, 'thinking');

// 2. Send an initial (possibly empty) message.
const messageNumber = await E(powers).send(
  recipientName, [''], [], [],
);

// 3. As tokens arrive, accumulate and edit.
let accumulated = '';
for await (const token of tokenStream) {
  accumulated += token;
  await E(powers).edit(messageNumber, [accumulated], [], []);
}

// 4. Final edit with capabilities if needed.
await E(powers).edit(
  messageNumber, [accumulated], edgeNames, petNamesOrPaths,
);
```

No new streaming protocol, no stream formulas, no special message types.
The recipient sees a single message whose content grows over time.

### Recipient side: observing edits

The existing `followMessages` async generator currently yields
`StampedMessage` objects as new messages arrive.
It must be extended to also yield edit events:

```ts
type MessageEdit = {
  type: 'edit';
  number: bigint;
  date: string;
  strings: Array<string>;
  names: Array<Name>;
  ids: Array<FormulaIdentifier>;
};

type Action = {
  type: 'action';
  from: FormulaIdentifier;
  action: string;
};

type MailEvent =
  | StampedMessage       // new message (existing)
  | MessageEdit          // edit to existing message
  | Action;              // ephemeral action indicator
```

`followMessages` (or a new `followMailEvents`) yields these events.
The Chat UI uses the `type` discriminant to decide whether to insert a
new message bubble, update an existing one, or show an ephemeral
indicator.

## Implementation Sketch

### 1. Update ledger storage

Each message's durable record gains an `updates` array.
On `edit`, a new `MessageUpdate` entry is appended and the record is
flushed to disk.
For streaming use cases where edits arrive rapidly (every few tokens),
persistence can be debounced — only the latest revision needs to be
durable, since intermediate states are ephemeral.

### 2. `send` returns a message number

Today `send` returns `Promise<void>`.
To enable the sender to subsequently edit the message they sent, `send`
must return the message number (or the message ID) of the created
message.
This is a minor but necessary change to the `send` and `reply`
signatures:

```ts
send(...): Promise<bigint>;   // was Promise<void>
reply(...): Promise<bigint>;  // was Promise<void>
```

### 3. Authorization

Only the original sender of a message may edit it.
The `edit` method checks that the caller's formula identifier matches
the message's `from` field.

### 4. `act` delivery

Actions are delivered through the `followMessages` / `followMailEvents`
subscription but are **not** written to the message store.
They travel over CapTP as ordinary method calls and are discarded after
delivery.
If the recipient is not currently following, the action is silently
dropped — this is the correct behaviour for ephemeral indicators.

### 5. Cross-peer considerations

Edits cross CapTP peer boundaries as ordinary method calls, just like
`send`.
The recipient's daemon applies the edit to its local copy of the message
ledger.
No new transport primitive is needed.

Actions are fire-and-forget method calls over CapTP.
If the CapTP connection drops, in-flight actions are lost — acceptable
for ephemeral indicators.

### 6. Chat UI integration

The Familiar Chat UI observes `followMailEvents` and:

- On `StampedMessage`: inserts a new message bubble.
- On `MessageEdit`: updates the text of the existing bubble in place.
  If the message was previously showing a partial streaming state, the
  bubble content is replaced with the latest revision.
- On `Action`: shows a transient indicator (e.g. "Genie is thinking…")
  that auto-dismisses after a timeout or when a message/edit arrives.

### 7. Debouncing

For streaming, the sender may produce tokens faster than is useful to
transmit.
The sender (or a helper library) should debounce `edit` calls — for
example, batching tokens and editing at most every 50–100ms.
This is a sender-side concern and does not affect the protocol.

## Migration Path

1. **Add `updates` to `Package`**: The `updates` field defaults to an
   empty array.  Existing messages are unaffected.
2. **Change `send`/`reply` return type**: Return `Promise<bigint>`
   instead of `Promise<void>`.  Callers that ignore the return value are
   unaffected.
3. **Add `edit` method**: New method on `Mail`.  No existing code calls
   it until guests opt in.
4. **Add `act` method**: New method on `Mail`.  Ephemeral, no storage
   changes.
5. **Extend `followMessages`**: Yield `MessageEdit` and `Action` events
   alongside `StampedMessage`.  Existing consumers that only handle
   `StampedMessage` continue to work if the generator is extended to a
   new method (`followMailEvents`) rather than changing the existing one.
6. **Update Chat UI**: Render edits as in-place updates, actions as
   transient indicators.
7. **Update Genie**: Replace the "Thinking…" / "Calling tool…" /
   buffered-send workaround with `act` + `send` + sequential `edit`.

## Design Decisions

1. **Three verbs, no streaming protocol.**  Streaming is an emergent
   behaviour from sequential edits, not a first-class protocol concept.
   This avoids stream formulas, promise-chain plumbing, and a new message
   type.

2. **Full-content edits, not deltas.**  Each edit carries the complete
   message content.  This is slightly less efficient on the wire but
   vastly simpler — no patch language, no ordering bugs, no
   reconciliation.  For the typical streaming case (appending tokens to a
   growing string), the overhead is modest and easily managed by
   debouncing.

3. **Messages are mutable via an append-only ledger.**  The ledger
   preserves every revision.  This maintains auditability while allowing
   mutation.  The "current" content is always the latest ledger entry (or
   the original content if the ledger is empty).

4. **Actions are ephemeral.**  They are not messages.  They are not
   persisted.  They are fire-and-forget notifications that exist only in
   the moment.  This keeps the message store clean and avoids cluttering
   the inbox with "typing…" artifacts.

5. **Only `package` messages are editable.**  Requests, forms, and
   eval-requests have structured semantics that don't benefit from
   free-form editing.  Restricting editability to `package` avoids
   complications with structured message types.

6. **`send`/`reply` return message numbers.**  A small breaking change
   to the return type, but necessary for the sender to reference their
   own message in subsequent `edit` calls.

## Open Questions

- **Edit throttling**: Should the daemon enforce a minimum interval
  between edits to a single message, or is this purely a sender-side
  concern?
- **Edit permissions for capabilities**: Should `edit` be allowed to add
  new capabilities to a message, or only revise the text?  Adding
  capabilities in an edit has security implications — the recipient may
  have already processed the original capabilities.
- **Recipient cancellation**: How does a recipient signal "stop
  generating" to the sender?  This could be a separate `cancel` method
  or a message sent in the reverse direction.  It is orthogonal to the
  send/act/edit model.
- **Edit notifications across peers**: Should edits be pushed eagerly
  to peer daemons, or should the peer pull the latest revision on
  demand?  Eager push matches the streaming use case; pull might be
  more appropriate for editorial revisions.
- **Ledger compaction**: For messages that receive many streaming edits
  (hundreds of revisions from token-by-token updates), should the ledger
  be compacted after finalisation to retain only the initial and final
  states?

## Prompt

> Josh Corbin observed that the Telegram messaging API has merely three
> methods pertaining to messages: sendMessage, sendChatAction,
> editMessageText.  I would have chosen the verbs send, act, and edit.
> Semantically, edit is used for streaming updates as well as editorial
> revisions.  Act is for ephemeral notifications like "thinking",
> "typing".  We would use neither for reactji, preferring to fold up
> small messages containing only reactji into various views without
> muddying the protocol.  I think this design direction is simple and
> avoids the need to model streaming at the message protocol.  We would
> simply aggregate text and sequentially edit a message.  It follows
> that messages could no longer be immutable and would need to address
> an append-only ledger of updates.
