// @ts-check
/**
 * Cap'n Proto struct read/write helpers.
 *
 * A struct is a contiguous run of `dataWords` data words followed by
 * `ptrWords` pointer words. Field reads/writes apply XOR-based defaults; we
 * keep field defaults at zero throughout this implementation (the rpc.capnp
 * schema uses zero defaults for all primitive fields we touch).
 */

import { Fail } from '@endo/errors';

import { WORD_SIZE } from './segment.js';
import { readPointer, writePointer, resolvePointer } from './pointer.js';

/**
 * @typedef {object} StructLocation
 * @property {import('./segment.js').MessageReader} msg
 * @property {number} segId
 * @property {number} wordOffset      Word offset to first data word.
 * @property {number} dataWords
 * @property {number} ptrWords
 */

/**
 * @typedef {object} StructBuilder
 * @property {import('./segment.js').MessageBuilder} msg
 * @property {number} segId
 * @property {number} wordOffset
 * @property {number} dataWords
 * @property {number} ptrWords
 */

/**
 * Allocate a struct of the given size and write a struct pointer at
 * `pointerLocation`.
 *
 * @param {import('./segment.js').MessageBuilder} msg
 * @param {{ segId: number, wordOffset: number }} pointerLocation
 *   Word location of the pointer slot itself.
 * @param {number} dataWords
 * @param {number} ptrWords
 * @returns {StructBuilder}
 */
export const allocStruct = (msg, pointerLocation, dataWords, ptrWords) => {
  const total = dataWords + ptrWords;
  const { segId: pSeg } = pointerLocation;
  const alloc = msg.allocate(total);
  const ptrSeg = msg.segments[pSeg];
  if (alloc.segId === pSeg) {
    // Same segment: regular struct pointer.
    const offsetWords = alloc.wordOffset - (pointerLocation.wordOffset + 1);
    writePointer(ptrSeg.view, pointerLocation.wordOffset * WORD_SIZE, {
      kind: 'struct',
      offsetWords,
      dataWords,
      ptrWords,
    });
  } else {
    // Different segment: write a double landing pad (2 words) in the same
    // segment as the struct so the far pointer's landingPad=1 layout is
    // intact. We use allocateInSegment so that the pad is guaranteed to
    // land next to the payload — `allocate`'s first-fit policy could
    // otherwise place the pad in an earlier segment with spare room.
    const padAlloc = msg.allocateInSegment(alloc.segId, 2);
    // First pad word: single-far pointing at content.
    writePointer(
      msg.segments[padAlloc.segId].view,
      padAlloc.wordOffset * WORD_SIZE,
      {
        kind: 'far',
        landingPad: 0,
        segmentId: alloc.segId,
        offsetWords: alloc.wordOffset,
      },
    );
    // Second pad word: tag (struct pointer with offset 0).
    writePointer(
      msg.segments[padAlloc.segId].view,
      (padAlloc.wordOffset + 1) * WORD_SIZE,
      {
        kind: 'struct',
        offsetWords: 0,
        dataWords,
        ptrWords,
      },
    );
    // Original pointer slot: far with double landing pad.
    writePointer(ptrSeg.view, pointerLocation.wordOffset * WORD_SIZE, {
      kind: 'far',
      landingPad: 1,
      segmentId: padAlloc.segId,
      offsetWords: padAlloc.wordOffset,
    });
  }
  return {
    msg,
    segId: alloc.segId,
    wordOffset: alloc.wordOffset,
    dataWords,
    ptrWords,
  };
};

/**
 * Resolve a pointer slot to a struct location, or null if the pointer is null.
 *
 * @param {import('./segment.js').MessageReader} msg
 * @param {number} segId
 * @param {number} pointerWordOffset
 * @returns {StructLocation | null}
 */
export const readStructPointer = (msg, segId, pointerWordOffset) => {
  const r = resolvePointer(msg, segId, pointerWordOffset);
  if (r.ptr.kind === 'null') return null;
  if (r.ptr.kind !== 'struct') {
    throw Fail`expected struct pointer, got ${r.ptr.kind}`;
  }
  return {
    msg,
    segId: r.targetSegId,
    wordOffset: r.targetWordOffset,
    dataWords: r.ptr.dataWords,
    ptrWords: r.ptr.ptrWords,
  };
};

const dataByteOffset = loc => loc.wordOffset * WORD_SIZE;
const ptrSlotByteOffset = (loc, idx) =>
  (loc.wordOffset + loc.dataWords + idx) * WORD_SIZE;

/**
 * @param {StructLocation} loc
 * @param {number} byteIdx
 * @returns {number}
 */
export const readUint8 = (loc, byteIdx) => {
  if (byteIdx >= loc.dataWords * WORD_SIZE) return 0;
  return loc.msg
    .segment(loc.segId)
    .view.getUint8(dataByteOffset(loc) + byteIdx);
};

/**
 * @param {StructBuilder} loc
 * @param {number} byteIdx
 * @param {number} value
 */
export const writeUint8 = (loc, byteIdx, value) => {
  if (byteIdx >= loc.dataWords * WORD_SIZE) {
    throw Fail`uint8 write out of range`;
  }
  loc.msg.segments[loc.segId].view.setUint8(
    loc.wordOffset * WORD_SIZE + byteIdx,
    value,
  );
};

/**
 * @param {StructLocation} loc
 * @param {number} byteIdx
 */
