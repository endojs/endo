# Chat /view and /edit Commands

| | |
|---|---|
| **Created** | 2026-03-21 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The Chat UI can display values and navigate directory trees in the
inventory panel, but there is no way to *view* or *edit* the content
of blobs from within Chat.
Users who want to read a file must use the CLI (`endo cat`) or check
it out to the local filesystem.
Users who want to edit must round-trip through the filesystem and
write back.

Two new commands — `/view` and `/edit` — would let users inspect and
modify blob content directly in the Chat interface.
This is especially useful for agents that produce text artifacts
(code, configuration, prose) that users want to review or tweak
without leaving the conversation.

## Design

### Commands

| Command | Mode | Fields | Effect |
|---------|------|--------|--------|
| `/view` | Modal | `petNamePath` | Opens a read-only viewer for the blob at the given path |
| `/edit` | Modal | `petNamePath` | Opens a Monaco editor for the blob at the given path |

Both commands accept a pet name path that resolves to a blob
(a `ReadableBlob`, `SnapshotBlob`, or a blob entry within a
`ReadableTree` or `Directory`).
Path resolution follows the existing convention: slash-separated
segments where the first segment is a pet name in the current
profile's namespace and subsequent segments navigate into trees.

### Viewer panel

`/view` opens a modal panel with the blob's content rendered
read-only.
The viewer selects a rendering mode based on content type:

| Content type | Renderer |
|--------------|----------|
| Plain text, source code | Monaco editor in read-only mode |
| Markdown | Synchronized two-panel layout (source + rendered preview) |
| JSON | Monaco with JSON language mode, read-only |
| Images (future) | `<img>` element from base64 stream |

Content type is inferred from the pet name path's extension
(`.md`, `.js`, `.json`, etc.) or, when available, from metadata
on the blob.
When the extension is ambiguous or absent, the viewer defaults to
plain text.

### Editor panel

`/edit` opens a modal panel with a Monaco editor pre-loaded with
the blob's content.
The editor supports saving changes back to the blob:

1. **Mutable blobs** (entries in a `Directory` or writable mount) —
   the save action calls `write()` on the parent directory with
   the updated content.
2. **Immutable blobs** (`ReadableBlob`, `SnapshotBlob`) — the save
   action creates a new blob formula via the daemon and offers to
   store it under a pet name.
   The original blob is unchanged (content-addressed immutability).

The editor panel includes:
- A header showing the pet name path and a content type indicator.
- A save button (or `Cmd/Ctrl+S` shortcut) that writes changes.
- A close button that warns on unsaved changes.

### Markdown: synchronized render panel

Markdown files (`.md` extension) get special treatment in both
`/view` and `/edit`:

- **`/view`** renders Markdown as formatted HTML by default, with
  a toggle to show the raw source.
- **`/edit`** uses a side-by-side layout: Monaco editor on the left,
  live-rendered HTML preview on the right.
  The preview updates on every edit (debounced).
  Scroll position is synchronized between the two panels so that
  the preview tracks the cursor's location in the source.

The Markdown renderer reuses the same rendering pipeline as Chat
message display (from `chat-markdown-render`), ensuring consistent
styling and security (sanitized HTML, no script execution).

This two-panel layout is the most complex part of the design.
It can be delivered incrementally: an initial implementation can
render Markdown as plain text in Monaco and add the synchronized
preview in a follow-up phase.

### Panel layout

The viewer and editor open as modal overlays, consistent with the
existing eval form modal and help modal patterns.
The modal uses a wider layout than the standard command modals to
give the editor comfortable horizontal space:

```
┌─────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────┐ │
│ │ header: path, type, [save] [close]      │ │
│ ├─────────────────────────────────────────┤ │
│ │                                         │ │
│ │  Monaco editor / viewer                 │ │
│ │  (or split: editor | preview)           │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

For the Markdown split view:

```
┌─────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────┐ │
│ │ header: path, type, [save] [close]      │ │
│ ├────────────────────┬────────────────────┤ │
│ │                    │                    │ │
│ │  Monaco editor     │  Rendered preview  │ │
│ │  (source)          │  (HTML)            │ │
│ │                    │                    │ │
│ └────────────────────┴────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Loading blob content

Both commands load content by resolving the pet name path to a
capability and calling `text()` on the resulting blob:

1. Resolve the first path segment as a pet name in the current
   profile's namespace.
2. If the result is a tree or directory, call `lookup()` with the
   remaining path segments.
3. Call `text()` on the resolved blob to get the content as a string.

For save in `/edit`, the inverse: call `write()` on the parent
directory with the entry name and new content, or create a new
`readable-blob` formula for immutable blobs.

### Integration with focus mode

When a message in the transcript contains a value that resolves to
a blob, the focus mode shortcuts extend:

- `v` → `/view` (pre-fills the pet name path from the focused
  value's name)
- `e` → `/edit` (same pre-fill)

These shortcuts only appear when the focused value is a blob or a
directory entry that resolves to a blob.

## Phases

1. **Phase 1: `/view` with plain text** — modal viewer, Monaco in
   read-only mode, content loaded via `text()`.
   No content-type inference beyond "text".
2. **Phase 2: `/edit` with mutable save** — Monaco editor with
   save-back to writable directories.
   Immutable blobs get "save as new" behavior.
3. **Phase 3: Content type inference** — extension-based language
   mode selection for Monaco (`.js`, `.json`, `.ts`, `.py`, etc.).
4. **Phase 4: Markdown preview** — synchronized two-panel layout
   for `.md` files, reusing the chat Markdown renderer.
   Scroll synchronization.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [chat-command-bar](chat-command-bar.md) | Command registration and modal dispatch |
| [chat-markdown-render](chat-markdown-render.md) | Markdown rendering pipeline reused for preview |
| [chat-focus-message](chat-focus-message.md) | Focus mode shortcut integration |
| [daemon-mount](daemon-mount.md) | Writable directory entries for `/edit` save |
| [daemon-checkin-checkout](daemon-checkin-checkout.md) | `ReadableTree` blob access patterns |

## Design Decisions

1. **Modal overlay, not an embedded panel.**
   Editing and viewing are focused tasks that benefit from maximum
   screen space.
   A modal can be dismissed to return to the conversation, whereas
   a persistent panel would compete with the transcript and
   inventory for space.

2. **Reuse Monaco, not a new editor.**
   The codebase already integrates Monaco for the eval form.
   Reusing it avoids a second editor dependency and provides
   familiar keybindings.

3. **Markdown split view is phased separately.**
   Synchronized scroll between an editor and a rendered preview is
   non-trivial (line-to-element mapping, variable-height rendered
   blocks).
   Deferring it to Phase 4 lets the core `/view` and `/edit`
   commands ship without this complexity.

4. **Immutable blobs produce new formulas on save.**
   Content-addressed storage is append-only by design.
   Editing a `ReadableBlob` creates a new blob rather than
   violating immutability.
   The user is prompted to name the new blob.

5. **Content type from extension, not MIME sniffing.**
   Blobs in Endo do not carry MIME metadata.
   Extension-based inference is simple, predictable, and matches
   how Monaco selects language modes.

## Prompt

> Design Chat /view and /edit commands that operate on directory
> entries that correspond to blobs.
> These would open a viewer or Monaco editor.
> Allow for the possibility this could be complicated for Markdown in
> particular, which would enjoy a synchronized render panel.
