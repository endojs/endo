---
'@endo/agentry': minor
'@endo/fae': minor
'@endo/lal': minor
---

Add an LLM-friendly edit-by-replacement tool to the Lal and Fae agents,
implementing the `endopi-edit-tool` design (modeled on Pi's edit tool).

The exact-string-replacement core is a new pure module, `@endo/agentry/edit-text`
(`applyEdits`, `computeUnifiedDiff`, `normalizeEdits`): it enforces a unique
match per `oldText`, rejects overlapping edits in a batch, matches against
LF-normalized text while restoring the file's original CRLF/BOM, and returns a
unified diff of the change. Fae exposes it as the `edit` tool (single
`oldText`/`newText` pair or an `edits` array), replacing the earlier
first-occurrence `editFile`. Lal exposes it as `editText`, operating on a tree
capability through the existing `readText`/`writeText` shape.
