# Chat Markdown Render: Gap Analysis and Redesign

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-27 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Supersedes** | (replaces earlier revision of this document) |

## Motivation

The inline formatting parser in `packages/chat/markdown-render.js`
(`parseInline`, line 47) implements a Markdown-like subset with chip
interpolation support.
It diverges from CommonMark in several ways and lacks key features
that surface daily — especially when rendering LLM-generated output,
which relies heavily on standard Markdown.

The earlier revision of this document addressed word-boundary awareness
and a per-message render mode toggle.
This revision expands the scope to a full gap analysis against
CommonMark and GFM, proposes a delimiter realignment, and lays out a
phased implementation plan.

### Current delimiter mapping

| Delimiter | Current | CommonMark |
|-----------|---------|------------|
| `*text*` | bold (`<strong>`) | italic (`<em>`) |
| `**text**` | **broken** — produces `<strong>*text</strong>` | bold (`<strong>`) |
| `/text/` | italic (`<em>`) | not markup |
| `_text_` | underline (`<u>`) | italic (`<em>`) |
| `__text__` | not supported | bold (`<strong>`) |
| `~text~` | strikethrough (`<s>`) | (GFM) strikethrough |
| `` `text` `` | inline code | inline code |

### Current block-level support

- Headings (`#` through `######`)
- Code fences (` ``` ` with optional language tag)
- Unordered lists (`-` or `*` prefix)
- Ordered lists (`1.` or `1)` prefix)
- Paragraphs (default)

## Gap Analysis

### Gap 1 — `**bold**` double-asterisk syntax

**Priority: High.**
The most common bold syntax in Markdown and in LLM output.
The current regex `^\*([^*]+)\*` matches `**bold**` as
`<strong>*bold</strong>` (the inner `*` is captured as content).
Users writing standard Markdown bold get garbled output.

### Gap 2 — Delimiter semantics divergence

**Priority: High.**
The current `*` = bold and `_` = underline assignments conflict with
every Markdown user's muscle memory and with all LLM-generated
Markdown.

**Decision:** Align fully with CommonMark:

| Delimiter | New meaning |
|-----------|-------------|
| `*text*` | italic (`<em>`) |
| `**text**` | bold (`<strong>`) |
| `_text_` | italic (`<em>`) |
| `__text__` | bold (`<strong>`) |
| `~text~` | strikethrough (`<s>`) — GFM extension |
| `~~text~~` | strikethrough (`<s>`) — GFM extension |
| `` `text` `` | inline code — unchanged |
| `/text/` | **not markup** — retired |

Underline (`<u>`) is dropped entirely.
There is no standard Markdown delimiter for underline, and
repurposing any delimiter for it creates confusion.
If underline is needed in the future, it can be added via a
non-conflicting delimiter (e.g., `++text++` as in some Markdown
extensions) as a separate proposal.

Retiring `/text/` eliminates the largest class of false positives
(URLs like `https://example.com/foo/bar`).

### Gap 3 — Word-boundary awareness

**Priority: High.**
Inline delimiter regexes fire on any adjacent pair, causing false
positives:

- `1*2*3` → bold
- `snake_case_name` → underline (soon: italic)
- `a~b~c` → strikethrough

**Design:** Replace the regex-per-delimiter approach in `parseInline`
with a left-to-right state-machine scanner that enforces CommonMark
flanking delimiter run rules:

- **Left-flanking:** not followed by whitespace, and either not
  followed by punctuation or preceded by whitespace/punctuation.
- **Right-flanking:** not preceded by whitespace, and either not
  preceded by punctuation or followed by whitespace/punctuation.
- **`_` intraword restriction:** a left-flanking `_` run that is
  also right-flanking cannot open emphasis; a right-flanking `_` run
  that is also left-flanking cannot close emphasis.
  This prevents `foo_bar_baz` from triggering.
- **`*` has no intraword restriction** — `foo*bar*baz` does trigger
  emphasis, matching CommonMark.

The `\uE000` placeholder character (Unicode Private Use Area) should
be classified as a regular character (non-whitespace,
non-punctuation) for boundary purposes.

### Gap 4 — Tables (GFM)

