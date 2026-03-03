# Daemon Value Message

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

Endo's message system lets agents exchange text with embedded references
(`package`), make requests (`request`, `form-request`), and negotiate code
execution (`eval-request`, `definition`). All of these either carry text, carry
promises, or carry code.

There is no message type for the simple act of **giving a value to another
agent**. Today, the closest workaround is sending a `package` message where
the text template is empty or incidental and the only meaningful payload is an
embedded reference. This is awkward because:

1. **A `package` requires template strings.** The sender must construct a
   `strings` array with at least one element. For a pure value transfer the
   text is noise.
2. **No clear reply semantics.** An agent that receives a `request` or
   `form-request` can resolve the promise with a value, but there is no way
   to reply with a value to an arbitrary message — a `package` reply can only
   carry references as named edges within text, not a first-class retained
   value.
3. **Adopt ceremony.** The recipient of a `package` must `adopt` each edge
   name to create a pet name. A value message should retain the value directly
   in the recipient's pet store under a specified name, like `request`
   resolution does.
4. **LLM agent tool results.** An AI agent that performs a task and produces
   a result (a file, a capability, a computed object) should be able to reply
   to the originating message with the result as a retained value. This is the
   core loop of agentic interaction: human sends task, agent replies with
   result.

## Design

### New message type: `value`

A `value` message carries exactly one formula identifier — a retained
reference to any passable value or capability. It is always a reply to an
existing message.

```ts
export type ValueMessage = MessageBase & {
  type: 'value';
  replyTo: FormulaNumber; // required, not optional
  valueId: FormulaIdentifier;
};
```

The `replyTo` field is **required** (unlike `package` where it is optional).
Every value message is a response to something — either a human's text
message, a request, a form result, or another value message.

### Message formula persistence

Add `'value'` to the `MessageFormula.messageType` union:

```ts
type MessageFormula = {
  type: 'message';
  messageType:
    | 'request'
    | 'package'
    | 'eval-request'
    | 'definition'
    | 'form'
    | 'eval-proposal-reviewer'
    | 'eval-proposal-proposer'
    | 'value';  // new
  // ...existing fields...
  valueId?: FormulaIdentifier; // new
};
```

Add `ValueMessage` to the `Message` union type.

### Mail interface: `sendValue`

Add a new method to the `Mail` interface:

```ts
interface Mail {
  // ...existing methods...
  sendValue(
    messageNumber: bigint | number | string,
    petNameOrPath: string | string[],
    resultName?: string | string[],
  ): Promise<void>;
}
```

Parameters:

- **`messageNumber`** — the message being replied to. The recipient is
  inferred as the other party (same logic as `reply`).
- **`petNameOrPath`** — the value to send, resolved from the sender's pet
  store to a formula identifier.
- **`resultName`** (optional) — if provided, the recipient automatically
  retains the value under this pet name in their store (no `adopt` needed).

### Implementation in `mail.js`

```js
const sendValue = async (messageNumber, petNameOrPath, resultName) => {
  const normalizedMessageNumber = mustParseBigint(messageNumber, 'message');
  const parent = messages.get(normalizedMessageNumber);
  if (parent === undefined) {
    throw new Error(`No such message with number ${q(messageNumber)}`);
  }
  const otherId = parent.from === selfId ? parent.to : parent.from;
  const messageId = await randomHex256();
  const to = await provideHandle(otherId);

  const petPath = namePathFrom(petNameOrPath);
  const valueId = await E(directory).identify(...petPath);
  if (valueId === undefined) {
    throw new Error(`Unknown pet name ${q(petNameOrPath)}`);
  }

  const message = harden({
    type: 'value',
    valueId,
    messageId,
    replyTo: parent.messageId,
    from: selfId,
    to: otherId,
  });

  await post(to, message);
};
```

### Reception and auto-retain

When a `value` message is delivered, the recipient's mailbox checks for a
`resultName` hint. If present, the value is automatically written to the
recipient's pet store — the recipient does not need to explicitly `adopt`.

This mirrors how `request` resolution works: the response promise resolves
and the sender can optionally name the result.

However, the `resultName` is a hint from the sender, not a guarantee. The
recipient (or their agent) may choose to ignore it. The auto-retain happens
in the recipient's `deliver()` path:

```js
if (message.type === 'value' && resultName) {
  await E(directory).write(namePathFrom(resultName), message.valueId);
}
```

**Open question:** Should `resultName` be carried inside the message envelope
or passed out-of-band? Carrying it in the envelope makes it visible to both
sender and recipient but means the sender chooses the pet name in the
recipient's namespace. An alternative is for the recipient to adopt manually
using the `VALUE` edge name on the message hub directory.

### Message hub directory

The message hub formula for a `value` message exposes:

| Edge name | Value |
|-----------|-------|
| `FROM` | Sender handle formula ID |
| `TO` | Recipient handle formula ID |
| `DATE` | ISO 8601 timestamp |
| `TYPE` | `'value'` |
| `MESSAGE` | `messageId` |
| `REPLY` | `replyTo` messageId |
| `VALUE` | The retained value (resolved from `valueId`) |

