// @ts-check
/**
 * Cap'n Proto stream framing.
 *
 *   uint32  segmentCount - 1   (so a single-segment message starts with 0)
 *   uint32[segmentCount]  segment word lengths
 *   pad to multiple of 8 bytes (insert one extra uint32 if segmentCount is even)
 *   then concatenated segment bytes (each already a multiple of 8 bytes)
 *
 * All integers are little-endian.
 */

import { Fail } from '@endo/errors';

import { WORD_SIZE } from './segment.js';

/**
 * Encode a list of segment ArrayBuffers into a single framed ArrayBuffer.
 *
 * @param {ArrayBuffer[]} segmentBuffers
 * @returns {ArrayBuffer}
 */
export const frameSegments = segmentBuffers => {
  const n = segmentBuffers.length;
  if (n === 0) throw Fail`empty message: at least one segment required`;
  // Header: (n) uint32s for segment word counts + 1 uint32 for (n-1) prefix.
  // Padded to 8-byte alignment.
  const headerWords = Math.ceil((n + 1) / 2);
  const headerBytes = headerWords * WORD_SIZE;
  let payloadBytes = 0;
  for (const seg of segmentBuffers) {
    if (seg.byteLength % WORD_SIZE !== 0) {
      throw Fail`segment byte length ${seg.byteLength} not a multiple of 8`;
    }
    payloadBytes += seg.byteLength;
  }
  const out = new ArrayBuffer(headerBytes + payloadBytes);
  const view = new DataView(out);
  view.setUint32(0, n - 1, true);
  for (let i = 0; i < n; i += 1) {
    view.setUint32((i + 1) * 4, segmentBuffers[i].byteLength / WORD_SIZE, true);
  }
  let cursor = headerBytes;
  const u8 = new Uint8Array(out);
  for (const seg of segmentBuffers) {
    u8.set(new Uint8Array(seg), cursor);
    cursor += seg.byteLength;
  }
  return out;
};

/**
 * Decode a framed message into per-segment ArrayBuffers.
 *
 * @param {ArrayBuffer} framed
 * @returns {ArrayBuffer[]}
 */
export const unframeSegments = framed => {
  if (framed.byteLength < 4) {
    throw Fail`framed message too short: ${framed.byteLength} bytes`;
  }
  const view = new DataView(framed);
  const segmentCountMinusOne = view.getUint32(0, true);
  const n = segmentCountMinusOne + 1;
  if (framed.byteLength < (n + 1) * 4) {
    throw Fail`framed message header truncated`;
  }
  const lens = new Array(n);
  let totalWords = 0;
  for (let i = 0; i < n; i += 1) {
    lens[i] = view.getUint32((i + 1) * 4, true);
    totalWords += lens[i];
  }
  const headerWords = Math.ceil((n + 1) / 2);
  const headerBytes = headerWords * WORD_SIZE;
  if (framed.byteLength < headerBytes + totalWords * WORD_SIZE) {
    throw Fail`framed message payload truncated`;
  }
  /** @type {ArrayBuffer[]} */
  const out = [];
  let cursor = headerBytes;
  for (let i = 0; i < n; i += 1) {
    const bytes = lens[i] * WORD_SIZE;
    out.push(framed.slice(cursor, cursor + bytes));
    cursor += bytes;
  }
  return out;
};
