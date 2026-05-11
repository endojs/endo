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

### `directoryRef` contract

`directoryRef` must satisfy the `EndoDirectory` capability
guard (the same guard `E(guest).readText` and `E(guest).writeText`
require).
In v1 the only `EndoDirectory` implementation that supports
`edit` is `EndoMount` (and its sub-mounts derived via `lookup()`).
A `directoryRef` that resolves to a non-mount `EndoDirectory`
(e.g., a future virtual-filesystem ref) returns
`{ success: false, failure: { reason: 'path-not-found' } }`
with a diagnostic explaining that the directory does not back a
splice-capable file store.

The daemon does not let a CapTP-level "no such method" error
escape across the boundary; the `EndoGuest.edit` adapter catches
the missing-method case and translates it into the structured
`path-not-found` failure so the agent's retry logic sees the
same shape regardless of whether the path exists, the mount
exists, or the ref is mount-shaped at all.

`EndoDirectory.edit` is exposed on the `EndoDirectory`
interface (not only on `EndoMount`) so an agent armed with an
`EndoDirectory` ref can invoke `E(directoryRef).edit(path,
patch, options)` directly without going through `EndoGuest`.
The `EndoGuest.edit(directoryRef, path, patch, options)` form
is sugar that delegates to `E(directoryRef).edit(path, patch,
options)`; it exists so an agent that holds only its own guest
ref can still target a directory it has been given by name.
Sub-mounts and mount-derived `EndoDirectory` refs satisfy the
edit method; non-mount `EndoDirectory` implementations either
implement edit themselves or inherit a default that returns
`path-not-found` per the previous paragraph.

### Patch envelope shape

```js
/**
 * @typedef {object} EditPatch
 * @property {string} expectedFileHash SHA-256 of the file the agent
 *   read, as 64-char lowercase hex. The CAS check, regardless of any
 *   underlying content store's native digest. For an empty file the
 *   canonical value is the SHA-256 of the empty byte string
 *   (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
 *   Absent files are not addressable via `edit`; see
 *   "Empty and absent files" below.
 * @property {EditOp[]} ops operations in any order; sorted bottom-up
 *   by line number before splicing. Per-line anchor hashes are CRC32
 *   (see "Hashing" below); the algorithm is fixed for v1, no envelope
 *   field selects it.
 */

/**
 * @typedef {object} EditOp
 * @property {'replace'|'replace-range'|'delete'|'insert-after'|'insert-before'|'prepend'|'append'} op
 * @property {Anchor} [anchor] one anchor for non-range ops
 * @property {Anchor} [anchorEnd] second anchor for range ops
 * @property {string[]} [payload] inserted lines, each a bare line
 *   content (no embedded LF). The splice joins them with LF
 *   separators on insert. A payload entry containing an embedded
 *   `\n` is a `patch-syntax` failure; multi-line insertion is
 *   expressed as multiple payload entries.
 */

/**
 * @typedef {object} Anchor
 * @property {number} line 1-indexed line number
 * @property {string} hash 2-to-4-char hex per the chosen algorithm
 */
```

The wire shape is plain JSON.
CapTP delivers the envelope to the daemon as a hardened pass-by-copy
record, but the daemon must not assume any particular hardening or
class identity on the values it receives.
The mount's `edit` method re-runs the validator
(`validateEditPatch`) on entry to reject malformed envelopes that
were accepted by some intermediate hop or by a non-CLI caller that
constructed the envelope directly.
Callers cannot rely on hardened envelopes round-tripping with
identity preserved across the eventual-send boundary.

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
 * @property {string} hashExpected the patch's anchor hash
 * @property {string} hashActualAtPatchWidth the live line's CRC32
 *   recomputed at the same hex width as `hashExpected`, for
 *   apples-to-apples comparison
 * @property {string} hashActualAtFileWidth the live line's CRC32
 *   at the file's currently-native width (2-char for ≤4096 lines,
 *   4-char above), so an agent that hand-edits the patch can see
 *   what the daemon would render today
 */
