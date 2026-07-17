# @endo/platform

Host-platform adapters for Endo's filesystem and process seams. The
package keeps the platform-agnostic contracts (types and lite
implementations) separate from the host-specific bindings, so a consumer
depends on the seam it needs without pulling a host graph it does not.

## Entry points

- `@endo/platform/fs/lite` — the platform-agnostic filesystem layer
  (snapshot store, blob, and tree machinery).
- `@endo/platform/fs/lite/types` — the filesystem contracts, including
  `ContentStoreFilePowers` and `ContentStoreCryptoPowers` (the seam a
  filesystem-backed `ContentStore` injects).
- `@endo/platform/fs/node` — the `node:fs`-backed adapters
  (`makeLocalBlob`, `makeLocalTree`, `makeTreeWriter`, and the
  content-store powers below).
- `@endo/platform/fs/extended` — the extended filesystem backends.
- `@endo/platform/proc` and `@endo/platform/exo-fs` — process and
  exo-filesystem helpers.

## Content-store powers (`@endo/platform/fs/node`)

A filesystem-backed `ContentStore` (such as `@endo/daemon-cas`) stores and
fetches blobs by their sha256, injecting a filesystem seam and a
content-addressing seam so the store implementation stays host-agnostic.
`@endo/platform/fs/node` exports the real-`node:fs` / `node:crypto`
implementations of those two seams, so a content store and its tests share
one powers source rather than hand-rolling the plumbing:

```js
import {
  makeContentStoreFilePowers,
  makeContentStoreCryptoPowers,
} from '@endo/platform/fs/node';
import { makeContentStore } from '@endo/daemon-cas';

const store = makeContentStore(storageDirectoryPath, {
  filePowers: makeContentStoreFilePowers(),
  cryptoPowers: makeContentStoreCryptoPowers(),
});
```

`makeContentStoreFilePowers()` returns the `ContentStoreFilePowers`
nine-method file seam:

- `makeFileReader(path)` — a whole-blob `@endo/stream` byte reader.
- `makeFileWriter(path)` — the temp-file sink the `store` loop streams
  chunks into before the atomic rename.
- `readFileText(path)` — read the whole blob as UTF-8 text.
- `readFileRange(path, offset, length)` — a windowed read of
  `[offset, offset + length)`, clamped at end of file.
- `statPath(path)` — `{ kind, size, mtime, atime }` where `size` is a
  bigint byte count and `mtime` / `atime` are bigint nanosecond
  timestamps.
- `makePath(path)` — recursive directory creation.
- `joinPath(...components)` — path composition.
- `renamePath(source, target)` — the atomic rename onto the sha256 name.
- `removePath(path)` — idempotent removal (a missing path is not an
  error).

`makeContentStoreCryptoPowers()` returns the `ContentStoreCryptoPowers`
content-addressing seam: `makeSha256()` (a streaming digester with
`update` and hex `digestHex`) and `randomHex256()` (the temp-file name
source).
