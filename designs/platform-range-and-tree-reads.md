# Platform range reads and recursive tree listing

| | |
|---|---|
| **Created** | 2026-07-12 |
| **Updated** | 2026-07-12 |
| **Author** | endolinbot (prompted by kriskowal) |
| **Status** | In Progress |

## Motivation

The `genie`, `lal`, and `fae` agent toolkits each grew their own file-reading
conveniences: a recursive directory listing, a byte-range read, and a
line-range read. The intention is to **retire those toolkits and consolidate
their features into the platform** (`@endo/platform`) so a single readable-blob
/ readable-tree surface serves every consumer, rather than three parallel
re-implementations.

This design adds three methods to the platform's own read surfaces:

- **`listTree(petNamePath, options?)`** — recursive counterpart to `list`, on
  the readable **tree** surface.
- **`rangeRead(offset, length)`** — whole-value byte-range read, on the
  readable **blob** surface.
- **`rangeReadText(startLine, endLine)`** — whole-value line-range read, on the
  readable **blob** surface.

It also records two explicit decisions from the same directive: **`stat` is
omitted** (it leaks security-germane host details), and **`getInfo` should be
renamed** to something like `contentAddress` (deferred; see § Follow-ups).

## What the platform already had

The platform read surfaces (`packages/platform/src/fs/interfaces.js`, per
[fs-interface-consolidation.md](fs-interface-consolidation.md) § C4) already
carried:

- On blobs: `text` / `json` / `streamBase64` (whole-value), plus
  `getInfo() → { algorithm, hash, size }` and `fetch(offset, length)` — the
  latter a **streaming** windowed read returning a `PassableBytesReader`.
- On trees: `has` / `list` / `lookup` — where `list` is **shallow** (immediate
  child names only).

So the primitives existed, but the *ergonomic whole-value* forms an agent
toolkit wants did not: a recursive listing, a byte range returned as a plain
`Uint8Array`, and a line range returned as text. These three are what genie /
lal / fae each re-invented.

## The methods

### `rangeRead(offset, length) → Uint8Array`

Returns the raw bytes of the window `[offset, offset + length)`, clamped at
EOF, in one round-trip. This is the convenience twin of `fetch`: `fetch`
returns an incremental `PassableBytesReader` (the streaming primitive);
`rangeRead` returns the bytes directly (what a caller reading a bounded window
actually wants). Both share one `readWindow` helper in `local-blob.js`, so the
EOF clamp, the allocation bound (a huge `length` against a small file cannot
drive a multi-GB allocation), and the `EINVAL` validation on negative /
out-of-range offsets are identical.

Offsets are **`bigint`**, matching `fetch` — a blob may exceed
`Number.MAX_SAFE_INTEGER` bytes.

### `rangeReadText(startLine, endLine) → string`

