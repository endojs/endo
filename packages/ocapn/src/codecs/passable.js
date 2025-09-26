// @ts-check

/**
 * @import { SyrupCodec, SyrupRecordCodec } from '../syrup/codec.js'
 * @import { DescCodecs } from './descriptors.js'
 */

import { passStyleOf as realPassStyleOf } from '@endo/pass-style';
import {
  makeTagged,
  makeSelector,
  passStyleOf,
} from '../pass-style-helpers.js';
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
  makeOcapnRecordCodec,
  makeOcapnRecordCodecFromDefinition,
} from './util.js';

const quote = JSON.stringify;

// OCapN Passable Atoms

const UndefinedCodec = makeOcapnRecordCodec(
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

const NullCodec = makeOcapnRecordCodec(
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

const OcapnSelectorCodec = makeCodec('OcapnSelector', {
  read(syrupReader) {
    const name = syrupReader.readSelectorAsString();
    return makeSelector(name);
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
  selector: OcapnSelectorCodec,
  byteArray: BytestringCodec,
};

/**
 * @typedef {object} PassableCodecs
 * @property {SyrupCodec} PassableCodec
 */

/**
 * @param {DescCodecs} descCodecs
 * @returns {PassableCodecs}
 */
export const makePassableCodecs = descCodecs => {
  const { ReferenceCodec } = descCodecs;

  // OCapN Passable Containers

  /** @type {SyrupCodec} */
  const OcapnStructCodec = makeCodec('OcapnStruct', {
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
              `OcapnStruct must have unique keys, got repeated ${quote(key)} at index ${start} of ${syrupReader.name}`,
            );
          }
          if (key < lastKey) {
            throw new Error(
              `OcapnStruct keys must be in bytewise sorted order, got ${quote(key)} immediately after ${quote(lastKey)} at index ${start} of ${syrupReader.name}`,
            );
          }
        }
        lastKey = key;
        // Value can be any Passable.
        /* eslint-disable-next-line no-use-before-define */
        const value = OcapnPassableUnionCodec.read(syrupReader);
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
        OcapnPassableUnionCodec.write(passable, syrupWriter);
      }
      syrupWriter.exitDictionary();
    },
  });

  // <:desc:tagged :tagName value>
  const OcapnTaggedCodec = makeOcapnRecordCodec(
    'OcapnTagged',
    'desc:tagged',
    // readBody
    syrupReader => {
      const tagName = syrupReader.readSelectorAsString();
      // Value can be any Passable.
      /* eslint-disable-next-line no-use-before-define */
      const value = OcapnPassableUnionCodec.read(syrupReader);
      return makeTagged(tagName, value);
    },
    // writeBody
    (value, syrupWriter) => {
      const tagName = value[Symbol.toStringTag];
      syrupWriter.writeSelectorFromString(tagName);
      // eslint-disable-next-line no-use-before-define
      OcapnPassableUnionCodec.write(value.payload, syrupWriter);
    },
  );

  const OcapnErrorCodec = makeOcapnRecordCodecFromDefinition(
    'OcapnError',
    'desc:error',
    {
      message: 'string',
    },
  );

  // all record based passables
  const OcapnPassableRecordUnionCodec = makeRecordUnionCodec(
    'OcapnPassableRecordUnion',
    {
      UndefinedCodec,
      NullCodec,
      OcapnTaggedCodec,
      OcapnErrorCodec,
      ...ReferenceCodec.getChildCodecs(),
    },
  );

  const OcapnPassableNumberPrefixUnionCodec = makeCodec(
    'OcapnPassableNumberPrefixUnion',
    {
      read(syrupReader) {
        const { type, value } = syrupReader.readTypeAndMaybeValue();
        if (type === 'integer' || type === 'string' || type === 'bytestring') {
          return value;
        }
        if (type === 'selector') {
          return makeSelector(value);
        }
        throw new Error(
          `Unexpected type ${type} for OcapnPassableNumberPrefixUnionCodec`,
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
            `Unexpected value ${value} for OcapnPassableNumberPrefixUnionCodec`,
          );
        }
      },
    },
  );

  const OcapnPassableUnionCodec = makeTypeHintUnionCodec(
    'OcapnPassable',
    // syrup type hint -> codec
    {
      boolean: AtomCodecs.boolean,
      float64: AtomCodecs.float64,
      // "number-prefix" can be String, ByteArray (Syrup bytestring), Selector, Integer
      'number-prefix': OcapnPassableNumberPrefixUnionCodec,
      record: OcapnPassableRecordUnionCodec,
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
        const passStyle = passStyleOf(value);
        if (passStyle === 'tagged') {
          // eslint-disable-next-line no-use-before-define
          return ContainerCodecs.tagged;
        }
        if (passStyle === 'selector') {
          return AtomCodecs.selector;
        }
        // Some OCapN Record Types have a type property.
        const { type: recordType } = value;
        if (
          recordType !== undefined &&
          OcapnPassableRecordUnionCodec.supports(recordType)
        ) {
          return OcapnPassableRecordUnionCodec;
        }
        if (value instanceof Error) {
          return OcapnErrorCodec;
        }
        const realPassStyle = realPassStyleOf(value);
        if (realPassStyle === 'copyRecord') {
          // eslint-disable-next-line no-use-before-define
          return ContainerCodecs.struct;
        }
        if (realPassStyle === 'remotable') {
          return ReferenceCodec;
        }
        if (realPassStyle === 'promise') {
          return ReferenceCodec;
        }
        throw new Error(`Unexpected value ${value} for OcapnPassable`);
      },
      function: value => {
        const realPassStyle = realPassStyleOf(value);
        if (realPassStyle === 'remotable') {
          return ReferenceCodec;
        }
        throw new Error(`Unexpected value ${value} for OcapnPassable`);
      },
    },
  );

  const ContainerCodecs = {
    list: makeListCodecFromEntryCodec('OcapnList', OcapnPassableUnionCodec),
    struct: OcapnStructCodec,
    tagged: OcapnTaggedCodec,
  };

  return {
    PassableCodec: OcapnPassableUnionCodec,
  };
};