```

The `permission-denied` reason covers both the static
read-only case (a mount whose policy disallows mutation) and the
filesystem case (a writable mount whose target file or directory
is mode 0444 or otherwise rejects the kernel's `write`/`unlink`
call with `EACCES`).
A future taxonomy split (`mount-read-only` vs.
`fs-permission-denied`) is a clean addition; v1 collapses both
into `permission-denied` so callers do not have to switch on a
combinatorial space.

Other OS errors that surface during the splice (`EIO`, `ENOSPC`,
`EROFS`, `EBUSY`) propagate as thrown errors, not as structured
failures.
The structured-failure shape is reserved for cases the agent can
react to programmatically (re-read, re-author, drop the
operation); a disk-full condition is a daemon-host concern that
needs human attention.

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
  Candidate runtime dependency for the per-line anchor hash if we
  do not write our own.

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
- The patch is prefixed with a metadata header:
  `@expected-file-hash <hex>`. Required (the CAS check is on by
  default; see "CAS semantics"). Per-line anchor hashes are CRC32;
  no `@hash-algo` header in v1.

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

## Splice contract

The splice transforms the file's byte content into a new byte
content under a few normative rules.
These were under-specified in the first cut of the design and
surfaced as gaps during the tentative builder dispatch
(PR [#204](https://github.com/endojs/endo-but-for-bots/pull/204));
the normative rules are pinned down here.

### Line splitting and trailing newline

The daemon splits the file into lines on LF (`\n`) only.
A `splitLines` helper returns a `{ lines, trailingNewline }` pair:

- `lines` is the array of line contents excluding their terminating
  LF.
- `trailingNewline` is `true` if the file's final byte is `\n` (or
  the file is empty), `false` otherwise.

The splice preserves `trailingNewline` byte-for-byte: a file that
ended in `\n` before the splice ends in `\n` after; a file that did
not, does not.
Operations that insert lines (`insert-after`, `insert-before`,
`prepend`, `append`, the payload of a `replace`) do not alter
`trailingNewline`.
The only way the trailing-newline state changes across an `edit`
is if the patch explicitly deletes the file's last line and that
last line was the trailing `\n` carrier.

`joinLines({ lines, trailingNewline })` is the inverse: lines
joined by LF, with a final LF appended only if `trailingNewline`
is true.

### CRLF round-trip

CRLF in the source file is preserved byte-for-byte through the
splice.
Specifically: a `\r` immediately preceding a `\n` stays on the line
content as a trailing `\r`; the LF is the line separator.
The per-line CRC32 hash strips the trailing `\r` (the
"normalize CRLF to LF" rule under "Hash algorithm specification"
applies to the hash input, not to the splice).

This makes the splice oblivious to CRLF: a CRLF file edited by an
agent that emits LF-only payload will end up with mixed line
endings.
The design accepts this trade-off in v1 because:

- Re-writing the whole file to one convention silently mutates
  bytes the agent did not author.
- Detecting and matching the file's dominant ending requires
  reading the whole file just to make the determination.
- The cost of mixed endings (a noisy diff in `git`) is recoverable;
  the cost of silently-rewritten endings is not.

A future option (`{ normalizeLineEndings: 'preserve' | 'lf' | 'crlf' }`)
can pin a single convention if a concrete need surfaces.

### Anchor uniqueness within a patch

Two operations may anchor on the same line.
The splice sort applies a deterministic tiebreaker so the result
does not depend on `Array.sort`'s stability:

1. Sort by line number, descending (bottom-up so earlier anchors
   keep their original positions).
2. Within a line, apply operations in this priority order:
   `insert-after` first, then `insert-before`, then `replace` /
   `delete`.
3. Within an op type at the same line, apply in the order the
   operations appear in the patch.

Rationale: `insert-after L` and `insert-before L` cannot coexist
with `replace L` in any meaningful way (the replace consumes the
line the inserts anchor on), so adopting a fixed order makes the
patch's intent unambiguous.
The validator may emit a warning when this combination appears;
v1 accepts it without warning.

A `replace L` and a second `replace L` in the same patch is a
`patch-syntax` failure (the first replace's payload would shadow
the second's anchor).

### Empty and absent files

The empty file (zero bytes on disk) is addressable via `edit` and
has the canonical `expectedFileHash`
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
(SHA-256 of the empty byte string).
Edits against the empty file may use `prepend` or `append` to
populate it.

An absent file (the path does not exist within the mount) is not
addressable via `edit`.
Every `edit` against an absent path fails with `path-not-found`
regardless of the patch's contents.
A patch that consists only of `prepend` / `append` ops does not
implicitly create the file.
File creation is `endo write`'s responsibility; once the file
exists (even at zero bytes), `edit` operates on it.

Rationale: separating creation from mutation keeps the mount's
permission model legible (a mount that grants `edit` on an
existing path does not implicitly grant `create` on a new path),
and avoids the awkward case of an `expectedFileHash` for
"the file does not exist yet".

### File mode bits and metadata

The splice preserves the target file's mode bits, ownership, and
mtime semantics through a write-existing-inode pattern:

1. The daemon reads the file via `readFileText` (which yields the
   original mode bits via `fs.promises.stat`).
2. The splice computes the new content in memory.
3. The daemon writes the new content by truncating and rewriting
   the existing file descriptor, not by writing a new file and
   renaming it.
4. The original mode bits and ownership remain because the inode
   is the same.

Extended attributes (xattr) and ACLs beyond POSIX mode bits are
**not** preserved in v1.
A future `{ preserveXattr: true }` option may extend this; the
host filesystem support for xattr enumeration is the constraint.

The truncate-and-rewrite pattern trades a brief moment of
"file is half-written" visibility for metadata preservation.
For the AI-agent workflow this is acceptable because the mount's
internal lock serializes other `edit` callers; external readers
that race with an `edit` see either the pre-edit content or the
post-edit content (the kernel's page cache makes the partial-write
window vanishingly small for the file sizes the splice supports).

If atomic-rename semantics matter more than metadata preservation
for a particular mount, the mount may opt in via
`{ atomicRename: true }` to write a sibling tempfile and rename.
This is a future option; v1 always uses truncate-and-rewrite.

### File-size cap

The splice reads the whole file into memory.
Without a cap, a multi-GB file would OOM the daemon.

The daemon enforces a default cap of **16 MiB** per `edit` call.
A file whose on-disk size exceeds the cap fails with
`patch-syntax` and a diagnostic naming the file size and the cap.
(Reusing `patch-syntax` for the cap is a deliberate compromise so
v1 does not introduce a sixth `EditFailure` reason; a future
`file-too-large` reason is a clean addition.)

The cap is configurable per mount via a constructor option:

```js
makeMount(directory, { maxEditFileSize: 64 * 1024 * 1024 })
```

The default of 16 MiB is large enough for every source file in
the Endo monorepo (the largest file is under 200 KiB) and small
enough that a runaway agent does not exhaust daemon memory.

### Lock granularity

The mount-internal lock is **per-mount-instance**, not per-file
and not per-OS-path.
Every `edit` against any path within a single `EndoMount`
instance serializes against every other `edit` against any path
within the same `EndoMount` instance.

Two top-level `provideMount` calls that resolve to the same
on-disk directory produce two `EndoMount` instances with
**independent** locks.
A patch issued through one instance does not serialize against a
patch issued through the other.
This is a known limitation; cross-instance serialization would
require either a mount-deduplication layer (one `EndoMount` per
on-disk directory, name-tracked centrally) or a daemon-global
filesystem lock.
Neither is in v1.

The agent contract is: hold the same `directoryRef` for the
duration of an edit session; do not re-resolve the same path
through `provideMount` between reads and edits.
The CAS check via `expectedFileHash` is the safety net when
this contract is violated; the agent will see `file-rev-mismatch`
and re-read.

Sub-mounts derived via `lookup()` from a parent mount share the
parent's lock (they are views into the same `EndoMount`
instance, not independent instances).

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
- **Anchor-width selection on validate.** The patch's anchor hashes
  carry a width (the length of the hex string).
  Each anchor in a patch declares its own width; the validator
  recomputes the live line's CRC at the *patch's* declared width
  for the comparison.
  This means a patch authored against a small (≤4096 lines)
  rendering of a file remains valid even after the file grows past
  4096 lines (the daemon would now render at 4-char width on a
  fresh read, but the agent's earlier patch with 2-char anchors
  still validates).
  The mismatch report includes both widths
  (`{ hashExpected: 'a3', hashActualAtPatchWidth: 'b7',
  hashActualAtFileWidth: 'b73c' }`) so an agent that hand-edits
  the patch can see the file's current native width.

### Single algorithm: CRC32

Per the maintainer's review (2026-05-11): start with CRC32 only.
Per-line anchor hashes are always CRC32 in v1.
There is no `--hash-algo` flag, no `hashAlgo` envelope field, and no
`@hash-algo` header.
A future extension can re-introduce algorithm selection if a concrete
need arises (e.g., off-the-shelf interop with a tool that emits a
different algorithm); the wire format reservation cost of doing so
later is low because the envelope's `expectedFileHash` (always
SHA-256) is a separate field.

The whole-file CAS hash is **always SHA-256**, regardless of the
underlying content store's native digest. The agent computes SHA-256
of the file as it read it; the daemon computes SHA-256 of the file as
it currently is; mismatch fails the edit. This is independent of the
per-line anchor algorithm and stays SHA-256 even if the per-line
algorithm is later made selectable.

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

### Reapply search algorithm (tentative pending kriskowal confirmation)

The proposed v1 algorithm:

1. Search the closed interval `[LINE - 20, LINE + 20]` clipped to
   the file's actual line range.
2. Visit lines in **nearest-by-line-distance** order: `LINE`,
   `LINE - 1`, `LINE + 1`, `LINE - 2`, `LINE + 2`, …
3. Within a tie (a line at distance `d` above and a line at
   distance `d` below), visit the **lower line number first**
   (the line above the original anchor).
4. Collect every candidate whose CRC32 matches `HASH` (within the
   patch's declared anchor width).
5. If exactly one candidate exists in the window, relocate the
   operation to that line.
6. If two or more candidates exist, fail the operation with
   `ambiguous-reapply` and report all candidate line numbers.
7. If no candidate exists, fail the operation with
   `hash-mismatch` (the same failure as strict mode would have
   produced).

The window default of ±20 is configurable via the API option
`{ reapplyWindow: <integer> }` (default 20, max 200).
Larger windows are not free: every candidate is hashed during
the scan, so a 200-line window costs 400 CRC32 computations per
anchor.

This proposal departs from `diff-match-patch`'s algorithm
(which uses a Bitap fuzzy match against quoted context) because
hashline anchors are content hashes, not text quotations.
The nearest-distance order matches the intuition "the line
probably moved a small distance"; the lower-line-number tie
break matches the intuition "an `insert-after L`'s anchor is
more likely to have shifted up than down" (because earlier
inserts grow the file before `L`).

If kriskowal prefers a different default (forward-first,
breadth-first, or a fuzzy match through `diff-match-patch`),
this section is the ratchet point.

The implementation in PR #204 currently defers reapply
(`{ reapply: true }` is accepted but behaves identically to
strict).
The behavior described here lands in phase 2 once the algorithm
is confirmed.

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
- CRC32 per-line anchors; SHA-256 file-rev CAS (the only algorithms
  in v1).
- Test plan: unit tests for parser/validator/splice; integration
  tests for round-trip read-edit-read; CAS race tests with two
  concurrent guests editing the same path.

### Phase 3: secondary formats

- Implement `--format udiff` and `--format search-replace` parsers
  that translate into `EditPatch`.
- Test plan: per-format equivalence tests producing identical results
  to the hashline equivalent.

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

1. **Hash algorithm default. RESOLVED 2026-05-11 per kriskowal:**
   start with CRC32 (single algorithm) for per-line anchors and
   SHA-256 (single algorithm) for the file-rev CAS. The envelope
   carries no algorithm-selection field; future extension cost is
   low because the two algorithms occupy independent fields. The
   off-the-shelf-interop case (oh-my-pi xxhash32, opencode-hashline
   fnv1a) is deferred until a concrete consumer surfaces.

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

## Resolved during builder dispatch

The tentative builder dispatch on PR
[#204](https://github.com/endojs/endo-but-for-bots/pull/204)
surfaced 14 design gaps by reducing the design to code.
The following gaps are resolved inline above; the citations
point to the new normative section.

1. **Trailing-newline preservation.**
   Resolved: `splitLines` returns `{ lines, trailingNewline }`;
   the splice preserves `trailingNewline` byte-for-byte.
   See "Splice contract / Line splitting and trailing newline".
2. **CRLF round-trip behavior.**
   Resolved: CRLF is preserved byte-for-byte through the splice;
   the per-line hash strips `\r` for hashing only.
   See "Splice contract / CRLF round-trip".
3. **Payload LF semantics.**
   Resolved: each payload entry is bare line content with no
   embedded `\n`; an embedded LF is a `patch-syntax` failure.
   See the `EditOp.payload` typedef.
4. **Anchor uniqueness within a patch.**
   Resolved: two ops may share a line; sort applies a fixed
   tiebreaker (`insert-after` > `insert-before` > `replace` /
   `delete`); two `replace L` ops in one patch is `patch-syntax`.
   See "Splice contract / Anchor uniqueness within a patch".
6. **`expectedFileHash` for the empty / absent file.**
   Resolved: empty file uses SHA-256 of the empty byte string
   (`e3b0c44…`); absent files always fail with `path-not-found`;
   `edit` does not implicitly create files.
   See "Splice contract / Empty and absent files".
7. **Lock granularity.**
   Resolved: per-`EndoMount`-instance, not per-file and not
   per-OS-path; sub-mounts share the parent's lock; two
   independent `provideMount` calls have independent locks
   (CAS is the safety net).
   See "Splice contract / Lock granularity".
8. **Permission-error taxonomy.**
   Resolved: filesystem `EACCES` and mount-policy read-only both
   map to `permission-denied`; other OS errors (`EIO`, `ENOSPC`,
   `EROFS`, `EBUSY`) propagate as thrown errors.
   See the `EditFailure` typedef and the prose immediately
   following it.
10. **File mode bits / ownership / xattr.**
    Resolved (mode bits and ownership): truncate-and-rewrite
    preserves them; xattrs are not preserved in v1.
    A future `{ atomicRename: true }` and `{ preserveXattr: true }`
    can extend this.
    See "Splice contract / File mode bits and metadata".
11. **CapTP boundary revalidation.**
    Resolved: the wire shape is plain JSON; the mount re-runs
    `validateEditPatch` on entry; callers cannot rely on
    hardened envelopes round-tripping with identity.
    See the prose under "Patch envelope shape".
12. **Anchor hash-width mismatch behavior.**
    Resolved: validator recomputes the live line at the patch's
    declared width for the comparison; mismatch report includes
    both the patch-width and the file-native-width hash.
    See the `AnchorMismatch` typedef and "Hash algorithm
    specification / Anchor-width selection on validate".
13. **`directoryRef` shape.**
    Resolved: `directoryRef` must satisfy `EndoDirectory`;
    non-mount or non-edit-capable refs return structured
    `path-not-found`, not a CapTP no-such-method error.
    See "Daemon-side API / `directoryRef` contract".
14. **`EndoDirectory` does not currently expose `edit`.**
    Resolved: `edit` is added to the `EndoDirectory` interface;
    `EndoGuest.edit(directoryRef, …)` is sugar that delegates
    to `E(directoryRef).edit(…)`.
    See "Daemon-side API / `directoryRef` contract".

The remaining two gaps (5 and 9) are settled with best-guess
proposals that need maintainer confirmation; see the next
section.

## Open Questions surfaced by builder dispatch

These two gaps from PR #204 are settled with a best-guess
proposal in-line above.
Listing them here for kriskowal's bulk confirmation; the
proposed answer is the section noted.

5. **`--reapply` search algorithm.**
   Best-guess proposal: nearest-by-line-distance within ±20
   lines, ties broken lower-line-number-first; configurable
   via `{ reapplyWindow }`.
   Alternatives considered: forward-first (matches `diff -u`
   convention but biases against the more common "line moved
   up" case for `insert-after`); breadth-first (loses the
   distance signal); `diff-match-patch` Bitap (overkill for
   content-hash anchors).
   See "Reapply mode / Reapply search algorithm".
   Asks: confirm the nearest-distance + lower-first tiebreaker,
   confirm the ±20 default, confirm the configurability.

9. **No file-size cap.**
   Best-guess proposal: 16 MiB default, configurable per mount
   via `{ maxEditFileSize }`; over-cap fails as `patch-syntax`
   (compromise to avoid a sixth `EditFailure` reason in v1).
   See "Splice contract / File-size cap".
   Asks: confirm 16 MiB is appropriate, confirm
   `patch-syntax` is acceptable as the cap-exceeded failure
   reason (vs. introducing `file-too-large`), confirm the
   per-mount knob is the right granularity (vs. daemon-global).

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
  `@expected-file-hash` header.
- Unit tests for the `hashline-json` validator:
  every operation type, missing required fields, malformed envelope.
- Unit tests for the CRC32 hash:
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
