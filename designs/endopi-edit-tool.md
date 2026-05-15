# EndoPi: LLM-Friendly Edit Tool

| | |
|---|---|
| **Created** | 2026-05-15 |
| **Updated** | 2026-05-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Parent** | [endopi](endopi.md) |

## Motivation

LLM-driven coding agents perform most of their file mutations as
"replace this exact string with this other string" rather than as
whole-file writes. Whole-file `write` either truncates unintended
content or forces the model to re-emit the entire file, which is
token-expensive and error-prone for large files. The dominant solution
across modern coding harnesses (Claude Code, Codex, Pi, Cursor) is an
*edit* tool with two arguments: `oldText` (a unique snippet to replace)
and `newText` (the replacement), with optional batching of multiple
edits per call.

Endo's [daemon-agent-tools](daemon-agent-tools.md) design lists
`readFile` and `writeFile` but no edit-by-replacement primitive. The
[cli-edit-verb](cli-edit-verb.md) design addresses the *human-on-CLI*
case (hashline patches) but is not the shape LLMs use today.

## Design

Add an `edit` tool to Lal and Fae that operates on a `File` capability,
modeled on Pi's `coding-agent/src/core/tools/edit.ts`.

### Tool surface

```js
const editSchema = M.interface('EditTool', {
  edit: M.callWhen(
    M.string(),                     // file pet name / path within Dir
    M.arrayOf(
      M.splitRecord({
        oldText: M.string(),        // unique match
        newText: M.string(),
      }),
    ),
  ).returns(M.record()),            // { applied, diff, conflicts }
});
```

### Semantics borrowed from Pi

- **Unique match required.** If `oldText` matches more than once in the
  file, the tool returns an error naming the conflict; the agent must
  add disambiguating context. (Pi's `applyEditsToNormalizedContent`
  enforces this.)
- **No overlap between edits in one call.** Concurrent edits in a single
  call must not target overlapping byte ranges; conflicts are returned
  as a structured error.
- **Line-ending preservation.** The tool normalizes to LF for matching,
  then restores the file's original line endings (`detectLineEnding`,
  `restoreLineEndings`) when writing. BOM is preserved if present.
- **Structured diff in the tool result.** The tool returns a unified
  diff of the applied changes. The Chat UI renders it inline; the LLM
  sees it as confirmation.

### Capability shape

The `edit` tool is itself a method on the `File` capability (or on a
helper exo that takes a `File`), not on the `Dir`. This is consistent
with the rest of `daemon-agent-tools`: `Dir.lookup(name) → File`, then
`File.edit(edits)`.

### File-mutation queueing

Pi serializes edits/writes to the same file through a queue
(`file-mutation-queue.ts`) so concurrent tool calls cannot interleave
mid-write. Endo's eventual-send semantics already serialize per
capability if all writes go through one exo; explicit queueing is
unnecessary as long as the tool implementation does not split
read-modify-write across multiple awaits without holding a lock.

## Implementation notes

- Reuse the byte-level helpers from `packages/daemon` rather than
  importing Pi's TS verbatim; the algorithm is small and well-defined.
- The `oldText` / `newText` schema must work for both Anthropic
  tool-call format and OpenAI function-calling format; the Fae
  tool-schema layer already abstracts this.
- Pi's edit tool exposes a render-side preview (`renderDiff`) in its
  TUI; Endo's equivalent lives in the Chat UI, on the existing
  diff-rendering path.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [daemon-capability-filesystem](daemon-capability-filesystem.md) | Provides `File` capability |
| [daemon-agent-tools](daemon-agent-tools.md) | Sibling tool surface (read, write, exec) |
| [cli-edit-verb](cli-edit-verb.md) | Different consumer (human, hashlines), shares helper code |

## Open questions

- Should `edit` accept a single `(oldText, newText)` pair *or* an array
  of pairs? Pi accepts both shapes (`oldText`/`newText` for one,
  `edits[]` for many). Following Pi reduces friction for migrating
  prompts; the alternative is two separate tools (`edit`, `multi-edit`).
- Where does the diff land in the agent transcript? As a `toolResult`
  text block (consistent with Pi) vs. a structured value-message
  attachment?
- Does `oldText` need to support regex? Pi declines; Endo should match
  Pi's choice (regex multiplies the prompt-injection surface).

## Citation

- [`packages/coding-agent/src/core/tools/edit.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/edit.ts) (Pi's edit tool wiring)
- [`packages/coding-agent/src/core/tools/edit-diff.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/edit-diff.ts) (`applyEditsToNormalizedContent`, `computeEditsDiff`)

## Prompt

> Extracted from [endopi](endopi.md) § *Built-in tool core*. Bridge the
> gap between Endo's `daemon-agent-tools` (which has read/write/exec but
> no edit) and Pi's structured-replacement edit primitive that modern
> coding LLMs expect.
