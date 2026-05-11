# Chat Pending Commands Region

| | |
|---|---|
| **Created** | 2026-03-11 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

When the user issues a command in Chat — `/dismiss 5`, `/adopt 3 edge name`,
`/eval`, or even a plain message send — an indeterminate spinner replaces the
send button and the entire command bar is locked (`contentEditable = false`,
`pointer-events: none`, `opacity: 0.5`) until the daemon promise settles.
During this time the user cannot type, issue another command, or even read
back what they just submitted.

This creates two problems:

1. **Blocked input.** The user is locked out of the command bar for the
   duration of the operation. Fast operations (dismiss, adopt) resolve
   quickly, but evaluate, request, and send can take seconds or longer.
   The user cannot queue a second command or correct a mistake.

2. **No command history.** Once a command completes, the spinner disappears
   and the command bar resets. There is no visible record of what the user
   did or when. The only trace is the side effect in the inbox (a dismissed
   message disappears, an adopted value appears in the pet store). If the
   command fails, an error flash appears briefly and is gone.

The inbox transcript shows inbound messages — things sent *to* the user. It
does not show outbound commands the user issued. The result is an asymmetric
record: you see what others said to you but not what you did.

## Design

### Pending commands region

Add a visually distinct region anchored to the bottom of the transcript,
above the command bar and below the message list. This region displays:

- Each pending command as a compact card showing the command name and its
  arguments (e.g., `dismiss #5`, `adopt #3:edge → myname`, `eval …`).
- An indeterminate progress indicator *per card*, not on the send button.
- The time elapsed since submission.

When a command settles:

- **Success**: the card transitions to a success state (checkmark, muted
  style) and remains visible briefly before fading out. If the command
  produced a value (evaluate, request), the card shows a "show result"
  affordance that opens the value modal.
- **Failure**: the card transitions to an error state with the error
  message. It remains visible until the user explicitly dismisses it.

The command bar is unlocked immediately after the command is dispatched,
not after the promise settles. The spinner moves from the send button to
the pending card.

### Unlocking the command bar

Today `executeWithSpinner` in `chat-bar-component.js` gates the entire UI
on the returned promise:

```js
setCommandSubmitting(true);
try {
  const result = await executor.execute(commandName, data);
  // ...
} finally {
  setCommandSubmitting(false);
}
```

The change: dispatch the command, push a pending entry into the pending
commands region, and immediately release the command bar. The pending entry
holds the promise and updates its own UI when the promise settles.

```js
const pending = pendingRegion.add(commandName, data);
executor.execute(commandName, data).then(
  result => pending.resolve(result),
  error => pending.reject(error),
);
exitCommandMode(); // Immediately
```

This allows the user to issue multiple concurrent commands. Each gets its
own card in the pending region.

### Multiple concurrent commands

Commands are independent daemon operations. The daemon already handles
concurrent `E()` calls correctly — `dismiss`, `adopt`, and `resolve`
operate on different message numbers and do not interfere. `evaluate` runs
in an isolated worker. The only ordering concern is *user intent*: if a
user adopts edge `foo` from message 3 and then renames `foo`, the rename
must happen after adoption completes. The pending region makes this
ordering visible — the user can see that adoption is still in flight.

### Visual design

```
┌─ transcript ──────────────────────────────────────┐
│                                                    │
│  (messages)                                        │
│                                                    │
├─ pending ─────────────────────────────────────────┤
│  ◐ dismiss #5                              2s ago  │
│  ◐ eval (source…)                          0s ago  │
│  ✓ adopt #3:VALUE → myval                  done    │
├────────────────────────────────────────────────────┤
│  [command bar]                                     │
└────────────────────────────────────────────────────┘
```

The pending region collapses to zero height when empty.

## Relationship to Commands as Messages

The pending region is a UI-only solution. It solves the immediate UX
problems (blocked input, invisible commands) without daemon changes, but
leaves a deeper asymmetry: the daemon's transcript (`followMessages()`)
records only inbound messages. Outbound commands are promises that settle
and vanish. There is no durable record that the user dismissed message 5
or adopted a value.

[daemon-commands-as-messages](daemon-commands-as-messages.md) proposes
modeling commands as self-addressed messages in the daemon's mail system,
with results as reply messages. If implemented, that design would subsume
the pending region — pending commands would simply be messages without
replies yet, rendered inline in the transcript. This design remains
valuable as the near-term solution and as a fallback if the daemon change
is deferred.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [chat-command-bar](chat-command-bar.md) | Command bar states and modeline that this design modifies |
| [daemon-commands-as-messages](daemon-commands-as-messages.md) | Deeper daemon-level solution that would subsume the pending region |

## Affected Packages

- `packages/chat/chat-bar-component.js` — remove `setSubmitting` gating,
  dispatch to pending region instead.
- `packages/chat/pending-commands.js` (new) — pending commands region
  component.
- `packages/chat/chat.css` — styles for pending cards, transitions.

## Prompt

> Please create a design document. In Chat, we see an indeterminate progress
> indicator for every issued command and this holds the command line until it
> succeeds or fails. We need to create a region at the end of the transcript
> that is a holding area for pending commands and their resolutions.
>
> It may be necessary to evaluate whether we can model all commands as
> messages are logged and where their results are replies. This is a more
> invasive but possibly necessary change to the daemon architecture.
