// @ts-check

import { q } from '@endo/errors';
import { bytesFromText } from '@endo/bytes/from-string.js';

const TAR_BLOCK_SIZE = 512;

/**
 * Write `text` into `bytes` at `start` as raw bytes, leaving the surrounding
 * NUL padding of the field intact.
 *
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {string} text
 */
const writeField = (bytes, start, text) => {
  bytes.set(bytesFromText(text), start);
};

/**
 * Encode a numeric ustar header field as `width - 1` zero-padded octal digits
 * followed by a NUL terminator, the representation `git archive --format=tar`
 * emits and `@endo/tar`'s reader accepts.
 *
 * @param {number} value
 * @param {number} width
 * @returns {string}
 */
const octalField = (value, width) =>
  `${value.toString(8).padStart(width - 1, '0')}\0`;

/**
 * Encode a POSIX `ustar` header block for a regular file of `size` bytes at
 * `path`. The mode is `0644`; uid, gid, and mtime are zero, so the header is a
 * deterministic function of its path and size. Throws when `path` does not fit
 * the 100-byte ustar name field — this minimal writer does not emit the pax
 * extended header a longer path would require.
 *
 * @param {string} path
 * @param {number} size
 * @returns {Uint8Array} a single 512-byte header block
 */
export const tarFileHeader = (path, size) => {
  if (bytesFromText(path).byteLength > 100) {
    throw new Error(`Path is too long for a ustar tar header: ${q(path)}`);
  }
  const header = new Uint8Array(TAR_BLOCK_SIZE);
  writeField(header, 0, path);
  writeField(header, 100, octalField(0o644, 8));
  writeField(header, 108, octalField(0, 8));
  writeField(header, 116, octalField(0, 8));
  writeField(header, 124, octalField(size, 12));
  writeField(header, 136, octalField(0, 12));
  // The checksum is computed with its own field filled with spaces.
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeField(header, 257, 'ustar\0');
  writeField(header, 263, '00');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeField(header, 148, octalField(checksum, 8));
  return header;
};
harden(tarFileHeader);

/**
 * The zero padding that rounds a file body of `size` bytes up to the next
 * 512-byte tar block boundary. Empty when `size` is already block-aligned.
 *
 * @param {number} size
 * @returns {Uint8Array}
 */
export const tarFilePadding = size => {
  const remainder = size % TAR_BLOCK_SIZE;
  return remainder === 0
    ? new Uint8Array(0)
    : new Uint8Array(TAR_BLOCK_SIZE - remainder);
};
harden(tarFilePadding);

/**
 * The end-of-archive marker: two consecutive zero blocks that terminate a tar
 * stream.
 *
 * @returns {Uint8Array}
 */
export const tarEndMarker = () => new Uint8Array(TAR_BLOCK_SIZE * 2);
harden(tarEndMarker);
