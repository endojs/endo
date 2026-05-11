# Chat Focus Message Mode

| | |
|---|---|
| **Created** | 2026-03-04 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Active |
| **Supersedes** | `designs/chat-reply-chain-visualization.md` |

## Motivation

The previous reply-chain visualization (MOI layout) tried to automatically
infer which message was interesting and visualize reply trees around it.
This was complex and implicit.

Focus message mode takes a different approach: it provides a deliberate,
user-initiated mode for selecting a message and dispatching commands
against it. The focused message is **never** implicitly the head of a
reply chain — it simply pre-populates the `messageNumber` field when the
user invokes a command from focus mode.

**Goals:**
1. Let users quickly act on messages without mouse interaction
2. Pre-populate `messageNumber` fields for commands that need them
3. Visualize reply-chain structure around the focused message

## Entering Focus Mode

The user enters focus mode by pressing `⌘↑` (Cmd+ArrowUp on macOS,
Ctrl+ArrowUp elsewhere) when:
- The chat bar is in `send` mode
- The input is empty

On entry:
- Mode changes to `'focus'`
- The input is blurred
- The last message in the inbox is highlighted (receives `.focused` class)
- Reply-chain-aware indentation is computed (see **Indentation Algorithm**)
- A focus modeline appears showing available shortcut keys

Clicking a message also enters focus mode (or changes the focused
message if already in focus mode), provided the click is not intercepted
by an interactive element within the message.

## Navigation

While in focus mode, `↑` and `↓` arrow keys move the focus highlight
between messages. The focused message scrolls into view if needed.
`PageUp` and `PageDown` jump by roughly half a viewport, computed by
accumulating actual rendered message heights from the current position.

Pressing `↓` on the last message exits focus mode and returns to the
command line. This mirrors the entry gesture (`⌘↑` from the command
line) so the user can fluidly move between the transcript and input.

At the edges, the scroll container is scrolled to its limit directly
(rather than relying on `scrollIntoView`) to ensure the first/last
message aligns flush with the container boundary.

These are handled as global `keydown` events since the input is blurred.
The `⌘↑` entry gesture uses `stopPropagation()` on the input's keydown
to prevent the global handler from treating the same event as a
navigation action.

## Shortcut Keys

Single-letter keys enter a command with the focused message number
pre-filled:

| Key | Command | Description |
|-----|---------|-------------|
| `r` | `/reply` | Reply to the focused message |
| `d` | `/dismiss` | Dismiss the focused message |
| `a` | `/adopt` | Adopt a value from the focused message |
| `g` | `/grant` | Grant an eval-proposal |
| `s` | `/submit` | Submit values for a form |

These are the commands from `command-registry.js` that have a
`messageNumber` field and are common enough to warrant a single-key
shortcut.

When a shortcut key is pressed, the inline command form opens with the
`messageNumber` field pre-filled and focus advances to the next field
(typically the message body).

The modeline displays these as:
```
<kbd>r</kbd> reply  <kbd>d</kbd> dismiss  <kbd>a</kbd> adopt  <kbd>g</kbd> grant  <kbd>s</kbd> submit  <kbd>Esc</kbd> back
```

## Exiting Focus Mode

Pressing `Escape` exits focus mode:
- Mode returns to `'send'`
- The `.focused` class is removed from all messages
- The `.focus-active` class is removed from the messages container
- The input is re-focused

Pressing a shortcut key also exits focus mode (transitioning to the
inline command form with the message number pre-filled).

## Indentation Algorithm

When the focused message changes, the algorithm computes which messages
belong to the primary reply chain and indents all others.

### Primary chain

The chain is built by walking in both directions from the focused
message:

**Backward (ancestors):** Follow `replyTo` links from the focused
message upward. Each ancestor is added to the chain and un-indented.

**Forward (descendants):** From the focused message (and each subsequent
chain member), find the chronologically *last* reply. That reply joins
the chain and the search continues from it.

All messages not in the chain are indented by `4ex`.

### Chain lines

