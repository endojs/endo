# @endo/monaco-wrapper

A thin, lazy-loaded wrapper around
[`monaco-editor`](https://www.npmjs.com/package/monaco-editor) for use in the
Endo chat client and its Spaces.

The `monaco-editor` package is browser-only and heavy, so this module imports it
dynamically on first use rather than at module-evaluation time.

## Exports

- `detectTheme()` — resolve the active light/dark theme for the editor.
- `createMonacoEditor(...)` — create a configured Monaco editor instance
  mounted on a host element.
- `colorize(text, language)` — colorize a snippet to HTML without a live
  editor.
