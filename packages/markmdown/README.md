# `@endo/markmdown`

A Markdown subset parser and DOM renderer with support for
dependency-injected code highlighting.
Named for Mark Miller (MarkM).

Parses a useful subset of CommonMark and GFM into a block/inline
AST, then renders that AST to a `DocumentFragment`.
The parser is environment-agnostic; the renderer accepts a
`document` parameter so it works with any DOM implementation
(browser, happy-dom, jsdom).

## Install

```sh
npm install @endo/markmdown
```

## Usage

```js
import { parseBlocks, renderBlocks } from '@endo/markmdown';

const blocks = parseBlocks('# Hello **world**');
const fragment = renderBlocks(blocks);
document.body.appendChild(fragment);
```

### With a custom code highlighter

By default, code fences render as plain unhighlighted `<code>`
blocks.
Pass a `highlightCode` callback to inject your own highlighter:

```js
import { parseBlocks, renderBlocks } from '@endo/markmdown';

const fragment = renderBlocks(parseBlocks(text), {
  highlightCode(code, language, doc) {
    // Return a DocumentFragment with highlighted spans
    const frag = doc.createDocumentFragment();
    // ... your highlighting logic ...
    return frag;
  },
});
```

### With a non-browser DOM

```js
import { Window } from 'happy-dom';
import { parseBlocks, renderBlocks } from '@endo/markmdown';

const window = new Window();
const blocks = parseBlocks('*emphasis* and **strong**');
const fragment = renderBlocks(blocks, { document: window.document });
```

### Parsing inline content only

```js
import { parseInline, renderInlineTokens } from '@endo/markmdown';

const tokens = parseInline('**bold** and `code`');
const fragment = renderInlineTokens(tokens, document);
```

## Supported syntax

### Inline

| Syntax | Renders as |
|--------|-----------|
| `*text*` | `<em>` (italic) |
| `**text**` | `<strong>` (bold) |
| `_text_` | `<em>` (italic) |
| `__text__` | `<strong>` (bold) |
| `~text~` | `<s>` (strikethrough) |
| `~~text~~` | `<s>` (strikethrough) |
| `` `code` `` | `<code>` (inline code) |
| ` `` code `` ` | Multi-backtick code span |
| `[text](url)` | `<a>` (link, opens in new tab) |
| `\*` | Literal `*` (escape) |

Delimiter recognition follows CommonMark flanking rules:
`foo_bar_baz` does not trigger emphasis, but `foo*bar*baz` does.

### Block

| Syntax | Renders as |
|--------|-----------|
| `# Heading` | `<h1>` through `<h6>` |
| ` ``` ` | Fenced code block (`<pre><code>`) |
| ` ~~~ ` | Tilde code fence |
| `- item` | Unordered list |
| `1. item` | Ordered list |
| Indented sub-items | Nested lists |
| `> text` | Blockquote |
| `---` | Horizontal rule |
| `\| a \| b \|` | GFM table |

Code fences support N >= 3 backticks or tildes; a fence opened
with 4 backticks can contain triple-backtick content.

## Deliberate divergences from CommonMark

- **`\n` = hard break.**
  Newlines within a paragraph produce `<br>`, matching chat
  conventions.
  CommonMark treats them as soft breaks.
- **No raw HTML passthrough.**
  All user content is set via `textContent` to prevent XSS.
- **Link security.**
  Only `https:`, `http:`, and `mailto:` URLs are allowed.
  `javascript:` and `data:` URLs are rejected.

## API

### `parseInline(text): Token[]`

Parse inline formatting into a token tree.

### `parseBlocks(text): Block[]`

Parse block-level structures (headings, lists, tables, code
fences, blockquotes, paragraphs, horizontal rules).

### `renderInlineTokens(tokens, document): DocumentFragment`

Render an inline token array to DOM.

### `renderBlocks(blocks, options?): DocumentFragment`

Render a block array to DOM.

Options:

| Option | Type | Default |
|--------|------|---------|
| `document` | `Document` | `globalThis.document` |
| `highlightCode` | `(code, language, document) => DocumentFragment` | Plain text |

## Testing

```sh
cd packages/markmdown
npx ava
```

Tests are fixture-driven: each `test/fixtures/md/<name>.md` file
is parsed, rendered to HTML via happy-dom, and compared against
the corresponding `test/fixtures/html/<name>.html` file.