export const readUint16 = (loc, byteIdx) => {
  if (byteIdx + 2 > loc.dataWords * WORD_SIZE) return 0;
  return loc.msg
    .segment(loc.segId)
    .view.getUint16(dataByteOffset(loc) + byteIdx, true);
};

/**
 * @param {StructBuilder} loc
 * @param {number} byteIdx
 * @param {number} value
 */
export const writeUint16 = (loc, byteIdx, value) => {
  if (byteIdx + 2 > loc.dataWords * WORD_SIZE) {
    throw Fail`uint16 write at byte ${byteIdx} out of range (data section ${loc.dataWords * WORD_SIZE} bytes)`;
  }
  loc.msg.segments[loc.segId].view.setUint16(
    loc.wordOffset * WORD_SIZE + byteIdx,
    value,
    true,
  );
};

/**
 * @param {StructLocation} loc
 * @param {number} byteIdx
 */
export const readUint32 = (loc, byteIdx) => {
  if (byteIdx + 4 > loc.dataWords * WORD_SIZE) return 0;
  return loc.msg
    .segment(loc.segId)
    .view.getUint32(dataByteOffset(loc) + byteIdx, true);
};

/**
 * @param {StructBuilder} loc
 * @param {number} byteIdx
 * @param {number} value
 */
export const writeUint32 = (loc, byteIdx, value) => {
  if (byteIdx + 4 > loc.dataWords * WORD_SIZE) {
    throw Fail`uint32 write at byte ${byteIdx} out of range (data section ${loc.dataWords * WORD_SIZE} bytes)`;
  }
  loc.msg.segments[loc.segId].view.setUint32(
    loc.wordOffset * WORD_SIZE + byteIdx,
    // eslint-disable-next-line no-bitwise
    value >>> 0,
    true,
  );
};

/**
 * @param {StructLocation} loc
 * @param {number} byteIdx
 */
export const readUint64 = (loc, byteIdx) => {
  if (byteIdx + 8 > loc.dataWords * WORD_SIZE) return 0n;
  return loc.msg
    .segment(loc.segId)
    .view.getBigUint64(dataByteOffset(loc) + byteIdx, true);
};

/**
 * @param {StructBuilder} loc
 * @param {number} byteIdx
 * @param {number | bigint} value
 */
export const writeUint64 = (loc, byteIdx, value) => {
  if (byteIdx + 8 > loc.dataWords * WORD_SIZE) {
    throw Fail`uint64 write at byte ${byteIdx} out of range (data section ${loc.dataWords * WORD_SIZE} bytes)`;
  }
  loc.msg.segments[loc.segId].view.setBigUint64(
    loc.wordOffset * WORD_SIZE + byteIdx,
    BigInt(value),
    true,
  );
};

/**
 * Read a single bit from the data section (used for `Bool` fields).
 *
 * @param {StructLocation} loc
 * @param {number} bitIdx
 */
export const readBool = (loc, bitIdx) => {
  const byteIdx = bitIdx >>> 3;
  if (byteIdx >= loc.dataWords * WORD_SIZE) return false;
  // eslint-disable-next-line no-bitwise
  const bit = bitIdx & 7;
  // eslint-disable-next-line no-bitwise
  return (
    ((loc.msg
      .segment(loc.segId)
      .view.getUint8(dataByteOffset(loc) + byteIdx) >>>
      bit) &
      1) !==
    0
  );
};

/**
 * @param {StructBuilder} loc
 * @param {number} bitIdx
 * @param {boolean} value
 */
export const writeBool = (loc, bitIdx, value) => {
  // eslint-disable-next-line no-bitwise
  const byteIdx = bitIdx >>> 3;
  if (byteIdx >= loc.dataWords * WORD_SIZE) {
    throw Fail`bool write at bit ${bitIdx} out of range (data section ${loc.dataWords * WORD_SIZE} bytes)`;
  }
  // eslint-disable-next-line no-bitwise
  const bit = bitIdx & 7;
  const { view } = loc.msg.segments[loc.segId];
  const off = loc.wordOffset * WORD_SIZE + byteIdx;
  let cur = view.getUint8(off);
  // eslint-disable-next-line no-bitwise
  cur = value ? cur | (1 << bit) : cur & ~(1 << bit);
  view.setUint8(off, cur);
};

/**
 * Get the location of a pointer slot within a struct.
 *
 * @param {StructBuilder} loc
 * @param {number} ptrIdx
 * @returns {{ segId: number, wordOffset: number }}
 */
export const ptrSlot = (loc, ptrIdx) => {
  if (ptrIdx >= loc.ptrWords) {
    throw Fail`pointer slot index ${ptrIdx} >= ptrWords ${loc.ptrWords}`;
  }
  return {
    segId: loc.segId,
    wordOffset: loc.wordOffset + loc.dataWords + ptrIdx,
  };
};

/**
 * Read the raw pointer in a struct's pointer slot. Returns the pointer (which
 * may be null, struct, list, far, or cap).
 *
 * @param {StructLocation} loc
 * @param {number} ptrIdx
 */
export const readPtrAt = (loc, ptrIdx) => {
  if (ptrIdx >= loc.ptrWords) {
    return { kind: /** @type {const} */ ('null') };
  }
  return readPointer(
    loc.msg.segment(loc.segId).view,
    ptrSlotByteOffset(loc, ptrIdx),
  );
};
