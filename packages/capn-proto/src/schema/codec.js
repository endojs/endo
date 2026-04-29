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
        const big = typeof v === 'bigint' ? v : BigInt(v);
        if (kind === 'int64') view.setBigInt64(absByte, big, true);
        else view.setBigUint64(absByte, big, true);
        return;
      }
      writeUint64(loc, byteOffset, BigInt(v));
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
const writeStructInPlace = (msg, loc, layout, obj, layouts) => {
  const src = obj == null ? {} : obj;
  for (const f of layout.fields) {
    const v = src[f.name];
    if (f.slot.kind === 'void') {
      // void: nothing to write
    } else if (f.slot.kind === 'data') {
      if (v !== undefined) writeDataField(loc, f.slot, f.type.kind, v);
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
        writeList(msg, slot, f.type, v, layouts);
      } else if (f.type.kind === 'struct') {
        const sub = layouts.get(/** @type {string} */ (f.type.name));
        if (!sub) throw Fail`unknown struct type ${f.type.name}`;
        const subLoc = allocStruct(msg, slot, sub.dataWords, sub.pointerCount);
        writeStructInPlace(msg, subLoc, sub, v, layouts);
      } else {
        throw Fail`writeStructInPlace: unhandled field type ${f.type.kind}`;
      }
    }
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
 */
const writeList = (msg, pointerLocation, listType, value, layouts) => {
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
      writeStructInPlace(msg, elemLoc, elemLayout, arr[i], layouts);
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
        view.setBigInt64(off, typeof v === 'bigint' ? v : BigInt(v), true);
        break;
      case 'uint64':
        view.setBigUint64(off, typeof v === 'bigint' ? v : BigInt(v), true);
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
 * is a struct of the given layout.
 *
 * @param {any} obj
 * @param {import('./layout.js').StructLayout} layout
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 * @returns {ArrayBuffer}
 */
export const encodeRootStruct = (obj, layout, layouts) => {
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
  writeStructInPlace(msg, root, layout, obj, layouts);
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
const readStructFields = (msg, loc, layout, layouts) => {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const f of layout.fields) {
    if (f.slot.kind === 'void') {
      // void: nothing to read
    } else if (f.slot.kind === 'data') {
      out[f.name] = readDataField(loc, f.slot, f.type.kind);
    } else {
      const ptrLoc = {
        segId: loc.segId,
        wordOffset: loc.wordOffset + loc.dataWords + f.slot.index,
      };
      if (f.type.kind === 'text') {
        out[f.name] = readText(msg, ptrLoc.segId, ptrLoc.wordOffset);
      } else if (f.type.kind === 'data') {
        out[f.name] = readData(msg, ptrLoc.segId, ptrLoc.wordOffset);
      } else if (f.type.kind === 'list') {
        // eslint-disable-next-line no-use-before-define
        out[f.name] = readList(msg, ptrLoc, f.type, layouts);
      } else if (f.type.kind === 'struct') {
        const sub = layouts.get(/** @type {string} */ (f.type.name));
        if (!sub) throw Fail`unknown struct type ${f.type.name}`;
        const subLoc = readStructPointer(msg, ptrLoc.segId, ptrLoc.wordOffset);
        out[f.name] = subLoc
          ? readStructFields(msg, subLoc, sub, layouts)
          : null;
      } else {
        throw Fail`readStructFields: unhandled field type ${f.type.kind}`;
      }
    }
  }
  return out;
};

/**
 * @param {any} msg
 * @param {{ segId: number, wordOffset: number }} ptrLocation
 * @param {{ kind: string, elementType?: any }} listType
 * @param {Map<string, import('./layout.js').StructLayout>} layouts
 */
const readList = (msg, ptrLocation, listType, layouts) => {
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
      out.push(readStructFields(msg, elemLoc, elemLayout, layouts));
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
 */
export const decodeRootStruct = (framed, layout, layouts) => {
  const ab =
    framed instanceof ArrayBuffer
      ? framed
      : framed.buffer.slice(
          framed.byteOffset,
          framed.byteOffset + framed.byteLength,
        );
  const segments = unframeSegments(ab);
  const reader = makeMessageReader(segments);
  const root = readStructPointer(reader, 0, 0);
  if (!root) return null;
  return readStructFields(reader, root, layout, layouts);
};
