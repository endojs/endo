# `@endo/exo-zip` package

| | |
|---|---|
| **Created** | 2026-05-08 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Source** | PR #128 inline review comment ([discussion_r3205653903](https://github.com/endojs/endo-but-for-bots/pull/128#discussion_r3205653903)) |

## What is the Problem Being Solved?

PR #128 (`endo checkin` / `endo checkout`) implements the `-z` flag by
extracting the zip into a temporary directory and then walking that
directory with `makeLocalTree`.
The maintainer flagged this on `packages/cli/src/commands/checkin.js:36`:

> An intermediate representation on the filesystem is superfluous.
> We can open a Zip in memory with `@endo/zip` (with deflate/inflate
> configured) and then present a virtual tree from the Zip.
> Consider creating an `@endo/exo-zip` package that exposes an
> in-memory ZIP as an Exo directory/file tree for consumption over
> CapTP.

The intermediate filesystem representation has three costs:

1. It requires creating a temporary directory, registering a `try /
   finally` cleanup, and recovering from partial-extraction failure.
2. It doubles the I/O: every byte is written to disk and immediately
   re-read by the tree walker.
3. It conflates two concerns inside `checkin.js`: the zip-decoding
   concern and the tree-walking concern.
   Each is reusable on its own, but the current shape only ships them
   fused.

The desired shape is a small package that returns a `ReadableTree`
exo whose `list()` and `lookup()` honour the in-memory zip's central
directory, and whose leaf `lookup()` returns a `ReadableBlob` exo
whose `streamBase64()` decompresses on demand.
The CLI's `checkin -z` then collapses to a single call:

```js
const exoTree = makeExoZip(zipBytes);
await E(agent).storeTree(exoTree, parsedName);
```

## Design

### Package layout

```
packages/exo-zip/
  package.json
  README.md
  index.js
  src/
    exo-zip.js          // makeExoZip(zipBytes)
    exo-zip-tree.js     // internal ReadableTree exo
    exo-zip-blob.js     // internal ReadableBlob exo
  test/
    exo-zip.test.js
  tsconfig.json
  tsconfig.build.json
```

`package.json` declares dependencies on `@endo/exo`, `@endo/far`,
`@endo/harden`, `@endo/zip`, `@endo/stream`, and `@endo/platform` (for
`ReadableTreeInterface` and `ReadableBlobInterface`).
The package is pure ECMAScript with no Node built-ins, so it is
loadable in XS, browsers, and SES realms.

### Exported surface

```js
// index.js
export { makeExoZip } from './src/exo-zip.js';
```

```js
// src/exo-zip.js
import harden from '@endo/harden';
import { ZipReader } from '@endo/zip/reader.js';
import { makeExoZipTree } from './exo-zip-tree.js';

/**
 * Open a ZIP archive in memory and present it as a ReadableTree exo
 * whose leaves are ReadableBlob exos.
 * Suitable for handing to `E(agent).storeTree(...)` over CapTP.
 *
 * @param {Uint8Array} zipBytes
 * @param {{ name?: string }} [options]
 */
export const makeExoZip = (zipBytes, options = {}) => {
  const { name = '<zip>' } = options;
  const zipReader = new ZipReader(zipBytes, { name });
  return makeExoZipTree(zipReader, '');
};
harden(makeExoZip);
```

The factory is synchronous because `@endo/zip`'s `ZipReader`
constructor is synchronous: it parses the central directory and
decompresses each entry on demand when `.read(name)` is called.
A future lazy-zip API could make the tree async without changing the
caller's contract.

### Tree shape

`@endo/zip` exposes a flat `Map<string, ZFile>` keyed by the zip
entry's full path (segments joined by `/`).
The tree exo synthesizes the directory hierarchy from those paths:

- Group entries by their first path segment.
- A segment that has further children becomes a sub-`ReadableTree` exo
  with the segment name stripped from each child path.
- A segment that is a leaf becomes a `ReadableBlob` exo backed by the
  zip entry's lazy `read(fullPath)`.
- Empty path components and `.` / `..` segments are rejected at
  construction time so the resulting tree cannot escape the archive's
  namespace.

The grouping is computed once when `makeExoZip` is called.
Each tree node holds a `Map<string, () => exo>` of child factories so
sub-exos materialise only when looked up.
This keeps `list()` cheap on large archives and avoids creating tens
of thousands of exos for an archive that the caller only enumerates
shallowly.

