// Shared test helpers for the host-shell suites.

import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';

const textDecoder = new TextDecoder();

/**
 * Drain an exo-stream byte reader to a single UTF-8 string.
 *
 * @param {any} readerRef
 * @returns {Promise<string>}
 */
export const readAll = async readerRef => {
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for await (const chunk of iterateBytesReader(readerRef, { buffer: 64 })) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return textDecoder.decode(out);
};
