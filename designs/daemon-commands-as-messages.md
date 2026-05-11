# Daemon Commands as Messages

| | |
|---|---|
| **Created** | 2026-03-11 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The daemon's mail system records only inbound messages — things sent *to*
a user or agent. When a user issues a command (`dismiss`, `adopt`,
`resolve`, `evaluate`, `send`), the operation executes as a promise that
settles and vanishes. There is no durable record in `followMessages()` that
the command was issued, what its arguments were, or whether it succeeded.

This creates several problems:

1. **Asymmetric transcript.** The inbox shows what others said to you but
   not what you did. Reconstructing a session requires correlating inbox
   changes (a message disappeared, a name appeared) with unrecorded
   commands.

2. **No agent visibility.** Lal and Fae follow the user's inbox to build
   context. They cannot see the user's commands, so they lack half the
   conversation. An agent cannot distinguish "the user dismissed that
   request" from "the request was never delivered."

3. **No audit trail.** There is no persistent record of who did what and
   when. For capability-confined agents (see
   [daemon-agent-tools](daemon-agent-tools.md)), tool invocations are
   equally invisible — an agent reads a file, writes a file, runs a
   command, and none of it appears in the message log.

4. **Chat UI workarounds.** The Chat pending commands region
   ([chat-pending-commands](chat-pending-commands.md)) is a UI-only
   workaround: it tracks in-flight commands in ephemeral DOM state. This
   solves the immediate UX problem but does not persist across page
   reloads, is invisible to agents, and duplicates bookkeeping that the
   daemon should own.

## Design

### Commands as self-addressed messages

When a user or agent issues a command, the daemon creates a message in the
caller's own inbox representing the command:

```
#42  You → You  dismiss #5
```

When the command completes, the result is delivered as a reply:

```
#43  (reply to #42)  ✓ dismissed
```

Or on failure:

```
#43  (reply to #42)  ✗ Error: no such message
```

`followMessages()` yields both inbound messages from others and
self-addressed command records. Pending commands are messages that do not
yet have a reply. The Chat transcript renders them naturally as part of the
message stream with reply threading.

### New message type: `command`

A `command` message contains:

- `commandName` — the operation (`dismiss`, `adopt`, `resolve`, `evaluate`,
  `send`, `request`, etc.).
- `args` — a structured record of the command's arguments, varying by
  command type.
- `promiseId` / `resolverId` — formula identifiers for the result, as with
  `request` messages today.

```js
/** @type {CommandMessage} */
const message = {
  type: 'command',
  number: nextMessageNumber,
  date: new Date().toISOString(),
  from: selfId,
  to: selfId,
  commandName: 'adopt',
  args: harden({
    messageNumber: 3n,
    edgeName: 'VALUE',
    petName: ['myval'],
  }),
  promiseId,
  resolverId,
};
```

### Result as reply message

When the command promise settles, the daemon posts a reply message to the
caller's inbox:

- `replyTo` references the command message number.
- On success: carries a `valueId` if the command produced a value
  (evaluate, request), or a simple confirmation otherwise.
- On failure: carries the error message.

This mirrors the existing form → value-reply pattern from
[daemon-form-request](daemon-form-request.md) and
[daemon-value-message](daemon-value-message.md), where a `form` message
receives a `value` reply with `replyTo` linking them.

### Self-delivery

Today, `mail.js` suppresses self-sends:

```js
if (message.from !== message.to) await deliver(message);
```

This suppression must be lifted for `command` type messages specifically.
Other self-sends can remain suppressed to avoid inbox noise from internal
delegation patterns.

### Persistence

Command messages and their reply messages are durable formulas, surviving
daemon restart. The `command` formula stores the command name and
arguments. The reply formula stores the outcome. Both are linked by
`replyTo` and discoverable via `followMessages()`.

On restart, the inbox replays all historical messages including commands.
An agent or Chat UI can reconstruct the full session history: what was
received, what was done, and what happened.

### Which operations become commands

| Operation | Currently | As command message |
|-----------|-----------|-------------------|
| `dismiss` | Promise, no trace | `command` + confirmation reply |
| `adopt` | Promise, no trace | `command` + confirmation reply |
| `resolve` | Promise, settles remote | `command` + confirmation reply |
| `reject` | Promise, settles remote | `command` + confirmation reply |
| `evaluate` | `eval-proposal` pair | `command` + value reply (subsumes eval-proposal) |
| `request` | Outbound message to recipient | `command` + value reply when settled |
| `send` | Outbound message to recipient | `command` + confirmation reply |
| `grant` | Promise, no trace | `command` + confirmation reply |

