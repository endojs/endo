import {
  BooleanCodec,
  IntegerCodec,
  Float64Codec,
  SelectorCodec,
  StringCodec,
  BytestringCodec,
  ListCodec,
  AnyCodec,
  makeRecordUnionCodec,
  makeTypeHintUnionCodec,
} from '../codec.js';
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

/** @typedef {import('../codec.js').SyrupCodec} SyrupCodec */
/** @typedef {import('../codec.js').SyrupRecordCodec} SyrupRecordCodec */

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
  selector: SelectorCodec,
  byteArray: BytestringCodec,
};

// OCapN Passable Containers

// TODO: dictionary but with only string keys
/** @type {SyrupCodec} */
export const OCapNStructCodec = {
  read(syrupReader) {
    throw Error('OCapNStructCodec: read must be implemented');
  },
  write(value, syrupWriter) {
    throw Error('OCapNStructCodec: write must be implemented');
  },
};

const OCapNTaggedCodec = makeOCapNRecordCodec(
  'desc:tagged',
  // readBody
  syrupReader => {
    const tagName = syrupReader.readSelectorAsString();
    // @ts-expect-error any type
    const value = syrupReader.readOfType('any');
    return {
      [Symbol.for('passStyle')]: 'tagged',
      [Symbol.toStringTag]: tagName,
      value,
    };
  },
  // writeBody
  (value, syrupWriter) => {
    syrupWriter.writeSelector(value.tagName);
    value.value.write(syrupWriter);
  },
);

const ContainerCodecs = {
  list: ListCodec,
  struct: OCapNStructCodec,
  tagged: OCapNTaggedCodec,
};

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

// provided for completeness
// eslint-disable-next-line no-underscore-dangle
const _OCapNPassableCodecs = {
  ...AtomCodecs,
  ...ContainerCodecs,
  ...OCapNReferenceCodecs,
  ...OCapNErrorCodec,
};

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
    'number-prefix': AnyCodec,
    list: ContainerCodecs.list,
    record: OCapNPassableRecordUnionCodec,
    dictionary: ContainerCodecs.struct,
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
        return ContainerCodecs.list;
      }
      if (value[Symbol.for('passStyle')] === 'tagged') {
        return ContainerCodecs.tagged;
      }
      if (
        value.type !== undefined &&
        OCapNPassableRecordUnionCodec.supports(value.type)
      ) {
        return OCapNPassableRecordUnionCodec;
      }
      // TODO: need to distinguish OCapNReferenceCodecs and OCapNErrorCodec
      return ContainerCodecs.struct;
    },
  },
);
