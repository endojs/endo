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
  // Cap'n Proto enums are encoded as UInt16 on the wire. The codec resolves
  // the symbolic member name from a separate enum declaration carried on
  // the field's TypeRef.
  enum: 16,
};

const POINTER_KINDS = new Set(['text', 'data', 'list', 'struct', 'capability']);

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
  // eslint-disable-next-line no-bitwise
  const wantBits = 1 << wantLog2;
  let pos = offset + wantBits;
  // Remaining bits become new holes, smallest first so subsequent allocations
  // pack into low addresses (mirrors capnpc's layout: a UInt8 then a Bool
  // lands the Bool at byte 1 bit 0, not at byte 7 bit 0).
  for (let i = wantLog2; i < holeLog2; i += 1) {
    hs.holes[i].push(pos);
    // eslint-disable-next-line no-bitwise
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
 * @property {{ kind: string, elementType?: any, name?: string, enumMembers?: any }} type
 * @property {{ kind: 'data', bitOffset: number, bitSize: number }
 *           | { kind: 'pointer', index: number }
 *           | { kind: 'void' }} slot
 * @property {number} [discriminantValue]
 *   Set on union members. The integer value the parent struct's
 *   discriminator must hold for this member to be the active one. Equals
 *   the member's position in the union's declaration order, NOT its `@N`
 *   field ordinal.
 * @property {string[]} [groupPath]
 *   Carried over from FieldDecl. The codec uses this to route values into
 *   / out of nested JS sub-objects. Wire layout is unaffected.
 */

/**
 * @typedef {object} StructLayout
 * @property {string} name
 * @property {bigint} id
 * @property {number} dataWords
 * @property {number} pointerCount
 * @property {Array<FieldLayout>} fields
 * @property {Map<string, FieldLayout>} byName
 * @property {{ bitOffset: number } | undefined} discriminant
 *   When present, the struct carries an anonymous union; this is the bit
 *   offset of the UInt16 discriminator within the data section.
 * @property {Array<FieldLayout>} [unionMembers]
 *   The union's members, ordered by discriminant value.
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
    } else if (isPointerType(f.type)) {
      const slot = {
        kind: /** @type {const} */ ('pointer'),
        index: pointerCount,
      };
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

  /**
   * Anonymous union layout.
   *
   * capnpc treats the union as one logical "field" in declaration order.
   * When that slot is reached, three allocations happen in this order:
   *
   *   1. A shared data slot, sized to the largest data-typed union member.
   *      Every data-typed union member gets THIS bit offset; their own
   *      `bitSize` controls how many of the slot's bits they actually
   *      consume. (Different members share the slot since the union is
   *      tagged — only one is live at a time.)
   *   2. The 16-bit discriminator (UInt16), allocated from the same hole
   *      list so it lands wherever the next available 16-bit hole is.
   *   3. A single shared pointer slot, used by every pointer-typed member.
   *
   * Verified empirically against `capnp encode --no-standard-import` for
   * the simple union, the union mixed with non-union fields, and the
   * union with mixed primitive/pointer members.
   */
  /** @type {{ bitOffset: number } | undefined} */
  let discriminant;
  /** @type {Array<FieldLayout> | undefined} */
  let unionMembers;
  if (decl.unionMembers) {
    let maxDataBits = 0;
    let hasPointerMember = false;
    for (const m of decl.unionMembers) {
      if (m.type.kind === 'void') {
        // void members don't reserve any slot
      } else if (isPointerType(m.type)) {
        hasPointerMember = true;
      } else {
        const bits = dataBitsFor(m.type);
        if (bits > maxDataBits) maxDataBits = bits;
      }
    }
    const sharedDataOffset = maxDataBits > 0 ? allocBits(hs, maxDataBits) : 0;
    const discriminantBitOffset = allocBits(hs, 16);
    discriminant = { bitOffset: discriminantBitOffset };
    let sharedPointerSlot = -1;
    if (hasPointerMember) {
      sharedPointerSlot = pointerCount;
      pointerCount += 1;
    }
    unionMembers = decl.unionMembers.map((m, i) => {
      if (m.type.kind === 'void') {
        return {
          ...m,
          slot: /** @type {{kind: 'void'}} */ ({ kind: 'void' }),
          discriminantValue: i,
        };
      }
      if (isPointerType(m.type)) {
        return {
          ...m,
          slot: /** @type {{kind: 'pointer', index: number}} */ ({
            kind: 'pointer',
            index: sharedPointerSlot,
          }),
          discriminantValue: i,
        };
      }
      const bits = dataBitsFor(m.type);
      return {
        ...m,
        slot: /** @type {{kind: 'data', bitOffset: number, bitSize: number}} */ ({
          kind: 'data',
          bitOffset: sharedDataOffset,
          bitSize: bits,
        }),
        discriminantValue: i,
      };
    });
  }

  const dataWords = Math.ceil(hs.dataBits / 64);
  /** @type {Map<string, FieldLayout>} */
  const byName = new Map();
  for (const fl of fields) byName.set(fl.name, fl);
  if (unionMembers) {
    for (const um of unionMembers) byName.set(um.name, um);
  }
  return {
    name: decl.name,
    id: decl.id,
    discriminant,
    unionMembers,
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