For `request` and `send`, the outbound message to the recipient continues
to work as today. The `command` message is an *additional* record in the
sender's own inbox.

For `evaluate`, the existing `eval-proposal-proposer` /
`eval-proposal-reviewer` paired messages could be replaced by a single
`command` message with a value reply, simplifying the eval flow.

### Chat UI rendering

Command messages must be visually distinct from conversational messages.
They should render compactly — a single line showing the command and its
arguments, not a full message bubble:

```
┌─ transcript ──────────────────────────────────────┐
│                                                    │
│  #38  Fae: Here's what I found...                  │
│  #39  You: @Fae Can you also check the tests?      │
│  #40  ◐ dismiss #36                        pending  │
│  #41  ✓ adopt #38:VALUE → analysis         done     │
│  #42  ◐ eval (source…)                    pending  │
│                                                    │
│  [command bar]                                     │
└────────────────────────────────────────────────────┘
```

Pending commands (no reply yet) show a spinner. Settled commands show a
checkmark or error indicator. The reply message is not rendered separately
— it is folded into the command card's settled state.

### Agent tool audit trail

This design applies equally to agent tool invocations from
[daemon-agent-tools](daemon-agent-tools.md). When Fae calls `readFile` or
`exec` via a capability, the tool wrapper posts a `command` message to
Fae's own inbox. The host can observe the agent's command history by
following the agent's messages.

This gives the capability bank ([daemon-capability-bank](daemon-capability-bank.md))
a built-in audit mechanism without a separate logging system.

## What This Enables

- **Unified transcript.** Chat renders `followMessages()` directly. No
  separate pending region needed — pending commands are messages without
  replies yet. The [chat-pending-commands](chat-pending-commands.md)
  UI-only region becomes unnecessary.
- **Agent-visible history.** Agents see the user's command history as
  messages, enabling better conversational context.
- **Undo/replay.** A durable command log enables future undo support or
  session replay.
- **Tool audit trail.** Agent tool invocations are logged in the same
  system, observable by the host.

## What It Costs

- **Mail system changes.** `mail.js` and `types.d.ts` need a new message
  type, new formula definitions, and changes to delivery routing. This
  touches the core persistence layer.
- **Message volume.** Every command produces at least two messages (command +
  result). Dismiss, adopt, and other fast operations become heavier.
  Mitigation: command messages are smaller than conversational messages
  (no markdown body, no embedded references).
- **UI rendering.** The Chat transcript must distinguish command messages
  from conversational messages and render them compactly.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [chat-pending-commands](chat-pending-commands.md) | UI-only predecessor; subsumes its pending region |
| [chat-command-bar](chat-command-bar.md) | Command bar that dispatches commands |
| [daemon-form-request](daemon-form-request.md) | Existing form → value-reply pattern this extends |
| [daemon-value-message](daemon-value-message.md) | Value reply mechanism reused for command results |
| [daemon-agent-tools](daemon-agent-tools.md) | Agent tool invocations use the same command logging |
| [daemon-capability-bank](daemon-capability-bank.md) | Audit trail for capability-confined operations |

## Affected Packages

- `packages/daemon/src/mail.js` — `command` message type, self-delivery
  for commands, result reply posting.
- `packages/daemon/src/types.d.ts` — `CommandMessage` and
  `CommandResultMessage` type definitions, `CommandFormula`.
- `packages/daemon/src/host.js` — command methods post a command message
  before executing and a result reply after settling.
- `packages/chat/inbox-component.js` — render command messages compactly
  in the transcript, fold reply into settled state.

## Prompt

> Please divide phase 2 into its own design document, referencing phase 1.
>
> (Original prompt that motivated both documents:)
>
> Please create a design document. In Chat, we see an indeterminate progress
> indicator for every issued command and this holds the command line until it
> succeeds or fails. We need to create a region at the end of the transcript
> that is a holding area for pending commands and their resolutions.
>
> It may be necessary to evaluate whether we can model all commands as
> messages are logged and where their results are replies. This is a more
> invasive but possibly necessary change to the daemon architecture.
