// @ts-check
/* eslint-disable no-await-in-loop */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { decodeBase64 } from '@endo/base64';
import { ZipWriter } from '@endo/zip/writer.js';
import { deflate } from '@endo/zip/deflate.js';

// `@endo/zip/deflate.js` is implemented atop `CompressionStream`,
// which is available on every host the project targets (Node 18+,
// modern browsers, XS via web-stream shims). Probe once at module
// load so the writer falls back to STORE only on hosts that lack
// the global; this keeps `zip()` portable instead of hard-failing
// at archive-write time.
// Construct a probe so the gate exercises `'deflate-raw'` support;
// Node 18 ships `CompressionStream` but rejects `'deflate-raw'`.
let canDeflate = false;
try {
  // eslint-disable-next-line no-new
  new CompressionStream('deflate-raw');
  canDeflate = true;
  // eslint-disable-next-line no-empty
} catch {}

/**
 * Drain a `streamBase64()` async iterator into the underlying bytes.
 * The iterator may yield one or more base64-encoded chunks; we
 * accumulate the encoded strings and decode the concatenation in a
 * single pass.
 *
 * Base64 does not concatenate trivially: per-chunk `=` padding in the
 * middle of the stream produces an invalid composite string and a
 * naive per-chunk decode would silently misinterpret the byte
 * boundaries. The blob producers in `@endo/exo-unzip` and
 * `@endo/platform`'s `makeReaderRef` therefore guarantee that every
 * chunk except possibly the last has a length divisible by 4 (i.e.
 * encodes a raw-byte slice whose length is a multiple of 3), so the
 * concatenation is itself a valid base64 string.
 *
 * @param {any} readerRef
 * @returns {Promise<Uint8Array>}
 */
const drainBase64 = async readerRef => {
  /** @type {string[]} */
  const encodedChunks = [];
  let result = await E(readerRef).next();
  while (!result.done) {
    encodedChunks.push(result.value);
    result = await E(readerRef).next();
  }
  return decodeBase64(encodedChunks.join(''));
};
harden(drainBase64);

/**
 * Recursively walk a readable tree (local or remote), accumulating
 * each leaf blob into the supplied `ZipWriter` under its
 * slash-joined path.
 *
 * Uses `__getMethodNames__()` to discriminate sub-tree from leaf
 * blob, mirroring `@endo/platform`'s `checkoutTree` so the same
 * remotables work on both the read and write side without
 * duck-typing failed CapTP calls.
 *
 * @param {unknown} node
 * @param {string[]} pathSegments
 * @param {ZipWriter} writer
 * @param {{ date?: Date }} entryOptions
 */
const walkTree = async (node, pathSegments, writer, entryOptions) => {
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(/** @type {any} */ (node)).__getMethodNames__();
  const isTree = methods.includes('list');
  if (isTree) {
    const names = await E(/** @type {any} */ (node)).list();
    for (const name of names) {
      const child = await E(/** @type {any} */ (node)).lookup(name);
      await walkTree(child, [...pathSegments, name], writer, entryOptions);
    }
    return;
  }
  // Leaf blob: drain the base64 stream and write the entry. Use the
  // async `set()` because the configured compressor (`deflate`,
  // when injected) is itself async; the legacy sync `write()` only
  // works for STORE.
  if (pathSegments.length === 0) {
    throw new Error('zip: cannot serialize a bare blob without a path');
  }
  const readerRef = await E(/** @type {any} */ (node)).streamBase64();
  const bytes = await drainBase64(readerRef);
  await writer.set(pathSegments.join('/'), bytes, entryOptions);
};
harden(walkTree);

/**
 * Walk a readable-tree exo and serialize it into in-memory ZIP
 * archive bytes.
 *
 * Entries are emitted with DEFLATE compression on hosts that expose
 * `CompressionStream` (Node 18+, modern browsers, XS via
 * web-stream shims) and fall back to STORE on hosts that omit it,
 * matching the round-trip behaviour of `@endo/exo-unzip`.
 *
 * The input may be local or a CapTP-borne remotable; the walker
 * uses `E()` for every method send so the latter just works. Sub-tree
 * vs leaf-blob discrimination uses `__getMethodNames__()` rather
 * than duck-typing, mirroring `@endo/platform`'s `checkoutTree`.
 *
 * The factory is async because both `list`/`lookup` (potentially
 * over CapTP) and the `streamBase64` drain are async; the
 * underlying `ZipWriter.snapshot()` call is synchronous.
 *
 * @param {unknown} tree A readable-tree exo (local or remote)
 *   conforming to `@endo/platform`'s `ReadableTreeInterface`.
 * @param {object} [options]
 * @param {Date} [options.date] The mtime stamped on each entry's
 *   header. Defaults to the system clock at write time.
 * @returns {Promise<Uint8Array>} The complete archive bytes.
 */
export const zip = async (tree, options = {}) => {
  const { date } = options;
  const writer = new ZipWriter(canDeflate ? { deflate } : {});
  await walkTree(tree, [], writer, { date });
  return writer.snapshot();
};
harden(zip);
