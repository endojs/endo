// @ts-check
/**
 * Cap'n Proto segment arena.
 *
 * A message is a list of segments. Each segment is a contiguous run of
 * 8-byte words. Pointers within a segment can address words in any segment of
 * the same message via "far pointers" (see ./pointer.js).
 *
 * Segments grow geometrically. The MessageBuilder allocates new segments when
 * the current segment cannot satisfy a request.
 *
 * Endianness: little-endian, per the Cap'n Proto spec.
 */

import { Fail } from '@endo/errors';

export const WORD_SIZE = 8;
const INITIAL_SEGMENT_WORDS = 64;
const MAX_SEGMENT_WORDS = 1 << 24;

/**
 * @typedef {object} SegmentBuilder
 * @property {number} id
 * @property {ArrayBuffer} buffer
 * @property {DataView} view
 * @property {Uint8Array} bytes
 * @property {number} usedWords
 * @property {number} capacityWords
 * @property {(words: number) => number} allocate Allocates `words` words at the
 *   end of the segment and returns the word offset of the start of the new
 *   region, or -1 if the segment is full.
 * @property {(words: number) => void} grow Reallocates the underlying buffer.
 */

/**
 * @param {number} id
 * @param {number} initialWords
 * @returns {SegmentBuilder}
 */
export const makeSegmentBuilder = (
  id,
  initialWords = INITIAL_SEGMENT_WORDS,
) => {
  let capacityWords = initialWords;
  let buffer = new ArrayBuffer(capacityWords * WORD_SIZE);
  let view = new DataView(buffer);
  let bytes = new Uint8Array(buffer);
  let usedWords = 0;

  const seg = {
    id,
    get buffer() {
      return buffer;
    },
    get view() {
      return view;
    },
    get bytes() {
      return bytes;
    },
    get usedWords() {
      return usedWords;
    },
    get capacityWords() {
      return capacityWords;
    },
    allocate(words) {
      if (words < 0) {
        throw Fail`negative allocation ${words}`;
      }
      if (usedWords + words > capacityWords) {
        return -1;
      }
      const start = usedWords;
      usedWords += words;
      return start;
    },
    grow(minWords) {
      let newCap = capacityWords;
      while (newCap < usedWords + minWords) {
        newCap *= 2;
      }
      if (newCap > MAX_SEGMENT_WORDS) {
        throw Fail`segment too large: ${newCap} words`;
      }
      const newBuffer = new ArrayBuffer(newCap * WORD_SIZE);
      new Uint8Array(newBuffer).set(bytes.subarray(0, usedWords * WORD_SIZE));
      buffer = newBuffer;
      view = new DataView(newBuffer);
      bytes = new Uint8Array(newBuffer);
      capacityWords = newCap;
    },
  };
  return seg;
};

/**
 * @typedef {object} MessageBuilder
 * @property {SegmentBuilder[]} segments
 * @property {(words: number) => { segId: number, wordOffset: number }} allocate
 *   Allocate `words` words in any segment that has room, growing or creating
 *   segments as needed.
 * @property {(segId: number, words: number) => { segId: number, wordOffset: number }} allocateInSegment
 *   Allocate `words` words specifically inside `segId`, growing it (or
 *   creating a fresh segment if it cannot grow). This is required when a
 *   landing pad must live adjacent to a payload that has already been
 *   placed in a particular segment; otherwise the first-fit policy of
 *   `allocate` could put the pad in an earlier segment with spare room.
 * @property {() => ArrayBuffer[]} finish Returns one ArrayBuffer per segment,
 *   trimmed to the used portion. The framing layer wraps these.
 */

/** @returns {MessageBuilder} */
export const makeMessageBuilder = () => {
  /** @type {SegmentBuilder[]} */
  const segments = [makeSegmentBuilder(0)];

  const allocate = words => {
    for (const seg of segments) {
      const off = seg.allocate(words);
      if (off >= 0) {
        return { segId: seg.id, wordOffset: off };
      }
    }
    // Grow the last segment if it would fit, otherwise add a new one.
    const last = segments[segments.length - 1];
    if (words <= MAX_SEGMENT_WORDS / 2) {
      last.grow(words);
      const off = last.allocate(words);
      off >= 0 || Fail`grow failed`;
      return { segId: last.id, wordOffset: off };
    }
    const seg = makeSegmentBuilder(
      segments.length,
      Math.max(INITIAL_SEGMENT_WORDS, words),
    );
    segments.push(seg);
    const off = seg.allocate(words);
    off >= 0 || Fail`fresh segment allocate failed`;
    return { segId: seg.id, wordOffset: off };
  };

  const allocateInSegment = (segId, words) => {
    const seg = segments[segId];
    seg || Fail`unknown segment ${segId}`;
    let off = seg.allocate(words);
    if (off >= 0) return { segId, wordOffset: off };
    // Grow this specific segment to fit.
    if (words <= MAX_SEGMENT_WORDS / 2) {
      seg.grow(words);
      off = seg.allocate(words);
      off >= 0 || Fail`grow failed for segment ${segId}`;
      return { segId, wordOffset: off };
    }
    throw Fail`cannot allocate ${words} words in segment ${segId}`;
  };

  const finish = () =>
    segments.map(seg => seg.buffer.slice(0, seg.usedWords * WORD_SIZE));

  return { segments, allocate, allocateInSegment, finish };
};

/**
 * @typedef {object} SegmentReader
 * @property {number} id
 * @property {DataView} view
 * @property {Uint8Array} bytes
 * @property {number} wordCount
 */

/**
 * @typedef {object} MessageReader
 * @property {SegmentReader[]} segments
 * @property {(segId: number) => SegmentReader} segment
 */

/**
 * @param {ArrayBuffer[]} buffers
 * @returns {MessageReader}
 */
export const makeMessageReader = buffers => {
  const segments = buffers.map((buf, id) => ({
    id,
    view: new DataView(buf),
    bytes: new Uint8Array(buf),
    wordCount: buf.byteLength / WORD_SIZE,
  }));
  return {
    segments,
    segment(segId) {
      const s = segments[segId];
      if (!s) throw Fail`unknown segment ${segId}`;
      return s;
    },
  };
};
