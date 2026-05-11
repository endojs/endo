# `edit` verb: hash-anchored line-based patches for AI agents

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
A delta-based `edit` operation fills the gap.

This design names the daemon-side `EndoGuest.edit` API surface, the
thin CLI wrapper, the patch input formats, the atomicity guarantees,
the cap surface, and the error model.
The leading candidate format is **hashline**: short content-hash
anchors per line that double as both location identifiers and
staleness checks.

## Design framing: agent tool-calls drive the daemon, not the CLI

The original framing of this design positioned `endo edit` (a CLI verb
human or scripted callers invoke) as the primary surface.
Maintainer review on PR #162 corrected that framing.
AI agents do not type CLI commands.
They invoke tools, and those tool calls drive the daemon's `EndoGuest`
API directly.
The CLI is a thin convenience wrapper around that API for human
operators and shell scripts; the daemon-side capability is the
load-bearing surface that needs the design care.

The two surfaces in priority order:

1. **Primary: `E(guest).edit(directoryRef, path, patch, options)`.**
   The daemon-side eventual-send API.
   This is what an agent's tool-call lands on.
   It performs the read, anchor validation, splice, and write under a
   single mount-internal critical section.
2. **Secondary: `endo edit <name-path> --patch <file> --format hashline`.**
   A thin CLI wrapper that resolves the name path, reads the patch
   from a file or stdin, and delegates to the same daemon API as a
   single eventual send.

The CLI exists for human ergonomics (debugging, ad-hoc edits,
shell-script integration), not as the primary integration surface.
Treating the daemon API as the load-bearing path lets us put
atomicity, CAS, and concurrency control where they belong: inside the
daemon, behind the capability boundary, where the mount's revision
state is already authoritative.

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
  (CRC32 by default; FNV-1a and xxHash also supported via options;
  see "Hash algorithm specification").

### Edit operations reference anchors

The patch payload is a list of operations, each anchored by
`LINE#HASH`:

```
replace 5#f1
  const { agent, store } = powers;
delete 12#aa..14#bc
insert-after 20#dd
  // diagnostic
  console.error('starting');
insert-before 1#a3
  // Copyright header
prepend
  #!/usr/bin/env node
```

Operations supported across known implementations:

| Operation | Shape | Effect |
|---|---|---|
| `replace` | one anchor + payload | replace one line with N lines |
| `replace-range` | two anchors + payload | replace inclusive range with N lines |
| `delete` | one or two anchors | drop one line or an inclusive range |
| `insert-after` | one anchor + payload | insert N lines after the anchor |
| `insert-before` | one anchor + payload | insert N lines before the anchor |
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

## Daemon-side API: `EndoGuest.edit`

The primary surface is the daemon-side method an agent's tool-call
lands on:

```js
/**
 * @param {EndoDirectory} directoryRef the mount whose path to edit
 * @param {string} path the path within the mount
 * @param {EditPatch} patch the parsed patch envelope (see below)
 * @param {EditOptions} [options]
 * @returns {Promise<EditResult>}
 */
E(guest).edit(directoryRef, path, patch, options)
```

The `patch` argument is a structured envelope (the canonical
`hashline-json` shape; see "Patch input formats" below).
The CLI parses textual `hashline` into this envelope before the
eventual send; agents that emit JSON directly bypass the textual
parse.

### Patch envelope shape

```js
/**
 * @typedef {object} EditPatch
 * @property {string} expectedFileHash SHA-256 of the file the agent
 *   read, as 64-char lowercase hex. The CAS check.
 * @property {'crc32' | 'fnv1a' | 'xxhash32'} [hashAlgo='crc32']
 *   the algorithm the per-line anchors were computed with.
 * @property {EditOp[]} ops operations in any order; sorted bottom-up
 *   by line number before splicing.
 */

/**
 * @typedef {object} EditOp
 * @property {'replace'|'replace-range'|'delete'|'insert-after'|'insert-before'|'prepend'|'append'} op
 * @property {Anchor} [anchor] one anchor for non-range ops
 * @property {Anchor} [anchorEnd] second anchor for range ops
 * @property {string[]} [payload] inserted lines (LF-terminated implied)
 */

/**
 * @typedef {object} Anchor
 * @property {number} line 1-indexed line number
 * @property {string} hash 2-to-4-char hex per the chosen algorithm
 */
```

