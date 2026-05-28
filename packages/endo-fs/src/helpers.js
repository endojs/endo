// @ts-check
/**
 * Public porcelain helpers for `@endo/endo-fs` consumers.
 *
 * Free functions over the typed `Filesystem` / `Directory` / `File`
 * / `OpenFile` exo surface. Bytes-only — no text/JSON encoding
 * choices in the base; consumers who want text get a three-line
 * `readText` in their own code over `walk` + `File.read` +
 * `TextDecoder`.
 *
 * See DESIGN.md §10.1 for the round-trip cost framework that
 * `walk` exploits.
 */

import { E } from '@endo/eventual-send';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

/**
 * Walk a path from `root` segment-by-segment, returning a promise
 * that resolves to the final `Directory` or `File` cap.
 *
 * Each `lookup` is chained onto the previous promise so the whole
 * walk **pipelines as one CapTP batch** under E's promise-pipeline
 * semantics — no serial round-trips per segment. A caller can then
 * chain further `E(...)` calls onto the returned promise and have
 * the whole sequence dispatched in one flight:
 *
 *   const bytes = await E(walk(root, ['etc', 'hosts'])).read();
 *
 * is one CapTP batch (two `lookup`s + one `read`), not three.
 *
 * @param {object} root  starting Directory cap (may be a promise)
 * @param {string[]} path
 * @returns {Promise<object>}
 */
export const walk = (root, path) =>
  path.reduce((dir, name) => E(dir).lookup(name), root);
harden(walk);

/**
 * Drain a `PassableBytesReader` into a single `Uint8Array`. The
 * reader's chunks are base64-decoded by `iterateBytesReader` from
 * `@endo/exo-stream`.
 *
 * @param {object} reader  PassableBytesReader cap
 * @returns {Promise<Uint8Array>}
 */
export const collectBytes = async reader => {
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for await (const chunk of iterateBytesReader(reader)) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const chunk of chunks) {
    out.set(chunk, off);
    off += chunk.length;
  }
  return out;
};
harden(collectBytes);

/**
 * Drain a `PassableReader<T>` into an array of `T`.
 *
 * @param {object} reader  PassableReader cap
 * @returns {Promise<any[]>}
 */
export const collectStream = async reader => {
  /** @type {any[]} */
  const out = [];
  for await (const value of iterateReader(reader)) {
    out.push(value);
  }
  return harden(out);
};
harden(collectStream);
