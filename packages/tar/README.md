# Endo tar

This is a minimal, portable tar archive **reader**.
It decodes the regular files, directories, and symlinks that native
`git archive --format=tar` emits, honoring the pax extended headers
(`path`, `linkpath`, and `size` overrides) that `git archive` writes whenever
an entry does not fit the legacy ustar header fields.

The reader has no dependency on any built-in module: it operates entirely on
an `AsyncIterable<Uint8Array>` byte source and `Uint8Array` content, which
makes it suitable for embedding in an XS binary, bundling for any platform,
and running inside a locked-down SES realm.
This package is reader-only by design; producing a tar archive is left to a
native `git archive` (or another writer).

## Usage

`readTarEntries` consumes a byte source and yields each archive entry in
order.
The archive is never buffered as a whole: at most one 512-byte header block
plus a partial source chunk are held at a time, and each entry's content is
streamed chunk-by-chunk.

```javascript
import { readTarEntries, tarPathSegments } from '@endo/tar';

for await (const entry of readTarEntries(byteSource)) {
  // entry: { type: 'file' | 'directory' | 'symlink', path, size, linkname, content }
  const segments = tarPathSegments(entry.path);
  if (entry.type === 'file') {
    for await (const chunk of entry.content) {
      // consume the streamed content bytes
    }
  } else {
    // Directories and symlinks carry no data, but their `content` must
    // still be drained to keep the reader block-aligned.
    for await (const _chunk of entry.content) {
      // drain padding
    }
  }
}
```

The reader is stateful and block-aligned, so a consumer **must fully drain
each entry's `content` before resuming iteration**.

### Format primitives

The package also exports the lower-level primitives that `readTarEntries`
composes, for callers that need to decode tar headers directly:

- `isZeroTarBlock(bytes)` — whether a 512-byte block is all zeros (the
  archive terminator).
- `tarString(field)` — decode a NUL-terminated header field as text.
- `tarOctal(field)` — decode an octal header field (size, mode).
- `parsePaxRecords(bytes)` — parse a pax extended-header block into `path`,
  `linkpath`, and `size` overrides.
- `tarPathSegments(path)` — validate an entry path and split it into
  non-empty segments, rejecting absolute paths, embedded NULs, and `.`/`..`
  traversal.
- `makeTarReader(source)` — the block-aligned reader (`readBlock`,
  `streamContent`) underlying `readTarEntries`.

## Implementation Notes

This reader supports only the subset of the tar format that
`git archive --format=tar` produces: ustar regular files (typeflag `0`),
directories (typeflag `5`), and symlinks (typeflag `2`), plus pax extended
headers (typeflags `x` and `g`) carrying `path`, `linkpath`, and `size`
overrides.
Any other entry type is treated as an integrity error and rejected, rather
than silently skipped.

Path validation treats traversal (`..`), absolute paths, and embedded NULs
as integrity errors, since a tar archive is an untrusted byte stream.