### Result shape

```js
/**
 * @typedef {object} EditResult
 * @property {boolean} success
 * @property {string} fileHashAfter SHA-256 of the file after the edit,
 *   for the agent to use as its next `expectedFileHash`.
 * @property {EditFailure} [failure] populated only when success is false
 */

/**
 * @typedef {object} EditFailure
 * @property {'hash-mismatch'|'file-rev-mismatch'|'ambiguous-reapply'|
 *           'patch-syntax'|'path-not-found'|'permission-denied'} reason
 * @property {string} fileHashActual the live file SHA-256, returned on
 *   `file-rev-mismatch` so the agent can re-read at the new revision.
 * @property {AnchorMismatch[]} [mismatches] populated on `hash-mismatch`
 */

/**
 * @typedef {object} AnchorMismatch
 * @property {number} line
 * @property {string} hashExpected
 * @property {string} hashActual
 */
```

The result is a value, not a thrown error.
Returning a structured failure lets the agent inspect `reason`,
`fileHashActual`, and `mismatches` without unwrapping a thrown error
across the eventual-send boundary.

### Why a daemon-side API and not just CLI splice

Two reasons reverse the original design's CLI-side recommendation:

1. **Agents drive the daemon directly via tool-calls.**
   The CLI is one consumer; agent tool-calls are the higher-volume
   consumer.
   Centralising the splice in the daemon means both surfaces share
   the same atomicity, CAS, and concurrency-control logic.
2. **The daemon already owns the mount's authoritative state.**
   Putting the read-validate-splice-write sequence behind one
   capability call lets the daemon hold a mount-internal lock across
   the read and the write, which is the only way to close the
   concurrent-edit race for shared mounts.
   The capability boundary is also the right place to enforce
   permissions (read-only mounts, restricted paths) once the mount
   surface grows them.

The CLI verb stays a thin wrapper that parses the patch into the
envelope, looks up the directory ref by name path, and issues one
`E(guest).edit(...)` call.

## Investigate dependencies we can imitate or rely on

Per the maintainer's review note: agents drive this through tool
calls, and we should investigate prior art before re-implementing.

The patch-parsing, hash-anchor, and splice logic has prior
implementations across the AI-agent ecosystem.
Before implementation, the builder should evaluate:

- **[oh-my-pi](https://github.com/can1357/oh-my-pi)** (TypeScript /
  Bun): the originating hashline implementation.
  Reference for the per-line hash algorithm, the patch grammar, and
  the bottom-up splice.
  License-permitting, lifting the parser and adapting to Endo's
  module conventions is preferable to a clean-room rewrite.
