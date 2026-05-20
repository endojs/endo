// @ts-check
/**
 * Pure helpers shared across the `@endo/remote-fs` implementations
 * (in-memory, node-fs, from-mount). These were duplicated verbatim
 * across the three files; consolidating them keeps the
 * mechanically-shared code in one place without forcing the
 * implementations to share a base class.
 */

import { makeError, X, q } from '@endo/errors';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { bytesWriterFromIterator } from '@endo/exo-stream/bytes-writer-from-iterator.js';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

export const EMPTY_BYTES = harden(new Uint8Array(0));

/** Current time, nanoseconds since epoch. */
export const nowNs = () => BigInt(Date.now()) * 1_000_000n;

/** Initial `Attrs` record for a newly-created node. */
export const makeAttrs = () => {
  const t = nowNs();
  return { size: 0n, mtime: t, atime: t, ctime: t, btime: t };
};

/**
 * Wrap a `Uint8Array` snapshot as a `PassableBytesReader` that
 * yields its bytes in one chunk.
 *
 * @param {Uint8Array} bytes
 */
export const makeBytesReaderFromBytes = bytes => {
  const generator = async function* () {
    if (bytes.length > 0) yield bytes;
  };
  return bytesReaderFromIterator(generator());
};

/**
 * Wrap an array of strings as a `PassableReader<string>`.
 *
 * @param {string[]} items
 */
export const makeStringReaderFromArray = items => {
  const generator = async function* () {
    for (const item of items) yield item;
  };
  return readerFromIterator(generator());
};

/**
 * Build a `PassableBytesWriter` whose decoded chunks are pushed
 * to `onChunk` as `Uint8Array`s. The optional `onClose` callback
 * runs when the initiator closes the writer.
 *
 * @param {{
 *   onChunk: (bytes: Uint8Array) => void,
 *   onClose?: () => void,
 * }} hooks
 */
export const makeBytesSinkWriter = ({ onChunk, onClose }) => {
  const sinkIterator = {
    /** @param {Uint8Array} bytes */
    async next(bytes) {
      onChunk(bytes);
      return { done: false, value: undefined };
    },
    async return(value) {
      if (onClose) onClose();
      return { done: true, value };
    },
    [Symbol.asyncIterator]() {
      return sinkIterator;
    },
  };
  return bytesWriterFromIterator(sinkIterator);
};

/**
 * Test whether two byte ranges intersect. `length === 0n` means
 * "to end of file" (POSIX convention). Returns `true` if the
 * ranges share at least one byte.
 *
 * @param {{ start: bigint, length: bigint }} a
 * @param {{ start: bigint, length: bigint }} b
 */
export const rangesOverlap = (a, b) => {
  const aUnbounded = a.length === 0n;
  const bUnbounded = b.length === 0n;
  if (aUnbounded && bUnbounded) return true;
  if (aUnbounded) {
    const bEnd = b.start + b.length;
    return bEnd > a.start;
  }
  if (bUnbounded) {
    const aEnd = a.start + a.length;
    return aEnd > b.start;
  }
  const aEnd = a.start + a.length;
  const bEnd = b.start + b.length;
  return a.start < bEnd && b.start < aEnd;
};

/**
 * Validate a name passed to a `Directory` mutating verb. Rejects
 * empty strings, the `.` / `..` reserved names, and names
 * containing `/` or `NUL`.
 *
 * @param {string} name
 */
export const assertChildName = name => {
  if (typeof name !== 'string' || name.length === 0) {
    throw makeError(X`EINVAL: invalid name ${q(name)}`);
  }
  if (name === '.' || name === '..') {
    throw makeError(X`EINVAL: name ${q(name)} reserved`);
  }
  if (name.includes('/') || name.includes('\0')) {
    throw makeError(X`EINVAL: name ${q(name)} contains path separator`);
  }
};

/**
 * Build an ENOSYS-error factory bound to a backing-store
 * description.
 *
 * @param {string} backing  human-readable description (e.g.
 *                          "node:fs/promises-backed FS",
 *                          "Mount-adapted FS")
 */
export const makeNotSupported = backing => method =>
  makeError(X`ENOSYS: ${q(method)} not implemented on ${backing}`);

/**
 * Compute the OpenFile mode flags from an `OpenOpts` record.
 *
 * `append` and `truncate` are POSIX write modifiers (`O_APPEND`,
 * `O_TRUNC`); they have no meaning without write access. Coerce
 * them to imply write so a caller can't accidentally land a
 * truncate-only handle that can't subsequently write its
 * replacement bytes. If neither read nor write end up set, fall
 * back to read (a handle with no access flag is useless).
 *
 * @param {any} opts
 * @returns {{ read: boolean, write: boolean, append: boolean, truncate: boolean }}
 */
export const computeOpenMode = opts => {
  const o = opts || {};
  const write = !!o.write || !!o.append || !!o.truncate;
  let read;
  if (o.read === true) read = true;
  else if (o.read === false) read = false;
  else read = !write;
  const mode = {
    read,
    write,
    append: !!o.append,
    truncate: !!o.truncate,
  };
  if (!mode.read && !mode.write) mode.read = true;
  return mode;
};
