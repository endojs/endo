# ReadableBlob Range Attenuation

| | |
|---|---|
| **Created** | 2026-07-22 |
| **Updated** | 2026-07-22 |
| **Author** | kriscendobot (prompted) |
| **Status** | Proposed |

## Problem

`ReadableBlob.fetch(offset, length)` is a byte-window read, not a network
operation. Its name consequently hides both its unit and its capability
meaning. It returns a one-use bytes reader, so a caller cannot pass the
selected part of a blob on as the same read capability.

The replacement is an attenuation. `range` and `textRange` return a new,
ephemeral `ReadableBlob` with exactly the authority to read the selected
portion. The returned value has the same interface, so ranges compose and can
be handed to code that already accepts a readable blob.

## Current surface and terminology

The current public range method is not confined to the daemon. The shared
platform guard `rangeReadMethodGuards` in
[`packages/platform/src/fs/interfaces.js`](../packages/platform/src/fs/interfaces.js)
declares `getInfo()` and `fetch(offset: bigint, length: bigint)`. It is
combined with the base surface as `ReadableBlobRangeInterface`, and
`ReadableBlobRangeReadInterface` additionally declares the convenience methods
`rangeRead` and `rangeReadText`.

The daemon's `BlobInterface` in
[`packages/daemon/src/interfaces.js`](../packages/daemon/src/interfaces.js)
uses that guard. Its persisted `makeReadableBlob` and transient `makeBytesBlob`
implementations are in
[`packages/daemon/src/manager.js`](../packages/daemon/src/manager.js). The
live `EndoMountFile` and its `readOnly()` view implement it in
[`packages/daemon/src/mount.js`](../packages/daemon/src/mount.js). The same
shape is also implemented by platform `LocalBlob`
([`packages/platform/src/fs-node/local-blob.js`](../packages/platform/src/fs-node/local-blob.js)),
extended `BlobRef`
([`packages/platform/src/fs/extended/type-guards.js`](../packages/platform/src/fs/extended/type-guards.js)
and `shared/blobref.js`), and the Git blob in
[`packages/git/src/native-git-backend.js`](../packages/git/src/native-git-backend.js).
`packages/exo-git/src/types.ts` aliases this rich type as its `ReadableBlob`.

There are no public `readRange*` methods on the directory-like daemon exos.
`EndoDirectory`, `EndoGuest`, and `EndoHost` expose `readText` and
`maybeReadText`; trees expose `has`, `list`, and `lookup`. The similarly named
`ContentStoreBlob.readRange` is an internal safe-number backing seam, not a
CapTP method. The current public convenience convention is instead
`LocalBlob.rangeRead` and `LocalBlob.rangeReadText`, both blob methods. This
design deliberately corrects that distinction rather than extending a
nonexistent directory convention.

## Proposed interface

Make range attenuation part of the one rich `ReadableBlob` interface. The
current `ReadableBlobRange` and `ReadableBlobRangeRead` distinction goes away:
every public rich blob has the following methods in addition to `getInfo`,
`text`, `json`, `streamBase64`, and `help`.

```ts
range(start: bigint, end: bigint): Promise<ReadableBlob>
textRange(startLine: number, endLine: number): Promise<ReadableBlob>
```

An eventual send to either method naturally resolves to the returned remote
capability. The runtime guards should require the returned `ReadableBlob`, not
`M.any()`, so the same-interface guarantee is enforced at the CapTP boundary.

### Byte ranges

`range(start, end)` selects the half-open byte interval `[start, end)`, relative
to the receiver. Both values must be non-negative `bigint` values representable
by the backing implementation's safe-offset domain. `start > end`, a negative
value, or a non-safe value rejects with `EINVAL`; `start === end` returns an
empty readable blob. The endpoint convention intentionally differs from the
old `(offset, length)` signature: an end offset makes nested ranges and
adjacent ranges mechanically clear.

The selection clamps at the receiver's end. Thus `range(100n, 200n)` on a
12-byte blob is a valid empty attenuation, and `range(6n, 100n)` yields the
suffix. Constructing a byte range does not read or persist bytes. The returned
cap retains only its source cap plus the composed interval, so a range of a
range intersects the two intervals and can never regain authority outside the
parent interval.

Every ordinary read applies to the attenuated bytes. In particular, `text()`
and `json()` decode only those bytes, `streamBase64()` streams only those bytes,
and `getInfo()` reports the selected content's `{ algorithm, hash, size }`.
For an immutable source that is a stable content address for the selected
bytes. For the existing live mount-file face, it preserves the current live
semantics: each operation observes the source at that operation, subject to
the fixed interval; callers needing a stable selection first take a snapshot.
An empty range has size `0n` and the SHA-256 of empty bytes.

### Text ranges

`textRange(startLine, endLine)` selects lines `[startLine, endLine)`, relative
to the receiver's current bytes, and returns the corresponding byte-slice as a
`ReadableBlob`. The proposed model follows the existing `rangeReadText`
addressing convention: line indices are non-negative integer JavaScript
`number`s, zero-based, and end-exclusive. A negative, fractional, or
non-safe index rejects with `EINVAL`; an inverted interval rejects with
`EINVAL`; an equal interval or a start at or beyond the end returns an empty
blob. An end after the last line clamps at the end.