- **[opencode-hashline](https://github.com/izzzzzi/opencode-hashline)**
  (TypeScript): the OpenCode adoption.
  Adds `FILE_REV_MISMATCH` whole-file SHA-256 check and a JSON envelope.
  Reference for the structured-payload shape we adopt as
  `hashline-json` first-class.
- **[Aider](https://github.com/Aider-AI/aider)** (Python): the
  search-and-replace and unified-diff fallback formats.
  Not the primary format here, but Aider's prompt-engineering for
  weak-model patch generation is referenced in the format-comparison
  section.
- **[diff-match-patch](https://github.com/google/diff-match-patch)**
  (Google, multi-language): the canonical fuzzy-patch library.
  Reference for the `--reapply` bounded relocation search algorithm;
  not a runtime dependency unless the reapply heuristic needs it.
- **[parse-diff](https://www.npmjs.com/package/parse-diff)** and
  **[unidiff](https://www.npmjs.com/package/unidiff)** (npm): if the
  secondary `--format udiff` mode is in scope from day one, these are
  small parser dependencies we could pull in rather than write.
- **[crc-32](https://www.npmjs.com/package/crc-32)** (npm,
  zero-dependency, ISC): a CRC32 implementation in pure JS.
  Candidate runtime dependency for the default hash algorithm if we
  do not write our own.
- **[@node-rs/xxhash](https://www.npmjs.com/package/@node-rs/xxhash)**
  or **[xxhash-wasm](https://www.npmjs.com/package/xxhash-wasm)**: if
  `xxhash32` is exposed as an option, one of these provides the
  implementation; xxhash-wasm runs in browsers and has no native
  binding requirement.

The builder dispatch for this design should open with a
prior-art review (one paragraph per evaluated package: license,
maintenance status, surface fit) and a recommendation on which to
imitate vs. depend on.
The reference implementation lives in `packages/cli/src/hashline.js`
and `packages/daemon/src/hashline.js` (a shared pure module so the
agent's view and the daemon's view agree byte-for-byte) regardless of
whether the algorithm code is original or vendored.

## CLI verb shape (thin wrapper)

```
endo edit <name-path> [--patch <file>|--patch-stdin] [--as <agent>]
endo edit <name-path> --format hashline | hashline-json | udiff | search-replace
endo edit <name-path> --hash-algo crc32 | fnv1a | xxhash32
endo edit <name-path> [--dry-run] [--strict|--reapply]
```

The target `<name-path>` resolves through the same path machinery as
`endo write` and `endo read`: a single name is a top-level pet-name;
multi-segment paths address a path within a mount.

The patch is read from a file or stdin.
The CLI parses it into the `EditPatch` envelope, looks up the
directory ref, and issues a single `E(guest).edit(...)` call.

### `--format` is required; no auto-detection

Per the maintainer's review on this design: `--format` is an explicit
flag; the CLI does not attempt to auto-detect format from the leading
byte of the input.

The supported values are:

- `hashline` (default): the textual hashline grammar described below.
- `hashline-json`: the JSON envelope described below.
  First-class peer of `hashline`, not a secondary mode.
- `udiff`: unified-diff format, parsed into hashline operations.
  See "Alternative formats considered".
- `search-replace`: Aider-style SEARCH/REPLACE blocks.
  See "Alternative formats considered".

Auto-detection by leading byte was rejected because patches that
happen to start with characters legal in multiple formats (a JSON
patch that begins with whitespace, a hashline patch with a leading
comment) are ambiguous.
The flag is explicit, scriptable, and deterministic.

### `--enum` for line-number annotation on read

Independent of the patch format, the sibling `endo read` verb gains
`--enum` (or its equivalent flag) to enumerate line numbers without
implying any patch format.
A separate, orthogonal flag lets agents request hashline anchors
specifically when they want them, without coupling line-number
display to patch-format choice.

```
endo read --text --enum --hashline <name-path>   # both annotations
endo read --text --enum <name-path>              # line numbers only
endo read --text --hashline <name-path>          # hashline anchors only
```

The annotation flags belong in
[`cli-store-verb-text-modes.md`](cli-store-verb-text-modes.md) as the
read-side companion to the edit-side `--format` flag; they are
mentioned here because round-trip is the load-bearing usage shape.

### Round-trip pairing with `endo read`

```
endo read --text --hashline <name-path> > file.hashline
# agent edits file.hashline into a patch
endo edit --format hashline --patch-stdin <name-path> < patch.hashline
```

## Patch input formats

`hashline` and `hashline-json` are first-class peer formats with
shared semantics; `udiff` and `search-replace` are secondary
compatibility modes.

### Format: `hashline` (textual)

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

- `@op` is one of `replace`, `delete`, `insert-after`, `insert-before`,
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
- The patch may be prefixed with a metadata header:
  `@expected-file-hash <hex>` and `@hash-algo <algo>`.
  Both are required (the CAS check is on by default; see "CAS
  semantics").

This is a deliberately textual, line-oriented format so it is human-
readable, diff-friendly, and survives copy/paste through chat
interfaces.

### Format: `hashline-json` (structured, first-class)

Tools that build patches programmatically (a CLI option, a TypeScript
client, a future Chat UI's edit modal, an agent's tool-call) emit
JSON directly:

```json
{
  "expectedFileHash": "7c1b...",
  "hashAlgo": "crc32",
  "ops": [
    { "op": "replace", "anchor": { "line": 5, "hash": "f1" },
      "payload": ["  const { agent, store } = powers;"] },
    { "op": "insert-after", "anchor": { "line": 20, "hash": "dd" },
      "payload": ["  // diagnostic", "  console.error('starting');"] }
  ]
}
```

The JSON envelope is the canonical in-memory representation; the
textual hashline format parses into it.
For agent tool-calls that hit `E(guest).edit(...)` directly, the
JSON envelope IS the wire format (the daemon API takes the
`EditPatch` shape; no textual parse).

The two formats are peers, not primary-and-secondary.
The textual form serves human authors and copy/paste scenarios; the
JSON form serves machine producers and agent tool-calls.
Both round-trip through the same `EditPatch` envelope and validate
through the same daemon-side splice.

### Worked example (textual)

Input file (as `endo read --text --enum --hashline notes/today`):

```
1#a3 # Today's notes
2#00
3#5e Buy milk.
4#7e Buy eggs.
5#bc
```

Patch:

```
@expected-file-hash 7c1b2a... (full SHA-256)
@hash-algo crc32
@replace 4#7e
| Buy eggs (the brown ones).
@insert-after 4#7e
| Buy bread.
```

Result file:

```
# Today's notes

Buy milk.
Buy eggs (the brown ones).
Buy bread.

```

## Hash algorithm specification

To make hashline interoperable with off-the-shelf agent harnesses,
the hash algorithm is part of the wire contract.

### Default: CRC32

- **Algorithm:** CRC32 (the IEEE polynomial as in `zlib.crc32`).
  Cheap, deterministic, JS-portable, well-known.
- **Normalization:** strip trailing whitespace, normalize CRLF to LF,
  but preserve leading whitespace (indentation is significant for
  hashing because it's significant for the language).
- **Encoding:** 8 bits of the CRC, lowercase 2-char hex.
  16 bits (4-char hex) for files >4096 lines, to keep collision
  probability negligible.
- **Empty / whitespace-only lines:** seed the hash with the line
  number so multiple blank lines do not all map to the same anchor.

### Other algorithms supported via options

Per the maintainer's review on this design: leave the door open for
other hashing algorithms in options.
The patch envelope's `hashAlgo` field selects the algorithm; the CLI
exposes `--hash-algo`:

| Algorithm | Selector | Rationale |
|---|---|---|
| `crc32` | default | Zero-dependency, JS-portable, well-known. |
| `fnv1a` | option | What `opencode-hashline` uses; faster on short inputs; trivial to bundle. |
| `xxhash32` | option | What oh-my-pi uses (via `Bun.hash.xxHash32`); fastest of the three; needs a small WASM or native dependency. |

The CLI's `--hash-algo` flag, the patch envelope's `hashAlgo` field,
and the `--hashline` annotation on `endo read` must agree.
Mismatched algorithms produce hash mismatches the daemon reports as
ordinary `hash-mismatch` failures.

A reference implementation lives in
`packages/cli/src/hashline.js` and `packages/daemon/src/hashline.js`,
both calling into a shared pure-function module to ensure the agent's
view and the daemon's view agree byte-for-byte for every supported
algorithm.

## CAS (Compare-And-Swap) semantics

Per the maintainer's review: CAS via whole-file hash check is on by
default; agents do not opt in.
"We may as well; we'll often be using the CAS."

Every patch envelope carries an `expectedFileHash` field (the SHA-256
of the file as the agent read it).
The daemon performs the CAS check unconditionally as the first step
of every `edit`:

1. The daemon reads the current file content.
2. It computes the current SHA-256.
3. **If `expectedFileHash` does not match the current SHA-256, the
   edit fails with `file-rev-mismatch`.**
   The result includes `fileHashActual`, the live SHA-256, so the
   agent can re-read at the new revision and retry with a fresh
   patch.
4. For each operation in the patch, the daemon computes the per-line
   hash of the line currently at `LINE` and compares to `HASH`.
5. **If any per-line anchor mismatches, the edit fails with
   `hash-mismatch`** and a list of mismatching anchors.
   This is the inner staleness check that catches partial drift even
   when whole-file hashes happen to coincide.
6. If both the file hash and all per-line anchors validate,
   operations are sorted bottom-up by line number and applied as a
   single splice pass; the resulting file is written through the
   mount's `writeText` call.
7. The result returns `success: true` and `fileHashAfter`, which the
   agent can adopt as its next `expectedFileHash` for a follow-up
   edit without re-reading.

### Concurrency control by hash matching

This is the concurrency model.
Two agents editing the same file race as follows:

- Both read the file at SHA-256 H1 and produce patches with
  `expectedFileHash: H1`.
- Agent A's `edit` arrives first; the daemon's CAS check passes; the
  splice writes; the file is now at SHA-256 H2.
- Agent B's `edit` arrives; the daemon's CAS check sees the file at
  H2 but `expectedFileHash: H1`; the edit fails with
  `file-rev-mismatch` and `fileHashActual: H2`.
- Agent B re-reads, re-computes the patch against H2, and retries.

The daemon does not perform any merge.
The agent's retry loop is the merge strategy.
This is the standard CAS pattern; it is the reason the daemon-side
API is the load-bearing surface (the CLI cannot enforce
read-validate-write atomicity on its own; the mount-internal lock
inside the daemon can).

The patch envelope's `expectedFileHash` is **required**, not
optional.
The CLI computes it implicitly when the patch is generated by
`endo read --text --hashline` (which can include a header), or it can
be supplied via `--expect-rev <hex>` when the patch is hand-authored.
A patch without `expectedFileHash` is a syntax error.

## Reapply mode

`--reapply` (CLI) or `{ reapply: true }` (API option) enables a
bounded relocation search per anchor: when an anchor's hash mismatches
the line at `LINE`, the daemon searches a small window (default ±20
lines) for a line whose hash matches and, if exactly one candidate
exists, relocates the operation to the new line.
Multiple matches abort with `ambiguous-reapply`.

Default is strict (no relocation).
Reapply is opt-in because for AI agent flows, abort-and-re-read is
usually preferable to silent relocation; for human scripts mutating
mostly-stable files, reapply matches the intuition of "find the line
even if its number drifted".

`--reapply` does NOT relax the file-level CAS check.
A `file-rev-mismatch` fails regardless of `--reapply`; the agent
must re-read.
Reapply only addresses the per-line anchor case where the file
otherwise matches but a few lines have shifted.

## Capability surface

The daemon-side API extends `EndoGuest` (the per-agent capability
exposed to tool-calls) with a single new method:

```js
E(guest).edit(directoryRef, path, patch, options)
```

The implementation acquires a mount-internal lock on the target
directory, reads the file, validates anchors and CAS, splices, and
writes, all under the lock.
This is the surface that closes the read-write race for shared
mounts.

The thin CLI wrapper composes `EndoDirectory.lookup(name)` (to
resolve `<name-path>` to a directory ref) with the new
`EndoGuest.edit(...)` call.
No new CLI-side daemon capability is needed.

### Why a single new method, not a `readText` + `writeText` pair

The original design proposed implementing `endo edit` purely on the
CLI side, composing existing `readText` / `writeText` capabilities.
That design left a race window between the read and the write that no
CLI-side guard could close.
Per the maintainer's review, agents drive the daemon via tool-calls,
which puts the daemon's API on the critical path, which makes
closing that race essential rather than optional.

The new method is the smallest surface that holds the lock across
the read-validate-splice-write sequence.
It does not duplicate the parser (the `EditPatch` envelope is the
wire shape; both the CLI's textual-format parse and the agent's
direct JSON emission produce the same envelope).
It does not preclude future extensions (a multi-file batch, a
streaming-patch mode, a dry-run preview); those grow on top of the
single-method surface.

## Phase: daemon-side `EndoGuest.edit` for true atomicity

Per the maintainer's review: bring this forward as a phase of this
design.

This was originally captured under "Future extensions" as a
fallback if the CLI-side splice's race window became painful.
Promoted to a first-class phase here because it is now the primary
surface, not a fallback.

### Phase 1: API surface and wire envelope

- Land `EditPatch`, `EditOp`, `Anchor`, `EditResult`, `EditFailure`
  type definitions in `packages/daemon/src/types.js`.
- Land the textual `hashline` parser and the structured
  `hashline-json` validator in `packages/daemon/src/hashline.js`,
  both producing `EditPatch`.
- Stub `E(guest).edit(...)` on `EndoGuest`'s exo interface; reject
  with `not_implemented` until phase 2 lands.
- CLI verb scaffolds the call but errors with "edit not available
  on this daemon" until phase 2.

### Phase 2: daemon-side splice with mount-internal lock

- Implement `E(guest).edit(...)` to acquire the mount lock, read,
  validate CAS and per-line anchors, splice, write, release.
- Implement `--strict` (default) and `--reapply` modes.
- CRC32 hash algorithm; `fnv1a` and `xxhash32` deferred.
- Test plan: unit tests for parser/validator/splice; integration
  tests for round-trip read-edit-read; CAS race tests with two
  concurrent guests editing the same path.

### Phase 3: alternate hash algorithms and secondary formats

- Implement `fnv1a` and `xxhash32` per the algorithm options table.
- Implement `--format udiff` and `--format search-replace` parsers
  that translate into `EditPatch`.
- Test plan: per-algorithm round-trip tests with reference fixtures;
  per-format equivalence tests producing identical results to the
  hashline equivalent.

## Phase: multi-file atomicity

Per the maintainer's review on Open Question #3: take this on as a
phase of this design.

Single-path `edit` is the right primitive, but the multi-file
atomic case ("rename a symbol across three files") is a real agent
workflow that the daemon's existing surface does not support today.
Promoted from "Open Question, defer" to a phase of this design.

### Phase 4: multi-file edit batch

The daemon-side API gains a batch surface:

```js
/**
 * @typedef {object} EditBatchEntry
 * @property {EndoDirectory} directoryRef
 * @property {string} path
 * @property {EditPatch} patch
 */

/**
 * @param {EditBatchEntry[]} entries
 * @param {EditOptions} [options]
 * @returns {Promise<EditBatchResult>}
 */
E(guest).editBatch(entries, options)
```

The daemon acquires locks on every targeted mount in a deterministic
order (sorted by mount identity) to avoid deadlock, validates every
patch's CAS and anchors against its target file, and only proceeds
to splice if every validation passes.
Any failure leaves every targeted file unmutated.

Lock ordering is the load-bearing concurrency property: two
concurrent `editBatch` calls that target overlapping mounts in
opposite orders would deadlock without a global ordering rule.
Sorting by mount identity (a stable, comparable token already in
the daemon's namespace) avoids this.

The CLI exposes batch via a manifest file:

```
endo edit --manifest <path>
```

where the manifest is a JSON document listing per-path `<name-path>`,
`expectedFileHash`, and the patch (in any supported format).

Phase 4 sequencing: lands after phase 3, because the single-path
splice and the alternate formats are the building blocks the batch
surface composes.
The maintainer can decide to defer phase 4 indefinitely if the
single-path surface satisfies the observed agent workflows.

## Error model

The daemon-side API returns structured `EditFailure` values; the CLI
maps these to exit codes for shell-script consumption.

| Exit code | Failure `reason` | Diagnostic |
|---|---|---|
| 0 | success | (no output by default; `--verbose` shows op count and `fileHashAfter`) |
| 1 | `patch-syntax` | line number in patch + offending header |
| 2 | `hash-mismatch` | per-anchor table: requested, live, context |
| 3 | `file-rev-mismatch` | requested SHA-256 vs `fileHashActual`; the agent should re-read |
| 4 | `ambiguous-reapply` | the anchor and the candidate line numbers found |
| 5 | `path-not-found` | mount path + cause |
| 6 | `permission-denied` | mount name |

All CLI diagnostics go to stderr per the project's diagnostic
discipline.
Stdout stays clean so `endo edit ... && ...` pipelines work.
Errors use `@endo/errors`'s `makeError(X\`...\`)` for structured
formatting on the daemon side; the CLI renders them.

## Alternative formats considered

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

**Verdict:** secondary `--format udiff` for human-authored patches and
for `git apply` interop; not the primary format.
Lands in phase 3.

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

**Verdict:** secondary `--format search-replace` for agents heavily
trained on it.
Lands in phase 3.

### Alt 3: JSON Patch (RFC 6902)

Edits as a JSON array of `{op, path, value}` operations.

**Pros:** structured, machine-friendly, well-specified.

**Cons:** RFC 6902 addresses JSON pointers, not text-file lines.
Adapting it to lines is essentially reinventing hashline with an
unfortunate JSON envelope.
Verbose for the common case.

**Verdict:** rejected.
The first-class `hashline-json` format covers the structured-payload
use case without committing to RFC 6902 specifically.

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

1. **Hash algorithm default.**
   This design recommends CRC32 as the default, with `fnv1a` and
   `xxhash32` available via `--hash-algo` and `EditPatch.hashAlgo`.
   Maintainer judgment to confirm: is CRC32 the right default, or
   should we align with oh-my-pi (xxhash32) for off-the-shelf
   harness compatibility from day one?
   The choice is reversible; the wire contract carries the algorithm
   name.

2. **Concurrent-write hazard, beyond the daemon-internal lock.**
   The daemon-side `EndoGuest.edit` API closes the read-write race
   for sequential calls.
   For two truly-concurrent agent tool-calls hitting the daemon at
   the same instant, the mount-internal lock serialises them and the
   loser sees `file-rev-mismatch` on the second call's CAS check.
   This is the documented contract: agents must handle
   `file-rev-mismatch` by re-reading and retrying.
   No further hazard remains at the single-mount granularity.
   Cross-mount hazards are addressed by phase 4's `editBatch` lock
   ordering.

3. **CLI's role for human operators vs. agent tool-calls.**
   The CLI is now framed as a thin wrapper around the daemon API.
   Should the CLI also offer a `--no-cas` escape hatch for
   shell-script use cases that explicitly want last-write-wins
   semantics (e.g., a one-off cleanup script)?
   Recommendation: no; the agent and the human use cases both
   benefit from the CAS check, and a `--no-cas` flag is an
   attractive nuisance.
   If a human really wants last-write-wins, `endo write` with the
   whole file content is the right verb.

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
- **Chat UI integration** ([`chat-view-edit-commands`](chat-view-edit-commands.md)):
  the existing `/edit` command opens a Monaco editor on a blob.
  An agent-driven `/apply-patch` command, dispatching to the same
  `E(guest).edit(...)` API, would let agents propose patches in the
  chat transcript with diff preview before commit.
- **`endo read --enum --hashline`** as the read-side companion;
  belongs in [`cli-store-verb-text-modes.md`](cli-store-verb-text-modes.md)
  as a follow-on once `endo read --text` lands.

## Test Plan

- Unit tests for the hashline tokenizer:
  every operation type, range syntax, payload separator, comment
  handling, blank-line termination, malformed inputs, the
  `@expected-file-hash` and `@hash-algo` headers.
- Unit tests for the `hashline-json` validator:
  every operation type, missing required fields, malformed
  envelope, algorithm mismatch.
- Unit tests for each hash algorithm:
  agree byte-for-byte with a reference fixture across CRLF/LF,
  trailing whitespace, empty lines, lines that are only whitespace,
  Unicode (multi-byte) lines.
- Round-trip integration test: read a file via `endo read --text
  --enum --hashline`, parse the output to extract anchors, apply a
  patch via `E(guest).edit(...)`, read back and assert content.
- CAS test (file-level): read a file at SHA-256 H1, modify it
  externally, attempt to apply a patch with `expectedFileHash: H1`,
  assert the result is `failure: { reason: 'file-rev-mismatch',
  fileHashActual: H2 }`.
- CAS test (per-line): read a file at SHA-256 H1, modify a single
  line, attempt to apply a patch with `expectedFileHash: H1` and an
  anchor on the modified line, assert the result is `failure: {
  reason: 'hash-mismatch', mismatches: [...] }`.
- Reapply test: insert two unrelated lines above an anchor (without
  changing `expectedFileHash`), run `E(guest).edit(..., { reapply:
  true })`, assert the operation relocates correctly (single-
  candidate case) and aborts (multi-candidate case).
- Multi-op atomicity: a patch with three operations, the middle one
  having a stale per-line anchor, must leave the file unmodified.
- Concurrent-edit serialization: two simultaneous `E(guest).edit`
  calls against the same path; assert one succeeds and the other
  returns `file-rev-mismatch` with the post-first-edit hash.
- Format-flag tests: `--format udiff` and `--format search-replace`
  apply equivalent edits to a fixture and produce identical results
  to the hashline equivalent.
- Phase-4 batch test: an `editBatch` of three patches on three
  files, one with a stale `expectedFileHash`, must leave all three
  files unmutated.

## Dependencies

| Design | Relationship |
|---|---|
| [`cli-store-verb-text-modes`](cli-store-verb-text-modes.md) | Sibling. Defines `endo read --text` / `endo write --text` and the mount-path resolution model `endo edit` reuses. `endo edit` is the delta form; `endo write` is the whole-file form. The `--enum` and `--hashline` annotation flags on `endo read` belong in this sibling design. |
| [`daemon-mount`](daemon-mount.md) | Defines `EndoMount.readText` / `writeText`, the daemon primitives `E(guest).edit` builds on. Adds the new `EndoGuest.edit` capability and the mount-internal lock the splice acquires. |
| [`chat-view-edit-commands`](chat-view-edit-commands.md) | Future Chat UI integration: `/apply-patch` would share the patch parser and the `E(guest).edit` API. |

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
