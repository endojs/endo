// @ts-check
/**
 * Schema-driven encode / decode for Cap'n Proto structs.
 *
 * Given a `StructLayout` (from `./layout.js`), produces a byte-compatible
 * Cap'n Proto framed message from a JS object, and decodes such a framed
 * message back into a JS object.
 *
 * Supported field types — primitives (Bool, Int8/16/32/64, UInt8/16/32/64,
 * Float32, Float64), Text, Data, List(primitive), List(struct), and nested
 * struct references. Same subset as the parser.
 */

import { Fail } from '@endo/errors';

import {
  makeMessageBuilder,
  makeMessageReader,
  WORD_SIZE,
} from '../wire/segment.js';
import { frameSegments, unframeSegments } from '../wire/framing.js';
import {
  allocStruct,
  readStructPointer,
  ptrSlot,
  writeUint8,
  writeUint16,
  writeUint32,
  writeUint64,
  writeBool,
  readUint8,
  readUint16,
  readUint32,
  readUint64,
  readBool,
} from '../wire/struct.js';
import { writeText, readText, writeData, readData } from '../wire/text.js';
import {
  allocList,
  allocCompositeList,
  readListPointer,
  primitiveElementByteOffset,
  compositeElement,
} from '../wire/list.js';
import {
  LIST_BIT,
  LIST_BYTE,
  LIST_TWO_BYTES,
  LIST_FOUR_BYTES,
  LIST_EIGHT_BYTES,
  writePointer,
  readPointer,
} from '../wire/pointer.js';

const PRIMITIVE_LIST_ELEM_SIZE = {
  bool: LIST_BIT,
  int8: LIST_BYTE,
  uint8: LIST_BYTE,
  int16: LIST_TWO_BYTES,
  uint16: LIST_TWO_BYTES,
  int32: LIST_FOUR_BYTES,
  uint32: LIST_FOUR_BYTES,
  float32: LIST_FOUR_BYTES,
  int64: LIST_EIGHT_BYTES,
  uint64: LIST_EIGHT_BYTES,
  float64: LIST_EIGHT_BYTES,
};

const BIGINT_TYPES = new Set(['int64', 'uint64']);

/**
 * Write a primitive data field into a struct slot.
 *
 * @param {any} loc           StructBuilder
 * @param {{ bitOffset: number, bitSize: number }} dataSlot
 * @param {string} kind       primitive type name
 * @param {unknown} v
 */
const writeDataField = (loc, dataSlot, kind, v) => {
  const { bitOffset, bitSize } = dataSlot;
  if (kind === 'bool') {
    writeBool(loc, bitOffset, !!v);
    return;
  }
  if (bitOffset % bitSize !== 0) {
    throw Fail`unaligned data slot: bitOffset ${bitOffset} for size ${bitSize}`;
  }
  const byteOffset = bitOffset / 8;
  const view = loc.msg.segments[loc.segId].view;
  const absByte = loc.wordOffset * WORD_SIZE + byteOffset;
  switch (bitSize) {
    case 8:
      if (kind === 'int8') view.setInt8(absByte, Number(v));
      else writeUint8(loc, byteOffset, Number(v));
      return;
    case 16:
      if (kind === 'int16') view.setInt16(absByte, Number(v), true);
      else writeUint16(loc, byteOffset, Number(v));
      return;
    case 32:
      if (kind === 'float32') view.setFloat32(absByte, Number(v), true);
      else if (kind === 'int32') view.setInt32(absByte, Number(v), true);
      // eslint-disable-next-line no-bitwise
      else writeUint32(loc, byteOffset, Number(v) >>> 0);
      return;
    case 64:
      if (kind === 'float64') {
        view.setFloat64(absByte, Number(v), true);
        return;
      }
      if (BIGINT_TYPES.has(kind)) {
        const big = typeof v === 'bigint' ? v : BigInt(/** @type {any} */ (v));
        if (kind === 'int64') view.setBigInt64(absByte, big, true);
        else view.setBigUint64(absByte, big, true);
        return;
      }
      writeUint64(loc, byteOffset, BigInt(/** @type {any} */ (v)));
      return;
    default:
      throw Fail`writeDataField: bad bitSize ${bitSize}`;
  }
};