### Exo guards

The package reuses the canonical interfaces from
`packages/platform/src/fs/interfaces.js`:

- `ReadableTreeInterface` for tree nodes (`has`, `list`, `lookup`).
- `ReadableBlobInterface` for blob leaves (`streamBase64`, `text`,
  `json`).

These are the same guards `makeLocalTree` and `makeLocalBlob` already
use, so the daemon's `platformCheckinTree` (in
`packages/platform/src/fs/checkin.js`) consumes the exo-zip output
without any branching.
The `daemon-checkin-checkout` design's host method
`storeTree(M.remotable(), NameOrPathShape)` already accepts any
remotable that conforms to `ReadableTreeInterface`; `makeExoZip`
returns exactly that.

The `daemon/src/interfaces.js` `EndoReadableTree` guard adds `sha256`
and `help`.
That guard belongs to the daemon-side hosted readable, not the
client-side adapter.
The exo-zip output sits on the client side of CapTP, so the
platform-level `ReadableTreeInterface` is the right one to satisfy.

### Blob streaming

The blob exo's `streamBase64()` returns a one-shot `ReaderRef` that
yields a single base64-encoded chunk:

```js
const bytes = zipReader.read(fullPath);          // Uint8Array
const base64 = uint8ArrayToBase64(bytes);
async function* once() { yield base64; }
return makeReaderRef(once());
```

A single chunk is acceptable because `@endo/zip` already buffers the
decompressed content in memory; there is no streaming win from
chunking smaller.
For very large entries a future enhancement could chunk at, say,
64 KiB boundaries to keep CapTP frames small, but that is an
optimisation, not a correctness concern.

`text()` decodes the bytes as UTF-8 via `TextDecoder`; `json()` is
`JSON.parse` of the same.
Both follow the `@endo/platform` blob conventions and use
`Uint8Array` + `TextDecoder` rather than Node `Buffer`, per the
project's portability rules.

### How `daemon-checkin-checkout`'s `checkin -z` collapses

Before, from PR #128:

```js
if (zip) {
  // …read zipBytes from path or stdin…
  tmpDir = await extractZipToTemp(zipBytes);
  resolvedPath = tmpDir;
}
try {
  const localTree = makeLocalTree(resolvedPath, { onFile });
  await E(agent).storeTree(localTree, parsedName);
} finally {
  if (tmpDir) await fs.promises.rm(tmpDir, { recursive: true });
}
```

After:

```js
const sourceTree = zip
  ? makeExoZip(await readZipBytes(sourcePath, stdin))
  : makeLocalTree(resolvedPath, { onFile });
await E(agent).storeTree(sourceTree, parsedName);
```

The `try / finally` and the `extractZipToTemp` helper are deleted;
`onFile` becomes a wrapper around the exo's `lookup` (or the daemon's
checkin walk gains a per-blob callback, which is a small follow-on).
The CLI no longer touches `os.tmpdir()` for the zip path.
`makeExoZip` accepts a `Uint8Array` directly per the resolved
Open Question 1 (streaming-zip support is deferred until a
seekable-stream concept exists; a `ReaderRef` is not enough).

### Symmetric write path: what `checkout -z` should do

The current PR #128 `checkout -z` walks the readable-tree itself with
`__getMethodNames__` discrimination and pushes each entry into a
`ZipWriter`.
There is a symmetry argument for a sibling `makeExoWritableZip()` that
exposes a `WritableTree`-flavoured exo backed by an in-memory
`ZipWriter`, but the asymmetry is real and load-bearing:

- **Read side (`checkin -z`).**
  The daemon's `storeTree` consumes a `ReadableTree` over CapTP.
  The CLI must hand it a remotable.
  An exo adapter is the only way to bridge in-memory bytes to
  `storeTree`.
- **Write side (`checkout -z`).**
  The CLI has direct access to the daemon's `readable-tree` exo and
  can walk it with `list` / `lookup` / `streamBase64` against the
  daemon over CapTP.
  No `WritableTree` interface exists in `platform/src/fs/interfaces.js`
  (`TreeWriterInterface` and `DirectoryInterface` cover mutation, but
  neither is the dual of `ReadableTree`).
  The natural shape is: walk the remote tree client-side, accumulate
  into a local `ZipWriter`, snapshot, write.

