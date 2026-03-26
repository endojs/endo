# Chat Markdown Render Improvements

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |

## Motivation

The inline formatting parser in `packages/chat/markdown-render.js`
(`parseInline`, line 48) uses simple greedy regex patterns like
`/^\*([^*]+)\*/` for bold and `/^\/([^/]+)\//` for italic. These patterns
match delimiter characters anywhere, including in the middle of URLs, file
paths, and arithmetic expressions. For example:

- `https://example.com/foo/bar` — the slashes trigger italic
- `1*2*3` — the asterisks trigger bold
- `snake_case_name` — the underscores trigger underline

Additionally, there is no way for a user to view the raw text of a message
when formatting produces an incorrect rendering.

**Goals:**
1. Make inline delimiter recognition boundary-aware so formatting only
   triggers at natural word boundaries.
2. Provide a per-message toggle to switch between rendered and raw display
   modes.

## 1. Word-Boundary-Aware Inline Delimiters

Require that opening delimiters appear at a word boundary: preceded by
whitespace (or start of string/line) and followed by a non-space character.
Closing delimiters must be preceded by a non-space character and followed by
whitespace, punctuation, or end of string/line. This matches the conventions
of CommonMark emphasis parsing (though we don't need full CommonMark
compliance).

Rough shape of the improved pattern for bold (`*`):

```
(?<=^|[\s(])\*(?=\S)  ...content...  (?<=\S)\*(?=$|[\s.,;:!?)])
```

The same principle applies to `/` (italic), `_` (underline), and `~`
(strikethrough). Backtick-delimited code spans should remain unchanged since
backticks are unambiguous.

This is best implemented as a small state-machine parser rather than layered
regexes, so that we can correctly handle nesting and overlapping delimiters.
The parser should:

- Scan left-to-right, tracking potential openers and their positions.
- When a closer is found that matches an opener, emit a formatted span.
- Discard unmatched openers as literal text.
- Reject delimiter runs that don't satisfy the boundary rules.

## 2. Per-Message Render Mode Toggle

Add a render mode selector to the timestamp tooltip on each message. The
three modes are:

| Mode            | Behavior                                     |
|-----------------|----------------------------------------------|
| **Markdown**    | Current behavior (default)                   |
| **Literal**     | Display the raw text with no formatting       |
| **Preformatted**| Wrap the entire message in `<pre>` / monospace|

The selected mode is per-message and ephemeral (not persisted). The toggle
can be a small icon row or segmented control inside the existing timestamp
tooltip, since that tooltip already appears on hover/tap and is a natural
place for message-level actions.

### Implementation

- Store a `renderMode` property on the message DOM element (or a
  `WeakMap<Element, 'markdown' | 'literal' | 'preformatted'>`).
- When the mode changes, re-render the message body using the appropriate
  path: `renderMarkdown` for markdown, `renderPlainText` (with escaping) for
  literal, or a new `renderPreformatted` for preformatted.
- The toggle should be unobtrusive — a single icon (e.g. `</>`) that cycles
  modes, or three small icons, is sufficient.

## Files Affected

- `packages/chat/markdown-render.js` — parser rewrite (change 1), new
  `renderPreformatted` export (change 2)
- `packages/chat/inbox-component.js` — render mode toggle in tooltip,
  re-render on mode change (change 2)
- `packages/chat/test/unit/markdown-render.test.js` — new boundary-aware
  test cases (change 1)
- `packages/chat/style.css` — styles for the mode toggle and preformatted
  rendering (change 2)
