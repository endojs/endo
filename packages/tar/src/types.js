// @ts-check

export {};

/**
 * A block-aligned tar source. Reads the archive one 512-byte block at a
 * time and streams each entry's content without buffering the whole
 * archive: at most one header block plus a partial source chunk are held
 * at a time.
 *
 * @typedef {object} TarReader
 * @property {() => Promise<Uint8Array | undefined>} readBlock Read the next
 *   512-byte block, or `undefined` at a clean end of archive.
 * @property {(size: number, archivePath: string) => AsyncGenerator<Uint8Array>}
 *   streamContent Stream `size` content bytes, then consume the trailing
 *   padding to the next 512-byte boundary. Yields slices as they arrive so
 *   the consumer never sees the whole entry buffered.
 */

/**
 * A parsed tar entry yielded by {@link readTarEntries}. The header has been
 * decoded and any preceding pax extended-header overrides applied, but the
 * path is not yet validated into segments (use {@link tarPathSegments}). The
 * consumer MUST fully drain `content` before requesting the next entry; the
 * underlying reader is stateful and block-aligned.
 *
 * @typedef {object} TarEntry
 * @property {'file' | 'directory' | 'symlink'} type
 * @property {string} path The archive path (pax `path` override applied).
 * @property {number} size The content byte length (pax `size` override
 *   applied).
 * @property {string} linkname The symlink target (only meaningful when
 *   `type` is `'symlink'`; otherwise `''`).
 * @property {AsyncGenerator<Uint8Array>} content The entry's content bytes,
 *   streamed chunk-by-chunk and followed by block-padding consumption. For
 *   directories and symlinks this still must be drained to stay block
 *   aligned, even though the bytes are not the entry's data.
 */
