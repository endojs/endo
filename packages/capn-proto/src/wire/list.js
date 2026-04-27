// @ts-check
/**
 * Cap'n Proto list helpers.
 *
 * Lists come in 8 element-size codes; this implementation handles all of
 * them: void (0), bit (1), byte (2), 2-byte (3), 4-byte (4), 8-byte (5),
 * pointer (6), and composite (7).
 *
 * For composite lists the list payload begins with a tag word that looks like
 * a struct pointer but whose offsetWords field actually carries the element
 * count, and whose dataWords/ptrWords describe the per-element struct shape.
 */

import { Fail } from '@endo/errors';

import { WORD_SIZE } from './segment.js';
import {
  LIST_BIT,
  LIST_BYTE,
  LIST_TWO_BYTES,
  LIST_FOUR_BYTES,
  LIST_EIGHT_BYTES,
  LIST_POINTER,
  LIST_COMPOSITE,
  LIST_VOID,
  readPointer,
  writePointer,
  resolvePointer,
} from './pointer.js';

const ELEM_BYTES = {
  [LIST_VOID]: 0,
  [LIST_BIT]: 0, // packed bits
  [LIST_BYTE]: 1,
  [LIST_TWO_BYTES]: 2,
  [LIST_FOUR_BYTES]: 4,
  [LIST_EIGHT_BYTES]: 8,
  [LIST_POINTER]: 8,
};

/**
 * @typedef {object} ListLocation
 * @property {import('./segment.js').MessageReader} msg
 * @property {number} segId
 * @property {number} wordOffset      Word offset to first element / tag.
 * @property {number} elemSize        One of LIST_* codes.
 * @property {number} elemCount
 * @property {number} elemDataWords   composite only
 * @property {number} elemPtrWords    composite only
 */

/**
 * Resolve a pointer slot to a list location, or null if the pointer is null.
 *
 * @param {import('./segment.js').MessageReader} msg
 * @param {number} segId
 * @param {number} pointerWordOffset
 * @returns {ListLocation | null}
 */
export const readListPointer = (msg, segId, pointerWordOffset) => {
  const r = resolvePointer(msg, segId, pointerWordOffset);
  if (r.ptr.kind === 'null') return null;
  if (r.ptr.kind !== 'list') {
    throw Fail`expected list pointer, got ${r.ptr.kind}`;
  }
  let elemCount = r.ptr.elemCount;
  let elemDataWords = 0;
  let elemPtrWords = 0;
  let wordOffset = r.targetWordOffset;
  if (r.ptr.elemSize === LIST_COMPOSITE) {
    // Read the tag word.
    const tag = readPointer(
      msg.segment(r.targetSegId).view,
      wordOffset * WORD_SIZE,
    );
    if (tag.kind !== 'struct') {
      throw Fail`composite list tag must be struct-like, got ${tag.kind}`;
    }
    elemCount = tag.offsetWords;
    elemDataWords = tag.dataWords;
    elemPtrWords = tag.ptrWords;
    wordOffset += 1;
  }
  return {
    msg,
    segId: r.targetSegId,
    wordOffset,
    elemSize: r.ptr.elemSize,
    elemCount,
    elemDataWords,
    elemPtrWords,
  };
};

/**
 * Allocate a primitive (non-composite) list and write a list pointer at
 * `pointerLocation`.
 *
 * @param {import('./segment.js').MessageBuilder} msg
 * @param {{ segId: number, wordOffset: number }} pointerLocation
 * @param {number} elemSize
 * @param {number} elemCount
 * @returns {{ segId: number, wordOffset: number, elemSize: number, elemCount: number }}
 */
export const allocList = (msg, pointerLocation, elemSize, elemCount) => {
  if (elemSize === LIST_COMPOSITE) {
    throw Fail`use allocCompositeList`;
  }
  let totalWords;
  if (elemSize === LIST_BIT) {
    totalWords = Math.ceil(elemCount / 64);
  } else {
    const bytes = ELEM_BYTES[elemSize] * elemCount;
    totalWords = Math.ceil(bytes / WORD_SIZE);
  }
  const alloc = msg.allocate(totalWords);
  // For now we only emit lists whose pointer and content live in the same
  // segment; otherwise we'd need a far pointer here.
  if (alloc.segId !== pointerLocation.segId) {
    // Promote to far landing pad. Allocate a single landing pad with the list
    // pointer at offset 0 of the destination, content immediately after.
    // Simpler: use double landing pad.
    // Place the landing pad inside the same segment as the payload so that
    // far+landingPad=1 always finds its pair in alloc.segId. allocate()'s
    // first-fit policy could otherwise put the pad in an earlier segment.
    const padAlloc = msg.allocateInSegment(alloc.segId, 2);
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
    writePointer(
      msg.segments[padAlloc.segId].view,
      (padAlloc.wordOffset + 1) * WORD_SIZE,
      { kind: 'list', offsetWords: 0, elemSize, elemCount },
    );
    writePointer(
      msg.segments[pointerLocation.segId].view,
      pointerLocation.wordOffset * WORD_SIZE,
      {
        kind: 'far',
        landingPad: 1,
        segmentId: padAlloc.segId,
        offsetWords: padAlloc.wordOffset,
      },
    );
  } else {
    const offsetWords = alloc.wordOffset - (pointerLocation.wordOffset + 1);
    writePointer(
      msg.segments[pointerLocation.segId].view,
      pointerLocation.wordOffset * WORD_SIZE,
      { kind: 'list', offsetWords, elemSize, elemCount },
    );
  }
  return {
    segId: alloc.segId,
    wordOffset: alloc.wordOffset,
    elemSize,
    elemCount,
  };
};