The recommendation is therefore to ship `makeExoZip` for the read side
only.
The write side stays inline in PR #128's `checkout.js` for now (the
`addTreeToZip` walker function already there).
The walker is not specific to zip output: the same shape would work
for tar or any other archive format, so its eventual home is a lite
helper module under `@endo/platform` (or a sibling pure-JavaScript
helper package), reused across archive backends.
Per the maintainer's guidance on Open Question 3 (review
[4255618212](https://github.com/endojs/endo-but-for-bots/pull/154#pullrequestreview-4255618212)),
inline is fine until we find multiple uses.

The (intentional) consequence is that `@endo/exo-zip` is asymmetric on
purpose: it ships only `makeExoZip` (an exo adapter, because that is
the only way to feed bytes into `storeTree`) and leaves the dual
walker to its consumer until a second consumer materialises.
A future `WritableTree` exo could collapse the asymmetry, but that is
a separate design and not a blocker.

### Tests

`test/exo-zip.test.js` exercises:

- Round-trip: write a zip with `ZipWriter`, open with `makeExoZip`,
  verify `list()` at every level matches the input directory shape.
- `lookup` resolves nested paths in a single call
  (`lookup(['a', 'b', 'c.txt'])`).
- `streamBase64` decoded bytes equal the original entry content.
- `text()` and `json()` shortcuts work for UTF-8 and JSON entries.
- Hostile input: zip entries with `..` segments, empty segments, or
  duplicate paths are rejected at `makeExoZip` time, not at `lookup`
  time.
- An archive produced by walking `makeExoZip(bytes)` with a
  `ZipWriter` (the same inline walker `checkout.js` uses) is
  byte-identical to the input (modulo zip metadata that
  `@endo/zip/writer` re-derives).
  This guards the round-trip property without depending on a
  walker exported from this package.
- The whole module passes `__getMethodNames__()` so the daemon's
  `platformCheckinTree` discrimination works without poking unknown
  methods.

The package's tests do not depend on the daemon; an integration test
in `packages/daemon/test/` (or `packages/cli/test/`) will cover the
`checkin -z` end-to-end path once PR #128 is reshaped.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-weblet-application](daemon-weblet-application.md) | **Depends on.** Defines the `readable-tree` formula type and its `ReadableTreeInterface` shape that `makeExoZip` conforms to. |
| [daemon-checkin-checkout](daemon-checkin-checkout.md) | **Depends on (consumer).** The `checkin -z` algorithm is the primary caller of `makeExoZip`. The `checkout -z` algorithm walks the readable-tree inline against an in-memory `ZipWriter`; the walker stays in the CLI until a second consumer justifies extraction. |

**Reshape blocker for:** PR #128 (`checkin.js`).
The PR's current `checkin.js` extracts to a temp directory; reshape
merges this design's `makeExoZip` adapter and deletes
`extractZipToTemp`.
`checkout.js`'s inline tree-to-zip walker stays in place; no reshape
is required there.

## Implementation Phases

1. **Package skeleton (S).**
   `packages/exo-zip/` with `package.json`, `index.js`, `src/`,
   `test/`, `tsconfig*.json`.
   Stub `makeExoZip` returning an empty exo so the package builds and
   the test runner finds it.

2. **`makeExoZip` read path (S).**
   Parse zip via `@endo/zip`, group entries into a tree, implement
   `ReadableTree` and `ReadableBlob` exos with the platform guards.
   Tests for round-trip, deep paths, hostile input.

3. **PR #128 `checkin.js` reshape (S).**
   Replace `extractZipToTemp` + `try / finally` in `checkin.js` with
   `makeExoZip`.
   Drop `os.tmpdir()` and `fs.promises.rm` from `checkin.js`.
   `checkout.js`'s inline tree-to-zip walker is left in place per the
   resolved Open Question 3.

Phases 1 and 2 land in a single `feat(exo-zip): in-memory ZIP as
exo readable-tree` PR.
Phase 3 is a follow-on PR that retargets PR #128's `checkin.js`
substance against the new package.

## Design Decisions

1. **Exo adapter, not a CapTP-side daemon formula.**
   `makeExoZip` runs in the CLI process and presents the zip as a
   client-side remotable that the daemon walks over CapTP.
   Putting the zip inside the daemon would require a new formula type
   for an in-memory archive, which is out of scope; the existing
   `readable-tree` formula type captures the post-checkin state
   cleanly.

2. **Reuse `@endo/platform`'s `ReadableTreeInterface`, not the
   daemon's `EndoReadableTree`.**
   The platform interface omits `sha256` and `help` because the
   client-side adapter does not have a content hash to report (the
   hash is computed by the daemon during checkin) and `help` is a
   daemon-side discoverability convention.
   Conforming to the smaller interface keeps the package free of
   daemon dependencies.

3. **Lazy materialisation of sub-exos.**
   A 10 000-entry archive should not allocate 10 000 exos at
   `makeExoZip` time.
   The grouping pass produces child factories; `lookup` invokes them.
   The cost of repeated `lookup` calls on the same name is one extra
   exo creation each time; the daemon's checkin walk only calls each
   `lookup` once, so this is a non-issue in the load-bearing path.

4. **Asymmetric read/write API; walker stays inline at the consumer.**
   `makeExoZip` (exo) on the read side; the dual write-side walker
   stays inline in `checkout.js` for now.
   The asymmetry reflects that `storeTree` requires a remotable input
   while the readable-tree output of `checkout` is already a
   remotable that the CLI can walk directly.
   The walker's eventual home is a lite helper module under
   `@endo/platform` (or a sibling pure-JavaScript helper package),
   reused across archive backends, but inline is fine until we find
   multiple uses (resolved Open Question 3).
   A future `WritableTreeInterface` could collapse the asymmetry
   further, but this design does not block on inventing one.

5. **No streaming decompression.**
   `@endo/zip`'s reader buffers each entry's decompressed bytes in
   memory.
   `streamBase64()` therefore yields a single chunk.
   Chunking at, say, 64 KiB is straightforward to add later without
   changing the API.

6. **`Uint8Array` and `TextDecoder` throughout, no `Buffer`.**
   Per the project's portability rules, the package must load in XS
   and SES realms where `Buffer` is unavailable.
   `@endo/zip` already uses `Uint8Array`; `makeExoZip` carries that
   through.

7. **`makeExoZip` accepts `Uint8Array`, not a stream.**
   The CLI reads the whole zip into memory before calling
   `makeExoZip`.
   Accepting a stream would let very large archives skip the
   buffering step in principle, but `@endo/zip` requires the full
   bytes to parse the central directory anyway, and a stream alone
   is not enough: lazy zip access needs a *seekable* stream concept,
   which the project does not yet define.
   Streaming zip support is deferred until that concept exists, at
   which point `makeExoZip` can grow an overload without breaking
   the `Uint8Array` callers.
   (Resolved Open Question 1.)

8. **Separate `@endo/exo-zip` package, not a sibling export from
   `@endo/zip`.**
   `@endo/zip` is deliberately dependency-free.
   Folding the adapter in (even as a sibling entry point) would
   entrain Passable / exo machinery into `@endo/zip`'s core library.
   A separate package keeps `@endo/zip` minimal and isolates the
   exo / `@endo/platform` dependency chain to the adapter.
   (Resolved Open Question 2.)

## Resolved Questions

The original design carried three Open Questions that were resolved
inline by the maintainer in review
[4255618212](https://github.com/endojs/endo-but-for-bots/pull/154#pullrequestreview-4255618212).
Their resolutions are folded into the design body above:

1. **`Uint8Array` vs `ReaderRef` input.**
   Resolution: `Uint8Array` (Decision 7).
   Streaming zip is deferred until a seekable-stream concept exists.

2. **`@endo/exo-zip` vs sibling export from `@endo/zip`.**
   Resolution: separate `@endo/exo-zip` package (Decision 8).
   Avoids entraining Passable machinery in `@endo/zip`'s core
   library.

3. **Walker location (`writeZipFromTree`).**
   Resolution: walker stays inline at the consumer (`checkout.js`)
   for now (Decision 4 and the *Symmetric write path* section).
   Future home is a lite helper module under `@endo/platform` (or a
   sibling pure-JavaScript helper package).
   Per the maintainer: "inline is fine until we find multiple uses".

## Prompt

> Design an `@endo/exo-zip` package that exposes an in-memory ZIP
> archive (read via `@endo/zip` with deflate/inflate) as a virtual
> `readable-tree` / `readable-blob` exo hierarchy consumable over
> CapTP.
> The package should let a caller open a Zip in memory and present it
> as the same `ReadableTreeInterface` / `EndoReadable` that
> `daemon-checkin-checkout` consumes, eliminating the intermediate
> filesystem extraction step in `endo checkin -z`.