Non-indented chain members are connected by a vertical line in the
`2ex` gutter created by the indentation. Each envelope element gets a
class based on its role:

| Class | Line | Role |
|-------|------|------|
| `chain-start` | Bottom half | First chain member (connects downward) |
| `chain-through` | Full height | Middle chain member (connects both ways) |
| `chain-end` | Top half | Last chain member (connects upward) |
| `chain-tee` | Full height + horizontal stub | Indented message replying to a chain member (gutter-connected) |

Messages between consecutive chain members that are not tee-connected
get `chain-through` so the primary line passes through them
continuously.

### Indented message connections

Every indented message with a `replyTo` gets one of three visual
treatments based on adjacency:

1. **Gutter-connected** (`chain-tee`): The message replies to a
   non-indented chain member. It receives a horizontal stub from the
   primary gutter line at `2ex`. This is applied during chain line
   computation.

2. **Predecessor-connected** (`sub-start` / `sub-end` / `sub-through`):
   The message replies to the immediately adjacent indented envelope
   above it (both are indented). A vertical line at `6ex` (2ex into the
   4ex indent) connects them. If a message connects both upward to its
   parent and downward to its child, it gets `sub-through`.

3. **Reply indicator** (`sub-indicator`): The message has a `replyTo`
   but its parent is neither adjacent-and-indented nor a gutter-connected
   chain member. A short 6px stub at the top of the envelope at `6ex`
   indicates the reply relationship without drawing a long line.

Secondary connections are computed over all envelopes after indentation,
independent of the primary chain. They appear for every indented message
that has a `replyTo`.

## Visual Design

### Envelope structure

Each message is wrapped in a `.message-envelope` element with no
intermediate margin. The envelope carries `data-number`,
`data-message-id`, and `data-reply-to` attributes. Envelopes use
`padding: 4px 0` to center the message bubble, and chain/sub lines are
drawn as `background-image` gradients on the envelope so they span
continuously between messages.

### Focused message

The focused message stays at its normal position (no indentation) and
receives a ring highlight:
```css
.focus-active .message-envelope.focused .message {
  box-shadow: 0 0 0 2px var(--accent-primary);
}
```

### Indented messages

All non-chain messages are indented:
```css
.focus-active .message-envelope.indented .message {
  margin-left: 4ex;
}
```

### Line styling

Both primary and secondary lines use `--msg-sent-bg` color at `2px`
width. Primary lines run at `2ex`, secondary lines at `6ex` (the same
relative offset within the indented region). This keeps the visual
language consistent — the same color and weight at corresponding
positions within their respective gutter spaces.

## Data Model

Message envelopes carry three data attributes set during rendering
in `inbox-component.js`:
- `data-number` — the message number (used for command pre-fill)
- `data-message-id` — the message's unique ID (used for chain traversal)
- `data-reply-to` — the ID of the parent message (used for chain
  traversal and connection classification)

## Pre-fill Mechanism

`inline-command-form.js` accepts an optional `prefill` parameter on
`setCommand(name, prefill?)`. After rendering the form fields, any
matching field names in the prefill record are set as initial values.
The `focus(skipFilled)` method advances past pre-filled fields.

When a shortcut key is pressed in focus mode:
1. Read `data-number` from the `.focused` envelope element
2. Call `enterCommandMode(commandName, { messageNumber: number })`
3. The inline form renders with the message number already filled in
4. Focus advances to the next empty field

## Key Files

| File | Change |
|------|--------|
| `packages/chat/chat-bar-component.js` | Focus mode logic, keyboard handling, modeline, chain/connection algorithms |
| `packages/chat/inline-command-form.js` | `prefill` parameter on `setCommand`, `skipFilled` on `focus` |
| `packages/chat/inbox-component.js` | Envelope wrapping, `data-number`/`data-message-id`/`data-reply-to` |
| `packages/chat/index.css` | Envelope, focus, chain line, and connection styles |

## Out of Scope

- Automatic MOI selection
- Multi-message selection
- Arrowheads on chain lines