Line boundaries are LF (`0x0a`). A CR before LF remains content, so CRLF is
preserved rather than normalized. A final LF creates the same terminal empty
line used by `rangeReadText`; selecting through that line preserves the final
LF. This keeps `await E(blob).textRange(a, b).text()` consistent with
`rangeReadText`: the same line-origin, endpoint, clamping, and trailing-newline
behavior, so the two spellings never disagree about which bytes a line range
selects.
UTF-8 decoding is only performed by `text()` or `json()` and follows their
existing decoder behavior; finding LF byte boundaries neither normalizes nor
materializes unrelated bytes.

`textRange` is intentionally defined on the receiver, not on the original
blob. A text range of a byte range indexes the lines visible in that byte
range; a byte range of a text range indexes its selected bytes. This is the
useful attenuation law, even when a byte range begins or ends mid-line.

## Relationship to `rangeRead*`

The public `rangeRead` / `rangeReadText` helpers should co-evolve toward this
shape, rather than be copied onto directory exos. They currently exist only on
the in-process `LocalBlob`, return materialized values, and are explicitly a
follow-up for daemon, Git, and mount blobs in
[platform-range-and-tree-reads.md](platform-range-and-tree-reads.md).

Recommendation: replace `rangeRead(offset, length)` with `range(start, end)`
and `rangeReadText(startLine, endLine)` with `textRange(startLine, endLine)` in
the next rich-blob API version. The result-type change is intentional: callers
read the returned attenuated blob by its normal methods rather than receiving a
special one-shot value. Do not add either spelling to `Directory`,
`ReadableTree`, `EndoDirectory`, `EndoGuest`, or `EndoHost`; path selection
continues to happen with `lookup`, then range selection happens on the blob.

## Rename and refactor plan

This is a semantic rename, not a mechanical `fetch` search-and-replace. The
old method's result is `PassableBytesReader`; the new method's result is a
same-interface capability. In particular, `fetch` cannot be an alias of
`range`.

The implementation owner must inventory these range-specific definitions and
callers before editing. The list is intentionally separated from unrelated
HTTP, Git-transport, and content-store methods also named `fetch`:

| Area | Definitions or callers to update |
|---|---|
| Shared lite contract | `packages/platform/src/fs/interfaces.js`, `types.d.ts`, `index.js`, and `packages/exo-git/src/types.ts` |
| Implementations | `packages/platform/src/fs-node/local-blob.js`; `packages/platform/src/fs/extended/shared/blobref.js`; `packages/daemon/src/manager.js` (`makeReadableBlob`, `makeBytesBlob`); `packages/daemon/src/mount.js` (`makeMountFileExo`, `makeReadableBlobView`); `packages/git/src/native-git-backend.js` |
| Extended guard and consumers | `packages/platform/src/fs/extended/type-guards.js`, `cas.js`, and `cached-fs.js` |
| Daemon guard, declarations, and help | `packages/daemon/src/interfaces.js`, `types.d.ts`, `help-text-data.js`, and `help.md` |
| Existing range tests | `packages/platform/test/{local-blob,blobref,node-fs,optimal-querying}.test.js`; `packages/daemon/test/{endo,mount,git}.test.js`; the mount conformance tests |
| Design and API prose | `designs/{fs-interface-consolidation,platform-range-and-tree-reads,agentry-git-eval-scenarios,endo-fs-from-git,fs-interface-reconciliation,registry-capability,snapshot-mapper}.md`, `designs/README.md`, and `packages/platform/src/fs/extended/DESIGN.md` |

1. Add a shared attenuation maker and tests for byte composition, empty and
   EOF-clamped selections, revocation/liveness, `getInfo` on selected content,
   and text-line selections. Adopt it in every rich blob implementation above.
   Keep the source's identity and lifetime private: derived ranges receive no
   formula, name, or persistence entry.
2. Replace `fetch`, `rangeRead`, and `rangeReadText` with `range` and
   `textRange` on every producer in one clean break — migration is not a
   concern, so no deprecated aliases, compatibility window, or legacy-adapter
   package. Update internal consumers (`cas.js`, `cached-fs.js`, and daemon
   consumers) to the new cap shape, decoding/streaming through the normal blob
   surface where they formerly consumed a bytes reader.
3. Rename the shared guard to the single `ReadableBlob` surface, drop the
   `ReadableBlobRange*` names, update generated declarations and help text, and
   make method-set conformance tests assert that every derived cap exposes the
   same methods as its parent.

The test matrix must include nested byte ranges, byte-after-text and
text-after-byte ranges, terminal-LF behavior, CRLF preservation, invalid
arguments, `start === end`, EOF clamping, immutable snapshot stability, live
mount changes, and revocation.

## Resolved decisions

1. `textRange` keeps the zero-based, end-exclusive, LF-with-terminal-empty-line
   model, staying consistent with `rangeReadText` rather than adopting a
   divergent line/terminal-LF convention. The two spellings address lines
   identically.
2. No compatibility window and no versioned legacy-adapter package. Migration
   is not a concern, so the old methods are replaced outright rather than kept
   as deprecated aliases for a release.
3. Every current rich blob (`BlobRef`, LocalBlob, daemon stored and transient
   blobs, mount views, and Git blobs) adopts the new surface in the one clean
   release. There is no daemon-only-first phase and no temporary interface
   split.
