# Endo tar

This is a minimal, portable tar archive **reader and writer**.
The reader decodes the regular files, directories, and symlinks that native
`git archive --format=tar` emits, honoring the pax extended headers
(`path`, `linkpath`, and `size` overrides) that `git archive` writes whenever
an entry does not fit the legacy ustar header fields.
The writer emits the ustar header, padding, and end-of-archive blocks needed
to stream a regular-file tar archive back out, the exact subset a caller can
hand straight to this reader.

Neither side has any dependency on a built-in module: they operate entirely on
`AsyncIterable<Uint8Array>` / `Uint8Array` bytes, which makes the package
suitable for embedding in an XS binary, bundling for any platform, and running
inside a locked-down SES realm.
The writer is intentionally minimal — it emits only ustar regular-file
entries (no directories, symlinks, or pax headers), which is enough to
serialize a content-addressed blob tree for transport.

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

## Writing

The writer exposes the three primitives a streaming producer concatenates to
build a regular-file tar archive. A producer yields, per file, a header then
the body then any padding, and finally the end-of-archive marker:

```javascript
import { tarFileHeader, tarFilePadding, tarEndMarker } from '@endo/tar';

async function* tar(files) {
  for (const { path, bytes } of files) {
    yield tarFileHeader(path, bytes.byteLength);
    yield bytes;
    const padding = tarFilePadding(bytes.byteLength);
    if (padding.byteLength !== 0) yield padding;
  }
  yield tarEndMarker();
}
```

- `tarFileHeader(path, size)` — a 512-byte ustar header for a regular file
  (mode `0644`; zero uid/gid/mtime, so the header is a deterministic function
  of its path and size). Throws when `path` exceeds the 100-byte ustar name
  field.
- `tarFilePadding(size)` — the zero padding that rounds a file body up to the
  next 512-byte block; empty when already aligned.
- `tarEndMarker()` — the two zero blocks that terminate a tar stream.

The `writer.js` subpath (`@endo/tar/writer.js`) exports the same three
primitives without pulling in the reader.

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