/**
 * Allocate a composite list and write its pointer.
 *
 * @param {import('./segment.js').MessageBuilder} msg
 * @param {{ segId: number, wordOffset: number }} pointerLocation
 * @param {number} elemCount
 * @param {number} elemDataWords
 * @param {number} elemPtrWords
 * @returns {{
 *   segId: number,
 *   wordOffset: number,
 *   elemCount: number,
 *   elemDataWords: number,
 *   elemPtrWords: number,
 * }}
 */
export const allocCompositeList = (
  msg,
  pointerLocation,
  elemCount,
  elemDataWords,
  elemPtrWords,
) => {
  const perElemWords = elemDataWords + elemPtrWords;
  const payloadWords = elemCount * perElemWords;
  // 1 tag word + payload.
  const alloc = msg.allocate(1 + payloadWords);
  if (alloc.segId !== pointerLocation.segId) {
    // Far landing pad: place pad in the payload segment so far+landingPad=1
    // resolution always finds the pair.
    const padAlloc = msg.allocateInSegment(alloc.segId, 2);
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
    writePointer(
      msg.segments[padAlloc.segId].view,
      (padAlloc.wordOffset + 1) * WORD_SIZE,
      {
        kind: 'list',
        offsetWords: 0,
        elemSize: LIST_COMPOSITE,
        elemCount: payloadWords,
      },
    );
    writePointer(
      msg.segments[pointerLocation.segId].view,
      pointerLocation.wordOffset * WORD_SIZE,
      {
        kind: 'far',
        landingPad: 1,
        segmentId: padAlloc.segId,
        offsetWords: padAlloc.wordOffset,
      },
    );
  } else {
    const offsetWords = alloc.wordOffset - (pointerLocation.wordOffset + 1);
    writePointer(
      msg.segments[pointerLocation.segId].view,
      pointerLocation.wordOffset * WORD_SIZE,
      {
        kind: 'list',
        offsetWords,
        elemSize: LIST_COMPOSITE,
        elemCount: payloadWords,
      },
    );
  }
  // Write the tag word.
  writePointer(msg.segments[alloc.segId].view, alloc.wordOffset * WORD_SIZE, {
    kind: 'struct',
    offsetWords: elemCount,
    dataWords: elemDataWords,
    ptrWords: elemPtrWords,
  });
  return {
    segId: alloc.segId,
    wordOffset: alloc.wordOffset + 1,
    elemCount,
    elemDataWords,
    elemPtrWords,
  };
};

/**
 * Get the StructBuilder/StructLocation for the i-th element of a composite list.
 *
 * @param {object} listLoc
 * @param {number} listLoc.segId
 * @param {number} listLoc.wordOffset
 * @param {number} listLoc.elemDataWords
 * @param {number} listLoc.elemPtrWords
 * @param {any} msg
 * @param {number} idx
 */
export const compositeElement = (msg, listLoc, idx) => {
  const perElem = listLoc.elemDataWords + listLoc.elemPtrWords;
  return {
    msg,
    segId: listLoc.segId,
    wordOffset: listLoc.wordOffset + idx * perElem,
    dataWords: listLoc.elemDataWords,
    ptrWords: listLoc.elemPtrWords,
  };
};

/**
 * Get the byte offset of the i-th element of a primitive list.
 *
 * @param {ListLocation | { wordOffset: number, elemSize: number }} listLoc
 * @param {number} idx
 */
export const primitiveElementByteOffset = (listLoc, idx) => {
  if (listLoc.elemSize === LIST_BIT) {
    throw Fail`bit lists indexed by readBitListEntry`;
  }
  return listLoc.wordOffset * WORD_SIZE + idx * ELEM_BYTES[listLoc.elemSize];
};