**Priority: High.**
LLM responses frequently include pipe-delimited tables.
Without support, tables render as broken paragraph text.

**Syntax:**
```
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
```

**Design:**

- Add a `'table'` block type with `headerRow`, `alignments`, and
  `bodyRows` fields.
- Detection: when a line contains `|` and the next line matches
  `/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/`, begin a table block.
- The separator row determines column count and text alignment
  (`:--` left, `--:` right, `:--:` center).
- Each cell's content is run through `parseInline`, so chips,
  bold, italic, code, and links all work inside cells.
- Render as `<table class="md-table">` with `<thead>` and `<tbody>`.
- Rows that have fewer cells than the header get empty trailing cells;
  extra cells are discarded.

**Placeholder interaction:** A placeholder inside a cell is fine —
`parseInline` already tracks placeholder indices globally, and
cell-by-cell parsing preserves correct ordering as long as cells
are parsed left-to-right, top-to-bottom.

### Gap 5 — Multi-backtick code spans and code fences

**Priority: Medium-High.**
The current inline code regex `` /^`([^`]+)`/ `` supports only
single-backtick code spans and cannot contain literal backtick
characters.

**Inline code spans (CommonMark §6.1):**

CommonMark allows a code span to be opened by a run of N backticks
and closed by a matching run of exactly N backticks:

- `` `code` `` — single backtick (current behavior, preserved)
- ` `` code with `backtick` `` ` — double backtick span contains
  a literal single backtick
- ` ``` code with `` two `` ``` ` — triple backtick span contains
  literal double backticks

Rules:
- The opening run of N backticks scans forward for the next run of
  exactly N backticks; everything between is the code content.
- Leading and trailing single spaces are stripped if the content
  is not entirely spaces (allows `` ` `` ` `` to produce a literal
  backtick).
- No further inline parsing occurs inside code spans (no bold,
  italic, or placeholder detection).

**Code fences (CommonMark §4.5):**

The current code fence parser uses `` /^```(\w*)$/ `` which only
matches exactly three backticks.
CommonMark allows fences opened with N >= 3 backticks (or tildes),
closed by a line with >= N of the same character:

- ` ```` ` (4 backticks) opens a fence that can contain ` ``` `
  as literal content.
- ` ~~~~~ ` (5 tildes) opens a fence closed by ` ~~~~~ ` or more.

The closing fence must use the same character (`\`` or `~`) as the
opener and must have at least as many characters.

**Design:**
- Inline scanner: when a backtick is encountered, count the run
  length N. Scan forward for the next run of exactly N backticks.
  If found, emit a code token. If not found, emit the backticks as
  literal text.
