# Message Formatting (Quasi-Markdown)

Messages support a markdown dialect for rich text formatting.

## Block-level elements

- Headings: `# Heading 1` through `###### Heading 6`
- Code fences: `` ```language\ncode\n``` ``
- Unordered lists: `- item` or `* item`
- Ordered lists: `1. item` or `1) item`
- Paragraphs: Separated by blank lines

## Inline formatting (NOTE: differs from standard markdown!)

- Bold: `*text*` (single asterisks, NOT double)
- Italic: `/text/` (forward slashes, NOT asterisks)
- Underline: `_text_` (underscores)
- Strikethrough: `~text~` (tildes)
- Inline code: `` `code` `` (backticks)

## Examples

- Bold: `*important*` renders as **important**
- Italic: `/emphasis/` renders as _emphasis_
- Code: `` `const x = 1` `` renders as inline code

For multi-line code:

```
send("@host", ["Here is the implementation:\n```javascript\nfunction add(a, b) {\n  return a + b;\n}\n```"], [], [])
```
