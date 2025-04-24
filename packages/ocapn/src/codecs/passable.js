// @ts-check

import { PASS_STYLE } from '@endo/pass-style';
import {
  BooleanCodec,
  IntegerCodec,
  Float64Codec,
  StringCodec,
  BytestringCodec,
  makeRecordUnionCodec,
  makeTypeHintUnionCodec,
  makeListCodecFromEntryCodec,
  makeCodec,
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

const { freeze } = Object;
const quote = JSON.stringify;

// OCapN Passable Atoms

const UndefinedCodec = makeOCapNRecordCodec(
  'UndefinedCodec',
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
  'NullCodec',
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

const makeOCapNSelector = name => {
  return freeze({
    [Symbol.for('passStyle')]: 'selector',
    [Symbol.toStringTag]: name,
  });
};

const OCapNSelectorCodec = makeCodec('OCapNSelectorCodec', {
  read(syrupReader) {
    const name = syrupReader.readSelectorAsString();
    return makeOCapNSelector(name);
  },
  write(value, syrupWriter) {
    const name = value[Symbol.toStringTag];
    syrupWriter.writeSelectorFromString(name);
  },
});

const AtomCodecs = {
  undefined: UndefinedCodec,
  null: NullCodec,
  boolean: BooleanCodec,
  integer: IntegerCodec,
  float64: Float64Codec,
  string: StringCodec,
  selector: OCapNSelectorCodec,
  byteArray: BytestringCodec,
};

// OCapN Passable Containers

/** @type {SyrupCodec} */
export const OCapNStructCodec = makeCodec('OCapNStructCodec', {
  read(syrupReader) {
    /** @type {string | undefined} */
    let lastKey;
    syrupReader.enterDictionary();
    const result = {};
    while (!syrupReader.peekDictionaryEnd()) {
      // OCapN Structs are always string keys.
      const start = syrupReader.index;
      const key = syrupReader.readString();
      if (lastKey !== undefined) {
        if (key === lastKey) {
          throw new Error(
            `OCapN Structs must have unique keys, got repeated ${quote(key)} at index ${start} of ${syrupReader.name}`,
          );
        }
        if (key < lastKey) {
          throw new Error(
            `OCapN Structs keys must be in bytewise sorted order, got ${quote(key)} immediately after ${quote(lastKey)} at index ${start} of ${syrupReader.name}`,
          );
        }
      }
      lastKey = key;
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
    const keys = Object.keys(value);
    keys.sort();
    for (const key of keys) {
      syrupWriter.writeString(key);
      // Value can be any Passable.
      const passable = value[key];
      /* eslint-disable-next-line no-use-before-define */
      OCapNPassableUnionCodec.write(passable, syrupWriter);
    }
    syrupWriter.exitDictionary();
  },
});

// <:desc:tagged :tagName value>
const OCapNTaggedCodec = makeOCapNRecordCodec(
  'OCapNTaggedCodec',
  'desc:tagged',
  // readBody
  syrupReader => {
    const tagName = syrupReader.readSelectorAsString();
    // Value can be any Passable.
    /* eslint-disable-next-line no-use-before-define */
    const value = OCapNPassableUnionCodec.read(syrupReader);
    return {
      [PASS_STYLE]: 'tagged',
      [Symbol.toStringTag]: tagName,
      value,
    };
  },
  // writeBody
  (value, syrupWriter) => {
    const tagName = value[Symbol.toStringTag];
    syrupWriter.writeSelectorFromString(tagName);
    // eslint-disable-next-line no-use-before-define
    OCapNPassableUnionCodec.write(value.value, syrupWriter);
  },
);

// OCapN Reference (Capability)

const OCapNTargetCodec = makeRecordUnionCodec('OCapNTargetCodec', {
  DescExport,
  DescImportObject,
});

const OCapNPromiseCodec = makeRecordUnionCodec('OCapNPromiseCodec', {
  DescImportPromise,
  DescAnswer,
});

const OCapNReferenceCodecs = {
  OCapNTargetCodec,
  OCapNPromiseCodec,
};

// OCapN Error

const OCapNErrorCodec = makeOCapNRecordCodecFromDefinition(
  'OCapNErrorCodec',
  'desc:error',
  [['message', 'string']],
);

// all record based passables
const OCapNPassableRecordUnionCodec = makeRecordUnionCodec(
  'OCapNPassableRecordUnionCodec',
  {
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
  },
);

const OCapNPassableNumberPrefixCodec = makeCodec(
  'OCapNPassableNumberPrefixCodec',
  {
    read(syrupReader) {
      const { type, value } = syrupReader.readTypeAndMaybeValue();
      if (type === 'integer' || type === 'string' || type === 'bytestring') {
        return value;
      }
      if (type === 'selector') {
        return makeOCapNSelector(value);
      }
      throw new Error(
        `Unexpected type ${type} for OCapNPassableNumberPrefixCodec`,
      );
    },
    write(value, syrupWriter) {
      if (typeof value === 'string') {
        syrupWriter.writeString(value);
      } else if (typeof value === 'bigint') {
        syrupWriter.writeInteger(value);
      } else if (value instanceof Uint8Array) {
        syrupWriter.writeBytestring(value);
      } else {
        throw new Error(
          `Unexpected value ${value} for OCapNPassableNumberPrefixCodec`,
        );
      }
    },
  },
);

export const OCapNPassableUnionCodec = makeTypeHintUnionCodec(
  'OCapNPassableCodec',
  // syrup type hint -> codec
  {
    boolean: AtomCodecs.boolean,
    float64: AtomCodecs.float64,
    // "number-prefix" can be String, ByteArray (Syrup bytestring), Selector, Integer
    'number-prefix': OCapNPassableNumberPrefixCodec,
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
      if (value[PASS_STYLE] === 'tagged') {
        // eslint-disable-next-line no-use-before-define
        return ContainerCodecs.tagged;
      }
      if (value[Symbol.for('passStyle')] === 'selector') {
        return AtomCodecs.selector;
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
  list: makeListCodecFromEntryCodec('OCapNListCodec', OCapNPassableUnionCodec),
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
