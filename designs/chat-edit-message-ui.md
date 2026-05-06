# Chat Edit-Message UI Affordances

| | |
|---|---|
| **Created** | 2026-05-05 |
| **Updated** | 2026-05-05 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The daemon now exposes `editMessage` and `messageHistory` on every agent
(see [daemon-message-streaming](daemon-message-streaming.md), implemented
in
[endojs/endo-but-for-bots#23](https://github.com/endojs/endo-but-for-bots/pull/23)).
The capability is general: any sender, human or LLM, can replace the
interior of a message it previously sent and the recipient can inspect
the revision history.

The Chat UI does not yet expose any of this.
A user who notices a typo in a message they have already sent has no way
to correct it without dismissing and resending, which breaks the
reply-to chain and the recipient's dismissal state.
Agents implemented as guests of the local user can call `editMessage`
through the daemon, but the user driving the Chat client is denied the
same affordance.
This design closes that gap with three coordinated entry points
(keybinding, hover button, slash command) that compose with the existing
focus-mode and command-bar conventions.

## Design

### Authority

Edit affordances are visible only on messages whose `sender` matches the
current profile.
The daemon enforces sender-only edit authority
(see the dependency table); the UI mirrors that check so the affordance
is not even offered for messages the user could not edit.

### Slash command: `/edit`

A new entry in `command-registry.js`, dispatched through the existing
inline command form (see [chat-command-bar](chat-command-bar.md) §
"Inline Command Form"):

| Field | Type | Notes |
|---|---|---|
| `referent` | message identifier | Required. The outbox message to edit. |

`/edit` takes a single argument: the referent of the message to edit.
The command overloads on the type of the referent (a message number
when invoked from the command bar, an envelope reference when invoked
through focus mode or the hover button), the way other commands in
[chat-command-bar](chat-command-bar.md) overload on referent type.
The referent field reuses the existing message-picker component
(see [chat-components](chat-components.md) § "Message Components").

The new body is not a separate command argument.
Once the referent resolves to an editable message, the inline form
opens a body editor reusing `send-form.js` so embedded `@petName`
tokens work exactly as they do in a fresh send: type `@`, pick a
reference from the autocomplete, get a chip in the body.

When the form opens, the body field is pre-populated with the current
message's payload (Markdown text plus token chips for any embedded
references the original carried).
The user edits in place; pressing `Enter` calls
`E(currentProfile).editMessage(number, payload, { done: true })`
with the rebuilt payload.

The slash-command name is `/edit`.
This collides with the modal Monaco editor verb proposed in
[chat-view-edit-commands](chat-view-edit-commands.md), which targets
blob entries rather than inbox messages.
Resolution options are listed in **Open questions** below.

### Focus-mode shortcut: `e`

[chat-focus-message](chat-focus-message.md) already binds single-letter
keys against the focused message and lists `r d a g s` as the existing
shortcut set.
This design adds:

| Key | Command | Description |
|---|---|---|
| `e` | `/edit` | Edit the focused message (only when sender matches the current profile) |

The dispatch path is identical to the other focus shortcuts:
read `data-number` from the focused envelope, call
`enterCommandMode('edit', { referent })`, and let the inline form
take over.
When the focused message is not editable by the current user, `e` is a
no-op and is omitted from the focus modeline.

The `e` letter is unused by `/edit`'s siblings in
[chat-view-edit-commands](chat-view-edit-commands.md), which proposes
binding `e` to the blob editor only when the focused value resolves to
a blob.
The two shortcuts are disambiguated by what the focus is on: a message
envelope versus a blob value chip inside that message.
The blob-editor binding fires only when the focus is on a value, not on
a message envelope.

### Hover affordance: edit button

When a message envelope is hovered and the message is editable by the
current user, a small pencil button appears in the same affordance row
as the existing dismiss `×` button on outgoing messages.
Click invokes the same dispatch path as the `e` keybinding.

The button is keyboard-reachable through normal Tab order for users who
do not enter focus mode, mirroring the manual-equivalent pattern in
[chat-command-bar](chat-command-bar.md) § "Keyboard Actions".
On touch platforms the button is always visible (hover does not exist).

### Edit while in flight

`editMessage` is an ordinary eventual send; the user may issue a second
`/edit` against the same message number while a prior edit is still in
flight.
The Chat UI does not gate this.
The daemon's revision log is append-only and the recipient resolves
ordering from the revision timestamps, so a "racing edits from the same
sender" scenario degrades to "the last edit wins" rather than to a
broken envelope.

While an edit is in flight, the message envelope renders with a faint
"saving" affordance (the same indeterminate-progress style used for
not-done messages, per [daemon-message-streaming](daemon-message-streaming.md)).
The affordance clears when the edit settles.

### Surfacing edit history

A message that has been edited at least once carries an `edited
<timestamp>` caption in its envelope footer, where `<timestamp>` is
the time of the most recent edit.
The caption replaces (rather than supplements) the original send
timestamp, since a reader who wants the original time can open the
revision panel.
Hover or click on the caption opens a revision panel that calls
`E(currentProfile).messageHistory(number)` and renders the array
oldest-first:

```
┌───────────────────────────────────────────────┐
│  Revisions of #42                       [×]   │
├───────────────────────────────────────────────┤
│  2026-05-05 14:31:02   (done)   <body>        │
│  2026-05-05 14:30:58            <body>        │
│  2026-05-05 14:30:55            <body>  ← now │
└───────────────────────────────────────────────┘
```

Each revision renders its payload through the same Markdown-and-tokens
pipeline as the live envelope (see
[chat-markdown-render](chat-markdown-render.md)).
The current revision is marked.
The panel is read-only; restoring a prior revision is just another
`/edit` against the latest body.

### Interaction with focus chains

Editing a message does not change its `messageId`, its `replyTo`
linkage, or its message number.
The reply-chain visualization in
[chat-focus-message](chat-focus-message.md) is unaffected.
The focused message stays focused across an edit.
If the user edits the focused message, the envelope re-renders with
the new body but retains the `.focused` class and ring highlight.

### Modeline updates

The send-mode modeline gains no new entries (edit is reachable only
through focus mode or hover).

The focus-mode modeline appends `e` to the shortcut row, conditional on
the focused message being editable by the current user:

```
<kbd>r</kbd> reply  <kbd>d</kbd> dismiss  <kbd>a</kbd> adopt  <kbd>g</kbd> grant  <kbd>s</kbd> submit  <kbd>e</kbd> edit  <kbd>Esc</kbd> back
```

The inline-command-form modeline for `/edit` matches the existing
form-mode modeline pattern (`Enter submit · Tab next field · Esc
cancel`).

## Dependencies

| Design | Relationship |
|---|---|
| [daemon-message-streaming](daemon-message-streaming.md) | Provides the `editMessage` and `messageHistory` methods this UI calls. Implemented in [endojs/endo-but-for-bots#23](https://github.com/endojs/endo-but-for-bots/pull/23). |
| [chat-command-bar](chat-command-bar.md) | `/edit` registers as an inline command form; reuses the message-referent and embedded-token field types. |
| [chat-focus-message](chat-focus-message.md) | `e` is an additional focus-mode shortcut; identical dispatch shape. |
| [chat-components](chat-components.md) | Reuses `send-form.js`, `message-picker.js`, `markdown-render.js`. |
| [chat-markdown-render](chat-markdown-render.md) | Revision history rendering reuses the Markdown pipeline. |
| [chat-view-edit-commands](chat-view-edit-commands.md) | Sibling design; competes for the `e` keybinding and the `/edit` slash-command name. See **Open questions**. |

## Design decisions

1. **Edit time-window: indefinite.**
   `/edit` is available whenever the daemon accepts the call.
   The daemon imposes no window, and the UI imposes none either.
   A UI-only window (for example, "edit only the most recent message"
   or "within 5 minutes") would simplify the affordance but limits
   correction of long-tail typos, and the maintainer chose unbounded
   editability.

2. **Edit is hidden until the message settles.**
   When the focused message is a not-done message produced by the
   local user (rare but possible if the user is driving an agent
   that streams), `/edit` is not offered.
   The streaming sender owns the message during a streaming session,
   and manual edits during a stream race the agent's own edits.
   The button and shortcut are hidden until the message settles
   (`done: true`).

3. **Pre-populate from the model, not the DOM.**
   The edit form pre-populates the body field from the original
   `strings` payload (the last entry in `messageHistory`), not from
   the rendered DOM.
   The model is the source of truth, so a round-trip no-op edit is
   byte-equivalent.
   Markdown that did not survive a render round-trip (raw HTML
   escapes, non-canonical whitespace) is preserved.

4. **Embedded-token resolution: chip carries the locator, not the
   stale pet name.**
   If an embedded token in the original body refers to a pet name
   that has since been renamed or removed in the sender's namespace,
   the edit form renders the token as a chip carrying the underlying
   locator/identifier, not the (possibly stale) pet name.
   The locator/identifier is the source of truth for the reference;
   the inventory's pet name is orthogonal.
   The user can replace the chip with a fresh `@`-completion if the
   reference is wrong.

## Open questions

1. **Slash-command name collision with blob editing.**
   [chat-view-edit-commands](chat-view-edit-commands.md) reserves
   `/edit` for opening a Monaco editor on a blob entry.
   Three resolutions:
   (a) Rename one of the two; candidates include `/revise`, `/amend`,
   `/edit-message` for this design or `/open` for the blob editor.
   (b) Overload `/edit` and dispatch on the type of the first argument
   (a message number versus a pet name path).
   (c) Ship this design first and rename the blob editor when that
   design lands.
   The maintainer should pick.

2. **Visibility of edit history to other participants.**
   The daemon retains revision history per message and surfaces it
   through `messageHistory`, but it is unclear whether the recipient's
   Chat UI should also display the "edited" annotation and offer the
   revision panel.
   Arguments for: transparency; recipients deserve to know that the
   text they see has changed.
   Arguments against: an agent may make many small "thinking..."
   revisions during a streaming response, and exposing all of them as
   a clickable history clutters the inbox.
   A middle ground: always show "edited" but only expose the revision
   panel for messages that were ever settled (`done: true`) and then
   re-edited.

## Related: Chat parity gap for proposed names

The decision that embedded-token chips carry the locator/identifier
rather than the pet name (Design Decision 4) surfaces an existing
parity gap between Chat and the CLI: Chat has no affordance for
proposing a name that is not the addressee's pet name for the
referent, whereas the CLI does.

A previously suggested resolution treats `:` as a special key inside
the `@`-completion to enter a different proposed name from the pet
name; pressing `:` again would escape, allowing a literal colon in
the petname.
That suggestion was lost in the shuffle and warrants its own design
document.
This is a follow-up for a designer rather than a question to be
resolved in this design; the chat-edit affordance is correct as
specified above and does not depend on the resolution of the
parity-gap design.

## Prompt

> Please dispatch a designer to produce a follow-up design for the
> Chat user interface modifications that will let any Endo agent edit
> messages they previously sent.
> That should include an "e" keybinding when focused on a message,
> an edit button that appears when hovered over a message,
> an Edit command that notes a message number and enables the user to
> edit the message and embedded tokens.

Source: kriskowal's review on
[endojs/endo-but-for-bots#23](https://github.com/endojs/endo-but-for-bots/pull/23)
at 2026-05-05 03:35:29 UTC.
