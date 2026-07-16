// @ts-check

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import harden from '@endo/harden';
import { encodeBase64 } from '@endo/base64';
import { makeExo } from '@endo/exo';
import { makeReaderPump } from '@endo/exo-stream/reader-pump.js';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { mapReader } from '@endo/stream';
import { makeNodeReader } from '@endo/stream-node';

// `LocalBlob` exposes the whole-value read surface plus the richer `BlobRef`
// range-I/O surface (`getInfo` / `fetch`) so a remote reader can learn the
// content hash + size in one round-trip and read byte ranges without
// streaming the whole file. See designs/fs-interface-consolidation.md § C4.
import { ReadableBlobRangeReadInterface } from '../fs/interfaces.js';
import { toSafeNumber } from '../fs/extended/shared/helpers.js';

/** @import { ReadableBlobRangeRead } from '../fs/types.js' */

/**
 * Read the byte window `[offset, offset + length)` from `filePath` as a
 * `Uint8Array`, clamped at EOF. Reads only the requested window from disk
 * rather than the whole file, and bounds the allocation by the file size so
 * a huge `length` against a small file cannot drive a multi-GB allocation.
 * Shared by `fetch` (which wraps the bytes in a reader) and `rangeRead`
 * (which returns them directly).
 *
 * @param {string} filePath
 * @param {bigint} offset
 * @param {bigint} length
 * @returns {Promise<Uint8Array>}
 */
const readWindow = async (filePath, offset, length) => {
  // Validate at the bigint→Number boundary (same `toSafeNumber` the daemon
  // and `BlobRef` paths use) so negative / out-of-range windows throw
  // `EINVAL` rather than reaching `fs.read` with a bad position.
  const off = toSafeNumber(offset, 'offset');
  const len = toSafeNumber(length, 'length');
  if (len <= 0) {
    return new Uint8Array(0);
  }
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    const clamped = Math.min(len, Math.max(0, size - off));
    if (clamped <= 0) {
      return new Uint8Array(0);
    }
    const buffer = new Uint8Array(clamped);
    const { bytesRead } = await handle.read(buffer, 0, clamped, off);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

/**
 * Wrap a byte range as a `PassableBytesReader`. Empty ranges yield a reader
 * that is immediately done.
 *
 * @param {Uint8Array} bytes
 */
const bytesFromRange = bytes => {
  function* generator() {
    if (bytes.length > 0) {
      yield bytes;
    }
  }
  return bytesReaderFromIterator(generator());
};

/**
 * Creates a ReadableBlob Exo from a local file.
 * Streams file content as base64 via @endo/stream-node.
 *
 * @param {string} filePath
 * @returns {ReadableBlobRangeRead}
 */
export const makeLocalBlob = filePath => {
  /** @satisfies {ReadableBlobRangeRead} */
  const localBlobMethods = {
    /** @param {import('@endo/eventual-send').ERef<unknown>} synPromise */
    streamBase64(synPromise) {
      const nodeReadStream = fs.createReadStream(filePath);
      const reader = makeNodeReader(nodeReadStream);
      const pump = makeReaderPump(mapReader(reader, encodeBase64));
      return pump(/** @type {any} */ (synPromise));
    },
    text: () => fs.promises.readFile(filePath, 'utf-8'),
    json: async () => JSON.parse(await fs.promises.readFile(filePath, 'utf-8')),
    // The `{ algorithm, hash, size }` content-address triple. `hash` is base64
    // to match the extended `BlobRef`. Computed over the current file content.
    async getInfo() {
      const bytes = await fs.promises.readFile(filePath);
      const hash = encodeBase64(createHash('sha256').update(bytes).digest());
      return harden({
        algorithm: 'sha256',
        hash,
        size: BigInt(bytes.length),
      });
    },
    // Windowed read of `[offset, offset + length)`, clamped at EOF — reads only
    // the requested window from disk rather than the whole file.
    /**
     * @param {bigint} offset
     * @param {bigint} length
     */
    async fetch(offset, length) {
      return bytesFromRange(await readWindow(filePath, offset, length));
    },
    // Whole-value windowed read: the raw bytes of `[offset, offset + length)`,
    // clamped at EOF, as a `Uint8Array` (the convenience form distinct from
    // `fetch`'s streaming reader). See interfaces.js
    // `rangeReadConvenienceMethodGuards`.
    /**
     * @param {bigint} offset
     * @param {bigint} length
     */
    async rangeRead(offset, length) {
      return readWindow(filePath, offset, length);
    },
    // Whole-value line-range read: decode the file as UTF-8 and return lines
    // `[startLine, endLine)` (0-based, end-exclusive) joined with '\n'. A
    // negative or non-integer index throws EINVAL (via `toSafeNumber`); an
    // `endLine` past the last line clamps to the end.
    /**
     * @param {number} startLine
     * @param {number} endLine
     */
    async rangeReadText(startLine, endLine) {
      const start = toSafeNumber(startLine, 'startLine');
      const end = toSafeNumber(endLine, 'endLine');
      if (end <= start) {
        return '';
      }
      const text = await fs.promises.readFile(filePath, 'utf-8');
      // Split on '\n'; a trailing newline yields a final empty element, which
      // `slice` handles like any other line. `\r` is left intact (the caller
      // observes the file's own line endings).
      const lines = text.split('\n');
      return lines.slice(start, end).join('\n');
    },
    help: method =>
      method === undefined
        ? 'LocalBlob: read-only handle to a host file (text, json, streamBase64, getInfo, fetch, rangeRead, rangeReadText).'
        : `No documentation for method ${method}.`,
  };
  return makeExo('LocalBlob', ReadableBlobRangeReadInterface, localBlobMethods);
};
harden(makeLocalBlob);
