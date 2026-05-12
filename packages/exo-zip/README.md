# `@endo/exo-zip`

`@endo/exo-zip` walks a `ReadableTree` exo (local or borne over CapTP)
and serializes its blobs into in-memory ZIP archive bytes.
It is the symmetric write-side of
[`@endo/exo-unzip`](../exo-unzip), which exposes ZIP bytes as a
`ReadableTree`.

The motivating use case is `endo checkout -z`: rather than walking
the daemon-side tree to a temp directory and then zipping that
directory, the CLI calls `zip(tree)` and ships the resulting bytes
straight to the user, e.g.:

```js
const bytes = await zip(tree);
await fs.promises.writeFile('release.zip', bytes);
```

## Install

```sh
npm install @endo/exo-zip
```

## Usage

```js
import { zip } from '@endo/exo-zip';

const tree = await E(agent).lookup('release');
const bytes = await zip(tree);
```

The input tree must conform to
[`@endo/platform`](../platform)'s `ReadableTreeInterface` (`has`,
`list`, `lookup`); leaf blobs must conform to `ReadableBlobInterface`
(`streamBase64`, `text`, `json`).
Both interfaces are honoured by `unzip` from `@endo/exo-unzip`,
the daemon's `ReadableTree`, and any other exo that conforms.

## API

### `zip(tree, options?) -> Promise<Uint8Array>`

Walk a readable-tree exo and serialize it into in-memory ZIP archive
bytes.

- `tree` (`ReadableTree`): the readable-tree exo to serialize.
  May be local or remotable; the walker uses `E()` for every method
  send so a CapTP-borne tree just works.
- `options.date` (`Date`, optional): the mtime stamped on each
  entry's header.
  Defaults to the `ZipWriter`'s default (the current wall-clock
  time at construction).

The function is async because `list`, `lookup`, and the
`streamBase64` drain are all async.

Sub-tree vs leaf-blob discrimination uses `__getMethodNames__()`
rather than duck-typing, mirroring `@endo/platform`'s
`checkoutTree`.
This avoids noisy CapTP failure logs that duck-typing would
generate on every blob.

## Compression support

`zip` emits DEFLATE entries on hosts that expose `CompressionStream`
(Node 18+, modern browsers, XS via web-stream shims) by injecting
`@endo/zip`'s `deflate` into the underlying `ZipWriter`.
On hosts that omit `CompressionStream` the writer falls back to
`STORE` so the call still succeeds; output is portable but larger.

The companion read-side `unzip` from `@endo/exo-unzip` injects the
matching `inflate`, so a `zip(unzip(bytes))` round-trip is symmetric
on every host the project targets.

## Hardened JavaScript

The module is `// @ts-check`ed and every named export is hardened.
The package depends only on portable `Uint8Array` / `TextDecoder`
APIs and `@endo/zip`'s synchronous writer, so it loads in XS,
browsers, and SES realms.
