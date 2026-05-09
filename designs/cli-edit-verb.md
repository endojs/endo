# CLI `edit` verb: hash-anchored line-based patches for AI agents

| | |
|---|---|
| **Created** | 2026-05-08 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Source** | PR [#153](https://github.com/endojs/endo-but-for-bots/pull/153) inline review comment [discussion_r3212462309](https://github.com/endojs/endo-but-for-bots/pull/153#discussion_r3212462309) on `designs/cli-store-verb-text-modes.md:403` |

## What is the Problem Being Solved?

The maintainer's review on PR #153 reads:

> Please dispatch a subagent to design an edit verb in the daemon, and
> in particular investigate "hashline", as this appears to be used by
> AI agents.

Sibling design [`cli-store-verb-text-modes.md`](cli-store-verb-text-modes.md)
proposes `endo write --text <name> <path>` and `endo read --text <name>
<path>` as the verbs that mutate and read text inside a mount.
Whole-file overwrite via `endo write` is the wrong tool for the
common AI-agent workflow of "change three lines in this 600-line file
without re-reading and re-emitting the whole thing".
A delta-based `endo edit` verb fills the gap.

This design names the verb shape, the patch input format, the
atomicity guarantees, the cap surface, and the error model.
The leading candidate format is **hashline**: short content-hash
anchors per line that double as both location identifiers and
staleness checks.

## Background: what is hashline?

Hashline is a wire format for line-anchored file edits, originated by
[oh-my-pi](https://github.com/can1357/oh-my-pi)
and adopted by sibling projects ([opencode-hashline](https://github.com/izzzzzi/opencode-hashline),
the `hive` agent framework, and others).
Its insight: every line in a file gets a short content-hash anchor
displayed alongside its line number whenever the agent reads the file,
and edit operations reference those anchors instead of reproducing
text.

### Display format on read

When an agent reads a file in hashline mode, each line is annotated:

```
   1#a3 // @ts-check
   2#7e import { E } from '@endo/far';
   3#bb
   4#0c export const make = powers => {
   5#f1   const { agent } = powers;
```

The `LINE#HASH` prefix carries:

- **`LINE`**: 1-indexed line number, for human readability and ordinal
  reasoning.
- **`HASH`**: a 2-to-4-character content hash of the normalized line
  (typically CRC32, FNV-1a, or xxHash, mod a small alphabet, with
  trailing whitespace stripped before hashing).

### Edit operations reference anchors

The patch payload is a list of operations, each anchored by
`LINE#HASH`:

```
replace 5#f1
  const { agent, store } = powers;
delete 12#aa..14#bc
insert_after 20#dd
  // diagnostic
  console.error('starting');
insert_before 1#a3
  // Copyright header
prepend
  #!/usr/bin/env node
```

Operations supported across known implementations:

| Operation | Shape | Effect |
|---|---|---|
| `replace` | one anchor + payload | replace one line with N lines |
| `replace_range` | two anchors + payload | replace inclusive range with N lines |
| `delete` | one or two anchors | drop one line or an inclusive range |
| `insert_after` | one anchor + payload | insert N lines after the anchor |
| `insert_before` | one anchor + payload | insert N lines before the anchor |
| `prepend` | no anchor + payload | insert at the file's first line |
| `append` | no anchor + payload | insert at the file's last line |

### Why this works for AI agents

Three load-bearing properties:

1. **No text reproduction.**
   The agent never has to copy the original line into the patch (as
   search-and-replace requires).
   Whitespace-mismatch failures vanish.
2. **Built-in staleness check.**
   If the file changed between the agent's read and write, the hash
   in the anchor disagrees with the live file's hash at that line and
   the patch is rejected before any mutation.
   No silent overwrite.
3. **Atomic batch.**
   Multiple operations in one patch are sorted bottom-up by line
   number and applied as one splice pass, so anchors earlier in the
   patch keep referring to their original positions.
   All anchors are validated before any mutation.

Reported impact on weak-model accuracy is large: oh-my-pi's
benchmarks show Grok Code Fast 1 going from 6.7% to 68.3% task success
under hashline vs. string-replace, and ~60% fewer output tokens during
retry loops on stronger models.
The format is small enough that most modern code-editing agents
(Aider, Cursor, OpenCode, Codex, Claude Code) could adopt it.

## Design: `endo edit` verb shape

```
endo edit [--patch <file>|--patch-stdin] <name-path> [--as <agent>]
endo edit [--format hashline|udiff|search-replace] ...
endo edit [--dry-run] [--strict|--reapply]
```

The target `<name-path>` resolves through the same path machinery as
`endo write` and `endo read`: a single name is a top-level pet-name;
multi-segment paths address a path within a mount.

The patch is read from a file or stdin in the chosen format.
Default `--format` is `hashline`; the verb stays format-extensible
(see "Future formats" below).

### Round-trip pairing with `endo read`

`endo read` (sibling design) gains a `--annotate hashline` flag so
the agent can ask for the hashline-decorated view directly:

```
endo read --text --annotate hashline <name-path>
endo edit --format hashline --patch-stdin <name-path>
```

The annotation flag is the read-side companion to the edit-side
format flag.
Without it, `endo read --text` returns plain text and an agent that
wants hashline mode must compute the per-line hashes itself (which
matches the algorithm spec; see "Hash algorithm specification").
With it, the daemon does the work and the wire format is canonical.

### Verb scope

`endo edit` is the **mount-path mutation** verb (delta form).
It does not operate on `readable-blob` content-addressed formulas:
those are immutable.
An agent that wants to "edit" a `readable-blob` writes a fresh blob
under the same pet-name, mediated by `endo write`.

`endo edit` composes with `endo write`: both mutate a path.
`endo write` replaces the whole file; `endo edit` applies a delta.
Writing the entire file via `endo edit prepend ...` is technically
expressible but `endo write` is the right verb for that case.

## Patch input format: hashline

### Hash algorithm specification

To make `endo edit` interoperable with off-the-shelf agent harnesses,
the hash algorithm is part of the wire contract.
Recommended:

- **Algorithm:** CRC32 (the IEEE polynomial as in `zlib.crc32`).
  Cheap, deterministic, JS-portable, well-known.
  An alternative is FNV-1a, also cheap and well-known; see Open
  Question #1.
- **Normalization:** strip trailing whitespace, normalize CRLF to LF,
  but preserve leading whitespace (indentation is significant for
  hashing because it's significant for the language).
- **Encoding:** 8 bits of the CRC, lowercase 2-char hex.
  16 bits (4-char hex) for files >4096 lines, to keep collision
  probability negligible.
- **Empty / whitespace-only lines:** seed the hash with the line
  number so multiple blank lines do not all map to the same anchor.

A reference implementation lives in `packages/cli/src/hashline.js`
(to be created); `packages/daemon/src/hashline.js` carries the
daemon-side validator.
Both call into a shared pure-function module to ensure the agent's
view and the daemon's view agree byte-for-byte.

### Wire format

The patch is a UTF-8 text document.
Line endings in the document itself are LF only.
Each operation begins with a header line and is followed by zero or
more payload lines marked by a separator.

```
@op anchor[..anchor]
| payload line 1
| payload line 2
@op anchor
| payload line
```

- `@op` is one of `replace`, `delete`, `insert_after`, `insert_before`,
  `prepend`, `append`.
- `anchor` is `LINE#HASH` (e.g., `42#a3`).
- A range uses `..` between two anchors: `12#aa..14#bc`.
- `prepend` and `append` take no anchor.
- Each payload line begins with `| ` (pipe space).
  The space allows distinguishing an empty payload line (`|` followed
  by newline) from absent payload.
- Comments begin with `#` at the start of the line and are ignored.
- A blank line ends an operation; the next non-blank line either
  starts a new operation or is end-of-patch.

This is a deliberately textual, line-oriented format so it is human-
readable, diff-friendly, and survives copy/paste through chat
interfaces.
A JSON form is available as a secondary input mode (see Open
Question #2).

### Worked example

Input file (as `endo read --text --annotate hashline notes/today`):

```
1#a3 # Today's notes
2#00
3#5e Buy milk.
4#7e Buy eggs.
5#bc
```

Patch:

```
@replace 4#7e
| Buy eggs (the brown ones).
@insert_after 4#7e
| Buy bread.
```

Result file:

```
# Today's notes

Buy milk.
Buy eggs (the brown ones).
Buy bread.

```

## Atomicity and CAS semantics

`endo edit` is a compare-and-swap on every anchored line:

1. The daemon reads the current file content.
2. For each operation in the patch, it computes the hash of the line
   currently at `LINE` and compares to `HASH`.
3. **If any anchor mismatches, the operation aborts before any
   mutation.**
   The verb exits non-zero with a diagnostic that names every
   mismatching anchor and shows the live hash next to the requested
   one.
4. If all anchors validate, operations are sorted bottom-up by line
   number and applied as a single splice pass; the resulting file is
   written through the mount's `writeText` (sibling) call.

This is not transactional across multiple files; one `endo edit`
invocation targets one path.
A multi-file batch is a sequence of `endo edit` invocations; a
failure mid-sequence leaves earlier files mutated.
See Open Question #3.

### Whole-file revision check

In addition to per-anchor hashes, hashline implementations sometimes
carry a whole-file revision hash (`FILE_REV_MISMATCH` in
opencode-hashline's parlance).
`endo edit` adopts this via an optional `--expect-rev <hex>` flag:

```
endo edit --patch-stdin --expect-rev 7c1b... <path>
```

If supplied, the daemon also computes the SHA-256 of the file before
applying the patch and aborts on mismatch, even if every per-line
anchor happens to match.
This catches edits-to-deleted-and-recreated files where the line
content collisions could spuriously validate.
See Open Question #4 for whether this should be on by default.

## Reapply mode

`--reapply` enables a bounded relocation search per anchor: when an
anchor's hash mismatches the line at `LINE`, the daemon searches a
small window (default ±20 lines) for a line whose hash matches and,
if exactly one candidate exists, relocates the operation to the new
line.
Multiple matches abort with `AMBIGUOUS_REAPPLY`.

Default is `--strict` (no relocation).
Reapply is opt-in because for AI agent flows, abort-and-re-read is
usually preferable to silent relocation; for human scripts mutating
mostly-stable files, reapply matches the intuition of "find the line
even if its number drifted".

## Capability surface

`endo edit` does not introduce a new daemon capability.
It composes existing ones already exposed on `EndoDirectory` /
`EndoMount`:

- `readText(petNameOrPath)` to fetch current content.
- `writeText(petNameOrPath, content)` to write the patched content.

The CLI does the patch parsing, anchor validation, and splice in the
client process.
The daemon sees a `readText` followed by a `writeText` of the new
content, no different from `endo read | edit-locally | endo write`.

### Why CLI-side and not daemon-side

Two reasons:

1. **Patch grammar churn.**
   Hashline is one of several plausible patch formats and the
   ecosystem is still moving.
   Keeping the parser in the CLI lets the format evolve at CLI
   release cadence rather than being baked into the daemon's
   capability surface.
2. **The daemon's existing surface is sufficient.**
   `readText` + `writeText` already yields the needed primitives;
   adding `editText(path, patch)` to `EndoMount` would duplicate
   parsing logic in two places (CLI for offline edit, daemon for
   remote-agent edit) without buying confinement, since the agent
   that can `writeText` can write any content.

The race window between read and write is the price.
Two agents editing the same file concurrently can both pass anchor
validation against the same pre-state and the second `writeText`
wins (last-write-wins, no merge).
For AI agent workflows on per-agent scratch mounts this is
acceptable; for shared mounts it is a hazard called out in Open
Question #5.

### Future: daemon-side `editText` for true atomicity

If the read-then-write race becomes painful, a daemon-side
`EndoMount.editText(path, patch)` method can enforce read-and-write
under one mount-internal lock.
The CLI verb is unchanged; it just delegates to the new method when
the daemon supports it.
Captured in "Future extensions" below.

## Error model

The verb exits with one of these statuses:

| Exit code | Reason | Diagnostic shape |
|---|---|---|
| 0 | success | (no output by default; `--verbose` shows op count) |
| 1 | patch syntax error | line number in patch + offending header |
| 2 | anchor mismatch (`HASH_MISMATCH`) | per-anchor table: requested, live, context |
| 3 | range or whole-file rev mismatch (`FILE_REV_MISMATCH`) | requested vs live SHA-256 |
| 4 | `AMBIGUOUS_REAPPLY` | the anchor and the candidate line numbers found |
| 5 | path not found / not a text file | mount path + cause |
| 6 | permission denied (read-only mount) | mount name |

All diagnostics go to stderr per the project's diagnostic discipline.
Stdout stays clean so `endo edit ... && ...` pipelines work.
Errors use `@endo/errors`'s `makeError(X\`...\`)` for structured
formatting.

## Alternatives considered

### Alt 1: unified diff (RFC 2440-ish)

Use the standard `diff -u` format as the patch input.

**Pros:** universally understood, every developer can read it, every
language has a parser, integrates with `git apply`.

**Cons:** unified diff anchors are **content quotations** (the unchanged
context lines), not **content hashes**.
Whitespace mismatches and trivially-rephrased context lines fail to
apply.
The agent must reproduce surrounding context verbatim, which is
exactly the failure mode hashline exists to avoid.
Also, unified diffs do not detect "the file was rewritten between read
and edit" the way per-line hashes do.

**Verdict:** not the primary format.
Worth supporting as a secondary `--format udiff` for human-authored
patches and for `git apply` interop.

### Alt 2: search-and-replace blocks (Aider's "diff" format)

The agent emits paired SEARCH/REPLACE blocks and the tool finds the
SEARCH text in the file and substitutes the REPLACE text:

```
<<<<<<< SEARCH
const { agent } = powers;
=======
const { agent, store } = powers;
>>>>>>> REPLACE
```

**Pros:** zero ceremony for the agent; widely used by Aider, Cursor,
and others, so weak models have lots of training data.

**Cons:** every failure mode hashline solves stays present.
Whitespace mismatch fails; ambiguous matches require fuzzy fallback;
no built-in staleness detection.
Aider's own benchmarks show diff-format succeeds best on top-tier
models and worst on weaker ones; hashline reverses that gradient.

**Verdict:** offer `--format search-replace` as a secondary mode for
agents that are heavily trained on it, but hashline is the primary
recommendation.

### Alt 3: JSON Patch (RFC 6902)

Edits as a JSON array of `{op, path, value}` operations.

**Pros:** structured, machine-friendly, well-specified.

**Cons:** RFC 6902 addresses JSON pointers, not text-file lines.
Adapting it to lines is essentially reinventing hashline with an
unfortunate JSON envelope.
Verbose for the common case.

**Verdict:** rejected as primary format.
The `--format hashline-json` mode contemplated under Open Question #2
captures the structured-payload use case without committing to RFC
6902 specifically.

### Alt 4: do nothing; tell agents to use `endo write` with the whole file

Skip `edit` entirely; agents read the file, edit locally, and
overwrite the whole thing via `endo write`.

**Pros:** zero new code; CAS via SHA-256 of the prior file is already
expressible if `endo write` learns `--expect-rev`.

**Cons:** for files larger than the agent's emit budget (token
window), whole-file overwrite is impossible.
Even for small files, the agent burns tokens re-emitting unchanged
lines, and the failure mode for "file changed mid-edit" is silent
overwrite unless `--expect-rev` is added (and even then only at
file granularity, not per-line).
Misses the actual benefit of the per-line hash discipline.

**Verdict:** rejected for the AI-agent workflow that motivated this
design.
The `endo write --expect-rev <hex>` whole-file CAS, however, is a
worthwhile sibling feature; tracked in
[`cli-store-verb-text-modes.md`](cli-store-verb-text-modes.md) Open
Questions follow-up.

## Open Questions

1. **CRC32 vs FNV-1a vs xxHash for the per-line hash.**
   CRC32 is widely available, well-known, and fits in a `Uint32Array`
   loop with no library dependency.
   FNV-1a is faster on short inputs and what `opencode-hashline` uses.
   xxHash is what oh-my-pi uses (via Bun's built-in `Bun.hash.xxHash32`)
   but adds a runtime dependency on a hash library Endo does not
   currently bundle.
   Recommendation: **CRC32**, for zero-dependency JS portability.
   Defer if the maintainer wants to align with an existing
   ecosystem (oh-my-pi for compatibility with off-the-shelf agent
   harnesses).

2. **Should `--format hashline-json` be a first-class secondary
   mode?**
   The textual hashline format above is human-friendly but tools that
   build patches programmatically (a CLI option, a TypeScript client,
   a future Chat UI's edit modal) would prefer a JSON envelope:
   ```json
   { "ops": [
     { "op": "replace", "anchor": "5#f1",
       "payload": ["new line 1", "new line 2"] }
   ] }
   ```
   Recommendation: yes, accept both, dispatched by the leading
   character of the input (`{` vs `@`).
   Defer the actual schema until a client needs it.

3. **Multi-file atomicity.**
   Should `endo edit` accept multiple `<path>` arguments and either
   apply all-or-none, or emit a manifest patch format that names paths
   inline?
   The simplest first cut is one path per invocation; the
   all-or-none multi-path case is a real workflow ("rename a symbol
   across files") but requires a daemon-side transactional surface
   that does not yet exist.
   Recommendation: defer to a future extension; one-path-per-call
   covers 80% of agent edit workflows.

4. **Should the whole-file SHA-256 check be on by default?**
   Per-line hash checks alone can spuriously validate if a file is
   replaced wholesale with content that happens to share line hashes
   at the anchor positions.
   The likelihood is low but nonzero.
   Making `--expect-rev` mandatory raises the agent's bookkeeping
   burden; making it default-on requires the agent to fetch the
   revision hash on read, which `endo read --annotate hashline`
   could include as a header.
   Recommendation: include the file revision in the
   `--annotate hashline` output as a header; require it on
   `endo edit` only when `--strict-rev` is passed.
   Defer the default to maintainer judgment.

5. **Concurrent-write hazard on shared mounts.**
   Two agents editing the same path can both pass per-anchor
   validation against the same pre-state and silently last-write-wins
   on `writeText`.
   Mitigations: (a) a daemon-side `EndoMount.editText(path, patch)`
   that locks read-then-write under one mount-internal mutex;
   (b) `--expect-rev` on every edit by default; (c) tell users to
   not point two agents at the same shared mount.
   The right fix is (a) once the maintainer decides whether to grow
   the daemon's mount surface that way.
   Until then, document the hazard.

6. **Format extensibility: `--format` flag vs auto-detection.**
   Auto-detect on the leading byte is convenient but ambiguous when a
   patch happens to start with characters legal in multiple formats.
   The `--format` flag is explicit and scriptable.
   Recommendation: require `--format` when the input format is
   anything other than the default `hashline`.

## Future extensions

Captured here so a future builder can plan around them without
re-deriving the design:

- **`endo patch` as a sibling verb** specialized for unified-diff
  input.
  The maintainer's PR #153 inline note says
  "We may choose to have edit or patch in the future".
  Reading that as "edit OR patch" rather than "edit AND patch": one
  verb is preferable.
  Hashline's range and prepend/append operations cover unified diff's
  expressive range; the format flag is the affordance.
  If a need emerges to namespace the verbs separately, `endo patch`
  becomes a thin alias for `endo edit --format udiff`.
- **Daemon-side `EndoMount.editText(path, patch)`** to close the
  read-then-write race for shared mounts (Open Question #5).
- **Chat UI integration** ([`chat-view-edit-commands`](chat-view-edit-commands.md)):
  the existing `/edit` command opens a Monaco editor on a blob.
  An agent-driven `/apply-patch` command, dispatching to the same
  daemon path as `endo edit`, would let agents propose patches in the
  chat transcript with diff preview before commit.
- **`endo read --annotate hashline`** as the read-side companion;
  belongs in [`cli-store-verb-text-modes.md`](cli-store-verb-text-modes.md)
  as a follow-on once `endo read --text` lands.

## Test Plan

- Unit tests for the hashline tokenizer:
  every operation type, range syntax, payload separator, comment
  handling, blank-line termination, malformed inputs.
- Unit tests for the hash algorithm:
  agree byte-for-byte with a reference fixture across CRLF/LF,
  trailing whitespace, empty lines, lines that are only whitespace,
  Unicode (multi-byte) lines.
- Round-trip integration test: read a file via `endo read --annotate
  hashline`, parse the output to extract anchors, apply a patch via
  `endo edit`, read back and assert content.
- CAS test: read a file at hash H1, modify it externally, attempt
  to apply a patch anchored at H1, assert the verb exits 2 with a
  diagnostic naming the changed anchors.
- Reapply test: insert two unrelated lines above an anchor, run
  `endo edit --reapply`, assert the operation relocates correctly
  (single-candidate case) and aborts (multi-candidate case).
- Multi-op atomicity: a patch with three operations, the middle one
  having a stale anchor, must leave the file unmodified.
- Format-flag tests: `--format udiff` and `--format search-replace`
  apply equivalent edits to a fixture and produce identical results
  to the hashline equivalent.

## Dependencies

| Design | Relationship |
|---|---|
| [`cli-store-verb-text-modes`](cli-store-verb-text-modes.md) | Sibling. Defines `endo read --text` / `endo write --text` and the mount-path resolution model `endo edit` reuses. `endo edit` is the delta form; `endo write` is the whole-file form. |
| [`daemon-mount`](daemon-mount.md) | Defines `EndoMount.readText` / `writeText`, the daemon primitives `endo edit` composes. A future `EndoMount.editText` for true atomicity is an extension point on this surface. |
| [`chat-view-edit-commands`](chat-view-edit-commands.md) | Future Chat UI integration: `/apply-patch` could share the patch parser and validator. |

## Reshape sibling for

- PR [#153](https://github.com/endojs/endo-but-for-bots/pull/153):
  this design is the future extension `cli-store-verb-text-modes.md`
  Open Question #3 alludes to ("Alternatives: `endo edit`, ...").
  PR #153's `endo write` and `endo read` are the simpler verbs that
  land first; `endo edit` builds on them.

## Prompt

> Design an `endo edit <name>` verb in the daemon-side CLI surface
> that lets an AI agent (or a script, or a user) propose a delta-based
> update to a stored text resource.
> Investigate "hashline" as a leading candidate format (hash-anchored
> line-based patches resilient to concurrent edits).
> Compare against unified-diff and search-and-replace alternatives.
> Cover: verb shape, patch input format, atomicity (CAS via hash),
> cap surface, error model, integration with the read/write/store
> family from `designs/cli-store-verb-text-modes.md` (PR #153).
