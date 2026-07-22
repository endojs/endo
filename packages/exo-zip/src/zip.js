// @ts-check
/* eslint-disable no-await-in-loop */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
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
 * Drain a blob's `streamBase64` reader into the underlying bytes.
 *
 * The blob conforms to the platform's syn/ack reader-pump protocol
 * (`@endo/platform`'s `ReadableBlobInterface`): `streamBase64(synHead)`
 * returns a `StreamNode` chain, which `iterateBytesReader` consumes —
 * base64-DECODING each ack chunk to a `Uint8Array` before yielding it.
 * Each chunk is decoded independently, so there is no interior-padding
 * concern; we simply concatenate the decoded byte chunks.
 *
 * @param {unknown} blobRef A remotable exposing `streamBase64`.
 * @returns {Promise<Uint8Array>}
 */
const drainBytes = async blobRef => {
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for await (const chunk of iterateBytesReader(/** @type {any} */ (blobRef))) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};
harden(drainBytes);

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
  // Leaf blob: drain the base64 reader and write the entry. Use the
  // async `set()` because the configured compressor (`deflate`,
  // when injected) is itself async; the legacy sync `write()` only
  // works for STORE. `node` IS the reader — `iterateBytesReader`
  // initiates the stream by calling its `streamBase64` method.
  if (pathSegments.length === 0) {
    throw new Error('zip: cannot serialize a bare blob without a path');
  }
  const bytes = await drainBytes(node);
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