/**
 * Read a primitive data field out of a struct slot.
 *
 * @param {any} loc
 * @param {{ bitOffset: number, bitSize: number }} dataSlot
 * @param {string} kind
 */
const readDataField = (loc, dataSlot, kind) => {
  const { bitOffset, bitSize } = dataSlot;
  if (kind === 'bool') return readBool(loc, bitOffset);
  const byteOffset = bitOffset / 8;
  const view = loc.msg.segment(loc.segId).view;
  const absByte = loc.wordOffset * WORD_SIZE + byteOffset;
  switch (bitSize) {
    case 8:
      return kind === 'int8'
        ? view.getInt8(absByte)
        : readUint8(loc, byteOffset);
    case 16:
      return kind === 'int16'
        ? view.getInt16(absByte, true)
        : readUint16(loc, byteOffset);
    case 32:
      if (kind === 'float32') return view.getFloat32(absByte, true);
      if (kind === 'int32') return view.getInt32(absByte, true);
      return readUint32(loc, byteOffset);
    case 64:
      if (kind === 'float64') return view.getFloat64(absByte, true);
      if (kind === 'int64') return view.getBigInt64(absByte, true);
      if (kind === 'uint64') return view.getBigUint64(absByte, true);
      return readUint64(loc, byteOffset);
    default:
      throw Fail`readDataField: bad bitSize ${bitSize}`;
  }
};

/**
 * Write a struct's fields into an already-allocated `StructBuilder` slot.
 * Defined before `writeList` so the latter can call it for List(struct)
 * elements without tripping `no-use-before-define`.
 *
 * @param {any} msg
 * @param {any} loc
 * @param {import('./layout.js').StructLayout} layout
 * @param {any} obj
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 */
/**
 * @typedef {object} EncodeCtx
 * @property {(value: unknown) => any} [exportCap]
 *   Called for capability-typed fields. Should return a CapDescriptor that
 *   the caller will append to the message's cap table; the descriptor's
 *   index in `capTable` is what gets written into the cap pointer.
 * @property {any[]} [capTable]
 *   Mutable list of CapDescriptor objects accumulated during the encode.
 */

/**
 * Encode the value at `f` into the appropriate slot of the struct at
 * `loc`. Used both by the regular-field loop and by the union member
 * dispatch below.
 *
 * @param {any} msg
 * @param {any} loc
 * @param {import('./layout.js').FieldLayout} f
 * @param {unknown} v
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 * @param {EncodeCtx} [ctx]
 */
const writeFieldValue = (msg, loc, f, v, layouts, ctx) => {
  if (f.slot.kind === 'void') {
    // void: nothing to write
  } else if (f.slot.kind === 'data') {
    if (f.type.kind === 'enum') {
      // Enum values arrive as either a string (member name) or a number
      // (ordinal). Resolve names via the member list attached to the
      // TypeRef during parse, then write as UInt16.
      let ord;
      if (typeof v === 'number') {
        ord = v;
      } else {
        const m = (f.type.enumMembers || []).find(e => e.name === v);
        if (!m) throw Fail`enum ${f.type.name}: unknown member ${v}`;
        ord = m.ordinal;
      }
      writeDataField(loc, f.slot, 'uint16', ord);
    } else {
      writeDataField(loc, f.slot, f.type.kind, v);
    }
  } else if (v === undefined || v === null) {
    // pointer slot stays null
  } else {
    const slot = ptrSlot(loc, f.slot.index);
    if (f.type.kind === 'text') {
      writeText(msg, slot, /** @type {string} */ (v));
    } else if (f.type.kind === 'data') {
      writeData(msg, slot, /** @type {Uint8Array} */ (v));
    } else if (f.type.kind === 'list') {
      // eslint-disable-next-line no-use-before-define
      writeList(msg, slot, f.type, /** @type {any} */ (v), layouts, ctx);
    } else if (f.type.kind === 'struct') {
      const sub = layouts.get(/** @type {string} */ (f.type.name));
      if (!sub) throw Fail`unknown struct type ${f.type.name}`;
      const subLoc = allocStruct(msg, slot, sub.dataWords, sub.pointerCount);
      // eslint-disable-next-line no-use-before-define
      writeStructInPlace(msg, subLoc, sub, v, layouts, ctx);
    } else if (f.type.kind === 'capability') {
      if (!ctx || !ctx.exportCap || !ctx.capTable) {
        throw Fail`capability field ${f.name} requires an EncodeCtx with exportCap + capTable`;
      }
      const desc = ctx.exportCap(v);
      const index = ctx.capTable.length;
      ctx.capTable.push(desc);
      writePointer(msg.segments[slot.segId].view, slot.wordOffset * WORD_SIZE, {
        kind: 'cap',
        index,
      });
    } else {
      throw Fail`writeFieldValue: unhandled field type ${f.type.kind}`;
    }
  }
};

