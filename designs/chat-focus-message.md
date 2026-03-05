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
3. Keep the implementation minimal — no tree visualization, no layout algorithm

## Entering Focus Mode

The user enters focus mode by pressing `⌘↑` (Cmd+ArrowUp on macOS,
Ctrl+ArrowUp elsewhere) when:
- The chat bar is in `send` mode
- The input is empty

On entry:
- Mode changes to `'focus'`
- The input is blurred
- The last message in the inbox is highlighted (receives `.focused` class)
- All other messages are indented (parent receives `.focus-active` class)
- A focus modeline appears showing available shortcut keys

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

## Visual Design

### Focused message
The focused message stays at its normal position (no indentation) and
receives a subtle background highlight:
```css
.focus-active .message.focused {
  margin-left: 0;
  background: var(--focus-bg, rgba(59, 130, 246, 0.08));
}
```

### Non-focused messages
All other messages are indented to visually distinguish them:
```css
.focus-active .message {
  margin-left: 4ex;
  transition: margin-left 150ms ease;
}
```

## Data Model

Message elements carry a `data-number` attribute set during rendering
in `inbox-component.js` (and `channel-component.js` already uses
`data-message-id`). Focus mode reads this attribute to determine which
message number to pre-fill.

## Pre-fill Mechanism

`inline-command-form.js` accepts an optional `prefill` parameter on
`setCommand(name, prefill?)`. After rendering the form fields, any
matching field names in the prefill record are set as initial values.

When a shortcut key is pressed in focus mode:
1. Read `data-number` from the `.focused` message element
2. Call `enterCommandMode(commandName)` with prefill `{ messageNumber: number }`
3. The inline form renders with the message number already filled in

## Key Files

| File | Change |
|------|--------|
| `packages/chat/chat-bar-component.js` | Focus mode logic, keyboard handling, modeline |
| `packages/chat/inline-command-form.js` | `prefill` parameter on `setCommand` |
| `packages/chat/inbox-component.js` | Add `data-number` to `.message` elements |
| `packages/chat/index.css` | `.focused`, `.focus-active` styles |

## Out of Scope

- Reply chain visualization (deprecated)
- Automatic MOI selection
- Tree/thread layout algorithms
- Multi-message selection
