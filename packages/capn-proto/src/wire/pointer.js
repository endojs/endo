// @ts-check
/**
 * Cap'n Proto pointer encoding.
 *
 * A pointer is a single 64-bit (8-byte) word. The low 2 bits are a tag:
 *
 *   0 = struct pointer
 *   1 = list pointer
 *   2 = far pointer
 *   3 = "other" pointer (capability)
 *
 * Layout (little-endian):
 *
 *   Struct  : tag=0 | offset(30, signed) | dataWords(16) | ptrWords(16)
 *   List    : tag=1 | offset(30, signed) | elemSize(3) | elemCount(29)
 *             where elemSize is one of:
 *                0=void, 1=bit, 2=byte, 3=2byte, 4=4byte, 5=8byte (data),
 *                6=pointer, 7=composite (preceded by tag word giving struct size
 *                  and element count interpreted as words of payload)
 *   Far     : tag=2 | landingPad(1) | offset(29) | segmentId(32)
 *             landingPad=0 → single word at target; landingPad=1 → double-word
 *             landing pad (intra-segment indirection then far)
 *   Other   : tag=3 | subtag(30) | unused(32)
 *             subtag 0 = capability; the high 32 bits are the capability index
 *             into the message's cap table.
 *
 * Offsets in struct/list pointers are in WORDS, signed, relative to the word
 * IMMEDIATELY AFTER the pointer itself. A null struct pointer is a struct
 * pointer with dataWords=0 ptrWords=0 offset=0 (i.e. the all-zero word).
 */

import { Fail } from '@endo/errors';

import { WORD_SIZE } from './segment.js';

/** Pointer kind tag values. */
export const PTR_STRUCT = 0;
export const PTR_LIST = 1;
export const PTR_FAR = 2;
export const PTR_OTHER = 3;

/** List element-size codes. */
export const LIST_VOID = 0;
export const LIST_BIT = 1;
export const LIST_BYTE = 2;
export const LIST_TWO_BYTES = 3;
export const LIST_FOUR_BYTES = 4;
export const LIST_EIGHT_BYTES = 5;
export const LIST_POINTER = 6;
export const LIST_COMPOSITE = 7;

/** Other-pointer subtags. */
export const OTHER_CAPABILITY = 0;

/**
 * Read a 32-bit signed integer treating its low 2 bits as the tag.
 * Returns the signed offset in words (sign-extended from 30 bits).
 *
 * @param {number} lo32
 */
const readOffsetSigned = lo32 => {
  // low 2 bits are tag; upper 30 bits are signed offset
  // shift right arithmetic on 32-bit, then divide by 4
  // Using bitwise ops to sign-extend the 30-bit value:
  // eslint-disable-next-line no-bitwise
  return lo32 >> 2;
};

/**
 * Encode (tag, signedOffset30) into the low 32 bits.
 *
 * @param {number} tag
 * @param {number} offset30
 */
const encodeOffset = (tag, offset30) => {
  // eslint-disable-next-line no-bitwise
  return ((offset30 << 2) | tag) >>> 0;
};

/**
 * @typedef {object} StructPointer
 * @property {'struct'} kind
 * @property {number} offsetWords  signed, relative to word after pointer
 * @property {number} dataWords
 * @property {number} ptrWords
 */

/**
 * @typedef {object} ListPointer
 * @property {'list'} kind
 * @property {number} offsetWords
 * @property {number} elemSize
 * @property {number} elemCount
 */

/**
 * @typedef {object} FarPointer
 * @property {'far'} kind
 * @property {number} landingPad   0 or 1
 * @property {number} segmentId
 * @property {number} offsetWords  unsigned, within target segment
 */

/**
 * @typedef {object} CapPointer
 * @property {'cap'} kind
 * @property {number} index
 */

/**
 * @typedef {object} NullPointer
 * @property {'null'} kind
 */

/** @typedef {StructPointer | ListPointer | FarPointer | CapPointer | NullPointer} Pointer */

/**
 * @param {DataView} view
 * @param {number} byteOffset
 * @returns {Pointer}
 */