/**
 * Write a struct's fields into an already-allocated `StructBuilder` slot.
 * If the layout has an anonymous union, scan input keys to find the active
 * member, write the discriminator, and write that member's value.
 *
 * @param {any} msg
 * @param {any} loc
 * @param {import('./layout.js').StructLayout} layout
 * @param {any} obj
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 * @param {EncodeCtx} [ctx]
 */
const writeStructInPlace = (msg, loc, layout, obj, layouts, ctx) => {
  const src = obj == null ? {} : obj;
  for (const f of layout.fields) {
    // Group fields are flat in the wire layout but nested in the JS object.
    // Walk groupPath to reach the right sub-object before reading the leaf.
    let container = src;
    if (f.groupPath) {
      for (const seg of f.groupPath) {
        if (container == null) {
          container = undefined;
          break;
        }
        container = container[seg];
      }
    }
    const v = container == null ? undefined : container[f.name];
    if (v !== undefined) writeFieldValue(msg, loc, f, v, layouts, ctx);
  }
  // Anonymous union: at most one member key in `src` should match. Find it,
  // write the discriminator, and write that member's value.
  if (layout.unionMembers && layout.discriminant) {
    let activeMember;
    for (const m of layout.unionMembers) {
      if (src[m.name] !== undefined) {
        if (activeMember) {
          throw Fail`union ${layout.name}: ${activeMember.name} and ${m.name} both set`;
        }
        activeMember = m;
      }
    }
    if (activeMember) {
      writeUint16(
        loc,
        layout.discriminant.bitOffset / 8,
        /** @type {number} */ (activeMember.discriminantValue),
      );
      writeFieldValue(
        msg,
        loc,
        activeMember,
        src[activeMember.name],
        layouts,
        ctx,
      );
    }
    // If no member set: leave discriminator at zero (= first member is
    // active), which matches capnp's "default value of an anonymous union is
    // the first member". The corresponding slot stays zero / null too.
  }
};

/**
 * Encode a list field. `pointerLocation` is the pointer slot the list
 * pointer should be written into.
 *
 * @param {any} msg
 * @param {{ segId: number, wordOffset: number }} pointerLocation
 * @param {{ kind: string, elementType?: any }} listType
 * @param {Iterable<unknown>} value
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 * @param {EncodeCtx} [ctx]
 */
