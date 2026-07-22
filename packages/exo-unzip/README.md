# `@endo/exo-unzip`

`@endo/exo-unzip` exposes an in-memory ZIP archive as a virtual
`ReadableTree` / `ReadableBlob` exo hierarchy that conforms to
[`@endo/platform`](../platform)'s
`ReadableTreeInterface` and `ReadableBlobInterface`.
The result is a remotable that the daemon's `storeTree` (or any other
consumer of those interfaces) can walk over CapTP without the caller
ever extracting the archive to a temporary directory.

The motivating use case is `endo checkin -z`: the CLI used to extract
the zip into `os.tmpdir()` and walk the resulting directory with
`makeLocalTree`.
With `unzip`, the `try / finally` cleanup, the temporary
directory, and the second pass over the bytes all disappear:

```js
const exoTree = unzip(zipBytes);
await E(agent).storeTree(exoTree, parsedName);
```

The complementary write-side (readable tree to ZIP bytes) lives in
[`@endo/exo-zip`](../exo-zip).

## Install

```sh
npm install @endo/exo-unzip
```

## Usage

```js
import { unzip } from '@endo/exo-unzip';

const exoTree = unzip(zipBytes, { name: 'release.zip' });

// Use it like any ReadableTree
const names = await exoTree.list();
const blob = await exoTree.lookup(['docs', 'README.md']);
const text = await blob.text();
```

The returned remotable conforms to `ReadableTreeInterface`
(`has`, `list`, `lookup`); leaf blobs conform to
`ReadableBlobInterface` (`streamBase64`, `text`, `json`).

## API

### `unzip(zipBytes, options?) -> ReadableTree`

Open a ZIP archive in memory and present it as a `ReadableTree` exo
whose leaves are `ReadableBlob` exos.

- `zipBytes` (`Uint8Array`): the full archive content.
  The factory takes a `Uint8Array` rather than a stream because
  parsing the central directory needs the whole archive in memory
  anyway and `@endo/zip`'s reader is synchronous.
  A future seekable-stream concept would let an overload accept a
  stream without breaking the existing call sites.
- `options.name` (`string`, optional): a diagnostic name for the
  archive used in error messages.
  Defaults to `<zip>`.

The factory is synchronous.
Sub-tree and leaf exos are materialised lazily on lookup, so a
10 000-entry archive that the caller only enumerates shallowly does
not pay for thousands of unused exos.

## ZIP path safety

`unzip` rejects archives whose entries would be ambiguous or
unsafe to traverse:

- `..` and `.` path segments (zip-slip attempts).
- Empty path segments (a leading or trailing `/`, or a `//` run).
- Any control character (`\x00`-`\x1f`) in a path segment, including
  NUL.
- Two entries that resolve to the same path (duplicate entry).
- An entry whose path is a strict prefix of another entry's path
  (a name that is both a file and a directory).

The same validator is applied to the path arguments of `has`,
`list`, and `lookup`, so adversarial input arriving over CapTP
cannot bypass the construction-time checks.

Validation runs once at construction time for entries read out of
the central directory, so adversarial inputs fail fast rather than
at the first `lookup` call.

## Compression support

`unzip` injects `@endo/zip`'s `inflate` (a thin wrapper around
`DecompressionStream('deflate-raw')`) into every `ZipReader` on
hosts that expose the global, so DEFLATE-compressed archives (the
default produced by `zip`, `7z`, GitHub release downloads, and
`python -m zipfile`) round-trip transparently alongside `STORE`
entries.
On hosts that omit `DecompressionStream` the reader falls back to
its own "no inflate implementation configured" error when a
DEFLATE entry is read; STORE entries continue to work.

The symmetric write-side (readable tree to ZIP bytes) is in
[`@endo/exo-zip`](../exo-zip), which injects the matching `deflate`
so `zip(unzip(bytes))` is round-trip-symmetric on every host the
project targets.

## Hardened JavaScript

The module is `// @ts-check`ed and every named export is hardened.
The package depends only on portable `Uint8Array` / `TextDecoder`
APIs and `@endo/zip`'s synchronous reader, so it loads in XS,
browsers, and SES realms.