export const readPointer = (view, byteOffset) => {
  const lo = view.getUint32(byteOffset, true);
  const hi = view.getUint32(byteOffset + 4, true);
  if (lo === 0 && hi === 0) {
    return { kind: 'null' };
  }
  // eslint-disable-next-line no-bitwise
  const tag = lo & 0x3;
  switch (tag) {
    case PTR_STRUCT: {
      const offset = readOffsetSigned(lo);
      // eslint-disable-next-line no-bitwise
      const dataWords = hi & 0xffff;
      // eslint-disable-next-line no-bitwise
      const ptrWords = (hi >>> 16) & 0xffff;
      return { kind: 'struct', offsetWords: offset, dataWords, ptrWords };
    }
    case PTR_LIST: {
      const offset = readOffsetSigned(lo);
      // eslint-disable-next-line no-bitwise
      const elemSize = hi & 0x7;
      // eslint-disable-next-line no-bitwise
      const elemCount = hi >>> 3;
      return { kind: 'list', offsetWords: offset, elemSize, elemCount };
    }
    case PTR_FAR: {
      // eslint-disable-next-line no-bitwise
      const landingPad = (lo >>> 2) & 0x1;
      // eslint-disable-next-line no-bitwise
      const offset = lo >>> 3;
      return {
        kind: 'far',
        landingPad,
        offsetWords: offset,
        segmentId: hi,
      };
    }
    case PTR_OTHER: {
      // eslint-disable-next-line no-bitwise
      const subtag = lo >>> 2;
      if (subtag !== OTHER_CAPABILITY) {
        throw Fail`unknown other-pointer subtag ${subtag}`;
      }
      return { kind: 'cap', index: hi };
    }
    default:
      throw Fail`unreachable tag ${tag}`;
  }
};

/**
 * Range checks for individual pointer fields. Cap'n Proto pointer encoding
 * tightly packs sub-fields into the 64-bit word, so silent truncation by JS
 * bitwise operators would corrupt the wire format. We validate each
 * caller-supplied value against its representable range and Fail loudly
 * otherwise.
 */
const SIGNED_30_MIN = -(2 ** 29);
const SIGNED_30_MAX = 2 ** 29 - 1;
const UINT16_MAX = 0xffff;
const UINT29_MAX = 0x1fffffff;
const UINT32_MAX = 0xffffffff;

/** @param {number} offsetWords */
const checkSignedOffset30 = offsetWords => {
  if (
    !Number.isInteger(offsetWords) ||
    offsetWords < SIGNED_30_MIN ||
    offsetWords > SIGNED_30_MAX
  ) {
    throw Fail`pointer offsetWords ${offsetWords} not representable as signed 30-bit`;
  }
};

/**
 * @param {number} value
 * @param {string} name
 */
const checkUint16 = (value, name) => {
  if (!Number.isInteger(value) || value < 0 || value > UINT16_MAX) {
    throw Fail`pointer ${name} ${value} not representable as uint16`;
  }
};

/**
 * @param {number} value
 * @param {string} name
 */
const checkUint29 = (value, name) => {
  if (!Number.isInteger(value) || value < 0 || value > UINT29_MAX) {
    throw Fail`pointer ${name} ${value} not representable as uint29`;
  }
};

/**
 * @param {number} value
 * @param {string} name
 */
const checkUint32 = (value, name) => {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw Fail`pointer ${name} ${value} not representable as uint32`;
  }
};

/**
 * @param {DataView} view
 * @param {number} byteOffset
 * @param {Pointer} ptr
 */