const writeList = (msg, pointerLocation, listType, value, layouts, ctx) => {
  const elementType = /** @type {any} */ (listType.elementType);
  const arr = Array.from(value);
  if (elementType.kind === 'struct') {
    const elemLayout = layouts.get(elementType.name);
    if (!elemLayout) {
      throw Fail`unknown struct element type ${elementType.name}`;
    }
    const list = allocCompositeList(
      msg,
      pointerLocation,
      arr.length,
      elemLayout.dataWords,
      elemLayout.pointerCount,
    );
    for (let i = 0; i < arr.length; i += 1) {
      const elemLoc = compositeElement(msg, list, i);
      writeStructInPlace(msg, elemLoc, elemLayout, arr[i], layouts, ctx);
    }
    return;
  }
  if (elementType.kind === 'text' || elementType.kind === 'data') {
    const list = allocList(
      msg,
      pointerLocation,
      /* LIST_POINTER */ 6,
      arr.length,
    );
    for (let i = 0; i < arr.length; i += 1) {
      const slot = {
        segId: list.segId,
        wordOffset: list.wordOffset + i,
      };
      if (elementType.kind === 'text') {
        writeText(msg, slot, /** @type {string} */ (arr[i]));
      } else {
        writeData(msg, slot, /** @type {Uint8Array} */ (arr[i]));
      }
    }
    return;
  }
  // Enum element: encode names → ordinals, then treat as a UInt16 list.
  if (elementType.kind === 'enum') {
    const list = allocList(msg, pointerLocation, LIST_TWO_BYTES, arr.length);
    const view = msg.segments[list.segId].view;
    const members = elementType.enumMembers || [];
    for (let i = 0; i < arr.length; i += 1) {
      const v = arr[i];
      let ord;
      if (typeof v === 'number') {
        ord = v;
      } else {
        const m = members.find(e => e.name === v);
        if (!m) throw Fail`enum ${elementType.name}: unknown member ${v}`;
        ord = m.ordinal;
      }
      view.setUint16(primitiveElementByteOffset(list, i), ord, true);
    }
    return;
  }
  // Primitive element.
  const elemSize = PRIMITIVE_LIST_ELEM_SIZE[elementType.kind];
  if (elemSize === undefined) {
    throw Fail`unsupported list element type ${elementType.kind}`;
  }
  const list = allocList(msg, pointerLocation, elemSize, arr.length);
  if (elemSize === LIST_BIT) {
    const bytes = msg.segments[list.segId].bytes;
    for (let i = 0; i < arr.length; i += 1) {
      if (arr[i]) {
        // eslint-disable-next-line no-bitwise
        const byteIdx = list.wordOffset * WORD_SIZE + (i >>> 3);
        // eslint-disable-next-line no-bitwise
        bytes[byteIdx] |= 1 << (i & 7);
      }
    }
    return;
  }
  const view = msg.segments[list.segId].view;
  for (let i = 0; i < arr.length; i += 1) {
    const off = primitiveElementByteOffset(list, i);
    const v = arr[i];
    switch (elementType.kind) {
      case 'int8':
        view.setInt8(off, Number(v));
        break;
      case 'uint8':
        view.setUint8(off, Number(v));
        break;
      case 'int16':
        view.setInt16(off, Number(v), true);
        break;
      case 'uint16':
        view.setUint16(off, Number(v), true);
        break;
      case 'int32':
        view.setInt32(off, Number(v), true);
        break;
      case 'uint32':
        // eslint-disable-next-line no-bitwise
        view.setUint32(off, Number(v) >>> 0, true);
        break;
      case 'float32':
        view.setFloat32(off, Number(v), true);
        break;
      case 'int64':
        view.setBigInt64(
          off,
          typeof v === 'bigint' ? v : BigInt(/** @type {any} */ (v)),
          true,
        );
        break;
      case 'uint64':
        view.setBigUint64(
          off,
          typeof v === 'bigint' ? v : BigInt(/** @type {any} */ (v)),
          true,
        );
        break;
      case 'float64':
        view.setFloat64(off, Number(v), true);
        break;
      default:
        throw Fail`writeList: bad primitive ${elementType.kind}`;
    }
  }
};

/**
 * Encode a JS object as a top-level Cap'n Proto framed message whose root
 * is a struct of the given layout. If `ctx` is omitted, capability fields
 * in the schema (if any) cannot be encoded — this entry point is for
 * cap-free schemas.
 *
 * @param {any} obj
 * @param {import('./layout.js').StructLayout} layout
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 * @param {EncodeCtx} [ctx]
 * @returns {ArrayBuffer}
 */
export const encodeRootStruct = (obj, layout, layouts, ctx) => {
  const msg = makeMessageBuilder();
  // Reserve the first word of segment 0 for the root pointer; allocStruct
  // below writes into it.
  const rootPointerLoc = msg.allocate(1);
  const root = allocStruct(
    msg,
    rootPointerLoc,
    layout.dataWords,
    layout.pointerCount,
  );
  writeStructInPlace(msg, root, layout, obj, layouts, ctx);
  return frameSegments(msg.finish());
};

/* ===================================================================== *
 *  Decoder
 * ===================================================================== */

/**
 * Read a struct's fields from `loc` into a plain JS object. Defined before
 * `readList` so the latter can call it for List(struct) elements without
 * tripping `no-use-before-define`.
 *
 * @param {any} msg
 * @param {any} loc
 * @param {import('./layout.js').StructLayout} layout
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 */
/**
 * @typedef {object} DecodeCtx
 * @property {(desc: any) => unknown} [importCap]
 *   Called for capability-typed fields. Receives the CapDescriptor at the
 *   slot's cap-table index and should return the user-facing JS value
 *   (typically a Presence / HandledPromise).
 * @property {any[]} [capTable]
 *   The CapDescriptors that arrived alongside the contentBytes. The cap
 *   pointer at each capability field stores an index into this array.
 */

