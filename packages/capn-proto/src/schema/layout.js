// @ts-check
/**
 * Cap'n Proto struct layout.
 *
 * Translates a parsed schema (see `./parse.js`) into per-struct layout
 * metadata: the size of the data section in words, the number of pointer
 * slots, and per-field bit/pointer offsets.
 *
 * Capn'p's layout rule is: walk fields in declaration order, give each one
 * the smallest available slot of the appropriate size. This is the
 * "first-fit on a hole list" algorithm the reference compiler uses; we
 * reproduce it here so messages we encode are byte-identical to messages
 * that `capnpc`-generated code would produce for the same schema.
 *
 * The hole list is keyed by power-of-two bit sizes (1, 8, 16, 32, 64).
 * Allocating a smaller slot from a larger hole splits the hole into the
 * remaining smaller-power-of-two pieces.
 */

import { Fail } from '@endo/errors';

const PRIMITIVE_BITS = {
  void: 0,
  bool: 1,
  int8: 8,
  uint8: 8,
  int16: 16,
  uint16: 16,
  int32: 32,
  uint32: 32,
  float32: 32,
  int64: 64,
  uint64: 64,
  float64: 64,
};

const POINTER_KINDS = new Set(['text', 'data', 'list', 'struct']);

/**
 * Whether a parsed type ref occupies a pointer slot rather than data bits.
 *
 * @param {{ kind: string }} type
 */
export const isPointerType = type => POINTER_KINDS.has(type.kind);

/**
 * @param {{ kind: string }} type
 * @returns {number}
 */
const dataBitsFor = type => {
  const n = PRIMITIVE_BITS[type.kind];
  if (n === undefined) {
    throw Fail`layout: type ${type.kind} is not a data field`;
  }
  return n;
};

/**
 * Hole list: map from log2(size_in_bits) → array of bit offsets that are
 * available. log2 buckets used: 0 (1-bit), 3 (8-bit), 4 (16-bit), 5 (32-bit),
 * 6 (64-bit). 1-byte boundaries below a byte are treated as bit holes.
 *
 * @typedef {{ holes: number[][], dataBits: number }} HoleState
 */

const log2OfBits = bits => {
  switch (bits) {
    case 1:
      return 0;
    case 8:
      return 3;
    case 16:
      return 4;
    case 32:
      return 5;
    case 64:
      return 6;
    default:
      throw Fail`layout: unsupported field bit size ${bits}`;
  }
};

/** @returns {HoleState} */
const newHoleState = () => ({
  holes: [[], [], [], [], [], [], []],
  dataBits: 0,
});

/**
 * Add a fresh 64-bit word to the data section and record it as a single
 * 64-bit hole. Returns the bit offset of the new word.
 *
 * @param {HoleState} hs
 */
const addWord = hs => {
  const offset = hs.dataBits;
  hs.dataBits += 64;
  hs.holes[6].push(offset);
  return offset;
};

/**
 * Split a hole of size `2^holeLog2` at bit offset `offset` to satisfy a
 * request of size `2^wantLog2`. The returned offset is the start of the
 * allocated slot; the remaining `2^holeLog2 - 2^wantLog2` bits are pushed
 * back as smaller holes (powers of two summing to the remainder).
 *
 * @param {HoleState} hs
 * @param {number} offset
 * @param {number} holeLog2
 * @param {number} wantLog2
 * @returns {number}
 */
const splitHole = (hs, offset, holeLog2, wantLog2) => {
  const wantBits = 1 << wantLog2;
  let pos = offset + wantBits;
  // Remaining bits become new holes, smallest first so subsequent allocations
  // pack into low addresses (mirrors capnpc's layout: a UInt8 then a Bool
  // lands the Bool at byte 1 bit 0, not at byte 7 bit 0).
  for (let i = wantLog2; i < holeLog2; i += 1) {
    hs.holes[i].push(pos);
    pos += 1 << i;
  }
  return offset;
};

/**
 * Allocate `bits` bits from the hole state, growing the data section as
 * needed. Returns the bit offset of the allocation.
 *
 * @param {HoleState} hs
 * @param {number} bits
 */
const allocBits = (hs, bits) => {
  if (bits === 0) return 0; // void
  const wantLog2 = log2OfBits(bits);
  // Exact-size hole?
  if (hs.holes[wantLog2].length > 0) {
    return /** @type {number} */ (hs.holes[wantLog2].shift());
  }
  // Larger hole?
  for (let i = wantLog2 + 1; i <= 6; i += 1) {
    if (hs.holes[i].length > 0) {
      const offset = /** @type {number} */ (hs.holes[i].shift());
      return splitHole(hs, offset, i, wantLog2);
    }
  }
  // No suitable hole — extend by a fresh word.
  const newOffset = addWord(hs);
  // The new word is now a 64-bit hole; recurse to consume from it.
  // (allocBits will find it as the only hole at log2=6.)
  hs.holes[6].pop(); // remove what addWord just pushed
  return splitHole(hs, newOffset, 6, wantLog2);
};

/**
 * @typedef {object} FieldLayout
 * @property {string} name
 * @property {number} ordinal
 * @property {{ kind: string, elementType?: any, name?: string }} type
 * @property {{ kind: 'data', bitOffset: number, bitSize: number }
 *           | { kind: 'pointer', index: number }
 *           | { kind: 'void' }} slot
 */

/**
 * @typedef {object} StructLayout
 * @property {string} name
 * @property {bigint} id
 * @property {number} dataWords
 * @property {number} pointerCount
 * @property {Array<FieldLayout>} fields
 * @property {Map<string, FieldLayout>} byName
 */

/**
 * Compute the layout for one struct.
 *
 * @param {import('./parse.js').StructDecl} decl
 * @returns {StructLayout}
 */
export const layoutStruct = decl => {
  const hs = newHoleState();
  let pointerCount = 0;
  /** @type {Array<FieldLayout>} */
  const fields = [];
  // Walk fields in declaration order. (capnpc requires ordinals to match
  // declaration order, and our parser does not enforce that — but the
  // first-fit algorithm only depends on declaration order.)
  for (const f of decl.fields) {
    if (f.type.kind === 'void') {
      fields.push({ ...f, slot: { kind: 'void' } });
      continue;
    }
    if (isPointerType(f.type)) {
      const slot = { kind: /** @type {const} */ ('pointer'), index: pointerCount };
      pointerCount += 1;
      fields.push({ ...f, slot });
    } else {
      const bits = dataBitsFor(f.type);
      const bitOffset = allocBits(hs, bits);
      fields.push({
        ...f,
        slot: { kind: 'data', bitOffset, bitSize: bits },
      });
    }
  }
  const dataWords = Math.ceil(hs.dataBits / 64);
  /** @type {Map<string, FieldLayout>} */
  const byName = new Map();
  for (const fl of fields) byName.set(fl.name, fl);
  return {
    name: decl.name,
    id: decl.id,
    dataWords,
    pointerCount,
    fields,
    byName,
  };
};

/**
 * Compute layouts for every struct in a parsed schema.
 *
 * @param {import('./parse.js').ParsedSchema} parsed
 * @returns {Map<string, StructLayout>}
 */
export const layoutSchema = parsed => {
  /** @type {Map<string, StructLayout>} */
  const out = new Map();
  for (const decl of parsed.structs.values()) {
    out.set(decl.name, layoutStruct(decl));
  }
  return out;
};
