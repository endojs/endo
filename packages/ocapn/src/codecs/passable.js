// @ts-check

/**
 * @import { SyrupCodec } from '../syrup/codec.js'
 * @import { DescCodecs } from './descriptors.js'
 */

import { makeTagged } from '@endo/pass-style';
import { makeSelector, getSelectorName } from '../selector.js';
import {
  BooleanCodec,
  IntegerCodec,
  Float64Codec,
  StringCodec,
  BytestringCodec,
  makeRecordUnionCodec,
  makeListCodecFromEntryCodec,
  makeCodec,
  makeTypeHintPassStyleUnionCodec,
} from '../syrup/codec.js';
import { makeOcapnRecordCodec } from './util.js';
import { makeStructCodecForValues } from './subtypes.js';

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
  0, // 0 fields in body
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
  0, // 0 fields in body
);

const OcapnSelectorCodec = makeCodec('OcapnSelector', {
  read(syrupReader) {
    const name = syrupReader.readSelectorAsString();
    return makeSelector(name);
  },
  write(value, syrupWriter) {
    const name = getSelectorName(value);
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
  const { ReferenceCodec, OcapnSturdyRefCodec, HandOffUnionCodec } = descCodecs;

  // OCapN Passable Containers

  /* eslint-disable-next-line no-use-before-define */
  const OcapnStructCodec = makeStructCodecForValues(
    'OcapnStruct',
    // eslint-disable-next-line no-use-before-define
    () => OcapnPassableUnionCodec,
  );

  const OcapnListCodec = makeListCodecFromEntryCodec(
    'OcapnList',
    // eslint-disable-next-line no-use-before-define
    () => OcapnPassableUnionCodec,
  );

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
    2, // 2 fields: tagName, value
  );

  const ContainerCodecs = {
    list: OcapnListCodec,
    struct: OcapnStructCodec,
    tagged: OcapnTaggedCodec,
  };

  const OcapnErrorCodec = makeOcapnRecordCodec(
    'OcapnError',
    'desc:error',
    syrupReader => {
      const message = syrupReader.readString();
      const err = Error(message);
      delete err.stack;
      harden(err);
      return err;
    },
    (value, syrupWriter) => {
      syrupWriter.writeString(value.message);
    },
    1, // 1 field: message
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
        } else if (value instanceof ArrayBuffer) {
          syrupWriter.writeBytestring(value);
        } else {
          throw new Error(
            `Unexpected value ${value} for OcapnPassableNumberPrefixUnionCodec`,
          );
        }
      },
    },
  );

  const OcapnPassableUnionCodec = makeTypeHintPassStyleUnionCodec(
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
    // passStyleOf value -> codec
    {
      // Atoms
      undefined: AtomCodecs.undefined,
      null: AtomCodecs.null,
      boolean: AtomCodecs.boolean,
      number: AtomCodecs.float64,
      string: AtomCodecs.string,
      symbol: AtomCodecs.selector,
      bigint: AtomCodecs.integer,
      byteArray: AtomCodecs.byteArray,
      error: OcapnErrorCodec,
      // Containers
      tagged: ContainerCodecs.tagged,
      copyRecord: ContainerCodecs.struct,
      copyArray: ContainerCodecs.list,
      // References
      remotable: ReferenceCodec,
      promise: ReferenceCodec,
      // Special Cases
      signedHandoffReceive: HandOffUnionCodec,
      signedHandoffGive: HandOffUnionCodec,
      sturdyref: OcapnSturdyRefCodec,
    },
  );

  return {
    PassableCodec: OcapnPassableUnionCodec,
  };
};
