// @ts-check
/**
 * Cap'n Proto "packed" encoding.
 *
 * The packed encoding is a simple compression of the unpacked stream that
 * exploits the fact that most Cap'n Proto messages contain many zero bytes.
 * It operates word-at-a-time. For each 8-byte word of unpacked input the
 * encoder emits:
 *
 *   1. One TAG byte: bit i is set iff byte i of the word is non-zero.
 *   2. The non-zero bytes themselves, in increasing index order.
 *   3. If TAG == 0x00 (the whole word was zero) the encoder additionally
 *      emits a count byte N. The next N words are also all-zero (so the
 *      run is N+1 zero words including the one whose tag was emitted).
 *   4. If TAG == 0xff (the whole word was non-zero) the encoder
 *      additionally emits a count byte N and then N raw uncompressed
 *      words. These are bytes that are unlikely to compress well, so
 *      packing them word-by-word would only inflate the stream.
 *
 * The decoder mirrors this exactly. Unpacked output is always a multiple
 * of 8 bytes.
 *
 * Spec: https://capnproto.org/encoding.html#packing
 */

import { Fail } from '@endo/errors';

import { WORD_SIZE } from './segment.js';

/**
 * Pack an unpacked Cap'n Proto stream into the compact form.
 *
 * @param {ArrayBuffer | Uint8Array} unpacked An unpacked Cap'n Proto byte
 *   stream whose length must be a multiple of 8.
 * @returns {ArrayBuffer}
 */
export const pack = unpacked => {
  const u8 =
    unpacked instanceof Uint8Array ? unpacked : new Uint8Array(unpacked);
  if (u8.length % WORD_SIZE !== 0) {
    throw Fail`pack: input length ${u8.length} not a multiple of 8`;
  }
  const wordCount = u8.length / WORD_SIZE;
  // Worst case: every word is full of non-zeros and emitted as a literal
  // run of length 1, so ~9 bytes per word + a 1-byte run count. Cap at 10x
  // input to keep things simple.
  const out = new Uint8Array(u8.length * 10 + 16);
  let outLen = 0;
  let i = 0;

  /** @param {number} byte */
  const emit = byte => {
    out[outLen] = byte;
    outLen += 1;
  };
  /** @param {number} start word offset @param {number} end exclusive */
  const emitWordRange = (start, end) => {
    out.set(u8.subarray(start * WORD_SIZE, end * WORD_SIZE), outLen);
    outLen += (end - start) * WORD_SIZE;
  };

  while (i < wordCount) {
    const wordStart = i * WORD_SIZE;
    let tag = 0;
    for (let j = 0; j < WORD_SIZE; j += 1) {
      if (u8[wordStart + j] !== 0) {
        // eslint-disable-next-line no-bitwise
        tag |= 1 << j;
      }
    }
    emit(tag);
    if (tag === 0x00) {
      // Run of zero words. Count how many additional zero words follow,
      // capped at 255.
      let n = 0;
      let j = i + 1;
      while (j < wordCount && n < 255) {
        let allZero = true;
        for (let k = 0; k < WORD_SIZE; k += 1) {
          if (u8[j * WORD_SIZE + k] !== 0) {
            allZero = false;
            break;
          }
        }
        if (!allZero) break;
        n += 1;
        j += 1;
      }
      emit(n);
      i += 1 + n;
    } else if (tag === 0xff) {
      // Emit the eight non-zero bytes, then a literal-run count.
      emitWordRange(i, i + 1);
      // Count words ahead that contain at least 5 non-zero bytes (heuristic
      // matching capnproto reference): break the run only when the next
      // word would compress better. Cap at 255.
      let n = 0;
      let j = i + 1;
      while (j < wordCount && n < 255) {
        let nonZero = 0;
        for (let k = 0; k < WORD_SIZE; k += 1) {
          if (u8[j * WORD_SIZE + k] !== 0) nonZero += 1;
        }
        if (nonZero < 5) break;
        n += 1;
        j += 1;
      }
      emit(n);
      emitWordRange(i + 1, i + 1 + n);
      i += 1 + n;
    } else {
      // Mixed: emit only the non-zero bytes.
      for (let j = 0; j < WORD_SIZE; j += 1) {
        if (u8[wordStart + j] !== 0) emit(u8[wordStart + j]);
      }
      i += 1;
    }
  }

  return out.buffer.slice(0, outLen);
};

/**
 * Unpack a packed Cap'n Proto stream back into the unpacked form.
 *
 * @param {ArrayBuffer | Uint8Array} packed
 * @returns {ArrayBuffer}
 */
export const unpack = packed => {
  const u8 = packed instanceof Uint8Array ? packed : new Uint8Array(packed);
  // Generous overallocation; trimmed at the end.
  const out = new Uint8Array(u8.length * 8 + 64);
  let outLen = 0;
  let i = 0;

  /** @param {number} count words @returns {number} new outLen */
  const emitZeros = count => {
    // out is already zero-initialised; just advance.
    return outLen + count * WORD_SIZE;
  };

  while (i < u8.length) {
    const tag = u8[i];
    i += 1;
    if (tag === 0x00) {
      if (i >= u8.length) {
        throw Fail`unpack: truncated zero-run header`;
      }
      const n = u8[i];
      i += 1;
      // 1 word of zeros for the tag itself + n more.
      outLen = emitZeros(n + 1);
    } else if (tag === 0xff) {
      // 8 non-zero bytes follow, then a literal-run count, then that many
      // additional uncompressed words.
      if (i + WORD_SIZE > u8.length) {
        throw Fail`unpack: truncated full-tag word`;
      }
      out.set(u8.subarray(i, i + WORD_SIZE), outLen);
      outLen += WORD_SIZE;
      i += WORD_SIZE;
      if (i >= u8.length) {
        throw Fail`unpack: truncated literal-run count`;
      }
      const n = u8[i];
      i += 1;
      const literalBytes = n * WORD_SIZE;
      if (i + literalBytes > u8.length) {
        throw Fail`unpack: truncated literal run`;
      }
      out.set(u8.subarray(i, i + literalBytes), outLen);
      outLen += literalBytes;
      i += literalBytes;
    } else {
      // Mixed: read one byte per set bit in tag.
      for (let j = 0; j < WORD_SIZE; j += 1) {
        // eslint-disable-next-line no-bitwise
        if ((tag & (1 << j)) !== 0) {
          if (i >= u8.length) {
            throw Fail`unpack: truncated mixed word`;
          }
          out[outLen + j] = u8[i];
          i += 1;
        }
        // else: leave out[outLen + j] = 0 (already zero from new Uint8Array)
      }
      outLen += WORD_SIZE;
    }
  }

  return out.buffer.slice(0, outLen);
};