/**
 * Read the value of one field from a struct slot.
 *
 * @param {any} msg
 * @param {any} loc
 * @param {import('./layout.js').FieldLayout} f
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 * @param {DecodeCtx} [ctx]
 */
const readFieldValue = (msg, loc, f, layouts, ctx) => {
  if (f.slot.kind === 'void') return null;
  if (f.slot.kind === 'data') {
    if (f.type.kind === 'enum') {
      const ord = readDataField(loc, f.slot, 'uint16');
      const m = (f.type.enumMembers || []).find(e => e.ordinal === ord);
      // Unknown ordinals decode to the raw number (forward compatibility:
      // the encoder may have known a member we don't).
      return m ? m.name : ord;
    }
    return readDataField(loc, f.slot, f.type.kind);
  }
  const ptrLoc = {
    segId: loc.segId,
    wordOffset: loc.wordOffset + loc.dataWords + f.slot.index,
  };
  if (f.type.kind === 'text') {
    return readText(msg, ptrLoc.segId, ptrLoc.wordOffset);
  }
  if (f.type.kind === 'data') {
    return readData(msg, ptrLoc.segId, ptrLoc.wordOffset);
  }
  if (f.type.kind === 'list') {
    // eslint-disable-next-line no-use-before-define
    return readList(msg, ptrLoc, f.type, layouts, ctx);
  }
  if (f.type.kind === 'struct') {
    const sub = layouts.get(/** @type {string} */ (f.type.name));
    if (!sub) throw Fail`unknown struct type ${f.type.name}`;
    const subLoc = readStructPointer(msg, ptrLoc.segId, ptrLoc.wordOffset);
    // eslint-disable-next-line no-use-before-define
    return subLoc ? readStructFields(msg, subLoc, sub, layouts, ctx) : null;
  }
  if (f.type.kind === 'capability') {
    const ptr = readPointer(
      msg.segment(ptrLoc.segId).view,
      ptrLoc.wordOffset * WORD_SIZE,
    );
    if (ptr.kind === 'null') return null;
    if (ptr.kind !== 'cap') {
      throw Fail`capability field ${f.name} expected cap pointer, got ${ptr.kind}`;
    }
    if (!ctx || !ctx.capTable) {
      throw Fail`capability field ${f.name} requires a DecodeCtx with capTable`;
    }
    const desc = ctx.capTable[ptr.index];
    if (desc === undefined) {
      throw Fail`capability field ${f.name}: index ${ptr.index} out of capTable bounds`;
    }
    return ctx.importCap ? ctx.importCap(desc) : desc;
  }
  throw Fail`readFieldValue: unhandled field type ${f.type.kind}`;
};

/**
 * Read a struct's fields from `loc` into a plain JS object. If the layout
 * has an anonymous union, read the discriminator and decode only the
 * active member.
 *
 * @param {any} msg
 * @param {any} loc
 * @param {import('./layout.js').StructLayout} layout
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 * @param {DecodeCtx} [ctx]
 */
const readStructFields = (msg, loc, layout, layouts, ctx) => {
  /** @type {Record<string, any>} */
  const out = {};
  for (const f of layout.fields) {
    const v = readFieldValue(msg, loc, f, layouts, ctx);
    // Place the value at the right nested location for group members.
    if (f.groupPath && f.groupPath.length > 0) {
      let cur = out;
      for (const seg of f.groupPath) {
        if (cur[seg] === undefined) cur[seg] = {};
        cur = cur[seg];
      }
      cur[f.name] = v;
    } else {
      out[f.name] = v;
    }
  }
  // Anonymous union: read the discriminator and decode only the active
  // member. Inactive members are absent from the output object.
  if (layout.unionMembers && layout.discriminant) {
    const which = readUint16(loc, layout.discriminant.bitOffset / 8);
    const active = layout.unionMembers[which];
    if (active) {
      out[active.name] = readFieldValue(msg, loc, active, layouts, ctx);
      // which gives downstream switch-on access without iterating keys.
      out.which = active.name;
    }
  }
  return out;
};

/**
 * @param {any} msg
 * @param {{ segId: number, wordOffset: number }} ptrLocation
 * @param {{ kind: string, elementType?: any }} listType
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 * @param {DecodeCtx} [ctx]
 */