export const writePointer = (view, byteOffset, ptr) => {
  switch (ptr.kind) {
    case 'null':
      view.setUint32(byteOffset, 0, true);
      view.setUint32(byteOffset + 4, 0, true);
      return;
    case 'struct': {
      checkSignedOffset30(ptr.offsetWords);
      checkUint16(ptr.dataWords, 'dataWords');
      checkUint16(ptr.ptrWords, 'ptrWords');
      const lo = encodeOffset(PTR_STRUCT, ptr.offsetWords);
      // eslint-disable-next-line no-bitwise
      const hi = ((ptr.ptrWords & 0xffff) << 16) | (ptr.dataWords & 0xffff);
      view.setUint32(byteOffset, lo, true);
      // eslint-disable-next-line no-bitwise
      view.setUint32(byteOffset + 4, hi >>> 0, true);
      return;
    }
    case 'list': {
      checkSignedOffset30(ptr.offsetWords);
      if (ptr.elemSize < 0 || ptr.elemSize > 7) {
        throw Fail`pointer elemSize ${ptr.elemSize} not in 0..7`;
      }
      checkUint29(ptr.elemCount, 'elemCount');
      const lo = encodeOffset(PTR_LIST, ptr.offsetWords);
      // eslint-disable-next-line no-bitwise
      const hi = ((ptr.elemCount & 0x1fffffff) << 3) | (ptr.elemSize & 0x7);
      view.setUint32(byteOffset, lo, true);
      // eslint-disable-next-line no-bitwise
      view.setUint32(byteOffset + 4, hi >>> 0, true);
      return;
    }
    case 'far': {
      checkUint29(ptr.offsetWords, 'far offsetWords');
      if (ptr.landingPad !== 0 && ptr.landingPad !== 1) {
        throw Fail`far landingPad must be 0 or 1, got ${ptr.landingPad}`;
      }
      checkUint32(ptr.segmentId, 'segmentId');
      /* eslint-disable no-bitwise */
      const lo =
        (((ptr.offsetWords & 0x1fffffff) << 3) |
          ((ptr.landingPad & 0x1) << 2) |
          PTR_FAR) >>>
        0;
      view.setUint32(byteOffset, lo, true);
      view.setUint32(byteOffset + 4, ptr.segmentId >>> 0, true);
      /* eslint-enable no-bitwise */
      return;
    }
    case 'cap': {
      checkUint32(ptr.index, 'cap index');
      // eslint-disable-next-line no-bitwise
      const lo = ((OTHER_CAPABILITY << 2) | PTR_OTHER) >>> 0;
      view.setUint32(byteOffset, lo, true);
      // eslint-disable-next-line no-bitwise
      view.setUint32(byteOffset + 4, ptr.index >>> 0, true);
      return;
    }
    default:
      throw Fail`bad pointer kind ${ptr}`;
  }
};

/**
 * Resolve any far-pointer indirection. Returns the segment & word offset of
 * the target's first content word, plus the resolved target pointer (struct,
 * list, or cap).
 *
 * For a non-far pointer, returns the location of the first content word
 * computed from the pointer's own offset relative to the slot it lives in.
 *
 * @param {import('./segment.js').MessageReader} msg
 * @param {number} segId
 * @param {number} pointerWordOffset
 * @returns {{
 *   targetSegId: number,
 *   targetWordOffset: number,
 *   ptr: StructPointer | ListPointer | CapPointer | NullPointer,
 * }}
 */
export const resolvePointer = (msg, segId, pointerWordOffset) => {
  const seg = msg.segment(segId);
  const ptr = readPointer(seg.view, pointerWordOffset * WORD_SIZE);
  if (ptr.kind === 'null') {
    return { targetSegId: segId, targetWordOffset: 0, ptr };
  }
  if (ptr.kind === 'far') {
    const farSeg = msg.segment(ptr.segmentId);
    if (ptr.landingPad === 0) {
      // Single landing pad: the word at offset is the actual struct/list/cap
      // pointer, and content immediately follows.
      const inner = readPointer(farSeg.view, ptr.offsetWords * WORD_SIZE);
      if (inner.kind === 'far' || inner.kind === 'null') {
        throw Fail`single-landing-pad must point to inline pointer`;
      }
      return {
        targetSegId: ptr.segmentId,
        targetWordOffset: ptr.offsetWords + 1 + inner.offsetWords,
        ptr: inner,
      };
    }
    // Double landing pad: two words. First is a far ptr (offset to content),
    // second is the actual struct/list/cap pointer with offset=0.
    const firstFar = readPointer(farSeg.view, ptr.offsetWords * WORD_SIZE);
    const tagPtr = readPointer(farSeg.view, (ptr.offsetWords + 1) * WORD_SIZE);
    if (firstFar.kind !== 'far' || firstFar.landingPad !== 0) {
      throw Fail`double-landing-pad first word must be single far pointer`;
    }
    if (tagPtr.kind === 'far' || tagPtr.kind === 'null') {
      throw Fail`double-landing-pad tag word must be inline pointer`;
    }
    return {
      targetSegId: firstFar.segmentId,
      targetWordOffset: firstFar.offsetWords,
      ptr: tagPtr,
    };
  }
  // Inline pointer: content begins at pointer slot + 1 + offset.
  return {
    targetSegId: segId,
    targetWordOffset: pointerWordOffset + 1 + ptr.offsetWords,
    ptr,
  };
};