- Block parser: detect fence openers with
  `` /^(`{3,}|~{3,})(\w*)$/ ``. Record the fence character and
  length N. Close when a line starts with N or more of the same
  character and nothing else follows.

### Gap 6 — Escape sequences

**Priority: Medium.**
No way to produce a literal `*`, `_`, `~`, or `` ` `` adjacent to
text without triggering formatting.

**Design:** When the scanner encounters `\` followed by an ASCII
punctuation character, emit the punctuation character as a literal
text token and advance past both characters.
This check must precede all delimiter matching.

CommonMark escapable characters:
`` \  `  *  _  {  }  [  ]  (  )  #  +  -  .  !  |  ~ ``

### Gap 7 — Links `[text](url)`

**Priority: Medium-High.**
Links are extremely common in chat and in LLM output.
Currently rendered as literal text.

**Design:**

- Inline pattern: `[` opens a link-text span.
  The scanner looks for a matching `]` (tracking bracket depth),
  then expects `(url)` or `(url "title")` immediately after.
- Link text is parsed recursively for inline formatting and
  placeholders (a chip inside link text is valid).
- Render as `<a class="md-link" href="url" target="_blank"
  rel="noopener noreferrer">`.
- **Security:** Only allow `https:`, `http:`, and `mailto:` schemes.
  Reject `javascript:`, `data:`, and anything else.
- Reference-style links (`[text][ref]`) are not worth implementing
  for chat.

**Autolinks:** Optionally detect bare `https://...` URLs (GFM
autolink extension) and wrap them in `<a>` with the same
`target="_blank" rel="noopener noreferrer"` attributes.
This can be deferred to a later phase.

### Gap 8 — Inline formatting nesting

**Priority: Medium.**
Content inside delimiters is currently captured as a flat string
(`[^*]+`) and set via `textContent`.
`**bold and *italic***` or `*italic and **bold***` don't work.

**Design:** The state-machine parser naturally supports nesting.
When a formatted span is closed, its content (a list of tokens
accumulated between opener and closer) may contain child formatted
spans.
The `Token` type gains an optional `children: Token[]` field.
`renderInlineTokens` recurses into children instead of setting
`textContent`.

**Placeholder interaction:** Critical — placeholders inside nested
spans must still produce `md-chip-slot` elements in the
`insertionPoints` array with correct indices.
The recursive renderer must propagate the shared `insertionPoints`
array, which it already does since `insertionPoints` is passed by
reference.

### Gap 9 — Blockquotes

**Priority: Medium.**
`> text` is common in conversational contexts and in LLM output.

**Design:**

- Lines starting with `> ` (or `>` for lazy continuation) are
  collected into a blockquote block.
- Strip the `> ` prefix and recursively parse the remaining text
  as blocks (enabling nested blockquotes and block-level content
  inside quotes).
- Render as `<blockquote class="md-blockquote">`.

### Gap 10 — Nested lists

**Priority: Medium.**
The current parser collects consecutive list items into a flat list,
ignoring indentation.
LLM output frequently uses nested lists.

**Design:**

- Track indentation depth for each list item.
- Items indented more than the current level become children of the
  preceding item.
- The `list-item` block type gains an optional `children: Block[]`
  for sub-lists.
- Indentation threshold: 2 spaces per level (CommonMark uses the
  list marker width, but a fixed 2-space threshold is simpler and
  sufficient for chat).

### Gap 11 — Horizontal rules

**Priority: Low.**
`---`, `***`, or `___` on a line by themselves.

**Design:** Block-level pattern `/^(\*{3,}|-{3,}|_{3,})\s*$/`.
Must be checked before list detection (since `***` could start an
unordered list).
Render as `<hr class="md-rule">`.

### Gap 12 — Images

**Priority: Low.** Deferred.
The chat app has its own blob/attachment system.
If implemented later, `![alt](url)` should render as a clickable
link rather than an inline image to avoid layout disruption.

### Gap 13 — Line breaks

**Priority: Low — no change needed.**
The current renderer converts every `\n` within a paragraph to
`<br>`.
CommonMark treats paragraph-internal newlines as soft breaks
(rendered as spaces).
The current behavior is correct and expected for a chat context —
users expect Enter to produce a visible line break.
This is a deliberate, documented divergence.

### Gap 14 — Raw HTML and entities

**Priority: Not recommended.**
Raw HTML in chat messages is a security risk (XSS).
The renderer correctly avoids this by using `textContent` for all
user-supplied strings.
Do not implement.

## Package Architecture

The markdown parser and renderer will be factored out of
`packages/chat` into a new standalone package, `@endo/markmdown`
(`packages/markmdown`).
This enables dedicated test fixtures, independent versioning,
and reuse beyond the chat application.

### `@endo/markmdown` — Pure parsing and rendering

A DOM-free, environment-agnostic package that owns the parser
(block and inline) and produces a structured AST.
It also provides a DOM renderer, but the parser can be consumed
independently.

```
packages/markmdown/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── index.js
├── src/
│   ├── parse-inline.js    — state-machine inline scanner
│   ├── parse-blocks.js    — block-level parser
│   ├── render-dom.js      — AST → DOM fragment renderer
│   └── types.js           — Token, Block, RenderResult typedefs
├── test/
│   ├── render.test.js     — fixture-driven: md → DOM → HTML
│   └── fixtures/
│       ├── md/            — input Markdown files
│       │   ├── emphasis.md
│       │   ├── bold.md
│       │   ├── code-spans.md
│       │   ├── code-fences.md
│       │   ├── headings.md
│       │   ├── lists.md
│       │   ├── nested-lists.md
│       │   ├── tables.md
│       │   ├── links.md
│       │   ├── blockquotes.md
│       │   ├── horizontal-rules.md
│       │   ├── escapes.md
│       │   ├── nesting.md
│       │   ├── boundaries.md
│       │   └── mixed.md
│       └── html/          — expected HTML output (same basenames)
│           ├── emphasis.html
│           ├── bold.html
│           ├── code-spans.html
│           ├── code-fences.html
│           ├── headings.html
│           ├── lists.html
│           ├── nested-lists.html
│           ├── tables.html
│           ├── links.html
│           ├── blockquotes.html
│           ├── horizontal-rules.html
│           ├── escapes.html
│           ├── nesting.html
│           ├── boundaries.html
│           └── mixed.html
└── README.md
```

### Test fixture convention

Each fixture is a pair of files sharing a basename:
`test/fixtures/md/<name>.md` and `test/fixtures/html/<name>.html`.

The test runner reads every `.md` file in `fixtures/md/`, parses it
with `parseBlocks`, renders the resulting AST to a DOM fragment via
`renderBlocks` (using `happy-dom`), serializes the fragment to HTML
with `fragment.innerHTML` (or equivalent), and compares the result
against the corresponding `.html` file.

This produces a **language-agnostic** fixture set: the `.md` and
`.html` files are plain text, trivially reviewable in any editor or
diff tool, and could be reused to validate an alternative
implementation.

The `.html` files contain the expected output exactly as produced
by `happy-dom` serialization (including attribute order and
whitespace), so they can be regenerated with a `--update` flag
when the renderer changes intentionally.

**Exports:**

```js
// packages/markmdown/index.js
export { parseInline } from './src/parse-inline.js';
export { parseBlocks } from './src/parse-blocks.js';
export { renderBlocks, renderInlineTokens } from './src/render-dom.js';
```

The package does **not** depend on `@endo/chat` or any chat-specific
code.
It has no dependency on `document` at the module level — the DOM
renderer accepts a `document` parameter or uses `globalThis.document`
as a default.
Test fixtures use `happy-dom` (already in the monorepo).

### Dependency injection: code highlighter

The DOM renderer accepts an optional `highlightCode` function via
an options bag:

```js
/**
 * @callback HighlightCode
 * @param {string} code - Raw source text
 * @param {string} language - Language tag from the fence (may be '')
 * @param {Document} document - DOM document for element creation
 * @returns {DocumentFragment} - Highlighted DOM fragment
 */

/**
 * @typedef {object} RenderOptions
 * @property {Document} [document] - DOM document
 *   (defaults to globalThis.document)
 * @property {HighlightCode} [highlightCode] - Code fence highlighter
 *   (defaults to built-in regex-based highlighter)
 */

renderBlocks(blocks, insertionPoints, options);
```

By default (when no `highlightCode` is provided), code fences
render as plain unhighlighted `<code>` blocks — correct and
readable, just unstyled.

`@endo/chat` injects a Monaco-backed highlighter:

```js
import { renderBlocks } from '@endo/markmdown';
import * as monaco from 'monaco-editor';

const highlightCode = (code, language, doc) => {
  // Use Monaco's tokenizer for rich multi-language highlighting
  // Return a DocumentFragment with Monaco-styled spans
};

renderBlocks(blocks, insertionPoints, { highlightCode });
```

This keeps `@endo/markmdown` free of any Monaco (or other editor)
dependency while letting consumers inject whatever highlighter they
have available.

**Placeholder handling:** The `\uE000` placeholder character is not
special to `@endo/markmdown`.
The inline parser treats it as a regular non-whitespace,
non-punctuation character, which means it passes through the parse
tree as literal text.
This is correct — the chat layer is responsible for placeholder
semantics.

### `@endo/chat` — Integration layer

`packages/chat` becomes a consumer of `@endo/markmdown`:

- `markdown-render.js` shrinks to a thin wrapper that calls
  `parseBlocks` and `renderBlocks` from `@endo/markmdown`, then
  walks the resulting DOM to find placeholder characters and replace
  them with `md-chip-slot` spans.
- Injects a Monaco-backed `highlightCode` into `renderBlocks` for
  rich syntax highlighting across all languages Monaco supports.
- `prepareTextWithPlaceholders` stays in `@endo/chat` (it is
  chat-specific).
- `renderPlainText` stays in `@endo/chat` but delegates inline
  parsing to `@endo/markmdown`.

**Dependency:** `@endo/chat` adds `"@endo/markmdown": "workspace:^"`
to its dependencies.

## Per-Message Render Mode Toggle

(Retained from earlier revision.)

Add a render mode selector to the timestamp tooltip on each message:

| Mode | Behavior |
|------|----------|
| **Markdown** | Default rendered view |
| **Literal** | Raw text, no formatting |
| **Preformatted** | Entire message in `<pre>` / monospace |

The selected mode is per-message and ephemeral (not persisted).

**Implementation:**

- Store mode in a `WeakMap<Element, 'markdown' | 'literal' |
  'preformatted'>`.
- On mode change, re-render the message body using the appropriate
  render function.
- The toggle is a small `</>` icon or segmented control inside the
  existing timestamp tooltip.

## Summary Table

| # | Gap | Priority | Implement? | Phase |
|---|-----|----------|------------|-------|
| 1 | `**bold**` | High | Yes | 1 |
| 2 | Delimiter realignment | High | Yes | 1 |
| 3 | Word boundaries | High | Yes | 1 |
| 4 | Tables | High | Yes | 2 |
| 5 | Multi-backtick code spans/fences | Medium-High | Yes | 1 |
| 6 | Escape sequences | Medium | Yes | 1 |
| 7 | Links | Medium-High | Yes | 2 |
| 8 | Inline nesting | Medium | Yes | 1 |
| 9 | Blockquotes | Medium | Yes | 3 |
| 10 | Nested lists | Medium | Yes | 3 |
| 11 | Horizontal rules | Low | Yes | 3 |
| 12 | Images | Low | Defer | — |
| 13 | Line breaks | — | Keep as-is | — |
| 14 | Raw HTML | — | No | — |

## Phased Implementation

### Phase 0 — Package scaffolding and extraction

Create `packages/markmdown` and move existing parsing/rendering code
out of `packages/chat/markdown-render.js`.

1. Scaffold `packages/markmdown` with `package.json`, `tsconfig.json`,
   `tsconfig.build.json`, and directory structure.
2. Move `parseInline`, `parseBlocks`, `renderInlineTokens`,
   `renderBlocks`, `highlightCode`, and type definitions into
   `packages/markmdown/src/`.
3. Rewrite `packages/chat/markdown-render.js` as a thin wrapper:
   imports from `@endo/markmdown`, adds placeholder/chip-slot logic.
4. Move and adapt existing tests from
   `packages/chat/test/unit/markdown-render.test.js` to
   `packages/markmdown/test/`.
5. Add `"@endo/markmdown": "workspace:^"` to `packages/chat`
   dependencies.
6. Verify existing chat tests still pass.

**Files:**
- `packages/markmdown/` — new package (all files)
- `packages/chat/markdown-render.js` — rewrite as wrapper
- `packages/chat/package.json` — add dependency
- `packages/chat/test/unit/markdown-render.test.js` — reduce to
  integration tests for chip interpolation

### Phase 1 — Inline parser rewrite

Rewrite `parseInline` in `packages/markmdown` as a state-machine
scanner.
This is the foundation for everything else.

1. Implement the left-to-right scanner with flanking delimiter run
   rules (Gap 3).
2. Support single and double delimiters: `*`/`**`, `_`/`__`, `~`/`~~`
   (Gaps 1, 2).
3. Multi-backtick inline code spans: run-length matching for
   `` ` ``, ` `` `` `, ` ``` `, etc. (Gap 5).
4. Multi-backtick/tilde code fences: N >= 3 opener, >= N closer of
   same character (Gap 5).
5. Produce nested `Token` trees; update `renderInlineTokens` to
   recurse (Gap 8).
6. Handle `\` escape sequences (Gap 6).
7. Build out test fixtures in `packages/markmdown/test/fixtures/`.

**Files:**
- `packages/markmdown/src/parse-inline.js`
- `packages/markmdown/src/parse-blocks.js` — code fence update
- `packages/markmdown/src/render-dom.js`
- `packages/markmdown/test/render.test.js`
- `packages/markmdown/test/fixtures/md/emphasis.md`, `bold.md`,
  `code-spans.md`, `code-fences.md`, `escapes.md`, `nesting.md`,
  `boundaries.md`
- `packages/markmdown/test/fixtures/html/` — corresponding `.html`

### Phase 2 — Tables and links

1. Add GFM table parsing to `parseBlocks` (Gap 4).
2. Add table rendering to `renderBlocks`.
3. Add `[text](url)` link parsing to the inline scanner (Gap 7).
4. Add CSS for `md-table`, `md-link` in `packages/chat`.

**Files:**
- `packages/markmdown/src/parse-blocks.js`
- `packages/markmdown/src/parse-inline.js`
- `packages/markmdown/src/render-dom.js`
- `packages/markmdown/test/fixtures/md/tables.md`, `links.md`
- `packages/markmdown/test/fixtures/html/tables.html`, `links.html`
- `packages/chat/style.css`

### Phase 3 — Block-level additions and render mode toggle

1. Add blockquote parsing and rendering (Gap 9).
2. Add nested list support (Gap 10).
3. Add horizontal rule detection (Gap 11).
4. Implement per-message render mode toggle in `packages/chat`.

**Files:**
- `packages/markmdown/src/parse-blocks.js`
- `packages/markmdown/src/render-dom.js`
- `packages/markmdown/test/fixtures/md/blockquotes.md`,
  `nested-lists.md`, `horizontal-rules.md`
- `packages/markmdown/test/fixtures/html/` — corresponding `.html`
- `packages/chat/inbox-component.js` — render mode toggle
- `packages/chat/style.css`

## Design Decisions

1. **Extract to `@endo/markmdown` package.** The parser and renderer
   are general-purpose and warrant dedicated test fixtures, independent
   versioning, and potential reuse beyond chat (e.g., markdown preview,
   agent output rendering).
   Placeholder/chip interpolation stays in `@endo/chat` as a thin
   integration layer.

2. **Align `*`/`_` with CommonMark.** Maximizes compatibility with
   LLM output and user expectations.
   The cost is a breaking change for existing messages using
   `*single*` for bold, but the current user base is small and the
   benefit is large.

3. **`__text__` = bold (full CommonMark alignment).**
   Underline is dropped entirely.
   There is no standard Markdown delimiter for underline, and
   repurposing any delimiter creates confusion.
   A non-conflicting extension (e.g., `++text++`) can be proposed
   separately if underline is needed later.

4. **Retire `/slash/` italic.**
   Slash is too common in URLs, file paths, and prose to be a
   reliable delimiter.
   With `*` and `_` available for italic, `/` is redundant.

5. **State-machine parser over layered regexes.**
   The current regex approach cannot handle double delimiters,
   nesting, escapes, or boundary rules without exponential
   complexity.
   A single-pass scanner handles all of these naturally.

6. **`\n` = hard break (diverge from CommonMark).**
   Chat users expect Enter to produce a line break.
   Requiring trailing spaces for hard breaks would be confusing.

7. **Dependency injection for code highlighting.**
   `@endo/markmdown` must not depend on Monaco or any editor library.
   The renderer accepts an optional `highlightCode` callback; without
   one, code fences render as plain unhighlighted text.
   `@endo/chat` injects Monaco's tokenizer at the call site.

8. **No raw HTML passthrough.**
   Security trumps completeness.
   The renderer uses `textContent` exclusively for user content.

## Known Gaps and TODOs

- [ ] Autolinks (bare URL detection) — deferred, can add in Phase 2
  or later.
- [ ] Image syntax — deferred indefinitely.
- [ ] Nested blockquotes — supported by the recursive design but
  may need depth-limiting for display.
- [ ] Task lists (`- [ ]` / `- [x]`) — GFM extension, low priority.

## Prompt

> In packages/chat, there is a utility that converts Endo messages
> into formatted HTML using conventions borrowed from Markdown, but
> with an affordance for interpolating chips (aka tokens) in the
> output. It diverges and falls short of Markdown in a few details.
> Please perform a gap analysis and propose a design (in
> designs/*.md) that will address those gaps, notably for tables and
> for divergence in behavior for certain markup at word boundaries.
> I believe we may also lack support for _underscore_. We also seem
> to be lacking **bold**.