const readList = (msg, ptrLocation, listType, layouts, ctx) => {
  const list = readListPointer(msg, ptrLocation.segId, ptrLocation.wordOffset);
  if (!list) return [];
  const elementType = /** @type {any} */ (listType.elementType);
  if (elementType.kind === 'struct') {
    const elemLayout = layouts.get(elementType.name);
    if (!elemLayout)
      throw Fail`unknown struct element type ${elementType.name}`;
    const out = [];
    for (let i = 0; i < list.elemCount; i += 1) {
      const elemLoc = compositeElement(msg, list, i);
      out.push(readStructFields(msg, elemLoc, elemLayout, layouts, ctx));
    }
    return out;
  }
  if (elementType.kind === 'text' || elementType.kind === 'data') {
    const out = [];
    for (let i = 0; i < list.elemCount; i += 1) {
      const slotOff = list.wordOffset + i;
      out.push(
        elementType.kind === 'text'
          ? readText(msg, list.segId, slotOff)
          : readData(msg, list.segId, slotOff),
      );
    }
    return out;
  }
  if (elementType.kind === 'enum') {
    const view = msg.segment(list.segId).view;
    const members = elementType.enumMembers || [];
    const out = [];
    for (let i = 0; i < list.elemCount; i += 1) {
      const ord = view.getUint16(primitiveElementByteOffset(list, i), true);
      const m = members.find(e => e.ordinal === ord);
      out.push(m ? m.name : ord);
    }
    return out;
  }
  if (list.elemSize === LIST_BIT) {
    const bytes = msg.segment(list.segId).bytes;
    const out = [];
    for (let i = 0; i < list.elemCount; i += 1) {
      // eslint-disable-next-line no-bitwise
      const byteIdx = list.wordOffset * WORD_SIZE + (i >>> 3);
      // eslint-disable-next-line no-bitwise
      out.push((bytes[byteIdx] & (1 << (i & 7))) !== 0);
    }
    return out;
  }
  const view = msg.segment(list.segId).view;
  const out = [];
  for (let i = 0; i < list.elemCount; i += 1) {
    const off = primitiveElementByteOffset(list, i);
    switch (elementType.kind) {
      case 'int8':
        out.push(view.getInt8(off));
        break;
      case 'uint8':
        out.push(view.getUint8(off));
        break;
      case 'int16':
        out.push(view.getInt16(off, true));
        break;
      case 'uint16':
        out.push(view.getUint16(off, true));
        break;
      case 'int32':
        out.push(view.getInt32(off, true));
        break;
      case 'uint32':
        out.push(view.getUint32(off, true));
        break;
      case 'float32':
        out.push(view.getFloat32(off, true));
        break;
      case 'int64':
        out.push(view.getBigInt64(off, true));
        break;
      case 'uint64':
        out.push(view.getBigUint64(off, true));
        break;
      case 'float64':
        out.push(view.getFloat64(off, true));
        break;
      default:
        throw Fail`readList: bad primitive ${elementType.kind}`;
    }
  }
  return out;
};

/**
 * Decode a Cap'n Proto framed message whose root is a struct of the given
 * layout into a JS object.
 *
 * @param {ArrayBuffer | Uint8Array} framed
 * @param {import('./layout.js').StructLayout} layout
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 * @param {DecodeCtx} [ctx]
 */
export const decodeRootStruct = (framed, layout, layouts, ctx) => {
  /** @type {ArrayBuffer} */
  let ab;
  if (framed instanceof ArrayBuffer) {
    ab = framed;
  } else {
    // Copy bytes into a fresh ArrayBuffer. We can't call
    // `framed.buffer.slice(...)` directly because typed-array `.buffer` is
    // `ArrayBufferLike`, which TypeScript widens to `ArrayBuffer |
    // SharedArrayBuffer`, and `unframeSegments` insists on plain ArrayBuffer.
    ab = new ArrayBuffer(framed.byteLength);
    new Uint8Array(ab).set(framed);
  }
  const segments = unframeSegments(ab);
  const reader = makeMessageReader(segments);
  const root = readStructPointer(reader, 0, 0);
  if (!root) return null;
  return readStructFields(reader, root, layout, layouts, ctx);
};
