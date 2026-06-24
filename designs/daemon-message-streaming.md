# Daemon Message Streaming

|             |                          |
|-------------|--------------------------|
| **Created** | 2026-03-26               |
| **Updated** | 2026-06-15               |
| **Author**  | Joshua T Corbin (evoked) |
| **Status**  | In Progress              |

## Status

**In Progress** (design proposed 2026-03-26; Phase 1 implementation
open as PR #287, not yet merged to `llm`).

Phase 1 (`streamReply` + `StreamWriter` + `StreamReader`) implemented
on branch `feat/daemon-message-streaming-phase-1` (commit 4af9cd0ea)
and forwarded under the bot as
[PR #287](https://github.com/endojs/endo-but-for-bots/pull/287)
(open).
Not yet merged to `llm`.

### Roadmap calibration (per `git blame` on `llm`)

- Design phase: 2026-03-26 (single commit `116f5f06d`, "Mostly
  bot-written design for daemon message streaming").
- Implementation phase: open as PR #287 against `llm`. No completion
  date yet. Calendar gap since design is 54+ days.

## Motivation

The Genie agent (and similar LLM-powered guests) produces output incrementally.
Reasoning tokens stream in as the model thinks, tool-call notifications arrive
mid-turn, and the final assistant reply is assembled token-by-token.
Today the daemon's mail system only supports discrete, settled messages.
A guest that wants to show progress must emit several separate messages
("Thinking …", "Calling tool X …", then the final text), which produces a
choppy UX rather than a single message whose content fills in over time.

What is actually needed is narrow.
The sender must be able to replace the interior of a message it has already
sent, and the recipient must be able to tell whether the message has settled.
A prior revision of this design proposed a full stream-writer/reader protocol
with phases, chunks, back-pressure, and a dedicated stream formula type.
That is over-engineered for the use case.
Appending chunks, setting phase labels, and tracking partial progress are
all already expressible as a sequence of whole-message revisions, and the
whole-message form is a much smaller surface.

## Design

One new agent method, `editMessage`, replaces the interior of a message the
agent previously sent.
Messages gain a boolean `done` field that tells the recipient whether the
message has settled.
A companion query, `messageHistory`, returns the ordered list of revisions
with timestamps for a given message, so that the final record and the path
the sender took to arrive at it are both inspectable.

### `editMessage`

```js
/**
 * Replace the interior of a message the caller previously sent.
 *
 * The recipient's view of the message is updated in place: the inbox
 * entry keeps the same message number, the same reply-to linkage, and
 * the same dismissal state, but its displayed content is replaced with
 * the new payload. The prior revision is retained in the message's
 * history (see `messageHistory`).
 *
 * A message with `done: false` is a partial submission. The sender is
 * expected to issue one or more further `editMessage` calls ending with
 * `done: true`. Once `done: true` has been observed, the message is
 * settled. Later edits are still accepted and recorded in history, but
 * the recipient should treat them as revisions of a settled message
 * rather than as progress.
 *
 * @param {bigint} messageNumber - Outbox message number to edit.
 * @param {object} payload - New message interior. Shape matches the
 *   payload originally accepted by send/reply/sendValue/etc.
 * @param {object} [options]
 * @param {boolean} [options.done] - Defaults to true. Pass false to
 *   mark the revision as a partial submission.
 * @returns {Promise<void>}
 */
E(agent).editMessage(messageNumber, payload, options?)
```

A few things fall out of this shape:

- **Same message, same number.**
  `editMessage` never creates a new inbox entry.
  Replies that point at the edited message continue to point at it.
  Dismissal is unchanged: the recipient dismisses the message as a whole,
  not any particular revision.
- **Any message type can be edited.**
  The payload argument mirrors the union already accepted by `send`,
  `reply`, `sendValue`, `submit`, and related verbs.
  An edit may change the payload type (e.g. a `strings` message with a
  "Thinking..." placeholder becomes a `value` message carrying the
  final structured result), subject to whatever type-compatibility
  rules the mail subsystem chooses to enforce.
- **`done` is a first-class field on the message envelope**,
  not a stream event.
  The initial `send` / `reply` call accepts `done` with a default of
  `true` so that existing callers keep the settled-on-arrival semantics
  they have today.
  A sender that wants progressive delivery passes `done: false` on the
  first submission and a final `editMessage(..., { done: true })`
  when settled.
- **Edits after `done` are allowed.**
  If the sender needs to correct or amend a settled message, it may call
  `editMessage` again.
  The prior settled revision and the amendment both live in history
  with their own timestamps.
  This matches how humans use edits in chat clients and lets agents
  post-correct without fabricating a reply chain.
- **Only the original sender may edit.**
  Authority to edit is tied to the capability that originally sent the
  message, the same way authority to reply is tied to possession of
  the message reference.

### `done`

`done` is stored on the envelope and is surfaced to the recipient alongside
the payload.
The recipient UI is expected to render not-done messages with an
indeterminate progress affordance (spinner, pulsing cursor, "…" suffix,
whatever is locally idiomatic) and to drop that affordance once `done`
flips to true.
Nothing about `done` constrains what the payload can contain; a
"Thinking..." placeholder and a fully assembled answer are both legitimate
interiors for a not-done message.

### `messageHistory`

```js
/**
 * Return the ordered revision history of a message in the caller's
 * inbox or outbox.
 *
 * The returned array is in submission order, oldest first. Each entry
 * records the payload as sent, the `done` flag at the time, and the
 * timestamp assigned by the mail subsystem when the revision was
 * accepted.
 *
 * @param {bigint} messageNumber
 * @returns {Promise<Array<MessageRevision>>}
 *
 * @typedef {object} MessageRevision
 * @prop {object} envelope - The message envelope as accepted for this revision.
 * @prop {boolean} done
 * @prop {string} date - ISO 8601 timestamp assigned when the revision was applied.
 * @prop {number} timestamp - Milliseconds since the Unix epoch, derived from `date`.
 */
E(agent).messageHistory(messageNumber)
```

History is retained for the lifetime of the message (i.e. until the
recipient dismisses and it is garbage-collected).
The current message content, as exposed through the normal inbox read
path, is equivalent to the last entry in `messageHistory`.

### Why this is enough

The phased use cases from the prior design collapse onto this surface:

| Prior concept | Expressed as |
|---|---|
| `append(chunk)` | `editMessage(n, { strings: [soFar + chunk] }, { done: false })` |
| `setPhase("thinking")` | An edit whose payload text is `"Thinking..."` with `done: false` |
| `end()` | `editMessage(n, finalPayload, { done: true })` |
| `abort(reason)` | `editMessage(n, { strings: [..., reason] }, { done: true })` — or a reply containing the error, if the partial content should be preserved verbatim |
| Recipient live rendering | Poll-free: the existing message-follow path already notifies on envelope changes |

The sender decides chunk granularity.
The mail subsystem does not need a debounce, buffer, or back-pressure
story: each `editMessage` is an ordinary eventual send.
If a sender chooses to edit every token, it will pay CapTP overhead per
token; if it batches every 50ms, it pays less.
That is a caller concern, not a protocol concern.

## Implementation Sketch

1. **Envelope.**
   Add `done: boolean` to the message envelope.
   Default to `true` on the existing submission paths so unchanged callers
   see unchanged behavior.

2. **Revision log.**
   For each outbound message, retain an append-only log of revisions
   alongside the current envelope.
   The current envelope is `revisions[revisions.length - 1]`.
   In the current implementation the revision log lives in memory
   (`revisionsByNumber` in `packages/daemon/src/mail.js`) and is
   discarded on daemon restart; only the latest envelope is persisted
   via the message's stored formula.
   Persisting the full log so it survives restart and can be replayed
   into a resumed inbox is a follow-up
   (TODO: lift `revisionsByNumber` into the mailbox store).

3. **`editMessage` on the mail interface.**
   Authorized only for the sender's outbox entry for the given message
   number.
   Validates that the target message exists and has not been
   reaped.
   Appends the new revision, updates the current envelope,
   and notifies followers via the existing message-change path.

4. **`messageHistory` on the mail interface.**
   Reads the revision log for a message number in the caller's inbox
   or outbox.
   Returns a snapshot array; it does not subscribe.

5. **Recipient delivery.**
   The existing follow-messages channel already emits a change event
   when an envelope mutates.
   The recipient gets the new payload and `done` on the same path it
   already uses for new messages; no new async-iterable surface is
   introduced.

6. **Chat UI.**
   Render `done: false` messages with a progress indicator.
   On change, swap in the new payload in place.
   Offer a "view history" affordance that calls `messageHistory` and
   lists prior revisions with their timestamps.

## Dependencies

| Design | Relationship |
|---|---|
| [daemon-value-message](daemon-value-message.md) | `editMessage` accepts any payload type in the message union, including `value`. No structural changes expected; this design just reuses the union. |
| [daemon-commands-as-messages](daemon-commands-as-messages.md) | Command results can use `editMessage` to fill in output as it becomes available, superseding any ad-hoc "pending result" placeholder. |
| [lal-reply-chain-transcripts](lal-reply-chain-transcripts.md) | Reply-chain transcripts include the current envelope of each ancestor. This design does not change what a transcript records; it simply means transcripts assembled before a message settles will show the latest revision at that moment. |

## Design Decisions

1. **Edits replace the whole interior, not a diff.**
   The sender has the full text it wants to show; the mail subsystem
   does not need to understand diffs or partial token structure.
   Whole-payload replacement is trivial to reason about and trivial to
   persist.

2. **`done` is separate from the payload union.**
   It is tempting to model "not done" as a distinct message type, but
   partial and settled forms are the same message at different points in
   its life.
   Keeping `done` as an envelope field means message-type code paths are
   not duplicated.

3. **Edits after `done` are permitted.**
   Forbidding post-settlement edits would force senders that want to
   correct a settled message to send a new reply, which distorts the
   reply graph and leaves the wrong content in place.
   History plus timestamps preserves the audit trail without that cost.

4. **Only the original sender may edit.**
   The edit capability rides on the same authority as the original
   submission.
   No new delegation primitive is introduced.

5. **No dedicated stream formula, writer, or reader.**
   Revisions flow through the existing envelope-change channel.
   This was the major simplification over the prior design.
   The use cases do not require token-granular back-pressure, and a
   sender that wants coarser granularity just edits less often.

## Known Gaps and TODOs

- [ ] Decide whether `editMessage` may change the payload type (e.g.
      `strings` → `value`) or whether the payload type is fixed at
      first submission.
      Leaning toward permitting the change, with the caveat that
      recipient code that has already rendered a particular type may
      need to re-render.
- [ ] Define the storage representation of the revision log
      (flat append in the existing message record vs. a sidecar).
- [ ] Quota: cap the number of revisions per message or the total
      retained bytes, to prevent a runaway sender from filling the
      inbox store.
- [ ] Consider whether `messageHistory` should be follow-able
      (subscribe to new revisions) or remain a snapshot query.
      Snapshot is sufficient for the history-viewer UX; live follow is
      already covered by the normal message-follow path for the
      current envelope.

## Prompt

> Let's reset to actual/llm hard and rewrite the daemon-message-streaming
> design document from scratch. This streaming approach is overwrought and
> we really only need a single method on agents, editMessage. The
> editMessage verb will replace the interior of a message. The history of
> edits will be preserved. Messages will have a "done" boolean that
> distinguishes messages that indicate partial submissions, like
> "Thinking..." or "Typing..." or a prefix of the ultimate message, which
> might be accompanied by an indeterminate progress indicator. Once
> "done", the message will be expected to have settled, and edits received
> after that time will be preserved, such that the revisions and their
> timestamps can be reviewed. This will require another query verb,
> "messageHistory".
