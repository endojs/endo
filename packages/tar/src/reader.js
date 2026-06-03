// @ts-check

import { q } from '@endo/errors';
import { bytesToText } from '@endo/bytes/to-string.js';

/** @import { TarReader, TarEntry } from './types.js' */

const TAR_BLOCK_SIZE = 512;

/**
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export const isZeroTarBlock = bytes => bytes.every(byte => byte === 0);
harden(isZeroTarBlock);

/**
 * Decode a NUL-terminated tar header field as text.
 *
 * @param {Uint8Array} field
 * @returns {string}
 */
export const tarString = field => {
  const nul = field.indexOf(0);
  const end = nul < 0 ? field.length : nul;
  return bytesToText(field.slice(0, end));
};
harden(tarString);

/**
 * Decode an octal tar header field (size, mode, etc.).
 *
 * @param {Uint8Array} field
 * @returns {number}
 */
export const tarOctal = field => {
  const text = tarString(field).trim();
  if (text === '') {
    return 0;
  }
  if (!/^[0-7]+$/u.test(text)) {
    throw new Error(`Invalid tar octal field ${q(text)}`);
  }
  return Number.parseInt(text, 8);
};
harden(tarOctal);

/**
 * Parse a pax extended header record block. Pax records are a sequence
 * of `"<length> <key>=<value>\n"` entries where `<length>` is the
 * decimal byte length of the whole record including the length field,
 * the space, and the trailing newline. `git archive --format=tar`
 * emits a pax header (typeflag `x`) before any entry whose path or size
 * cannot fit the ustar header fields (e.g. a single filename over 100
 * bytes). We honor `path` and `size` overrides; other keys are ignored.
 *
 * @param {Uint8Array} bytes
 * @returns {{ path?: string, size?: number }}
 */
export const parsePaxRecords = bytes => {
  const text = bytesToText(bytes);
  /** @type {{ path?: string, size?: number }} */
  const overrides = {};
  let cursor = 0;
  while (cursor < text.length) {
    const space = text.indexOf(' ', cursor);
    if (space < 0) {
      throw new Error('Malformed pax extended header record');
    }
    const length = Number.parseInt(text.slice(cursor, space), 10);
    if (
      !Number.isInteger(length) ||
      length <= 0 ||
      cursor + length > text.length ||
      text[cursor + length - 1] !== '\n'
    ) {
      throw new Error('Malformed pax extended header record');
    }
    const record = text.slice(space + 1, cursor + length - 1);
    const equals = record.indexOf('=');
    if (equals < 0) {
      throw new Error('Malformed pax extended header record');
    }
    const key = record.slice(0, equals);
    const value = record.slice(equals + 1);
    if (key === 'path') {
      overrides.path = value;
    } else if (key === 'size') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 0 || `${parsed}` !== value) {
        throw new Error('Malformed pax extended header record');
      }
      overrides.size = parsed;
    }
    cursor += length;
  }
  return overrides;
};
harden(parsePaxRecords);

/**
 * Validate a tar entry path and split it into its non-empty segments,
 * rejecting absolute paths, embedded NULs, and `.`/`..` traversal.
 *
 * @param {string} archivePath
 * @returns {string[]}
 */
export const tarPathSegments = archivePath => {
  if (
    archivePath === '' ||
    archivePath.startsWith('/') ||
    archivePath.includes('\0')
  ) {
    throw new Error(`Invalid tar entry path ${q(archivePath)}`);
  }
  const segments = archivePath.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`Invalid tar entry path ${q(archivePath)}`);
  }
  for (const segment of segments) {
    if (
      segment === '.' ||
      segment === '..' ||
      segment.includes('/') ||
      segment.includes('\0')
    ) {
      throw new Error(`Invalid tar entry path segment ${q(segment)}`);
    }
  }
  return segments;
};
harden(tarPathSegments);

/**
 * Wrap a byte source as a block-aligned tar reader so the archive is
 * consumed incrementally. The whole archive is never buffered: at most
 * one 512-byte header plus a partial source chunk are held at a time,
 * and each entry's content is streamed straight to the consumer.
 *
 * @param {AsyncIterable<Uint8Array>} source
 * @returns {TarReader}
 */
