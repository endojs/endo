// @ts-check

import {
  BooleanCodec,
  IntegerCodec,
  Float64Codec,
  SelectorAsStringCodec,
  StringCodec,
  BytestringCodec,
  NumberPrefixCodec,
  makeRecordUnionCodec,
  makeTypeHintUnionCodec,
  makeListCodecFromEntryCodec,
} from '../syrup/codec.js';
import {
  makeOCapNRecordCodec,
  makeOCapNRecordCodecFromDefinition,
} from './util.js';
import {
  DescImportObject,
  DescImportPromise,
  DescExport,
  DescAnswer,
  DescHandoffGive,
  DescHandoffReceive,
} from './descriptors.js';

/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */
/** @typedef {import('../syrup/codec.js').SyrupRecordCodec} SyrupRecordCodec */

// OCapN Passable Atoms

const UndefinedCodec = makeOCapNRecordCodec(
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

const NullCodec = makeOCapNRecordCodec(
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

const AtomCodecs = {
  undefined: UndefinedCodec,
  null: NullCodec,
  boolean: BooleanCodec,
  integer: IntegerCodec,
  float64: Float64Codec,
  string: StringCodec,
  selector: SelectorAsStringCodec,
  byteArray: BytestringCodec,
};

// OCapN Passable Containers

/** @type {SyrupCodec} */
export const OCapNStructCodec = {
  read(syrupReader) {
    syrupReader.enterDictionary();
    const result = {};
    while (!syrupReader.peekDictionaryEnd()) {
      // OCapN Structs are always string keys.
      const key = syrupReader.readString();
      // Value can be any Passable.
      /* eslint-disable-next-line no-use-before-define */
      const value = OCapNPassableUnionCodec.read(syrupReader);
      result[key] = value;
    }
    syrupReader.exitDictionary();
    return result;
  },
  write(value, syrupWriter) {
    syrupWriter.enterDictionary();
    for (const [key, structValue] of Object.entries(value)) {
      syrupWriter.writeString(key);
      // Value can be any Passable.
      /* eslint-disable-next-line no-use-before-define */
      OCapNPassableUnionCodec.write(structValue, syrupWriter);
    }
    syrupWriter.exitDictionary();
  },
};

const OCapNTaggedCodec = makeOCapNRecordCodec(
  'desc:tagged',
  // readBody
  syrupReader => {
    const tagName = syrupReader.readSelectorAsString();
    // Value can be any Passable.
    /* eslint-disable-next-line no-use-before-define */
    const value = OCapNPassableUnionCodec.read(syrupReader);
    return {
      [Symbol.for('passStyle')]: 'tagged',
      [Symbol.toStringTag]: tagName,
      value,
    };
  },
  // writeBody
  (value, syrupWriter) => {
    syrupWriter.writeSelectorFromString(value.tagName);
    value.value.write(syrupWriter);
  },
);

// OCapN Reference (Capability)

const OCapNTargetCodec = makeRecordUnionCodec({
  DescExport,
  DescImportObject,
});

const OCapNPromiseCodec = makeRecordUnionCodec({
  DescImportPromise,
  DescAnswer,
});

const OCapNReferenceCodecs = {
  OCapNTargetCodec,
  OCapNPromiseCodec,
};

// OCapN Error

const OCapNErrorCodec = makeOCapNRecordCodecFromDefinition('desc:error', [
  ['message', 'string'],
]);

// all record based passables
const OCapNPassableRecordUnionCodec = makeRecordUnionCodec({
  UndefinedCodec,
  NullCodec,
  OCapNTaggedCodec,
  DescExport,
  DescImportObject,
  DescImportPromise,
  DescAnswer,
  DescHandoffGive,
  DescHandoffReceive,
  // DescSigGiveEnvelope,
  // DescSigReceiveEnvelope,
  OCapNErrorCodec,
});

export const OCapNPassableUnionCodec = makeTypeHintUnionCodec(
  // syrup type hint -> codec
  {
    boolean: AtomCodecs.boolean,
    float64: AtomCodecs.float64,
    // "number-prefix" can be string, bytestring, selector, integer
    // TODO: should restrict further to only the types that can be passed
    'number-prefix': NumberPrefixCodec,
    record: OCapNPassableRecordUnionCodec,
    // eslint-disable-next-line no-use-before-define
    list: () => ContainerCodecs.list,
    // eslint-disable-next-line no-use-before-define
    dictionary: () => ContainerCodecs.struct,
  },
  // javascript typeof value -> codec
  {
    undefined: AtomCodecs.undefined,
    boolean: AtomCodecs.boolean,
    number: AtomCodecs.float64,
    string: AtomCodecs.string,
    symbol: AtomCodecs.selector,
    bigint: AtomCodecs.integer,
    object: value => {
      if (value === null) {
        return AtomCodecs.null;
      }
      if (value instanceof Uint8Array) {
        return AtomCodecs.byteArray;
      }
      if (Array.isArray(value)) {
        // eslint-disable-next-line no-use-before-define
        return ContainerCodecs.list;
      }
      if (value[Symbol.for('passStyle')] === 'tagged') {
        // eslint-disable-next-line no-use-before-define
        return ContainerCodecs.tagged;
      }
      if (
        value.type !== undefined &&
        OCapNPassableRecordUnionCodec.supports(value.type)
      ) {
        return OCapNPassableRecordUnionCodec;
      }
      // TODO: need to distinguish OCapNReferenceCodecs and OCapNErrorCodec
      // eslint-disable-next-line no-use-before-define
      return ContainerCodecs.struct;
    },
  },
);

const ContainerCodecs = {
  list: makeListCodecFromEntryCodec(OCapNPassableUnionCodec),
  struct: OCapNStructCodec,
  tagged: OCapNTaggedCodec,
};

// Provided for completeness, but not used.
// eslint-disable-next-line no-unused-vars
const OCapNPassableCodecs = {
  ...AtomCodecs,
  ...ContainerCodecs,
  ...OCapNReferenceCodecs,
  ...OCapNErrorCodec,
};