Decodes the blob as UTF-8 and returns lines `[startLine, endLine)` — **0-based,
end-exclusive** — joined with `'\n'`. `endLine` past the last line clamps to
the end; an empty or inverted range returns `''`. A trailing newline yields a
final empty line element, sliced like any other. `\r` is preserved (the caller
observes the file's own line endings).

Line indices are plain **numbers** (ordinary counts, not byte offsets), matching
the ergonomics of the toolkits being consolidated and JS array indexing. A
negative or non-integer index throws `EINVAL` (via the shared `toSafeNumber`).

### `listTree(petNamePath, options?) → Array<{ path: string[], type }>`

Recursive counterpart to `list`. Where `list` yields only the immediate child
names of the sub-path, `listTree` walks the whole subtree in one round-trip and
returns every descendant as a `{ path, type }` record — `path` relative to the
queried node, `type` either `'file'` or `'directory'` — lexically sorted, each
directory emitted **before** its own children. Symlinks and `.git` are skipped
(matching `list`), and the same `maxDepth` guard bounds recursion.

The query is a **`PetNamePath`** — a single `string` name or a `string[]` path,
the same shape `lookup` accepts, with `[]` naming the whole tree — rather than a
rest argument. Taking the path as a single value leaves the second parameter
free for an **options bag**, which is what a plain rest argument (`...path`)
foreclosed.

`options.ignore` (a `string[]`) **augments** — does not replace — the tree's own
ignore set for that one call. This keeps the base ignore list small and
non-arbitrary (only the always-ignored `.git`, matching `list`) while letting a
caller hide additional names at the read site. It deliberately avoids a "magic"
default ignore list baked into the surface: a mount may already carry
attenuations that make names invisible, and any further hiding is the caller's
explicit, per-call choice rather than an arbitrary surface default.

The record carries **no size and no host stat fields**: `type` is structural
(a caller needs it to know whether to recurse or read), whereas size / mtime /
mode would be the same `stat` leak this design omits.

## Why `stat` is omitted

A whole-file `stat` surfaces mtime / atime / mode / inode-shaped host details
that are germane to security (they can fingerprint the host, leak timing, or
distinguish otherwise-opaque backing stores). A caller that needs the byte
length already has `getInfo().size`; nothing else `stat` returns is part of the
portable contract. So `stat` is deliberately **not** added, and `listTree`'s
entry records are trimmed to `{ path, type }` for the same reason.

## Interface layering (blast radius)

The new methods are added as their own method-guard records and their own
pre-assembled interfaces, **not** folded into the shared `readableBlob*` /
`readableTree*` records that every implementer spreads. That containment is
deliberate: an exo's interface guard must match its behavior exactly, so adding
a method to a *shared* record would force every daemon / git / mount implementer
that spreads it to implement the method at once (the wide blast radius
[fs-interface-consolidation.md](fs-interface-consolidation.md) sequences
carefully around).

Instead:

- `rangeReadConvenienceMethodGuards = { rangeRead, rangeReadText }` and
  `recursiveListMethodGuards = { listTree }` are new exported records.
- `ReadableBlobRangeReadInterface` = `readableBlob` + `rangeRead`(getInfo/fetch)
  + the conveniences. A **tree implies recursion**, so `listTree` needs no
  separate "recursive tree" variant: it is spread onto the plain
  `ReadableTreeInterface` (the platform's own tree interface, tagged
  `'ReadableTree'`) directly. Because that interface is *not* the shared
  `readableTreeMethodGuards` record — which the daemon's own `EndoReadableTree`,
  git, and mount tree exos spread — those implementers are still unaffected; the
  containment is preserved by keeping `listTree` off the shared record, not by
  minting a parallel interface.
- The platform's own `LocalBlob` / `LocalTree` adopt the richer interfaces now.
  The daemon / git / mount blob and tree exos keep their current leaner
  interfaces and are unaffected; adopting the conveniences there is a follow-up.

Feature detection stays structural (by method name via `__getMethodNames__`);
the distinct interface tags only keep diagnostics unambiguous.

## Follow-ups

- **Rename `getInfo` → `contentAddress`.** Raised as an aside in the same
  directive ("`getInfo` is poorly named … should become more like
  `contentAddress()`"). It is a cross-cutting rename touching ~30 files across
  daemon / git / chat / platform and is intentionally **out of scope** here to
  keep this change reviewable; it wants its own PR (likely with a deprecation
  alias window). Tracked as a follow-up.
- **Propagate the conveniences to the daemon / git / mount blob and tree
  exos**, so `rangeRead` / `rangeReadText` / `listTree` are available over
  CapTP from a remote daemon, not just on the in-process platform surfaces.

## Dependencies

| Design | Relationship |
|---|---|
| [fs-interface-consolidation.md](fs-interface-consolidation.md) | Owns the readable-blob / readable-tree surfaces and the `getInfo` / `fetch` primitives these conveniences build on. |
| [platform-fs.md](platform-fs.md) | Owns the platform `lite` vocabulary the new records join. |