export const makeTarReader = source => {
  const iterator = source[Symbol.asyncIterator]();
  /** @type {Uint8Array} */
  let buffer = new Uint8Array(0);
  let pos = 0;
  let done = false;

  // Pull one more source chunk into the buffer, compacting away the
  // already-consumed prefix so the held window stays bounded.
  const pull = async () => {
    const result = await iterator.next();
    if (result.done) {
      done = true;
      return false;
    }
    const chunk = result.value;
    const remaining = buffer.subarray(pos);
    const next = new Uint8Array(remaining.byteLength + chunk.byteLength);
    next.set(remaining, 0);
    next.set(chunk, remaining.byteLength);
    buffer = next;
    pos = 0;
    return true;
  };

  // Ensure at least `n` bytes are available after `pos`, or EOF.
  /** @param {number} n */
  const ensure = async n => {
    while (buffer.byteLength - pos < n) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await pull())) {
        return;
      }
    }
  };

  return harden({
    /** @returns {Promise<Uint8Array | undefined>} */
    readBlock: async () => {
      await ensure(TAR_BLOCK_SIZE);
      const available = buffer.byteLength - pos;
      if (available === 0 && done) {
        return undefined;
      }
      if (available < TAR_BLOCK_SIZE) {
        throw new Error('Truncated tar header');
      }
      const block = buffer.slice(pos, pos + TAR_BLOCK_SIZE);
      pos += TAR_BLOCK_SIZE;
      return block;
    },

    /**
     * @param {number} size
     * @param {string} archivePath
     * @returns {AsyncGenerator<Uint8Array>}
     */
    streamContent: async function* streamContent(size, archivePath) {
      let pending = size;
      while (pending > 0) {
        if (buffer.byteLength - pos === 0) {
          // eslint-disable-next-line no-await-in-loop
          if (!(await pull())) {
            throw new Error(`Truncated tar content for ${q(archivePath)}`);
          }
        }
        const take = Math.min(pending, buffer.byteLength - pos);
        yield buffer.slice(pos, pos + take);
        pos += take;
        pending -= take;
      }
      const padding =
        (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
      if (padding > 0) {
        await ensure(padding);
        if (buffer.byteLength - pos < padding) {
          throw new Error(`Truncated tar content for ${q(archivePath)}`);
        }
        pos += padding;
      }
    },
  });
};
harden(makeTarReader);

/**
 * Read a `git archive --format=tar` byte stream and yield its filesystem
 * entries. This accepts the regular files, directories, and symlinks that
 * native `git archive` emits, applies pax extended-header `path`/`size`
 * overrides (next-entry typeflag `x` and global typeflag `g`), and stops at
 * the first zero block that terminates the archive.
 *
 * The reader is block-aligned and never buffers the whole archive: each
 * entry's content is streamed. The consumer MUST fully drain each yielded
 * entry's `content` before resuming iteration, since the underlying reader
 * is stateful.
 *
 * @param {AsyncIterable<Uint8Array>} source
 * @returns {AsyncGenerator<TarEntry>}
 */
export const readTarEntries = async function* readTarEntries(source) {
  const reader = makeTarReader(source);

  // pax overrides parsed from a preceding extended header. `global`
  // (typeflag `g`) persists across entries; `next` (typeflag `x`)
  // applies only to the immediately following entry.
  /** @type {{ path?: string, size?: number }} */
  let globalPax = {};
  /** @type {{ path?: string, size?: number } | undefined} */
  let nextPax;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const header = await reader.readBlock();
    if (header === undefined) {
      break;
    }
    if (isZeroTarBlock(header)) {
      break;
    }
    const name = tarString(header.slice(0, 100));
    const rawSize = tarOctal(header.slice(124, 136));
    const typeFlag = tarString(header.slice(156, 157)) || '0';
    const linkName = tarString(header.slice(157, 257));
    const prefix = tarString(header.slice(345, 500));

    // A pax extended header carries `key=value` overrides for the next
    // entry (typeflag `x`) or all following entries (typeflag `g`); it
    // is not itself a filesystem entry. Pax records are small, so the
    // header content is collected in full before parsing.
    if (typeFlag === 'x' || typeFlag === 'g') {
      /** @type {Uint8Array[]} */
      const paxChunks = [];
      // eslint-disable-next-line no-await-in-loop
      for await (const chunk of reader.streamContent(rawSize, '@PaxHeader')) {
        paxChunks.push(chunk);
      }
      const paxBytes = new Uint8Array(rawSize);
      let paxOffset = 0;
      for (const chunk of paxChunks) {
        paxBytes.set(chunk, paxOffset);
        paxOffset += chunk.byteLength;
      }
      const overrides = parsePaxRecords(paxBytes);
      if (typeFlag === 'g') {
        globalPax = { ...globalPax, ...overrides };
      } else {
        nextPax = overrides;
      }
      // eslint-disable-next-line no-continue
      continue;
    }

    // `git archive` sets the ustar size field of an entry preceded by a
    // pax header to the real byte length, so `rawSize` already governs
    // the content block span. A `size` override is honored defensively.
    const pax = { ...globalPax, ...(nextPax || {}) };
    nextPax = undefined;
    const ustarPath = prefix ? `${prefix}/${name}` : name;
    const archivePath = pax.path !== undefined ? pax.path : ustarPath;
    const size = pax.size !== undefined ? pax.size : rawSize;

    /** @type {TarEntry['type']} */
    let type;
    if (typeFlag === '5') {
      type = 'directory';
    } else if (typeFlag === '0' || typeFlag === '\0') {
      type = 'file';
    } else if (typeFlag === '2') {
      type = 'symlink';
    } else {
      throw new Error(
        `Unsupported tar entry type ${q(typeFlag)} for ${q(archivePath)}`,
      );
    }

    // The reader is stateful, so the consumer must drain `content` before
    // the next iteration; for directories and symlinks the content is
    // empty/padding but still consumes the block alignment.
    yield harden({
      type,
      path: archivePath,
      size,
      linkname: type === 'symlink' ? linkName : '',
      content: reader.streamContent(size, archivePath),
    });
  }
};
harden(readTarEntries);
