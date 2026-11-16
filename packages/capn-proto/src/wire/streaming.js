// @ts-check
/**
 * Streaming Cap'n Proto framed-message parser.
 *
 * `frameSegments` (in `./framing.js`) produces ONE complete framed message
 * per call. Over a duplex byte stream like a TCP socket, peers concatenate
 * those framed messages and the receiver must split the byte stream back
 * into individual messages — chunks may arrive in any size, including
 * mid-message or with multiple messages per chunk.
 *
 * This module wraps that splitting behind a tiny push API:
 *
 *   const parser = makeFramedStreamParser({
 *     onMessage: framed => connection.dispatch(framed),
 *   });
 *   socket.on('data', chunk => parser.push(chunk));
 *
 * The parser buffers partial messages and emits full ones as they arrive.
 *
 * Cap'n Proto Standard Stream Encoding (per `framing.js`):
 *   uint32  segmentCount - 1     (LE)
 *   uint32[segmentCount]  word counts per segment (LE)
 *   pad to 8-byte alignment
 *   segments back-to-back (each a multiple of 8 bytes)
 */

import { Fail } from '@endo/errors';
import harden from '@endo/harden';
import { WORD_SIZE } from './segment.js';

const HEADER_WORD_BYTES = 4;

/**
 * @param {{ onMessage: (framed: ArrayBuffer) => void }} cfg
 */
export const makeFramedStreamParser = ({ onMessage }) => {
  /** @type {Uint8Array} */
  let buf = new Uint8Array(0);

  const append = chunk => {
    if (buf.length === 0) {
      buf =
        chunk instanceof Uint8Array
          ? chunk
          : new Uint8Array(
              chunk.buffer,
              chunk.byteOffset || 0,
              chunk.byteLength,
            );
      return;
    }
    const incoming =
      chunk instanceof Uint8Array
        ? chunk
        : new Uint8Array(chunk.buffer, chunk.byteOffset || 0, chunk.byteLength);
    const next = new Uint8Array(buf.length + incoming.length);
    next.set(buf, 0);
    next.set(incoming, buf.length);
    buf = next;
  };

  const view = () => new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  /**
   * Try to consume one complete message from `buf`. Returns true if a
   * message was emitted (so the caller should loop), false if `buf` is
   * still short of the next message.
   */
  const tryEmitOne = () => {
    if (buf.length < HEADER_WORD_BYTES) return false;
    const v = view();
    const segCountMinus1 = v.getUint32(0, true);
    const segCount = segCountMinus1 + 1;
    if (segCount > 512) {
      // Cap'n Proto recommends rejecting >512 segments to bound resource use.
      throw Fail`framed message segment count ${segCount} exceeds 512`;
    }
    const headerWords = Math.ceil((segCount + 1) / 2);
    const headerBytes = headerWords * WORD_SIZE;
    if (buf.length < headerBytes) return false;
    let totalWords = 0;
    for (let i = 0; i < segCount; i += 1) {
      totalWords += v.getUint32((i + 1) * HEADER_WORD_BYTES, true);
    }
    const totalBytes = headerBytes + totalWords * WORD_SIZE;
    if (buf.length < totalBytes) return false;
    // Slice into a standalone ArrayBuffer so the caller can keep the
    // reference past our next `push`.
    const out = new ArrayBuffer(totalBytes);
    new Uint8Array(out).set(buf.subarray(0, totalBytes));
    buf = buf.subarray(totalBytes);
    onMessage(out);
    return true;
  };

  return harden({
    /**
     * Append a chunk and emit any complete messages that result.
     *
     * @param {Uint8Array | { buffer: ArrayBuffer, byteOffset?: number, byteLength: number }} chunk
     */
    push: chunk => {
      append(chunk);
      // eslint-disable-next-line no-empty
      while (tryEmitOne()) {}
    },
    /** Bytes still buffered awaiting more data (for diagnostics / tests). */
    pending: () => buf.length,
  });
};