The `VALUE` edge is the primary payload. Recipients can `adopt` it:

```bash
endo adopt 5 VALUE my-result
```

### Guest and Host interfaces

Both `EndoGuest` and `EndoHost` expose `sendValue`:

```ts
interface EndoGuest {
  // ...existing...
  sendValue(
    messageNumber: bigint | number | string,
    petNameOrPath: string | string[],
    resultName?: string | string[],
  ): Promise<void>;
}

interface EndoHost {
  // ...existing...
  sendValue(
    messageNumber: bigint | number | string,
    petNameOrPath: string | string[],
    resultName?: string | string[],
  ): Promise<void>;
}
```

### Interface guards

```js
sendValue: M.call(
  MessageNumberShape,   // messageNumber
  NameOrPathShape,      // petNameOrPath
)
  .optional(NameOrPathShape)  // resultName
  .returns(M.promise()),
```

### Help text

```
sendValue(messageNumber, petNameOrPath, resultName?) -> Promise<void>
Reply to a message with a retained value.
The value is sent to the other party in the conversation.
If resultName is provided, the recipient auto-retains the value under that name.
```

### CLI command

```
endo send-value <message-number> <pet-name> \
  --as <agent-name> \
  --name <result-name>
```

Example workflow:

```bash
# Host sends a task to guest "fae"
endo send fae "Please generate a summary of @report:report"

# Fae (AI agent) processes the task and replies with a value
endo send-value 0 summary-doc --as fae --name task-result

# Host sees the value message in inbox
endo inbox
# => 1. "fae" sent value (as "task-result") in reply to #0 at "..."

# Host can inspect the value
endo show task-result
```

### CLI inbox display

Value messages display as:

```
1. "fae" sent value in reply to #0 at "2026-03-02T..."
```

If `resultName` is present:

```
1. "fae" sent value (as "task-result") in reply to #0 at "2026-03-02T..."
```

### Chat UI rendering

In the inbox component, a `value` message renders as:

- Sender chip (`@fae`)
- "sent a value" text with a reply-chain indicator pointing to the parent
  message
- Inline value preview (using existing `value-render.js`)
- "Adopt" button if the value has not been named, or the pet name chip if
  already retained

## Design Decisions

1. **Reply-only.** A value message must always be a reply (`replyTo` is
   required). Sending an unsolicited value is a `package` with an edge name.
   This keeps `value` focused on the reply-with-result pattern.

2. **Single value.** Each `value` message carries exactly one formula
   identifier. To send multiple values, send multiple value messages or use a
   `package`. This simplicity aligns with the "one result per task" pattern
   and avoids inventing a new multi-value container.

3. **Auto-retain is optional.** The `resultName` hint enables zero-ceremony
   value delivery for the common case. Recipients who want explicit control
   can omit `resultName` and `adopt` manually.

4. **No promise/resolver infrastructure.** Unlike `request` and
   `form-request`, a value message is fire-and-forget from the sender's
   perspective. There is no promise to resolve. The value already exists; it
   is being shared, not requested.

5. **Recipient inferred from parent.** Like `reply`, the recipient of a
   `sendValue` is always the other party in the parent message's
   conversation. This avoids requiring the sender to re-specify the recipient
   and prevents sending values to unrelated parties.

## Files Modified

| File | Change |
|------|--------|
| `packages/daemon/src/types.d.ts` | Add `ValueMessage` type, update `Message` union, update `MessageFormula`, add `sendValue` to `Mail`, `EndoGuest`, `EndoHost` |
| `packages/daemon/src/mail.js` | Implement `sendValue`, update `makeStampedMessage` and `deliver` for value type, update message hub directory |
| `packages/daemon/src/host.js` | Expose `sendValue` on host exo |
| `packages/daemon/src/guest.js` | Expose `sendValue` on guest exo, delegate to mailbox |
| `packages/daemon/src/interfaces.js` | Add `sendValue` guard to Guest and Host interfaces |
| `packages/daemon/src/help-text.js` | Add help text for `sendValue` |
| `packages/daemon/src/daemon.js` | Update `makeMessageHub` to expose `VALUE` edge for value messages |
| `packages/cli/src/endo.js` | Add `send-value` command definition |
| `packages/cli/src/commands/send-value.js` | New — CLI command implementation |
| `packages/cli/src/commands/inbox.js` | Add value message display formatting |
| `packages/daemon/test/endo.test.js` | Add value message integration tests |
| `packages/chat/inbox-component.js` | Render value messages with preview and adopt |
| `packages/chat/command-registry.js` | Register `/send-value` command |
| `packages/chat/command-executor.js` | Execute send-value via `E(host).sendValue()` |

## Related Designs

- [daemon-form-request](daemon-form-request.md) — form messages use value
  messages as their reply mechanism; each form submission produces a value
  message with `replyTo` pointing to the form.
- [chat-reply-chain-visualization](chat-reply-chain-visualization.md) — value
  messages will participate in reply chains and should render with the
  connector lines once that design is implemented.
- [daemon-capability-bank](daemon-capability-bank.md) — value messages could
  be the delivery mechanism for capability grants.
