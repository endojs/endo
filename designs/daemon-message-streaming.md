# Daemon Message Streaming

|             |                          |
|-------------|--------------------------|
| **Created** | 2026-03-26               |
| **Author**  | Joshua T Corbin (evoked) |
| **Status**  | Not Started              |

## Motivation

The Genie agent (and similar AI-powered guests) produces output incrementally:
reasoning tokens stream in as the LLM thinks, tool call notifications arrive
mid-turn, and the final assistant response is assembled token-by-token.  Today
the daemon's mail system only supports discrete, complete messages — there is no
way for a guest to stream a response that the recipient can consume
progressively.

This forces the Genie main module to use a workaround:

1. Send a "Thinking …" status message while the LLM reasons.
2. Send a "Calling tool X …" message on each tool invocation.
3. Buffer all response tokens and send the full text as a single final message.

This is functional but produces a choppy UX — the recipient sees several
separate messages rather than a single response that builds up in real time.

## Use-Case Requirements

From the Genie integration, the streaming facility needs to support:

- **Progressive text delivery**: A sender opens a streaming message, appends
  text fragments over time, and eventually finalises the message.  The recipient
  sees each fragment as it arrives.
- **Status phases**: The stream should carry metadata indicating the current
  phase (e.g. `thinking`, `tool-call`, `responding`) so the UI can render
  appropriate indicators.
- **Finalisation**: The stream has a defined end.  Once finalised, the message
  becomes an ordinary immutable message in the inbox/outbox.  The recipient can
  dismiss it like any other message.
- **Error / abort**: The sender can abort the stream, signalling that the
  response will not complete.  The recipient sees the partial content plus an
  error indicator.
- **Back-pressure (optional, future)**: If the recipient is slow to consume,
  the sender should be able to detect this and throttle.

## Proposed Interface Changes

### New mail method: `streamReply`

```js
/**
 * Open a streaming reply to an existing message.
 *
 * Returns a StreamWriter that the sender uses to append content and
 * finalise the stream.
 *
 * @param {bigint} messageNumber - The inbox message to reply to.
 * @param {object} [options]
 * @param {string} [options.phase] - Initial phase label (e.g. "thinking").
 * @returns {Promise<StreamWriter>}
 */
E(powers).streamReply(messageNumber, options?)
```

### StreamWriter interface

```js
/**
 * @typedef {object} StreamWriter
 * @prop {(text: string) => Promise<void>} append
 *   Append a text fragment to the stream.
 * @prop {(phase: string) => Promise<void>} setPhase
 *   Update the current phase label (e.g. "thinking" → "responding").
 * @prop {() => Promise<void>} end
 *   Finalise the stream.  The message becomes immutable.
 * @prop {(reason: string) => Promise<void>} abort
 *   Abort the stream with an error reason.
 */
```

### Recipient-side: StreamReader

Messages delivered with streaming carry a `stream` property that is an async
iterable of `StreamEvent` objects:

```js
/**
 * @typedef {object} StreamEvent
 * @prop {'append' | 'phase' | 'end' | 'abort'} type
 * @prop {string} [text]   - For 'append' events.
 * @prop {string} [phase]  - For 'phase' events.
 * @prop {string} [reason] - For 'abort' events.
 */

// Recipient usage:
for await (const event of message.stream) {
  switch (event.type) {
    case 'append':
      process.stdout.write(event.text);
      break;
    case 'phase':
      showStatus(event.phase);
      break;
    case 'end':
      break;
    case 'abort':
      showError(event.reason);
      break;
  }
}
```

### Alternative: `streamSend`

For initiating a brand-new streaming conversation (not a reply):

```js
E(powers).streamSend(recipientName, options?)
// Returns Promise<StreamWriter>
```

## Implementation Sketch

### 1. Stream formula

Introduce a new formula type `stream` that holds a promise-kit-backed async
iterator.  The stream formula is created when `streamReply` is called and its
ID is attached to the outbound message envelope.

```
stream:<id> = {
  phase: string,
  chunks: AsyncIterator<StreamEvent>,
  push(event): void,   // internal — called by the sender's StreamWriter
  close(): void,       // internal
}
```

### 2. Message envelope extension

Add an optional `streamId` field to the message envelope.  When present the
recipient's inbox entry includes a `stream` property that is a Far reference
to the stream formula's async iterable.

### 3. Delivery path

- Sender calls `streamReply(number)`.
- Mail subsystem creates a stream formula and a message envelope with
  `streamId`.
- The envelope is delivered to the recipient immediately (the message appears
  in their inbox with `stream` attached).
- The sender receives a `StreamWriter` far-reference whose methods proxy to
  the stream formula's `push` / `close`.
- On `end()`, the stream formula resolves; the message snapshot (all appended
  text concatenated) is persisted as the message's `strings` for offline
  access.

### 4. Persistence

- While streaming, only the stream formula's in-memory buffer is authoritative.
- On `end()`, the assembled text is written to the message's durable record so
  it survives daemon restart.
- On `abort()`, partial text plus the abort reason are persisted.

### 5. Cross-peer considerations

For messages that cross CapTP peer boundaries, the stream events travel over
the existing CapTP channel as method calls on the stream formula's far
reference.  No new transport primitive is needed — the existing promise
pipelining and method dispatch handle it.

## Migration Path

1. Implement `streamReply` / `streamSend` alongside the existing `reply` /
   `send` methods — no breaking changes.
2. Guests that want streaming opt in; guests that don't continue to use
   discrete messages.
3. The Familiar chat UI checks for the `stream` property on inbox messages
   and renders a live-updating bubble when present, falling back to the
   static `strings` content for finalised or non-streaming messages.

## Open Questions

- **Chunk granularity**: Should `append` send individual tokens or should the
  sender batch into larger chunks?  A minimum interval (e.g. 50ms debounce)
  could reduce CapTP overhead without noticeably hurting perceived latency.
- **Back-pressure**: Should `append` return a promise that resolves when the
  recipient has consumed the chunk, or should it be fire-and-forget with an
  internal buffer?
- **Multiple streams per message**: Is there a use case for a single message
  carrying multiple parallel streams (e.g. stdout + stderr)?  For now a
  single stream per message seems sufficient.
- **Stream cancellation by recipient**: Should the recipient be able to signal
  the sender to stop streaming (e.g. user clicks "Stop generating")?  This
  could be modelled as a method on the StreamReader or as a separate request
  message.
