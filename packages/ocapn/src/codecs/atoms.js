// @ts-check

/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */

import {
  makeSelector,
  makeByteArray,
  makeUint8ArrayFromByteArray,
  isByteArray,
} from '../pass-style-helpers.js';
import {
  BooleanCodec,
  IntegerCodec,
  Float64Codec,
  StringCodec,
  makeCodec,
} from '../syrup/codec.js';
import { makeOcapnRecordCodec } from './util.js';

// OCapN Passable Atoms

export const UndefinedCodec = makeOcapnRecordCodec(
  'Undefined',
  'void',
  // readBody
  syrupReader => {
    return undefined;
  },
  // writeBody
  (value, syrupWriter) => {
    // body is empty
  },
);

export const NullCodec = makeOcapnRecordCodec(
  'Null',
  'null',
  // readBody
  syrupReader => {
    return null;
  },
  // writeBody
  (value, syrupWriter) => {
    // body is empty
  },
);

export const ByteArrayCodec = makeCodec('ByteArray', {
  read(syrupReader) {
    return makeByteArray(syrupReader.readBytestring());
  },
  write(value, syrupWriter) {
    if (!isByteArray(value)) {
      throw Error(`Expected ByteArray, got ${typeof value}`);
    }
    const buffer = makeUint8ArrayFromByteArray(value);
    syrupWriter.writeBytestring(buffer);
  },
});

export const OcapnSelectorCodec = makeCodec('OcapnSelector', {
  read(syrupReader) {
    const name = syrupReader.readSelectorAsString();
    return makeSelector(name);
  },
  write(value, syrupWriter) {
    const name = value[Symbol.toStringTag];
    syrupWriter.writeSelectorFromString(name);
  },
});

export const AtomCodecs = harden({
  undefined: UndefinedCodec,
  null: NullCodec,
  boolean: BooleanCodec,
  integer: IntegerCodec,
  float64: Float64Codec,
  string: StringCodec,
  selector: OcapnSelectorCodec,
  byteArray: ByteArrayCodec,
});
