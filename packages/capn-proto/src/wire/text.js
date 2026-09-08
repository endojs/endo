// @ts-check
/**
 * Text and Data helpers.
 *
 * Text is a List(Byte) with a trailing NUL byte (counted in elemCount).
 * Data is a plain List(Byte) with no NUL terminator.
 */

import { Fail } from '@endo/errors';

import { WORD_SIZE } from './segment.js';
import { LIST_BYTE } from './pointer.js';
import { allocList, readListPointer } from './list.js';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8');

/**
 * Write a Text into a pointer slot. Allocates a list-of-byte with a
 * NUL-terminated UTF-8 payload.
 *
 * @param {import('./segment.js').MessageBuilder} msg
 * @param {{ segId: number, wordOffset: number }} pointerLocation
 * @param {string} value
 */
export const writeText = (msg, pointerLocation, value) => {
  const utf8 = utf8Encoder.encode(value);
  const total = utf8.length + 1;
  const list = allocList(msg, pointerLocation, LIST_BYTE, total);
  const seg = msg.segments[list.segId];
  const off = list.wordOffset * WORD_SIZE;
  for (let i = 0; i < utf8.length; i += 1) {
    seg.view.setUint8(off + i, utf8[i]);
  }
  seg.view.setUint8(off + utf8.length, 0);
};

/**
 * Read a Text from a pointer slot. Returns null if the pointer is null.
 *
 * @param {import('./segment.js').MessageReader} msg
 * @param {number} segId
 * @param {number} pointerWordOffset
 */
export const readText = (msg, segId, pointerWordOffset) => {
  const list = readListPointer(msg, segId, pointerWordOffset);
  if (list === null) return null;
  if (list.elemSize !== LIST_BYTE) {
    throw Fail`Text must be List(Byte), got ${list.elemSize}`;
  }
  const seg = msg.segment(list.segId);
  // Strip the trailing NUL.
  const len = list.elemCount > 0 ? list.elemCount - 1 : 0;
  const start = list.wordOffset * WORD_SIZE;
  return utf8Decoder.decode(seg.bytes.subarray(start, start + len));
};

/**
 * Write a Data field (raw bytes, no NUL).
 *
 * @param {import('./segment.js').MessageBuilder} msg
 * @param {{ segId: number, wordOffset: number }} pointerLocation
 * @param {Uint8Array} value
 */
export const writeData = (msg, pointerLocation, value) => {
  const list = allocList(msg, pointerLocation, LIST_BYTE, value.length);
  const seg = msg.segments[list.segId];
  const off = list.wordOffset * WORD_SIZE;
  seg.bytes.set(value, off);
};

/**
 * Read a Data field. Returns null if the pointer is null. The returned
 * Uint8Array is a view backed by the message's segment (caller should copy
 * if persistence is needed beyond the message's lifetime).
 *
 * @param {import('./segment.js').MessageReader} msg
 * @param {number} segId
 * @param {number} pointerWordOffset
 */
export const readData = (msg, segId, pointerWordOffset) => {
  const list = readListPointer(msg, segId, pointerWordOffset);
  if (list === null) return null;
  if (list.elemSize !== LIST_BYTE) {
    throw Fail`Data must be List(Byte), got ${list.elemSize}`;
  }
  const seg = msg.segment(list.segId);
  const start = list.wordOffset * WORD_SIZE;
  return seg.bytes.subarray(start, start + list.elemCount);
};
